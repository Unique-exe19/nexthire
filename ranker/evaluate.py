"""
evaluate.py
-----------
Offline evaluation harness for the NextHire ranker.

The Redrob leaderboard is HIDDEN during the competition (spec §8) — no feedback
until results close. The JD also explicitly wants engineers who "design
evaluation frameworks for ranking systems — NDCG, MRR, MAP". So we build our own.

What it does
============
1. Builds a PROXY ground truth: assigns every candidate a relevance tier 0-5 from
   transparent, JD-derived rules (title fit, product-vs-consulting, real AI/ML in
   career history, experience band, domain fit, availability). Honeypots (detected
   via internal contradictions) are forced to tier 0, exactly as the real ground
   truth does (spec §7).
2. Scores a submission.csv against those proxy tiers with the SAME metrics and
   weights the organizers use (spec §4):
       composite = 0.50*NDCG@10 + 0.30*NDCG@50 + 0.15*MAP + 0.05*P@10
3. Reports the honeypot rate in the top 100 (spec §3 Stage-3 DQ filter: >10% ⇒ DQ).

This is a PROXY, not the hidden truth — use it to compare design choices
(ablations) and catch regressions, not as an absolute score. Relative deltas
between runs are what matter.

Usage
=====
    python ranker/evaluate.py                       # eval ../submission.csv
    python ranker/evaluate.py --submission foo.csv  # eval a specific file
    python ranker/evaluate.py --rebuild-labels      # force relabel the pool

Outputs a JSON report to ../eval_report.json (consumed by the web dashboard).
"""

import os
import sys
import csv
import json
import math
import pickle
import argparse
import logging

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("evaluate")

from ranker import load_candidates, DEFAULT_INPUT
from honeypot import honeypot_flags
from job_description import (
    POSITIVE_TITLES, DISQUALIFIER_TITLES, PURE_CONSULTING_COMPANIES,
    POSITIVE_INDUSTRIES, JD_PREFERRED_LOCATIONS,
)

DEFAULT_SUBMISSION = os.path.join(SCRIPT_DIR, "..", "submission.csv")
REPORT_PATH = os.path.join(SCRIPT_DIR, "..", "eval_report.json")

# AI/ML evidence keywords we expect to see *in career history descriptions*,
# not just in the skills list (the JD's core "reads profiles, not keywords" test).
_AI_CAREER_KWS = (
    "machine learning", "deep learning", "nlp", "natural language",
    "information retrieval", "ranking", "retrieval", "embedding", "vector",
    "recommendation", "search engine", "semantic search", "llm", "transformer",
    "neural", "pytorch", "tensorflow", "rag", "fine-tun", "learning to rank",
)
# Domains the JD explicitly de-prioritizes when NLP/IR is absent.
_OTHER_DOMAIN_KWS = ("computer vision", "image", "object detection", "speech",
                     "tts", "asr", "robotics", "gan")


def _text_blob(c: dict) -> str:
    p = c.get("profile", {})
    parts = [p.get("headline", ""), p.get("summary", ""), p.get("current_title", "")]
    for j in c.get("career_history", []):
        parts.append(j.get("title", ""))
        parts.append(j.get("description", ""))
        parts.append(j.get("industry", ""))
    for s in c.get("skills", []):
        parts.append(s.get("name", ""))
    return " ".join(parts).lower()


def proxy_relevance(c: dict) -> int:
    """
    Assign a relevance tier 0..5 from transparent JD-derived rules.
    Deliberately rule-based and independent of the ranker's score so the eval
    is not purely circular. Honeypots are forced to 0 by the caller.
    """
    p = c.get("profile", {})
    title = (p.get("current_title", "") or "").lower()
    yoe = p.get("years_of_experience", 0) or 0
    history = c.get("career_history", [])
    blob = _text_blob(c)

    # ── Hard zero: clearly wrong current role (JD "do NOT want" list) ──────────
    hard_wrong = ("marketing", "accountant", "hr ", "human resources", "sales",
                  "customer support", "customer service", "civil engineer",
                  "mechanical engineer", "graphic designer", "content writer",
                  "operations manager")
    if any(w in title for w in hard_wrong):
        return 0

    # ── Signal components ─────────────────────────────────────────────────────
    title_pos = any(pt in title for pt in POSITIVE_TITLES)
    title_neg = any(dt in title for dt in DISQUALIFIER_TITLES)

    # Real AI/ML evidence in career history descriptions (not just skills).
    hist_text = " ".join(
        (j.get("description", "") + " " + j.get("title", "")) for j in history
    ).lower()
    ai_in_career = any(kw in hist_text for kw in _AI_CAREER_KWS)

    # Product company tenure vs pure consulting.
    consult_m, total_m = 0, 0
    for j in history:
        d = j.get("duration_months", 0) or 0
        total_m += d
        if any(cc in (j.get("company", "") or "").lower() for cc in PURE_CONSULTING_COMPANIES):
            consult_m += d
    consulting_only = total_m > 0 and consult_m / total_m > 0.85
    product_exposure = any(
        any(ind in (j.get("industry", "") or "").lower() for ind in POSITIVE_INDUSTRIES)
        for j in history
    )

    # Domain mismatch: CV/speech/robotics with no NLP/IR.
    other_domain = any(k in blob for k in _OTHER_DOMAIN_KWS)
    nlp_ir = any(k in blob for k in ("nlp", "natural language", "information retrieval",
                                     "retrieval", "ranking", "search", "embedding"))
    domain_mismatch = other_domain and not nlp_ir

    # Shipping at scale + pure-research signals (JD-intent, independent of ranker).
    shipped = any(k in blob for k in ("shipped", "deployed", "production", "at scale",
                                      "real users", "end-to-end", "end to end"))
    research_only = (
        sum(1 for k in ("research scholar", "postdoc", "post-doc", "academic",
                        "publication", "research fellow", "thesis") if k in blob) >= 2
        and not shipped
    )

    # Experience band fit (JD 5-9 sweet spot).
    in_band = 5 <= yoe <= 9
    near_band = 4 <= yoe <= 11

    # ── Tiering ───────────────────────────────────────────────────────────────
    if consulting_only or (title_neg and not title_pos) or domain_mismatch or research_only:
        return 1  # adjacent-at-best / explicitly de-prioritized

    score = 0
    score += 2 if title_pos else 0
    score += 2 if ai_in_career else 0
    score += 1 if product_exposure else 0
    score += 1 if in_band else (0 if not near_band else 1)
    score += 1 if shipped else 0  # JD prizes demonstrable shipping
    # availability nudge (JD: must be reachable)
    sig = c.get("redrob_signals", {})
    if sig.get("open_to_work_flag") and sig.get("recruiter_response_rate", 0) >= 0.3:
        score += 1

    # Map raw 0..8 → tier 0..5
    if score >= 7:
        return 5
    if score >= 5:
        return 4
    if score >= 3:
        return 3
    if score >= 2:
        return 2
    return 1


# ── Label cache (rules are cheap, but parsing 487MB isn't) ─────────────────────

def build_labels(input_path: str, rebuild: bool = False) -> dict:
    cache = os.path.splitext(input_path)[0] + "_eval_labels.pkl"
    if not rebuild and os.path.exists(cache):
        try:
            with open(cache, "rb") as f:
                data = pickle.load(f)
            log.info(f"Loaded {len(data['labels']):,} proxy labels from cache.")
            return data
        except Exception as e:
            log.warning(f"Label cache unreadable ({e}); rebuilding.")

    log.info("Labeling candidate pool with proxy relevance tiers...")
    labels, honeypots = {}, set()
    n = 0
    for c in load_candidates(input_path):
        cid = c.get("candidate_id")
        hp_pen, hp_flags = honeypot_flags(c)
        if hp_flags and hp_pen <= 0.15:
            labels[cid] = 0
            honeypots.add(cid)
        else:
            labels[cid] = proxy_relevance(c)
        n += 1
        if n % 20000 == 0:
            log.info(f"  labeled {n:,} ...")
    data = {"labels": labels, "honeypots": honeypots}
    try:
        with open(cache, "wb") as f:
            pickle.dump(data, f, protocol=pickle.HIGHEST_PROTOCOL)
        log.info(f"Cached labels to {cache}")
    except Exception as e:
        log.warning(f"Could not cache labels: {e}")
    return data


# ── Metrics ────────────────────────────────────────────────────────────────────

def _dcg(rels: list) -> float:
    return sum((2 ** r - 1) / math.log2(i + 2) for i, r in enumerate(rels))


def ndcg_at_k(ranked_rels: list, ideal_rels: list, k: int) -> float:
    idcg = _dcg(sorted(ideal_rels, reverse=True)[:k])
    if idcg <= 0:
        return 0.0
    return _dcg(ranked_rels[:k]) / idcg


def average_precision(ranked_rels: list, relevant_threshold: int = 3,
                      total_relevant: int = None) -> float:
    """
    Average Precision over the submitted ranking. The denominator is the number
    of relevant items reachable within the submitted list (min of total relevant
    in the pool and the list length) — so a 100-row submission is not
    structurally penalized for not containing all thousands of pool-relevant
    candidates. This mirrors how MAP behaves on a fixed-depth cutoff.
    """
    hits, ap = 0, 0.0
    for i, r in enumerate(ranked_rels, 1):
        if r >= relevant_threshold:
            hits += 1
            ap += hits / i
    reachable = min(total_relevant, len(ranked_rels)) if total_relevant else hits
    return (ap / reachable) if reachable else 0.0


def evaluate(submission_path: str, labels_data: dict) -> dict:
    labels = labels_data["labels"]
    honeypots = labels_data["honeypots"]

    with open(submission_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    rows.sort(key=lambda r: int(r["rank"]))
    ranked_ids = [r["candidate_id"] for r in rows]
    ranked_rels = [labels.get(cid, 0) for cid in ranked_ids]

    # Ideal: best achievable relevance ordering across the whole pool.
    ideal_rels = sorted(labels.values(), reverse=True)
    total_relevant = sum(1 for v in labels.values() if v >= 3)

    ndcg10 = ndcg_at_k(ranked_rels, ideal_rels, 10)
    ndcg50 = ndcg_at_k(ranked_rels, ideal_rels, 50)
    mapv = average_precision(ranked_rels, 3, total_relevant)
    p10 = sum(1 for r in ranked_rels[:10] if r >= 3) / 10.0
    p5 = sum(1 for r in ranked_rels[:5] if r >= 3) / 5.0
    composite = 0.50 * ndcg10 + 0.30 * ndcg50 + 0.15 * mapv + 0.05 * p10

    hp_in_top100 = sum(1 for cid in ranked_ids[:100] if cid in honeypots)
    hp_rate = hp_in_top100 / max(1, len(ranked_ids[:100]))

    # Tier histogram of the submitted top-100.
    hist = {t: sum(1 for r in ranked_rels if r == t) for t in range(6)}

    return {
        "submission": os.path.basename(submission_path),
        "metrics": {
            "NDCG@10": round(ndcg10, 4),
            "NDCG@50": round(ndcg50, 4),
            "MAP": round(mapv, 4),
            "P@10": round(p10, 4),
            "P@5": round(p5, 4),
            "composite": round(composite, 4),
        },
        "honeypot": {
            "in_top_100": hp_in_top100,
            "rate": round(hp_rate, 4),
            "disqualified": hp_rate > 0.10,
        },
        "tier_histogram_top100": hist,
        "pool": {
            "size": len(labels),
            "relevant_tier3plus": total_relevant,
            "honeypots_total": len(honeypots),
        },
        "note": "Proxy ground truth (rule-based). Use deltas between runs, not absolute values.",
    }


def main():
    ap = argparse.ArgumentParser(description="NextHire offline eval (proxy NDCG/MAP/P@10)")
    ap.add_argument("--input", "-i", default=DEFAULT_INPUT, help="candidates file")
    ap.add_argument("--submission", "-s", default=DEFAULT_SUBMISSION, help="submission CSV")
    ap.add_argument("--rebuild-labels", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.submission):
        log.error(f"Submission not found: {args.submission}")
        sys.exit(1)

    labels_data = build_labels(args.input, rebuild=args.rebuild_labels)
    report = evaluate(args.submission, labels_data)

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    m = report["metrics"]
    print("\n" + "=" * 60)
    print(f"{'OFFLINE EVAL (proxy ground truth)':^60}")
    print("=" * 60)
    print(f"  NDCG@10 : {m['NDCG@10']:.4f}   (weight 0.50)")
    print(f"  NDCG@50 : {m['NDCG@50']:.4f}   (weight 0.30)")
    print(f"  MAP     : {m['MAP']:.4f}   (weight 0.15)")
    print(f"  P@10    : {m['P@10']:.4f}   (weight 0.05)")
    print(f"  P@5     : {m['P@5']:.4f}")
    print("-" * 60)
    print(f"  COMPOSITE : {m['composite']:.4f}")
    print("-" * 60)
    hp = report["honeypot"]
    flag = "  ⚠ DISQUALIFIED" if hp["disqualified"] else "  ✓ within limit"
    print(f"  Honeypots in top-100: {hp['in_top_100']} ({hp['rate']:.1%}){flag}")
    print(f"  Top-100 tier histogram: {report['tier_histogram_top100']}")
    print(f"\n  Report written to: {REPORT_PATH}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
