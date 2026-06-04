"""
ranker.py
---------
NextHire — AI Recruiter Ranking Engine
Redrob Hackathon: Intelligent Candidate Discovery & Ranking Challenge

Pipeline:
  1. Build candidate text corpus
  2. Hybrid semantic scoring (BM25 + TF-IDF via RRF)
  3. Structured scoring (skills, career, experience, behavioral)
  4. Weighted ensemble + disqualifier penalties
  5. Sort, rank, normalize → CSV output + sidecar JSON

Usage:
    py ranker.py [--input PATH] [--output PATH] [--top-k N] [--sample]
"""

import sys
import os
import json
import csv
import time
import argparse
import logging
from typing import Any

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
from hybrid_ranker import HybridRanker, _rank_list, reciprocal_rank_fusion, _normalize
from concurrent.futures import ProcessPoolExecutor


def _score_candidate_worker(item):
    """Worker function for parallel structured scoring (ProcessPoolExecutor)"""
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
    final_score = raw_score * penalty

    scores_dict = {
        "semantic":    sem_s,
        "skills":      skill_s,
        "career":      career_s,
        "experience":  exp_s,
        "behavioral":  behavioral_s,
        "final":       final_score,
    }

    return {
        "candidate_id":  c.get("candidate_id"),
        "score":         final_score,
        "raw_score":     raw_score,
        "penalty":       penalty,
        "scores":        scores_dict,
        "skill_evidence": skill_evidence,
        "disqualifiers": disqualifiers,
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
                log.info(f"Loaded {len(candidates):,} candidates")
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
                except json.JSONDecodeError:
                    continue
            log.info(f"Loaded {count:,} candidates")


# ─────────────────────────────────────────────────────────────────────────────
# Main Ranking Pipeline
# ─────────────────────────────────────────────────────────────────────────────

def rank_candidates(input_path: str, output_path: str, top_k: int = 100):
    t0 = time.time()

    # ── Phase 1: Build corpus ──────────────────────────────────────────────
    log.info("Phase 1/4: Building candidate corpus...")
    candidates = []
    candidate_texts = []
    candidate_semantic_texts = []

    for c in load_candidates(input_path):
        candidates.append(c)
        candidate_texts.append(build_candidate_text(c))
        candidate_semantic_texts.append(build_candidate_semantic_text(c))

    n = len(candidates)
    log.info(f"Corpus: {n:,} candidates | {time.time()-t0:.1f}s elapsed")

    # ── Phase 2: Hybrid Semantic Scoring (Retrieve-and-Rerank Pipeline) ────
    log.info("Phase 2/4: Hybrid semantic scoring (First-pass: BM25 + TF-IDF)...")
    t1 = time.time()
    ranker = HybridRanker()
    
    # First-pass RRF scoring using BM25 and TF-IDF on all candidates
    first_pass_scores, semantic_raw = ranker.fit_transform(candidate_texts, JD_TEXT)
    log.info(f"First-pass semantic scoring done: {time.time()-t1:.1f}s")

    # Filter to top candidates for second-pass dense embeddings
    FILTER_LIMIT = 1500 if n > 1500 else n
    
    # Get indices sorted by first-pass score descending
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

    w = WEIGHTS
    worker_inputs = []
    for idx_in_subset, orig_idx in enumerate(top_indices):
        c = candidates[orig_idx]
        text = candidate_texts[orig_idx]
        sem_s = final_semantic_scores_subset[idx_in_subset]
        worker_inputs.append((c, text, sem_s, w))

    with ProcessPoolExecutor() as executor:
        # parallel execution on 16 cores (chunksize=100 is optimal for 1500 candidates)
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
    log.info("Phase 4/4: Sorting and generating output...")
    results.sort(key=lambda x: (-x["score"], x["candidate_id"]))

    # ── Phase 3b: LLM Re-ranking of Top 15 Candidates ──────────────────────
    log.info("Phase 3b/4: LLM Re-ranking of top 15 candidates...")
    from llm_reranker import rerank_top_candidates
    top_15 = results[:15]
    llm_results = rerank_top_candidates(top_15, JD_TEXT)
    
    for r in top_15:
        cid = r["candidate_id"]
        if cid in llm_results:
            # Apply minor score adjustments (max change +/- 0.05)
            r["score"] = max(0.0, r["score"] + llm_results[cid]["score_adjustment"])
            r["scores"]["final"] = r["score"]
            r["llm_reasoning_long"] = llm_results[cid]["reasoning_long"]
        else:
            r["llm_reasoning_long"] = None

    # Re-sort results after LLM re-ranking adjustments
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

        # Update scores dict with final normalized score for reasoning
        r["scores"]["final"] = norm_score

        # Short reasoning for CSV
        reasoning = generate_reasoning(c, r["scores"], rank_idx, r["skill_evidence"])

        # Long reasoning for dashboard (prefers LLM reasoning if available)
        long_reasoning = r.get("llm_reasoning_long")
        if not long_reasoning:
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
    parser.add_argument("--sample", action="store_true",
                        help="Use sample_candidates.json (50 candidates)")
    args = parser.parse_args()

    if args.sample:
        args.input = os.path.join(
            SCRIPT_DIR, "..", "dataset",
            "India_runs_data_and_ai_challenge", "sample_candidates.json"
        )
        args.output = os.path.join(SCRIPT_DIR, "..", "sample_submission_out.csv")
        log.info("Running on SAMPLE dataset (50 candidates)")

    if not os.path.exists(args.input):
        log.error(f"Input file not found: {args.input}")
        sys.exit(1)

    rank_candidates(input_path=args.input, output_path=args.output, top_k=args.top_k)


if __name__ == "__main__":
    main()
