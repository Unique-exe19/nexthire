"""
hybrid_ranker.py
----------------
Hybrid semantic ranker combining BM25-Okapi + TF-IDF via RRF.
Upgraded with Redis caching, GPU auto-detection, ANN search (Annoy/NumPy),
and incremental updates.
"""

import re
import math
import logging
import os
import time
import hashlib
import pickle
from collections import Counter
from typing import Optional, List, Dict, Any, Tuple

log = logging.getLogger("ranker.hybrid")

# Standard RRF constant (k=60 from original paper)
RRF_K = 60
# BM25 tuning parameters
BM25_K1 = 1.5   # term frequency saturation
BM25_B  = 0.75  # length normalization

# ── Redis Client Initialization (OPTIONAL, OFF by default) ─────────────────────
# The Redrob spec (§3) forbids network calls during the ranking step. Redis is a
# convenience cache for the web dashboard ONLY. It is disabled unless the operator
# explicitly opts in via NEXTHIRE_USE_REDIS=1, and every failure path degrades to
# the local file cache. This guarantees the ranking step is network-free out of the box.
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "web", ".env"))
    load_dotenv()
except Exception:
    # python-dotenv is optional; environment variables still work without it.
    pass

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
REDIS_ENABLED = os.environ.get("NEXTHIRE_USE_REDIS", "0").lower() in ("1", "true", "yes")

redis_client = None
redis_available = False

if REDIS_ENABLED:
    try:
        import redis
        # Short connect timeout so an unreachable host never stalls the ranking step.
        redis_client = redis.Redis.from_url(
            REDIS_URL, decode_responses=False,
            socket_connect_timeout=2, socket_timeout=2,
        )
        redis_client.ping()
        redis_available = True
        log.info("Connected to Redis via REDIS_URL client connection ✓")
    except Exception as e:
        redis_available = False
        redis_client = None
        log.warning(f"Redis not available: {e}. Falling back to file-based cache.")
else:
    log.info("Redis disabled (set NEXTHIRE_USE_REDIS=1 to enable). Using local file cache only.")

# ── Semantic Skill Graph ──────────────────────────────────────────────────────
SKILL_SYNONYMS = {
    "react": ["nextjs", "next.js", "frontend", "typescript", "javascript", "reactjs", "react.js"],
    "nextjs": ["react", "next.js", "frontend", "typescript", "reactjs"],
    "next.js": ["react", "nextjs", "frontend", "typescript", "reactjs"],
    "pytorch": ["deep-learning", "deep learning", "torch", "tensor", "machine-learning", "ml"],
    "tensorflow": ["keras", "deep-learning", "deep learning", "tensor", "machine-learning", "ml"],
    "nodejs": ["node", "node.js", "express", "backend", "javascript", "typescript"],
    "node.js": ["node", "nodejs", "express", "backend", "javascript", "typescript"],
    "express": ["node", "nodejs", "node.js", "backend"],
    "python": ["django", "flask", "numpy", "pandas", "ml", "ai"],
    "kubernetes": ["k8s", "docker", "devops", "aws", "gcp", "cloud"],
    "docker": ["kubernetes", "k8s", "devops", "container"],
    "postgres": ["postgresql", "sql", "database", "db"],
    "postgresql": ["postgres", "sql", "database", "db"],
    "mongodb": ["mongo", "nosql", "database", "db"],
    "aws": ["cloud", "gcp", "azure", "devops"],
    "gcp": ["cloud", "aws", "azure", "devops"],
}

def _rank_list(scores: list) -> list:
    """Convert score list to 1-indexed rank list (highest score = rank 1)."""
    indexed = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    ranks = [0] * len(scores)
    for rank_pos, orig_idx in enumerate(indexed, 1):
        ranks[orig_idx] = rank_pos
    return ranks


def reciprocal_rank_fusion(rank_lists: list, k: int = RRF_K) -> list:
    """Fuse multiple rank lists: rrf(d) = Σ_i 1 / (k + rank_i(d))."""
    if not rank_lists:
        return []
    n = len(rank_lists[0])
    rrf = [0.0] * n
    for ranks in rank_lists:
        for doc_idx, r in enumerate(ranks):
            rrf[doc_idx] += 1.0 / (k + r)
    return rrf


def _normalize(scores: list) -> list:
    """Min-max normalize to [0, 1]. All-zeros returns zeros."""
    if not scores:
        return []
    max_s = max(scores)
    min_s = min(scores)
    rng = max_s - min_s
    if rng < 1e-12:
        return [1.0 if s > 0 else 0.0 for s in scores]
    return [(s - min_s) / rng for s in scores]


def _tokenize(text: str) -> list:
    """Tokenize text (lowercase word tokens ≥2 chars)."""
    return re.findall(r'\b[a-z][a-z0-9\-]{1,}\b', text.lower())


# ── Pure-Python BM25 Okapi with Incremental Updates ───────────────────────────

class BM25OkapiPure:
    """
    Pure-Python BM25-Okapi implementation with Inverted Index and incremental updates.
    """

    def __init__(self, corpus_tokens: Optional[list] = None):
        self.N = 0
        self.avgdl = 0.0
        self._dl = []
        self.inverted_index = {}
        self._df = Counter()
        self._document_tokens = [] # keep track for deletion lookup

        if corpus_tokens:
            self.N = len(corpus_tokens)
            self._document_tokens = [list(toks) for toks in corpus_tokens]
            sum_dl = sum(len(d) for d in corpus_tokens)
            self.avgdl = sum_dl / max(1, self.N)
            self._dl = [len(d) for d in corpus_tokens]

            # Build inverted index: term -> list of (doc_id, tf)
            for doc_id, doc_tokens in enumerate(corpus_tokens):
                tf = Counter(doc_tokens)
                for term, count in tf.items():
                    if term not in self.inverted_index:
                        self.inverted_index[term] = []
                    self.inverted_index[term].append((doc_id, count))
                    self._df[term] += 1

    def _idf(self, term: str) -> float:
        df = self._df.get(term, 0)
        return math.log((self.N - df + 0.5) / (df + 0.5) + 1)

    def add_document(self, doc_id: int, tokens: list):
        """Incrementally add a document to the BM25 index."""
        # Pad self._dl and self._document_tokens if doc_id is out of bounds
        while len(self._dl) <= doc_id:
            self._dl.append(0)
            self._document_tokens.append([])

        old_len = self._dl[doc_id]
        new_len = len(tokens)
        self._dl[doc_id] = new_len
        self._document_tokens[doc_id] = tokens

        # If it was an empty/new slot, increment N
        if old_len == 0 and new_len > 0:
            self.N += 1
            
        # Update avgdl
        sum_dl = sum(self._dl)
        self.avgdl = sum_dl / max(1, self.N)

        # Update inverted index & DF
        tf = Counter(tokens)
        for term, count in tf.items():
            if term not in self.inverted_index:
                self.inverted_index[term] = []

            # Remove any pre-existing entry for this doc_id. Only bump DF when the
            # term was not already attributed to this document (avoid double-counting
            # on re-add/update of an existing doc_id).
            before = len(self.inverted_index[term])
            self.inverted_index[term] = [(d, c) for (d, c) in self.inverted_index[term] if d != doc_id]
            already_present = len(self.inverted_index[term]) != before
            self.inverted_index[term].append((doc_id, count))
            if not already_present:
                self._df[term] += 1

    def remove_document(self, doc_id: int):
        """Incrementally remove a document from the BM25 index."""
        if doc_id >= len(self._dl) or self._dl[doc_id] == 0:
            return

        tokens = self._document_tokens[doc_id]
        self._dl[doc_id] = 0
        self._document_tokens[doc_id] = []
        self.N = max(0, self.N - 1)

        # Update avgdl
        sum_dl = sum(self._dl)
        self.avgdl = sum_dl / max(1, self.N)

        # Update inverted index & DF
        tf = Counter(tokens)
        for term in tf.keys():
            if term in self.inverted_index:
                self.inverted_index[term] = [(d, c) for (d, c) in self.inverted_index[term] if d != doc_id]
                self._df[term] = max(0, self._df[term] - 1)
                if self._df[term] == 0:
                    self._df.pop(term, None)
                    self.inverted_index.pop(term, None)

    def get_scores(self, query_tokens: list) -> list:
        scores = [0.0] * len(self._dl)
        
        # Semantic query expansion
        expanded_query = {}
        for token in query_tokens:
            expanded_query[token] = expanded_query.get(token, 0.0) + 1.0
            if token in SKILL_SYNONYMS:
                for syn in SKILL_SYNONYMS[token]:
                    expanded_query[syn] = expanded_query.get(syn, 0.0) + 0.4

        for term, q_weight in expanded_query.items():
            if term not in self.inverted_index:
                continue
            idf = self._idf(term)
            for doc_id, tf in self.inverted_index[term]:
                dl = self._dl[doc_id]
                if dl == 0:
                    continue
                numer = tf * (BM25_K1 + 1)
                denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * dl / self.avgdl)
                scores[doc_id] += idf * (numer / denom) * q_weight
        return scores


# ── Main HybridRanker Class ───────────────────────────────────────────────────

class HybridRanker:
    """
    Hybrid BM25 + TF-IDF + Dense Embeddings ranker via Reciprocal Rank Fusion.
    Integrates Redis, GPU acceleration, and HNSW/Annoy vector indexing.
    """

    def __init__(self):
        self._sklearn_available = False
        self._dense_available = False
        self._annoy_available = False

        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.metrics.pairwise import cosine_similarity
            import numpy as np
            self._TfidfVectorizer = TfidfVectorizer
            self._cosine_similarity = cosine_similarity
            self._np = np
            self._sklearn_available = True
            log.info("scikit-learn TF-IDF available ✓")
        except ImportError:
            log.info("Using pure-Python TF-IDF")

        try:
            from sentence_transformers import SentenceTransformer
            import torch
            import numpy as np
            self._np = np
            # CPU-only by default to honour the spec's "no GPU during ranking" rule.
            # Set NEXTHIRE_ALLOW_GPU=1 only for offline experimentation.
            allow_gpu = os.environ.get("NEXTHIRE_ALLOW_GPU", "0").lower() in ("1", "true", "yes")
            self._device = "cuda" if (allow_gpu and torch.cuda.is_available()) else "cpu"
            self._dense_model = SentenceTransformer('all-MiniLM-L6-v2', device=self._device)
            self._dense_available = True
            log.info(f"sentence-transformers dense model loaded on {self._device} ✓")
        except Exception as e:
            # Catch ImportError *and* offline model-download failures (OSError/HTTPError):
            # either way, degrade to sparse-only scoring instead of crashing the ranker.
            log.warning(f"sentence-transformers unavailable ({type(e).__name__}). Skipping dense semantic scoring.")

        try:
            from annoy import AnnoyIndex
            self._AnnoyIndex = AnnoyIndex
            self._annoy_available = True
            log.info("Annoy indexer available ✓")
        except ImportError:
            log.info("Annoy not available. Defaulting to NumPy vectorized ANN matching.")

        log.info("BM25-Okapi (pure Python) ready ✓")

    def get_cache_key(self, key_type: str, dataset_hash: str) -> str:
        return f"nexthire:cache:{key_type}:{dataset_hash}"

    def fit_transform(self, corpus: list, query: str, cache_path: Optional[str] = None, 
                      dense_corpus: Optional[list] = None, cache_data: Optional[dict] = None,
                      dataset_hash: Optional[str] = None):
        """
        Runs sparse retrieval and fuses results.
        """
        rank_lists = []
        raw_scores = {}
        
        # Calculate file/corpus hash if not provided
        if not dataset_hash and cache_path:
            # Generate stable hash from path or size
            h = hashlib.sha256(f"{len(corpus)}_{cache_path}".encode('utf-8')).hexdigest()
            dataset_hash = h
        elif not dataset_hash:
            dataset_hash = hashlib.sha256(f"{len(corpus)}".encode('utf-8')).hexdigest()

        # ── BM25 Sparse Retrieval ─────────────────────────────────────────
        log.info("Running BM25-Okapi...")
        bm25_cached = False
        bm25_index = None

        # Check Redis cache for BM25
        if redis_available and dataset_hash:
            redis_key = self.get_cache_key("bm25", dataset_hash)
            cached_val = redis_client.get(redis_key)
            if cached_val:
                try:
                    bm25_index = pickle.loads(cached_val)
                    bm25_cached = True
                    log.info("Loaded BM25 index from Redis cache ✓")
                except Exception as e:
                    log.warning(f"Failed to deserialize BM25 from Redis: {e}")

        if not bm25_cached:
            if cache_data and "bm25_index" in cache_data:
                bm25_index = cache_data["bm25_index"]
            else:
                if cache_data and "corpus_tokens" in cache_data:
                    corpus_tokens = cache_data["corpus_tokens"]
                else:
                    corpus_tokens = [_tokenize(doc) for doc in corpus]
                    if cache_data is not None:
                        cache_data["corpus_tokens"] = corpus_tokens
                bm25_index = BM25OkapiPure(corpus_tokens)
                if cache_data is not None:
                    cache_data["bm25_index"] = bm25_index

            # Save to Redis
            if redis_available and dataset_hash and bm25_index:
                try:
                    redis_key = self.get_cache_key("bm25", dataset_hash)
                    redis_client.setex(redis_key, 86400 * 7, pickle.dumps(bm25_index)) # 7 days expiry
                    log.info("Saved BM25 index to Redis cache ✓")
                except Exception as e:
                    log.warning(f"Failed to save BM25 to Redis: {e}")

        q_tokens = _tokenize(query)
        bm25_raw = bm25_index.get_scores(q_tokens)
        bm25_norm = _normalize(bm25_raw)
        raw_scores["bm25"] = bm25_norm
        rank_lists.append(_rank_list(bm25_norm))
        log.info("BM25 done")

        # ── TF-IDF Dense Scoring ──────────────────────────────────────────
        log.info("Running TF-IDF...")
        tfidf_scores = self._tfidf_score(corpus, query, cache_data, dataset_hash)
        raw_scores["tfidf"] = tfidf_scores
        rank_lists.append(_rank_list(tfidf_scores))
        log.info("TF-IDF done")

        # ── Dense Vector Similarity ───────────────────────────────────────
        if self._dense_available and cache_path:
            log.info(f"Running dense semantic search (using cache: {cache_path})...")
            d_corpus = dense_corpus if dense_corpus is not None else corpus
            dense_scores = self._dense_score(d_corpus, query, cache_path, dataset_hash)
            raw_scores["dense"] = dense_scores
            rank_lists.append(_rank_list(dense_scores))
            log.info("Dense semantic search done")
        else:
            log.warning("Dense embeddings skipped (model not loaded or no cache_path).")

        # ── Reciprocal Rank Fusion ────────────────────────────────────────
        rrf = reciprocal_rank_fusion(rank_lists)
        final = _normalize(rrf)

        return final, raw_scores

    def _dense_score(self, corpus: list, query: str, cache_path: str, dataset_hash: Optional[str] = None) -> list:
        np = self._np
        
        # 1. Load or compute candidate embeddings
        candidate_embeddings = None
        redis_key = self.get_cache_key("embeddings", dataset_hash) if dataset_hash else None
        
        # Try Redis first
        if redis_available and redis_key:
            cached_val = redis_client.get(redis_key)
            if cached_val:
                try:
                    candidate_embeddings = pickle.loads(cached_val)
                    if len(candidate_embeddings) == len(corpus):
                        log.info("Loaded candidate embeddings from Redis cache ✓")
                    else:
                        candidate_embeddings = None
                except Exception as e:
                    log.warning(f"Failed to load embeddings from Redis: {e}")

        # Try File Cache second
        if candidate_embeddings is None and os.path.exists(cache_path):
            try:
                candidate_embeddings = np.load(cache_path)
                if len(candidate_embeddings) != len(corpus):
                    log.warning(f"Cache size mismatch: {len(candidate_embeddings)} vs {len(corpus)}. Rebuilding...")
                    candidate_embeddings = None
                else:
                    log.info(f"Loaded candidate embeddings from file cache: {cache_path}")
                    # Push to Redis
                    if redis_available and redis_key:
                        redis_client.setex(redis_key, 86400 * 7, pickle.dumps(candidate_embeddings))
            except Exception as e:
                log.warning(f"Failed to load file cache: {e}. Rebuilding...")
                candidate_embeddings = None

        # Compute if not cached
        if candidate_embeddings is None:
            log.info(f"Computing dense embeddings for {len(corpus):,} candidates...")
            t_start = time.time()
            candidate_embeddings = self._dense_model.encode(
                corpus,
                batch_size=256,
                show_progress_bar=True,
                convert_to_numpy=True
            )
            # Save file cache
            np.save(cache_path, candidate_embeddings)
            # Save Redis cache
            if redis_available and redis_key:
                try:
                    redis_client.setex(redis_key, 86400 * 7, pickle.dumps(candidate_embeddings))
                    log.info("Saved computed embeddings to Redis ✓")
                except Exception as e:
                    log.warning(f"Failed to save embeddings to Redis: {e}")
            log.info(f"Computed and saved embeddings to {cache_path} in {time.time() - t_start:.1f}s")

        # 2. Compute query embedding
        query_embedding = self._dense_model.encode(query, convert_to_numpy=True)

        # 3. Compute similarities (ANN fallback to NumPy cosine dot-product)
        if self._annoy_available:
            try:
                dim = candidate_embeddings.shape[1]
                annoy_index = self._AnnoyIndex(dim, 'angular')
                
                # Check if build file exists in local storage
                annoy_file = cache_path.replace(".npy", ".ann")
                if os.path.exists(annoy_file):
                    annoy_index.load(annoy_file)
                    log.info("Loaded Annoy index from disk ✓")
                else:
                    log.info("Building Annoy Index for fast nearest neighbor search...")
                    for idx, emb in enumerate(candidate_embeddings):
                        annoy_index.add_item(idx, emb)
                    annoy_index.build(10) # 10 trees
                    annoy_index.save(annoy_file)
                    log.info(f"Saved Annoy index to {annoy_file}")
                
                # Approximate search
                sims = [0.0] * len(corpus)
                # Query nearest 1000 items
                nns, dists = annoy_index.get_nns_by_vector(query_embedding, len(corpus), include_distances=True)
                for item_idx, dist in zip(nns, dists):
                    # Annoy returns cosine distance (0 to 2 for angular). Cosine similarity = 1 - (distance^2)/2
                    sims[item_idx] = 1.0 - (dist * dist) / 2.0
                return _normalize(sims)
            except Exception as e:
                log.warning(f"Annoy search failed: {e}. Falling back to NumPy search.")

        # NumPy Vectorized Matrix Cosine Search
        q_norm = np.linalg.norm(query_embedding)
        if q_norm > 1e-12:
            query_embedding = query_embedding / q_norm
            
        c_norms = np.linalg.norm(candidate_embeddings, axis=1, keepdims=True)
        c_norms[c_norms < 1e-12] = 1.0
        normed_candidates = candidate_embeddings / c_norms
        
        sims = np.dot(normed_candidates, query_embedding).tolist()
        return _normalize(sims)

    def dense_score_only(self, corpus: list, query: str) -> list:
        if not self._dense_available:
            return [0.0] * len(corpus)
            
        np = self._np
        log.info(f"Computing dense embeddings for {len(corpus):,} candidates...")
        t_start = time.time()
        
        candidate_embeddings = self._dense_model.encode(
            corpus,
            batch_size=128,
            show_progress_bar=False,
            convert_to_numpy=True
        )
        query_embedding = self._dense_model.encode(query, convert_to_numpy=True)

        q_norm = np.linalg.norm(query_embedding)
        if q_norm > 1e-12:
            query_embedding = query_embedding / q_norm
            
        c_norms = np.linalg.norm(candidate_embeddings, axis=1, keepdims=True)
        c_norms[c_norms < 1e-12] = 1.0
        normed_candidates = candidate_embeddings / c_norms
        
        sims = np.dot(normed_candidates, query_embedding).tolist()
        log.info(f"Dense embeddings completed in {time.time() - t_start:.1f}s")
        return _normalize(sims)

    def _tfidf_score(self, corpus: list, query: str, cache_data: Optional[dict] = None, dataset_hash: Optional[str] = None) -> list:
        if self._sklearn_available:
            n = len(corpus)
            min_df = 2 if n >= 50 else 1
            vec = self._TfidfVectorizer(
                ngram_range=(1, 2),
                max_features=60_000,
                sublinear_tf=True,
                min_df=min_df,
                strip_accents="unicode",
                dtype=self._np.float32,
            )
            all_docs = corpus + [query]
            mat = vec.fit_transform(all_docs)
            sims = self._cosine_similarity(mat[:-1], mat[-1]).flatten().tolist()
            return _normalize(sims)
        else:
            return self._pure_python_tfidf(corpus, query, cache_data, dataset_hash)

    def _pure_python_tfidf(self, corpus: list, query: str, cache_data: Optional[dict] = None, dataset_hash: Optional[str] = None) -> list:
        df = None
        inverted_index = None
        doc_magnitudes = None
        tfidf_cached = False
        N = len(corpus)

        # Check Redis Cache
        if redis_available and dataset_hash:
            redis_key = self.get_cache_key("tfidf", dataset_hash)
            cached_val = redis_client.get(redis_key)
            if cached_val:
                try:
                    tfidf_state = pickle.loads(cached_val)
                    df = tfidf_state["tfidf_df"]
                    inverted_index = tfidf_state["tfidf_inverted_index"]
                    doc_magnitudes = tfidf_state["tfidf_doc_magnitudes"]
                    tfidf_cached = True
                    log.info("Loaded TF-IDF index from Redis cache ✓")
                except Exception as e:
                    log.warning(f"Failed to deserialize TF-IDF from Redis: {e}")

        if not tfidf_cached:
            if cache_data and "tfidf_df" in cache_data:
                log.info("Loading TF-IDF Inverted Index from memory cache...")
                df = cache_data["tfidf_df"]
                inverted_index = cache_data["tfidf_inverted_index"]
                doc_magnitudes = cache_data["tfidf_doc_magnitudes"]
            else:
                log.info("Indexing corpus for TF-IDF...")
                t_start = time.time()
                
                all_tokens = [_tokenize(d) for d in corpus]
                df = Counter()
                for toks in all_tokens:
                    for t in set(toks):
                        df[t] += 1
                        
                inverted_index = {}
                doc_magnitudes = [0.0] * N
                
                for doc_id, doc_tokens in enumerate(all_tokens):
                    if not doc_tokens:
                        continue
                    tf = Counter(doc_tokens)
                    sum_squares = 0.0
                    doc_weights = {}
                    for t, cnt in tf.items():
                        if t in df:
                            idf = math.log((N + 1) / (df[t] + 1)) + 1
                            w = (1 + math.log(cnt)) * idf
                            doc_weights[t] = w
                            sum_squares += w * w
                    
                    mag = math.sqrt(sum_squares)
                    doc_magnitudes[doc_id] = mag
                    
                    if mag > 1e-12:
                        for t, w in doc_weights.items():
                            if t not in inverted_index:
                                inverted_index[t] = []
                            inverted_index[t].append((doc_id, w))
                    
                    if (doc_id + 1) % 10000 == 0:
                        log.info(f"Progress: TF-IDF Indexed {doc_id + 1:,} / {N:,} candidates...")
                            
                log.info(f"TF-IDF Indexing completed in {time.time() - t_start:.2f}s")
                
                if cache_data is not None:
                    cache_data["tfidf_df"] = df
                    cache_data["tfidf_inverted_index"] = inverted_index
                    cache_data["tfidf_doc_magnitudes"] = doc_magnitudes

            # Save TF-IDF state to Redis
            if redis_available and dataset_hash:
                try:
                    redis_key = self.get_cache_key("tfidf", dataset_hash)
                    redis_client.setex(
                        redis_key, 
                        86400 * 7, 
                        pickle.dumps({
                            "tfidf_df": df,
                            "tfidf_inverted_index": inverted_index,
                            "tfidf_doc_magnitudes": doc_magnitudes
                        })
                    )
                    log.info("Saved TF-IDF index to Redis cache ✓")
                except Exception as e:
                    log.warning(f"Failed to save TF-IDF to Redis: {e}")

        # 3. Compute Query Vector
        q_tokens = _tokenize(query)
        q_tf = Counter(q_tokens)
        
        # Expand query vector
        expanded_q_tf = {}
        for token, count in q_tf.items():
            expanded_q_tf[token] = expanded_q_tf.get(token, 0.0) + count
            if token in SKILL_SYNONYMS:
                for syn in SKILL_SYNONYMS[token]:
                    expanded_q_tf[syn] = expanded_q_tf.get(syn, 0.0) + 0.4 * count

        q_vec = {}
        q_sum_squares = 0.0
        for t, cnt in expanded_q_tf.items():
            if t in df:
                idf = math.log((N + 1) / (df[t] + 1)) + 1
                w = (1 + math.log(cnt)) * idf
                q_vec[t] = w
                q_sum_squares += w * w
                
        q_mag = math.sqrt(q_sum_squares)
        
        # 4. Search using inverted index
        scores = [0.0] * N
        if q_mag > 1e-12:
            for t, q_w in q_vec.items():
                if t in inverted_index:
                    for doc_id, doc_w in inverted_index[t]:
                        scores[doc_id] += doc_w * q_w
                        
            # Normalize by magnitudes to get cosine similarity
            for doc_id in range(N):
                d_mag = doc_magnitudes[doc_id]
                if d_mag > 1e-12:
                    scores[doc_id] = scores[doc_id] / (d_mag * q_mag)
                    
        return _normalize(scores)
