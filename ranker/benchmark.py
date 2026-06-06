"""
benchmark.py
------------
Performance benchmarking suite for NextHire AI Candidate Discovery Engine.
Measures indexing time, search latency, memory usage, and throughput.

Usage:
    python ranker/benchmark.py [--sample]
"""

import os
import sys
import time
import argparse
import logging
import psutil

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("benchmark")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from job_description import JD_TEXT
from score_utils import build_candidate_text
from hybrid_ranker import HybridRanker, _tokenize

def get_memory_usage_mb() -> float:
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / (1024 * 1024)

def run_benchmarks(input_path: str):
    log.info("=" * 60)
    log.info(f"{'NEXTHIRE ENGINE PERFORMANCE BENCHMARK':^60}")
    log.info("=" * 60)

    # 1. Loading and Corpus Parsing Benchmark
    t_start = time.time()
    mem_start = get_memory_usage_mb()
    
    # Import locally
    from ranker import load_candidates
    candidates = list(load_candidates(input_path))
    mem_loaded = get_memory_usage_mb()
    load_time = time.time() - t_start
    
    log.info(f"Loaded {len(candidates):,} candidates in {load_time:.2f}s")
    log.info(f"Memory Overhead after load: {mem_loaded - mem_start:.1f} MB (Total: {mem_loaded:.1f} MB)")

    # 2. Text Corpus Build Benchmark
    t_start = time.time()
    corpus_texts = [build_candidate_text(c) for c in candidates]
    corpus_build_time = time.time() - t_start
    log.info(f"Built corpus text patterns in {corpus_build_time:.2f}s ({len(candidates)/max(0.001, corpus_build_time):.1f} docs/sec)")

    # Tokenize corpus for BM25
    t_start = time.time()
    corpus_tokens = [_tokenize(doc) for doc in corpus_texts]
    tok_time = time.time() - t_start
    log.info(f"Tokenized corpus in {tok_time:.2f}s")

    # 3. Sparse Retrieval Model Construction
    t_start = time.time()
    ranker = HybridRanker()
    
    # BM25 okapi build time
    t_bm25 = time.time()
    from hybrid_ranker import BM25OkapiPure
    bm25 = BM25OkapiPure(corpus_tokens)
    bm25_build_time = time.time() - t_bm25
    log.info(f"BM25 index construction: {bm25_build_time:.4f}s")

    # Pure TF-IDF build time
    t_tfidf = time.time()
    cache_data = {}
    ranker._pure_python_tfidf(corpus_texts, JD_TEXT, cache_data=cache_data)
    tfidf_build_time = time.time() - t_tfidf
    log.info(f"TF-IDF index construction: {tfidf_build_time:.4f}s")

    # 4. Search Query Latency Benchmarking
    log.info("-" * 60)
    log.info("Running search query evaluations...")
    
    # BM25 Search
    q_tokens = _tokenize(JD_TEXT)
    t_search = time.time()
    iterations = 5 if len(candidates) > 5000 else 50
    for _ in range(iterations):
        bm25.get_scores(q_tokens)
    bm25_search_time = (time.time() - t_search) / iterations
    log.info(f"BM25 Retrieval Latency: {bm25_search_time * 1000:.2f} ms per query")

    # TF-IDF Search
    t_search = time.time()
    for _ in range(iterations):
        ranker._pure_python_tfidf(corpus_texts, JD_TEXT, cache_data=cache_data)
    tfidf_search_time = (time.time() - t_search) / iterations
    log.info(f"TF-IDF Retrieval Latency: {tfidf_search_time * 1000:.2f} ms per query")

    # NumPy Dense Vector Matrix Search (Simulated for top 1500 candidate embeddings if sentence-transformers is skipped)
    try:
        import numpy as np
        dim = 384
        emb_count = min(1500, len(candidates))
        dummy_embeddings = np.random.randn(emb_count, dim).astype(np.float32)
        dummy_query = np.random.randn(dim).astype(np.float32)
        
        t_dense = time.time()
        dense_iterations = 100
        for _ in range(dense_iterations):
            q_norm = np.linalg.norm(dummy_query)
            q_normed = dummy_query / max(1e-12, q_norm)
            c_norms = np.linalg.norm(dummy_embeddings, axis=1, keepdims=True)
            c_norms[c_norms < 1e-12] = 1.0
            normed_c = dummy_embeddings / c_norms
            np.dot(normed_c, q_normed)
        dense_latency = (time.time() - t_dense) / dense_iterations
        log.info(f"Vectorized NumPy Dense Search (Cosine, N={emb_count}): {dense_latency * 1000:.2f} ms per query")
    except ImportError:
        log.warning("NumPy not available. Skipping simulated dense vector search latency benchmark.")

    # 5. Multi-Core Scoring Workload Benchmark
    log.info("-" * 60)
    log.info("Running multi-core parallel scoring benchmark...")
    from ranker import _score_candidate_worker
    from job_description import WEIGHTS
    from concurrent.futures import ProcessPoolExecutor
    
    # Take subset
    subset_size = min(1500, len(candidates))
    worker_inputs = []
    for i in range(subset_size):
        worker_inputs.append((candidates[i], corpus_texts[i], 0.85, WEIGHTS))
        
    t_scoring = time.time()
    with ProcessPoolExecutor() as executor:
        list(executor.map(_score_candidate_worker, worker_inputs, chunksize=100))
    scoring_latency = time.time() - t_scoring
    log.info(f"Parallel Structured Scoring (N={subset_size}): {scoring_latency:.2f}s total ({scoring_latency/subset_size*1000:.2f} ms/cand)")

    mem_end = get_memory_usage_mb()
    log.info("=" * 60)
    log.info(f"Peak RSS Memory Usage: {mem_end:.1f} MB")
    log.info(f"Benchmark Suite Completed Successfully.")
    log.info("=" * 60)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", action="store_true", help="Run benchmark on small sample dataset")
    args = parser.parse_args()

    input_path = os.path.join(
        SCRIPT_DIR, "..", "dataset", "India_runs_data_and_ai_challenge", 
        "sample_candidates.json" if args.sample or not os.path.exists(DEFAULT_INPUT) else "candidates.json"
    )
    if args.sample:
        log.info("Running benchmarks on SAMPLE candidate pool...")
    else:
        log.info("Running benchmarks on FULL candidate pool...")
        
    run_benchmarks(input_path)

if __name__ == "__main__":
    main()
