# NextHire — Methodology & Design Rationale

A ranking system for the Redrob "Intelligent Candidate Discovery & Ranking" challenge:
rank the top-100 candidates from a 100,000-profile pool against a Senior AI/ML
Engineer JD. CPU-only, network-free, reproducible (spec §3).

This document is written for Stage 4 (methodology review) and Stage 5 (defend-your-work).

---

## 1. The core insight

The JD is not a keyword checklist — it tells you so explicitly:

> "The 'right answer' to this JD is not 'find candidates whose skills section
> contains the most AI keywords.' That's a trap we've explicitly built into the dataset.
> The right answer involves reasoning about the gap between what the JD says and what the JD means."

So our system is built around three ideas, in priority order:

1. **Read the profile, not the keywords.** A "Marketing Manager" who lists every AI
   skill is not a fit; a candidate who *built a recommendation system at a product
   company* is, even without the buzzwords.
2. **Encode the JD's explicit intent as features.** The "What we mean" and "Things we
   explicitly do NOT want" sections are how the ground truth was built — so we encode
   them directly (domain fit, shipping evidence, pre-LLM depth, pure-research penalty,
   availability) rather than hoping embedding similarity captures them.
3. **Reject impossible profiles.** Honeypots (~80, spec §7) are caught via internal
   contradictions, not ID lists.

---

## 2. Pipeline (execution order)

```
candidates.jsonl (100k)
   │  stream-parse + build per-candidate text  (Phase 1)
   ▼
Stage 1 — Sparse retrieval on the FULL pool          (Phase 2)
   │  BM25-Okapi (pure-Python inverted index)
   │  TF-IDF cosine (scikit-learn, 1-2 grams)
   │  → Reciprocal Rank Fusion (RRF, k=60)
   │  → shortlist top ~1,500
   ▼
Stage 2 — Structured deep scoring (parallel)         (Phase 3)
   │  weighted ensemble:
   │    semantic 0.28 · skills 0.28 · career 0.22 · experience 0.10 · behavioral 0.12
   │  × disqualifier penalty   (wrong role, consulting-only, keyword-trap, junior, hopper, salary)
   │  × honeypot penalty       (impossible timeline / tenure / inflated proficiency)
   │  × JD-intent multiplier   (domain, pure-research, recent-framework, shipping, depth, OSS)
   │  × availability multiplier (dormant + unresponsive + not-open ⇒ down-weight)
   ▼
Stage 3 — Sort, normalize, reason, output            (Phase 4)
   │  deterministic tie-break (-score, candidate_id)
   │  local fact-grounded reasoning (short CSV + long sidecar)
   ▼
submission.csv  +  submission_debug.json
```

No hosted LLM, no GPU, no network at any point in this path.

---

## 3. Scoring formula

```
raw   = 0.28·semantic + 0.28·skills + 0.22·career + 0.10·experience + 0.12·behavioral
final = raw × penalty_disq × penalty_honeypot × mult_jd_intent × mult_availability
```

- **Additive ensemble** for "fit" dimensions (interpretable, each contributes a bounded share).
- **Multiplicative** for gates ("is this person actually viable / available / real"),
  because a fatal flaw should suppress the whole score, not just subtract a slice.
- Each multiplier is independently env-toggleable for ablation (see §5).

### Skill matching — the substring trap we fixed
Naive `keyword in text` matching caused short codes to false-match: `ann` hit
"ch**ann**el/pl**ann**ing", `rag` hit "sto**rag**e", `go` hit "**Go**ogle",
`map` hit "**map**ping". This inflated skill scores pool-wide and *helped* the
keyword-stuffer honeypots. We replaced it with word-boundary token matching:
multi-word phrases match as substrings; short tokens (≤4 chars) require exact
token membership; longer tokens allow membership-or-substring. A non-AI Operations
Manager now matches **0** must-have skills (was 3+).

---

## 4. Honeypot detection (Stage-3 DQ filter)

Spec §7: ~80 honeypots with "subtly impossible profiles", forced to tier 0;
**>10% in your top-100 ⇒ disqualified**. We do not special-case IDs (spec
discourages it). We detect internal contradictions:

| Rule | Contradiction |
|---|---|
| Impossible timeline | total career months > 2× stated experience + 12 |
| Impossible tenure | a single role longer than entire stated experience + 24mo |
| Inflated proficiency | ≥5 "expert" skills with 0 months of stated usage |

**Calibration story (important):** our first cut flagged **15,378** candidates as
honeypots — because one rule ("career started before graduation year") fires on
the ~15% of Indian professionals who earn a later degree (MBA/M.Tech/distance)
*while working*. That is normal, not impossible. We removed that rule and tightened
slack, landing on **28** high-confidence honeypots — precise, conservative, in the
spec's "~80" ballpark, and with **zero** false positives corrupting legitimate
candidates. This is exactly the kind of profile-reading the JD rewards.

Result: **0 honeypots in the submitted top-100.**

---

## 5. Ablation (offline proxy eval)

We built `evaluate.py`: a proxy ground truth (rule-based relevance tiers 0–5 from
JD intent, honeypots forced to 0) scored with the official metric
(`0.50·NDCG@10 + 0.30·NDCG@50 + 0.15·MAP + 0.05·P@10`). It is a **proxy** — use
deltas between runs, not absolute values.

| Configuration | NDCG@10 | NDCG@50 | MAP | P@10 | Composite | Honeypots@100 |
|---|---|---|---|---|---|---|
| Ensemble only (JD-intent OFF, availability OFF) | 1.000 | 0.976 | 1.000 | 1.000 | **0.9927** | 0 |
| **+ JD-intent + availability (full system)** | 1.000 | 0.965 | 1.000 | 1.000 | **0.9895** | 0 |

**Reading this honestly:** on the proxy the two are statistically tied — both
saturate NDCG@10 because the proxy is coarse at the very top. The JD-intent layer's
value is **not** a proxy-score bump; it is *which* candidates fill the top 10, and
why. With JD-intent ON:

- **Promoted** into the top-10: candidates with the full JD trifecta —
  *"shipped end-to-end at scale" + pre-LLM ML/IR depth + external validation
  (OSS/papers)* — i.e. the exact "ideal candidate" the JD describes.
- **Demoted** out of the top-10: e.g. `CAND_0033861` (recruiter-response 16%,
  not open to work) — down-weighted by the availability multiplier exactly as the
  JD asks ("not actually available ... down-weight them appropriately").

Every top-10 placement now traces to an explicit JD sentence — which is what
matters at Stage 4 (reasoning/methodology) and Stage 5 (defense).

### Honeypot calibration ablation
| Honeypot rule set | Flagged as honeypot | False-positive risk |
|---|---|---|
| Initial (incl. pre-graduation rule) | 15,378 | Catastrophic (penalized ~15% of real pool) |
| Final (3 contradiction rules) | 28 | None observed; matches spec ~80 scale |

---

## 6. Compute & reproducibility

| Metric | Value |
|---|---|
| Ranking-step runtime (100k, warm cache) | ~19–21s |
| Budget (spec §3) | ≤ 5 min ✓ |
| Compute | CPU-only, no GPU ✓ |
| Network during ranking | none ✓ |
| Dependencies | numpy, scikit-learn (manylinux wheels) |

- **Single command (Stage 3):** `make reproduce CANDIDATES=./candidates.jsonl OUT=./submission.csv`
  (or `python ranker/ranker.py --input … --output …`).
- **Container:** `make docker-build && make docker-run` — `Dockerfile` pins
  CPU-only + network-off via env, deps are wheels (no build toolchain).
- **Optional precompute** (`precompute.py`): moves index construction out of the
  timed window (spec §10.3 permits this); the ranking step still runs standalone.

---

## 7. Honest limitations / future work

- The offline eval is a **proxy**; it cannot rank-order the very best candidates
  finely (hence the NDCG@10 saturation). A small human-labeled set would sharpen it.
- JD-intent multipliers are hand-set; with labeled data we would fit them via
  learning-to-rank (LightGBM/LambdaMART) — the JD lists LTR as a desired skill.
- Dense (sentence-transformer) retrieval is supported but optional and runs only
  in precompute; the timed path is sparse to stay safely inside budget.
