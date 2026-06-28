"""
precompute.py
-------------
Optional one-time precomputation step (Redrob spec §10.3 explicitly allows
precomputation to exceed the 5-minute window — only the ranking step that
produces the CSV must fit inside it).

This builds the parsed-corpus + BM25 + TF-IDF index cache (and, if
sentence-transformers is installed, dense embeddings) and writes it to the local
file cache next to the candidates file. A subsequent `python ranker/ranker.py`
run then LOADS the cache instead of rebuilding it, keeping the timed ranking step
comfortably under budget.

It is entirely optional: `ranker.py` builds the cache itself on a cold run. Use
this only when you want to move index/embedding construction out of the timed run.

Usage:
    python ranker/precompute.py --input ./candidates.jsonl
"""

import os
import sys
import time
import json
import pickle
import logging
import argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("precompute")

from ranker import load_candidates, build_candidate_semantic_text, DEFAULT_INPUT
from score_utils import build_candidate_text
from hybrid_ranker import HybridRanker
from job_description import JD_TEXT


def build_cache(input_path: str):
    t0 = time.time()
    file_size = os.path.getsize(input_path)
    mtime = os.path.getmtime(input_path)
    cache_file = os.path.splitext(input_path)[0] + "_cache.pkl"

    log.info(f"Precomputing corpus + indices for {input_path} ...")
    candidates, candidate_texts, candidate_semantic_texts = [], [], []
    for c in load_candidates(input_path):
        candidates.append(c)
        candidate_texts.append(build_candidate_text(c))
        candidate_semantic_texts.append(build_candidate_semantic_text(c))
    log.info(f"Parsed {len(candidates):,} candidates in {time.time()-t0:.1f}s")

    cache_data = {
        "file_size": file_size,
        "mtime": mtime,
        "candidates": candidates,
        "candidate_texts": candidate_texts,
        "candidate_semantic_texts": candidate_semantic_texts,
    }

    # Populate BM25 + TF-IDF index state into cache_data. Precompute is the ONLY
    # place dense embeddings may be built (it is untimed, spec §10.3). Opt in with
    # `NEXTHIRE_USE_DENSE=1 python ranker/precompute.py`; the model is fetched here,
    # outside the timed ranking step, so the ranker itself never touches the network.
    if os.environ.get("NEXTHIRE_USE_DENSE", "0").lower() in ("1", "true", "yes"):
        log.info("NEXTHIRE_USE_DENSE=1 → dense embeddings will be built (untimed precompute).")
    ranker = HybridRanker()
    embeddings_cache = cache_file.replace(".pkl", "_embeddings.npy")
    ranker.fit_transform(
        candidate_texts, JD_TEXT,
        cache_path=embeddings_cache, cache_data=cache_data,
    )

    log.info(f"Writing cache to {cache_file} ...")
    with open(cache_file, "wb") as f:
        pickle.dump(cache_data, f, protocol=pickle.HIGHEST_PROTOCOL)

    size_gb = os.path.getsize(cache_file) / (1024 ** 3)
    log.info(f"Done. Cache: {cache_file} ({size_gb:.2f} GB) | total {time.time()-t0:.1f}s")
    log.info("Now run: python ranker/ranker.py --input <candidates> --output <participant_id>.csv")


def main():
    parser = argparse.ArgumentParser(description="NextHire precomputation (optional, untimed)")
    parser.add_argument("--input", "-i", default=DEFAULT_INPUT)
    args = parser.parse_args()
    if not os.path.exists(args.input):
        log.error(f"Input file not found: {args.input}")
        sys.exit(1)
    build_cache(args.input)


if __name__ == "__main__":
    main()
