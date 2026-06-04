"""
hybrid_ranker.py
----------------
Hybrid semantic ranker combining BM25-Okapi + TF-IDF via RRF.
Pure-Python implementation — no external dependencies required.
Uses sklearn/numpy if available for speed, pure Python otherwise.

Scoring modes (auto-selected):
  1. BM25-Okapi + sklearn TF-IDF → fused with RRF   [best accuracy]
  2. BM25-Okapi + pure-Python TF-IDF → fused with RRF
  3. sklearn TF-IDF only                             [fast fallback]
  4. pure-Python TF-IDF                              [no-dependency]
"""

import re
import math
import logging
import os
import time
from collections import Counter
from typing import Optional

log = logging.getLogger("ranker.hybrid")

# Standard RRF constant (k=60 from original paper)
RRF_K = 60
# BM25 tuning parameters
BM25_K1 = 1.5   # term frequency saturation
BM25_B  = 0.75  # length normalization


def _rank_list(scores: list) -> list:
    """Convert score list to 1-indexed rank list (highest score = rank 1)."""
    indexed = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    ranks = [0] * len(scores)
    for rank_pos, orig_idx in enumerate(indexed, 1):
        ranks[orig_idx] = rank_pos
    return ranks


def reciprocal_rank_fusion(rank_lists: list, k: int = RRF_K) -> list:
    """Fuse multiple rank lists: rrf(d) = Σ_i 1 / (k + rank_i(d))."""
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


# ── Pure-Python BM25 Okapi ────────────────────────────────────────────────────

def _tokenize(text: str) -> list:
    """Tokenize text for BM25 (lowercase word tokens ≥2 chars)."""
    return re.findall(r'\b[a-z][a-z0-9\-]{1,}\b', text.lower())


class BM25OkapiPure:
    """
    Pure-Python BM25-Okapi implementation with an Inverted Index for fast retrieval.
    No external dependencies.
    """

    def __init__(self, corpus_tokens: list):
        self.N = len(corpus_tokens)
        self.avgdl = sum(len(d) for d in corpus_tokens) / max(1, self.N)
        self._dl = [len(d) for d in corpus_tokens]

        # Build inverted index: term -> list of (doc_id, tf)
        self.inverted_index = {}
        self._df = Counter()
        
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

    def get_scores(self, query_tokens: list) -> list:
        scores = [0.0] * self.N
        unique_query_tokens = set(query_tokens)
        for term in unique_query_tokens:
            if term not in self.inverted_index:
                continue
            idf = self._idf(term)
            for doc_id, tf in self.inverted_index[term]:
                dl = self._dl[doc_id]
                numer = tf * (BM25_K1 + 1)
                denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * dl / self.avgdl)
                scores[doc_id] += idf * numer / denom
        return scores


# ── Main HybridRanker class ───────────────────────────────────────────────────

class HybridRanker:
    """
    Hybrid BM25 + TF-IDF + Dense Embeddings ranker via Reciprocal Rank Fusion.
    All external libraries are optional — gracefully degrades.

    Usage:
        ranker = HybridRanker()
        scores, raw_scores = ranker.fit_transform(corpus_texts, query_text, cache_path)
    """

    def __init__(self):
        self._sklearn_available = False
        self._dense_available = False

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
            import numpy as np
            self._np = np
            self._dense_model = SentenceTransformer('all-MiniLM-L6-v2', device='cpu')
            self._dense_available = True
            log.info("sentence-transformers dense embeddings model available ✓")
        except ImportError:
            log.warning("sentence-transformers NOT available. Skipping dense semantic scoring.")

        log.info("BM25-Okapi (pure Python) ready ✓")
        log.info(f"Mode: {'BM25 + TF-IDF + Dense RRF' if self._dense_available else ('BM25 + sklearn-TF-IDF via RRF' if self._sklearn_available else 'BM25 + pure-Python TF-IDF via RRF')}")

    def fit_transform(self, corpus: list, query: str, cache_path: Optional[str] = None, dense_corpus: Optional[list] = None):
        """
        Returns (final_scores, raw_scores_dict).
        final_scores: list[float] in [0,1], length = len(corpus)
        raw_scores: {'bm25': [...], 'tfidf': [...], 'dense': [...]}
        """
        rank_lists = []
        raw_scores = {}

        # ── BM25 Sparse Retrieval ─────────────────────────────────────────
        log.info("Running BM25-Okapi...")
        corpus_tokens = [_tokenize(doc) for doc in corpus]
        q_tokens = _tokenize(query)
        bm25 = BM25OkapiPure(corpus_tokens)
        bm25_raw = bm25.get_scores(q_tokens)
        bm25_norm = _normalize(bm25_raw)
        raw_scores["bm25"] = bm25_norm
        rank_lists.append(_rank_list(bm25_norm))
        log.info("BM25 done")

        # ── TF-IDF Dense Scoring ──────────────────────────────────────────
        log.info("Running TF-IDF...")
        tfidf_scores = self._tfidf_score(corpus, query)
        raw_scores["tfidf"] = tfidf_scores
        rank_lists.append(_rank_list(tfidf_scores))
        log.info("TF-IDF done")

        # ── Dense Vector Similarity ───────────────────────────────────────
        if self._dense_available and cache_path:
            log.info(f"Running dense semantic search (using cache: {cache_path})...")
            d_corpus = dense_corpus if dense_corpus is not None else corpus
            dense_scores = self._dense_score(d_corpus, query, cache_path)
            raw_scores["dense"] = dense_scores
            rank_lists.append(_rank_list(dense_scores))
            log.info("Dense semantic search done")
        else:
            log.warning("Dense embeddings skipped (model not loaded or no cache_path).")

        # ── Reciprocal Rank Fusion ────────────────────────────────────────
        rrf = reciprocal_rank_fusion(rank_lists)
        final = _normalize(rrf)

        return final, raw_scores

    def _dense_score(self, corpus: list, query: str, cache_path: str) -> list:
        np = self._np
        
        # 1. Load or compute candidate embeddings
        candidate_embeddings = None
        if os.path.exists(cache_path):
            try:
                candidate_embeddings = np.load(cache_path)
                if len(candidate_embeddings) != len(corpus):
                    log.warning(f"Cache size mismatch: {len(candidate_embeddings)} vs {len(corpus)}. Rebuilding...")
                    candidate_embeddings = None
                else:
                    log.info(f"Loaded candidate embeddings from cache: {cache_path}")
            except Exception as e:
                log.warning(f"Failed to load cache: {e}. Rebuilding...")
                candidate_embeddings = None

        if candidate_embeddings is None:
            log.info(f"Computing dense embeddings for {len(corpus):,} candidates (this will take a few minutes)...")
            t_start = time.time()
            candidate_embeddings = self._dense_model.encode(
                corpus,
                batch_size=256,
                show_progress_bar=True,
                convert_to_numpy=True
            )
            np.save(cache_path, candidate_embeddings)
            log.info(f"Computed and saved embeddings to {cache_path} in {time.time() - t_start:.1f}s")

        # 2. Compute query embedding
        query_embedding = self._dense_model.encode(query, convert_to_numpy=True)

        # 3. Compute cosine similarities
        q_norm = np.linalg.norm(query_embedding)
        if q_norm > 1e-12:
            query_embedding = query_embedding / q_norm
            
        c_norms = np.linalg.norm(candidate_embeddings, axis=1, keepdims=True)
        c_norms[c_norms < 1e-12] = 1.0
        normed_candidates = candidate_embeddings / c_norms
        
        sims = np.dot(normed_candidates, query_embedding).tolist()
        return _normalize(sims)

    def dense_score_only(self, corpus: list, query: str) -> list:
        """
        Computes dense embedding similarity for the given corpus of candidate semantic texts.
        This is run on the filtered subset of candidates.
        """
        if not self._dense_available:
            log.warning("dense_score_only called but sentence-transformers is not loaded.")
            return [0.0] * len(corpus)
            
        np = self._np
        log.info(f"Computing dense embeddings for {len(corpus):,} filtered candidates...")
        t_start = time.time()
        
        candidate_embeddings = self._dense_model.encode(
            corpus,
            batch_size=128,
            show_progress_bar=False,
            convert_to_numpy=True
        )
        query_embedding = self._dense_model.encode(query, convert_to_numpy=True)

        # Compute cosine similarities
        q_norm = np.linalg.norm(query_embedding)
        if q_norm > 1e-12:
            query_embedding = query_embedding / q_norm
            
        c_norms = np.linalg.norm(candidate_embeddings, axis=1, keepdims=True)
        c_norms[c_norms < 1e-12] = 1.0
        normed_candidates = candidate_embeddings / c_norms
        
        sims = np.dot(normed_candidates, query_embedding).tolist()
        log.info(f"Dense embeddings completed in {time.time() - t_start:.1f}s")
        return _normalize(sims)

    def _tfidf_score(self, corpus: list, query: str) -> list:
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
            return self._pure_python_tfidf(corpus, query)

    def _pure_python_tfidf(self, corpus: list, query: str) -> list:
        def tokenize(t):
            return re.findall(r'\b[a-z][a-z0-9\-]{1,}\b', t.lower())

        log.info("Indexing corpus for TF-IDF...")
        t_start = time.time()
        
        all_tokens = [tokenize(d) for d in corpus]
        N = len(corpus)
        
        # 1. Compute Document Frequencies (DF)
        df = Counter()
        for toks in all_tokens:
            for t in set(toks):
                df[t] += 1
                
        # 2. Build inverted index & precompute document magnitudes
        inverted_index = {}
        doc_magnitudes = [0.0] * N
        
        for doc_id, toks in enumerate(all_tokens):
            if not toks:
                continue
            tf = Counter(toks)
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
                    
        log.info(f"TF-IDF Indexing completed in {time.time() - t_start:.2f}s")
        
        # 3. Compute Query Vector
        q_tokens = tokenize(query)
        q_tf = Counter(q_tokens)
        q_vec = {}
        q_sum_squares = 0.0
        for t, cnt in q_tf.items():
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
