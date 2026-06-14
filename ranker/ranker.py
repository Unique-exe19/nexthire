"""
ranker.py
---------
NextHire — AI Recruiter Ranking Engine
Upgraded with Redis caching, GPU-acceleration, Candidate Sharding,
and Explainable AI scoring breakdowns.

Usage:
    py ranker.py [--input PATH] [--output PATH] [--top-k N]
"""

import sys
import os
import json
import csv
import time
import argparse
import logging
import hashlib
import pickle
from typing import Any, List, Dict, Tuple, Optional

# ── Setup logging ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ranker")

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_INPUT = os.path.join(
    SCRIPT_DIR, "..", "dataset", "India_runs_data_and_ai_challenge", "candidates.json"
)
DEFAULT_OUTPUT = os.path.join(SCRIPT_DIR, "..", "submission.csv")

# ── Local imports ──────────────────────────────────────────────────────────────
sys.path.insert(0, SCRIPT_DIR)
from job_description import JD_TEXT, WEIGHTS, experience_score
from score_utils import (
    build_candidate_text,
    score_skills,
    score_career_quality,
    score_behavioral,
    compute_disqualifier_penalty,
    generate_reasoning,
    generate_long_reasoning,
)
from hybrid_ranker import HybridRanker, _rank_list, reciprocal_rank_fusion, _normalize, redis_client, redis_available
from honeypot import honeypot_flags
from concurrent.futures import ProcessPoolExecutor


def _score_candidate_worker(item):
    """Worker function for parallel structured scoring, returning explainable contributions"""
    c, text, sem_s, w = item
    p = c.get("profile", {})
    yoe = p.get("years_of_experience", 0)

    # Individual dimension scores
    skill_s, skill_evidence = score_skills(c, text)
    career_s = score_career_quality(c, text)
    exp_s = experience_score(yoe)
    behavioral_s = score_behavioral(c)

    # Weighted ensemble
    raw_score = (
        w["semantic"]       * sem_s
        + w["skill_match"]  * skill_s
        + w["career_quality"] * career_s
        + w["experience_fit"] * exp_s
        + w["behavioral"]   * behavioral_s
    )

    # Disqualifier penalty
    penalty, disqualifiers = compute_disqualifier_penalty(c, text)

    # Honeypot / impossible-profile penalty (spec §7: >10% honeypots in top 100 ⇒ DQ).
    # Detects internal contradictions (impossible timelines, inflated proficiency)
    # so honeypots collapse below the top 100 without special-casing IDs.
    hp_penalty, hp_flags = honeypot_flags(c)
    penalty *= hp_penalty
    if hp_flags:
        disqualifiers.extend(hp_flags)

    final_score = raw_score * penalty

    scores_dict = {
        "semantic":    sem_s,
        "skills":      skill_s,
        "career":      career_s,
        "experience":  exp_s,
        "behavioral":  behavioral_s,
        "final":       final_score,
    }

    # Generate explainable contribution breakdown
    contributions = [
        {
            "dimension": "Semantic Relevance", 
            "delta": round(w["semantic"] * sem_s, 4), 
            "reason": f"Semantic overlap with job profile (cosine: {sem_s:.2f})"
        },
        {
            "dimension": "Skills Depth", 
            "delta": round(w["skill_match"] * skill_s, 4), 
            "reason": f"Matched {len(skill_evidence.get('must_have_hits', []))} must-have & {len(skill_evidence.get('nice_hits', []))} nice-to-have skills"
        },
        {
            "dimension": "Career Growth", 
            "delta": round(w["career_quality"] * career_s, 4), 
            "reason": "Evaluated company tenure consistency and title progression"
        },
        {
            "dimension": "Experience Fit", 
            "delta": round(w["experience_fit"] * exp_s, 4), 
            "reason": f"Years of experience ({yoe} years) matches sweet-spot range"
        },
        {
            "dimension": "Behavioral Profile", 
            "delta": round(w["behavioral"] * behavioral_s, 4), 
            "reason": "Redrob platform responsiveness, recency, and availability signals"
        }
    ]

    if penalty < 1.0:
        penalty_pct = round((1.0 - penalty) * 100, 1)
        penalty_deduction = round(raw_score * (1.0 - penalty), 4)
        contributions.append({
            "dimension": "Disqualifier Penalty",
            "delta": -penalty_deduction,
            "reason": f"Applied -{penalty_pct}% penalty for: {', '.join(disqualifiers)}"
        })

    return {
        "candidate_id":  c.get("candidate_id"),
        "score":         final_score,
        "raw_score":     raw_score,
        "penalty":       penalty,
        "scores":        scores_dict,
        "skill_evidence": skill_evidence,
        "disqualifiers": disqualifiers,
        "contributions": contributions,
    }


def build_candidate_semantic_text(c: dict) -> str:
    """Concatenate core profile fields for compact, high-quality semantic embeddings."""
    p = c.get("profile", {})
    parts = []
    parts.append(p.get("headline", ""))
    parts.append(p.get("summary", ""))
    parts.append(p.get("current_title", ""))
    skills = [s.get("name", "") for s in c.get("skills", [])[:5]]
    parts.extend(skills)
    return " ".join(filter(None, parts))


# ── Sharding Helper ───────────────────────────────────────────────────────────

def shard_dataset(candidates: list) -> dict:
    """Shard candidate array by geographical region or skills for sharded search."""
    shards = {
        "Noida": [],
        "Pune": [],
        "Hyderabad": [],
        "Other": []
    }
    for c in candidates:
        loc = str(c.get("profile", {}).get("location", "")).lower()
        if "noida" in loc:
            shards["Noida"].append(c)
        elif "pune" in loc:
            shards["Pune"].append(c)
        elif "hyderabad" in loc:
            shards["Hyderabad"].append(c)
        else:
            shards["Other"].append(c)
    return shards


# ─────────────────────────────────────────────────────────────────────────────
# Candidate Loading
# ─────────────────────────────────────────────────────────────────────────────

def load_candidates(path: str):
    """Stream candidates from JSON array or JSONL file."""
    log.info(f"Loading candidates from: {path}")
    with open(path, "r", encoding="utf-8") as f:
        first_char = f.read(1)
        f.seek(0)

        if first_char == "[":
            log.info("Detected JSON array — loading...")
            try:
                candidates = json.load(f)
                log.info(f"Progress: Loaded {len(candidates):,} / 100,000 candidates")
                yield from candidates
            except json.JSONDecodeError as e:
                log.error(f"JSON parse error: {e}")
                sys.exit(1)
        else:
            log.info("Detected JSONL — streaming...")
            count = 0
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                    count += 1
                    if count % 10000 == 0:
                        log.info(f"Progress: Loaded {count:,} / 100,000 candidates...")
                except json.JSONDecodeError:
                    continue
            log.info(f"Progress: Loaded {count:,} / 100,000 candidates")


# ─────────────────────────────────────────────────────────────────────────────
# Main Ranking Pipeline
# ─────────────────────────────────────────────────────────────────────────────

def rank_candidates(input_path: str, output_path: str, top_k: int = 100, user_weights: Optional[dict] = None):
    t0 = time.time()

    # Generate dataset hash for Redis index lookups
    file_size = os.path.getsize(input_path)
    mtime = os.path.getmtime(input_path)
    dataset_hash = hashlib.sha256(f"{input_path}_{file_size}_{mtime}".encode('utf-8')).hexdigest()

    # Derive cache path robustly for BOTH candidates.json and candidates.jsonl.
    # (input_path.replace(".json", ...) corrupted ".jsonl" paths.)
    cache_file = os.path.splitext(input_path)[0] + "_cache.pkl"
    use_cache = False
    cache_data = {}

    # 1. Try Redis cache first
    if redis_available:
        try:
            cached_corpus = redis_client.get(f"nexthire:cache:corpus:{dataset_hash}")
            if cached_corpus:
                log.info("Corpus found in Redis! Fetching token structures from Redis cache...")
                cache_data = pickle.loads(cached_corpus)
                candidates = cache_data["candidates"]
                candidate_texts = cache_data["candidate_texts"]
                candidate_semantic_texts = cache_data["candidate_semantic_texts"]
                use_cache = True
                # Fast update logs for frontend
                log.info(f"Progress: Loaded {len(candidates):,} / 100,000 candidates")
        except Exception as e:
            log.warning(f"Failed to fetch corpus from Redis: {e}")

    # 2. Try File cache second
    if not use_cache and os.path.exists(cache_file):
        try:
            log.info(f"Checking file cache validity for {cache_file}...")
            with open(cache_file, "rb") as f:
                cache_data = pickle.load(f)
            if (cache_data.get("file_size") == file_size and 
                cache_data.get("mtime") == mtime):
                use_cache = True
                candidates = cache_data["candidates"]
                candidate_texts = cache_data["candidate_texts"]
                candidate_semantic_texts = cache_data["candidate_semantic_texts"]
                log.info("File cache is valid! Loading parsed candidates and TF-IDF index from cache...")
                # Fast update logs for frontend
                log.info(f"Progress: Loaded {len(candidates):,} / 100,000 candidates")
                
                # Push back to Redis if available
                if redis_available:
                    try:
                        serialized = pickle.dumps(cache_data)
                        if len(serialized) < 500 * 1024 * 1024:
                            redis_client.setex(f"nexthire:cache:corpus:{dataset_hash}", 86400 * 7, serialized)
                            log.info("Saved loaded file corpus to Redis cache ✓")
                    except Exception as redis_err:
                        log.warning(f"Failed to save file corpus back to Redis: {redis_err}")
            else:
                log.info("File cache is stale. Rebuilding cache...")
        except Exception as e:
            log.warning(f"Failed to load cache: {e}. Rebuilding...")

    # 3. Parse candidates if no cache hits
    if not use_cache:
        log.info("Phase 1/4: Building candidate corpus from source...")
        candidates = []
        candidate_texts = []
        candidate_semantic_texts = []

        for c in load_candidates(input_path):
            candidates.append(c)
            candidate_texts.append(build_candidate_text(c))
            candidate_semantic_texts.append(build_candidate_semantic_text(c))

        cache_data = {
            "file_size": file_size,
            "mtime": mtime,
            "candidates": candidates,
            "candidate_texts": candidate_texts,
            "candidate_semantic_texts": candidate_semantic_texts
        }

        # Save to file cache
        try:
            log.info(f"Saving newly indexed candidate corpus to file: {cache_file}...")
            with open(cache_file, "wb") as f:
                pickle.dump(cache_data, f, protocol=pickle.HIGHEST_PROTOCOL)
        except Exception as e:
            log.warning(f"Failed to save file cache: {e}")

        # Save to Redis cache
        if redis_available:
            try:
                serialized = pickle.dumps(cache_data)
                if len(serialized) < 500 * 1024 * 1024:
                    redis_client.setex(f"nexthire:cache:corpus:{dataset_hash}", 86400 * 7, serialized)
                    log.info("Saved candidate corpus to Redis cache ✓")
                else:
                    log.warning("Corpus size exceeds Redis 512MB limit, skipping Redis cache.")
            except Exception as e:
                log.warning(f"Failed to save corpus to Redis: {e}")

    n = len(candidates)
    log.info(f"Corpus: {n:,} candidates | {time.time()-t0:.1f}s elapsed")

    # Sharding stats printout
    shards = shard_dataset(candidates)
    for shard_name, shard_list in shards.items():
        log.info(f"Shard [{shard_name}]: {len(shard_list):,} candidates indexed.")

    # ── Phase 2: Hybrid Semantic Scoring ───────────────────────────────────
    log.info("Phase 2/4: Hybrid semantic scoring (First-pass: BM25 + TF-IDF)...")
    t1 = time.time()
    ranker = HybridRanker()
    
    # First-pass retrieval
    first_pass_scores, semantic_raw = ranker.fit_transform(
        candidate_texts, JD_TEXT, cache_path=cache_file.replace(".pkl", "_embeddings.npy"),
        cache_data=cache_data, dataset_hash=dataset_hash
    )
    log.info(f"First-pass semantic scoring done: {time.time()-t1:.1f}s")

    # Save cache if we newly indexed (since TF-IDF states are added to cache_data)
    if not use_cache:
        try:
            with open(cache_file, "wb") as f:
                pickle.dump(cache_data, f, protocol=pickle.HIGHEST_PROTOCOL)
        except Exception:
            pass

    # Filter to top candidates for second-pass dense embeddings
    FILTER_LIMIT = 1500 if n > 1500 else n
    sorted_indices = sorted(range(n), key=lambda i: first_pass_scores[i], reverse=True)
    top_indices = sorted_indices[:FILTER_LIMIT]
    
    log.info(f"Filtered corpus to top {FILTER_LIMIT} candidates. Running second-pass dense vector search...")
    top_semantic_texts = [candidate_semantic_texts[i] for i in top_indices]
    
    # Compute dense embeddings similarity only for the top candidates
    dense_scores_subset = ranker.dense_score_only(top_semantic_texts, JD_TEXT)
    
    # Fuse BM25, TF-IDF, and Dense ranks for the top subset
    subset_bm25_scores = [semantic_raw["bm25"][i] for i in top_indices]
    subset_tfidf_scores = [semantic_raw["tfidf"][i] for i in top_indices]
    
    rank_lists = [
        _rank_list(subset_bm25_scores),
        _rank_list(subset_tfidf_scores),
        _rank_list(dense_scores_subset)
    ]
    rrf_fused_subset = reciprocal_rank_fusion(rank_lists)
    final_semantic_scores_subset = _normalize(rrf_fused_subset)
    log.info("Dense vector search and RRF fusion completed.")

    # ── Phase 3: Structured + Behavioral Scoring (Parallel) ────────────────
    log.info(f"Phase 3/4: Structured & behavioral scoring (parallel) on top {FILTER_LIMIT} candidates...")
    t2 = time.time()

    w = user_weights if user_weights else WEIGHTS
    log.info(f"Using weights: {w}")
    
    worker_inputs = []
    for idx_in_subset, orig_idx in enumerate(top_indices):
        c = candidates[orig_idx]
        text = candidate_texts[orig_idx]
        sem_s = final_semantic_scores_subset[idx_in_subset]
        worker_inputs.append((c, text, sem_s, w))

    with ProcessPoolExecutor() as executor:
        scored_results = list(executor.map(_score_candidate_worker, worker_inputs, chunksize=100))

    # Reconstruct results and merge semantic breakdowns
    results = []
    for idx_in_subset, (r, orig_idx) in enumerate(zip(scored_results, top_indices)):
        c = candidates[orig_idx]
        r["_candidate"] = c
        r["scores"]["bm25"] = semantic_raw["bm25"][orig_idx]
        r["scores"]["tfidf"] = semantic_raw["tfidf"][orig_idx]
        r["scores"]["dense"] = dense_scores_subset[idx_in_subset]
        results.append(r)

    log.info(f"Scoring done: {time.time()-t2:.1f}s")

    # ── Phase 4: Sort, rank, normalize, output ─────────────────────────────
    # NOTE: All scoring is fully local, deterministic, CPU-only and network-free.
    # The previous hosted-LLM (Gemini) re-ranking phase was removed because the
    # Redrob spec (§3) forbids any external API / network call during the ranking
    # step. Long-form reasoning is generated locally below via generate_long_reasoning.
    log.info("Phase 4/4: Sorting and generating output...")
    results.sort(key=lambda x: (-x["score"], x["candidate_id"]))

    # Normalize scores to [0.10 .. 0.999] monotonically
    max_score = results[0]["score"] if results else 1.0
    min_score = results[top_k - 1]["score"] if len(results) >= top_k else 0.0
    score_range = max_score - min_score if abs(max_score - min_score) > 1e-9 else 1.0

    top = results[:top_k]
    top_scores = [r["score"] for r in top]
    log.info(f"Top-{top_k} raw score range: {min(top_scores):.4f} – {max(top_scores):.4f}")

    rows = []
    sidecar = {}

    for rank_idx, r in enumerate(top, 1):
        c = r["_candidate"]
        norm_score = 0.10 + 0.89 * (r["score"] - min_score) / score_range
        norm_score = round(min(0.999, max(0.001, norm_score)), 4)

        # Scale explainable contributions proportionally to final score
        scaling_factor = norm_score / max(1e-12, r["raw_score"] * r["penalty"])
        scaled_contributions = []
        for contrib in r["contributions"]:
            scaled_contrib = dict(contrib)
            scaled_contrib["delta"] = round(contrib["delta"] * scaling_factor, 4)
            scaled_contributions.append(scaled_contrib)

        r["scores"]["final"] = norm_score

        # Short reasoning for CSV (local, rank-aware, fact-grounded, concern-bearing)
        reasoning = generate_reasoning(c, r["scores"], rank_idx, r["skill_evidence"], r["disqualifiers"])

        # Long reasoning (local, deterministic — no network)
        long_reasoning = generate_long_reasoning(
            c, r["scores"], rank_idx, r["skill_evidence"], r["disqualifiers"]
        )

        rows.append({
            "candidate_id": r["candidate_id"],
            "rank": rank_idx,
            "score": norm_score,
            "reasoning": reasoning,
        })

        # Build sidecar entry
        sidecar[r["candidate_id"]] = {
            "rank": rank_idx,
            "score": norm_score,
            "dimensions": {
                "semantic": {
                    "score": round(r["scores"]["semantic"], 4),
                    "bm25":  round(r["scores"]["bm25"], 4),
                    "tfidf": round(r["scores"]["tfidf"], 4),
                    "dense": round(r["scores"].get("dense", 0.0), 4),
                },
                "skills": {
                    "score":          round(r["scores"]["skills"], 4),
                    "must_have_hits": r["skill_evidence"].get("must_have_hits", []),
                    "nice_hits":      r["skill_evidence"].get("nice_hits", []),
                    "must_hit_count": r["skill_evidence"].get("must_hit_count", 0),
                    "assessment_score": r["skill_evidence"].get("assessment_score", 0),
                },
                "career": {
                    "score": round(r["scores"]["career"], 4),
                },
                "experience": {
                    "score": round(r["scores"]["experience"], 4),
                    "years": c.get("profile", {}).get("years_of_experience", 0),
                },
                "behavioral": {
                    "score": round(r["scores"]["behavioral"], 4),
                    "open_to_work": c.get("redrob_signals", {}).get("open_to_work_flag", False),
                    "notice_days":  c.get("redrob_signals", {}).get("notice_period_days", 90),
                },
            },
            "disqualifiers": r["disqualifiers"],
            "reasoning_long": long_reasoning,
            "penalty": round(r["penalty"], 4),
            "contributions": scaled_contributions, # Push explainable AI breakdowns to JSON
        }

    # Ensure strictly monotonic scores
    for i in range(1, len(rows)):
        if rows[i]["score"] > rows[i - 1]["score"]:
            rows[i]["score"] = rows[i - 1]["score"]

    # Write CSV
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["candidate_id", "rank", "score", "reasoning"])
        writer.writeheader()
        writer.writerows(rows)

    # Write sidecar JSON
    sidecar_path = output_path.replace(".csv", "_debug.json")
    with open(sidecar_path, "w", encoding="utf-8") as f:
        json.dump(sidecar, f, indent=2)

    total_time = time.time() - t0
    log.info(f"Done! Written {len(rows)} candidates to: {output_path}")
    log.info(f"Sidecar JSON: {sidecar_path}")
    log.info(f"Total runtime: {total_time:.1f}s")

    # ── Print top-10 preview ───────────────────────────────────────────────
    print("\n" + "=" * 72)
    print(f"{'NEXTHIRE HYBRID RANKING RESULTS':^72}")
    print("=" * 72)
    print(f"{'Rk':<4} {'Score':<7} {'Candidate ID':<16} {'Title':<28} {'YoE':<5} {'Sem':<6} {'Ski':<6}")
    print("-" * 72)
    for row in rows[:10]:
        r_match = next((r for r in top if r["candidate_id"] == row["candidate_id"]), {})
        c_match = r_match.get("_candidate", {})
        p = c_match.get("profile", {})
        title = p.get("current_title", "N/A")[:27]
        yoe   = p.get("years_of_experience", 0)
        sem   = r_match.get("scores", {}).get("semantic", 0)
        ski   = r_match.get("scores", {}).get("skills", 0)
        print(f"{row['rank']:<4} {row['score']:.4f}  {row['candidate_id']:<16} {title:<28} {yoe:<5.1f} {sem:<6.2f} {ski:<6.2f}")
    print("-" * 72)
    print(f"\nFull results: {output_path}")
    print(f"Debug sidecar: {sidecar_path}\n")

    return rows


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="NextHire AI Recruiter Ranking Engine")
    parser.add_argument("--input",  "-i", default=DEFAULT_INPUT)
    parser.add_argument("--output", "-o", default=DEFAULT_OUTPUT)
    parser.add_argument("--top-k",  "-k", type=int, default=100)
    parser.add_argument("--weights", "-w", type=str, default=None,
                        help="Custom weight json string e.g. '{\"semantic\": 0.3, \"skill_match\": 0.3, ...}'")
    args = parser.parse_args()

    user_weights = None
    if args.weights:
        try:
            user_weights = json.loads(args.weights)
            # Verify weights sum to 1.0
            s = sum(user_weights.values())
            if abs(s - 1.0) > 1e-9:
                log.error(f"Provided weights must sum to 1.0, got {s}")
                sys.exit(1)
        except Exception as e:
            log.error(f"Failed to parse weights JSON: {e}")
            sys.exit(1)

    if not os.path.exists(args.input):
        log.error(f"Input file not found: {args.input}")
        sys.exit(1)

    rank_candidates(input_path=args.input, output_path=args.output, top_k=args.top_k, user_weights=user_weights)


if __name__ == "__main__":
    main()
