---
marp: true
theme: gaia
_class: lead
paginate: true
backgroundColor: #000000
color: #ffffff
---

# **NextHire**
### **AI Candidate Discovery & Ranking Engine**
*Ranking 100,000 candidates the way a great recruiter would — by understanding fit, not matching keywords.*

Redrob Hackathon — Intelligent Candidate Discovery & Ranking Challenge
Presenter: NextHire Team  ·  Repository: github.com/Unique-exe19/nexthire

---

## **Slide 1: The Problem**

> *"Recruiters go through hundreds of profiles and still often miss the right person. Not because the talent isn't there — but because keyword filters can't see what actually matters."*

* **The scale:** 100,000 candidates (487 MB) for **one** Senior AI/ML Engineer role.
* **The trap:** the JD explicitly says the right answer is **not** "most AI keywords." The dataset is seeded with keyword-stuffers, plain-language Tier-5 gems, and ~80 impossible **honeypots**.
* **Our mandate:** rank like a recruiter who actually *reads* profiles — reasoning about the gap between what the JD **says** and what it **means**.

> **Script:** "Recruiters miss great people not because talent is missing, but because keyword filters can't see what matters. Our job was to build the system that does — over a hundred-thousand-candidate pool, for a deliberately tricky role, with traps built into the data."

---

## **Slide 2: Solution Overview**

**What is our solution?** A two-stage, CPU-only ranking engine that retrieves broadly, then scores deeply by *reading the whole profile* — career history, behavioral signals, and the JD's own stated preferences — and explains every decision in plain language.

**What differentiates us from traditional matching:**

| Traditional keyword/embedding match | NextHire |
| :--- | :--- |
| Counts keyword / vector overlap | **Reads career history** for real evidence |
| "Marketing Manager" with AI skills ranks high | **Disqualifier + honeypot gates** catch them |
| Ignores whether the person is reachable | **Availability multiplier** (JD: "not actually available → down-weight") |
| Black-box score | **Fact-grounded reasoning** per candidate |
| Ranks the JD's *words* | Encodes the JD's **intent** (what it does/doesn't want) |

> **Script:** "Our differentiator is simple: we treat the JD as a spec, not a keyword bag. We read the career history, we gate out impossible and unavailable candidates, and we explain every placement with facts from the profile."

---

## **Slide 3: JD Understanding & Candidate Evaluation**

**Key requirements extracted from the JD:**
* 5–9 yrs, **applied ML at product companies** (not pure services/research).
* Embeddings / retrieval / ranking / vector search shipped **to real users at scale**.
* Evaluation literacy (NDCG/MRR/MAP). Pre-LLM ML depth, not recent-framework-only.
* **Explicitly NOT wanted:** consulting-only careers, CV/speech/robotics without NLP/IR, pure research without production, title-chasers.

**Most important candidate signals:** real AI/ML evidence in *career descriptions* · product-company tenure · experience band fit (5–9y) · **availability** (open-to-work, recruiter response rate, recency).

**Beyond keyword matching:** we score the *career trajectory* (recency-weighted), apply the JD's own disqualifiers, and reward demonstrable shipping — so a Tier-5 who "built a recommender at a product company" outranks a keyword-stuffer.

> **Script:** "The JD spends half a page on what it actually means. We extracted those requirements into explicit signals — and crucially, we read the career history descriptions, where real evidence lives, not just the skills tags anyone can stuff."

---

## **Slide 4: Ranking Methodology**

**Retrieve → Score → Rank:**

**1. Retrieve (full 100k, sparse):** BM25-Okapi + TF-IDF, fused via **Reciprocal Rank Fusion (RRF, k=60)** → shortlist ~1,500. **High-recall union** adds candidates with a strong *structural* signal (positive title + AI/ML in career history) that keywords miss → ~1,700.

**2. Score (shortlist, parallel):** 5-dimension weighted ensemble —
`0.28 semantic · 0.28 skills · 0.22 career · 0.12 behavioral · 0.10 experience`.

**3. Combine — additive fit × multiplicative gates:**
```
final = ensemble
      × disqualifier_penalty   (wrong role, consulting-only, keyword-trap, hopper)
      × honeypot_penalty       (impossible profiles → forced below top 100)
      × jd_intent_multiplier   (domain / research / framework / shipping / depth / OSS)
      × availability_multiplier
```
**Models/heuristics:** pure-Python BM25, scikit-learn TF-IDF, RRF, rule-based structured scoring. Deterministic tie-break `(-score, candidate_id)`.

> **Script:** "We retrieve broadly with sparse fusion, score deeply on a shortlist, and combine signals as an additive 'fit' score multiplied by gates for viability, honesty, and availability — so one fatal flaw suppresses the whole score, not just a slice."

---

## **Slide 5: Explainability & Data Validation**

**How decisions are explained:** every candidate gets a rank-aware rationale that names **real facts** — title, years, a concrete shipped artifact + employer ("*built a ranking pipeline at Zomato*"), and verified JD-skill hits. A sidecar JSON exposes the full per-dimension breakdown in the dashboard.

**Preventing hallucination:** reasoning is generated by **deterministic templates that can only cite fields present in the profile** — there is no LLM in the path, so there is nothing to invent. *Verified: top reasonings cross-checked against raw profiles — 0 hallucinations.*

**Handling suspicious / low-quality profiles:**
* **Honeypots** (~80 impossible profiles) caught by **internal contradiction** — tenure ≫ experience, single role > whole career, expert skills with 0 months used. **Result: 0 honeypots in our top-100** (DQ threshold is >10%).
* **Keyword-trap** penalty: AI skills listed but no AI evidence in career history.
* Calibrated to avoid false positives (e.g. legit later degrees while working).

> **Script:** "Every justification cites a real fact — and because no LLM touches the ranking path, hallucination is structurally impossible. Impossible profiles are caught by self-contradiction, not guesswork, and we ship zero honeypots in the top 100."

---

## **Slide 6: End-to-End Workflow**

```text
 candidates.jsonl (100k)              Job Description
        │                                   │
        ▼                                   ▼
 [1] Stream-parse + build per-candidate text blob
        │
        ▼
 [2] RETRIEVE — BM25 + TF-IDF → RRF fusion → top ~1,500
        + high-recall union (structural-signal candidates)  → ~1,700
        │
        ▼
 [3] SCORE (parallel, multi-core) — 5-dim ensemble
        × disqualifier × honeypot × jd-intent × availability gates
        │
        ▼
 [4] RANK — sort, deterministic tie-break, normalize scores
        │
        ▼
 [5] EXPLAIN — fact-grounded reasoning (short CSV + long sidecar)
        │
        ▼
 submission.csv  +  submission_debug.json  →  Next.js dashboard
```

> **Script:** "From JD and candidates in, to a ranked, explained CSV out — five deterministic stages, fully reproducible, no manual steps."

---

## **Slide 7: System Architecture**

```text
┌──────────────────────── Python Ranking Engine (CPU-only, offline) ───────────────────────┐
│  ranker.py        orchestrates the 4 phases                                               │
│  hybrid_ranker.py BM25-Okapi (inverted index) + TF-IDF + RRF  (+ optional dense, precompute)│
│  score_utils.py   5-dim structured scoring + fact-grounded reasoning                       │
│  job_description.py  JD constants, skill lists, weights                                    │
│  jd_intent.py     JD "do/don't want" → score multipliers (ablatable)                       │
│  honeypot.py      impossible-profile detection                                            │
│  evaluate.py      offline NDCG/MAP/P@10 + honeypot rate (proxy ground truth)              │
│  validate.py      spec format check · test_ranker.py  9 unit tests                         │
└───────────────────────────────────────────────────────────────────────────────────────────┘
        │ submission.csv + submission_debug.json + eval_report.json
        ▼
┌──────────────────────── Next.js 16 Recruiter Dashboard ──────────────────────────────────┐
│  /api/candidates · /api/eval   ·   radar charts, career timeline, AI rationale, eval panel │
└───────────────────────────────────────────────────────────────────────────────────────────┘
   Reproducibility: Dockerfile + Makefile  ·  `make reproduce` = single Stage-3 command
```

> **Script:** "The engine is plain Python — numpy and scikit-learn — split into focused modules: retrieval, scoring, JD-intent, honeypot, and a self-built eval harness. A Next.js dashboard renders the output, and a Dockerfile reproduces the whole thing in one command."

---

## **Slide 8: Results & Performance**

**Ranking quality (offline harness, proxy ground truth — official composite metric):**

| Metric | Score | Weight |
| :--- | :---: | :---: |
| NDCG@10 | **1.00** | 0.50 |
| NDCG@50 | **0.965** | 0.30 |
| MAP | **1.00** | 0.15 |
| P@10 | **1.00** | 0.05 |
| **Composite** | **0.9895** | — |
| **Honeypots in top-100** | **0 / 100** | DQ if >10% |

**Compute compliance (spec §3) — all met:**

| Constraint | Limit | NextHire |
| :--- | :--- | :--- |
| Runtime | ≤ 5 min | **~19 s** |
| Compute | CPU only | ✅ CPU only |
| Network | Off | ✅ **zero network calls** |
| Memory | ≤ 16 GB | ✅ streaming parse |

> **Script:** "On our own harness — built because the leaderboard is hidden — we score a 0.99 composite with zero honeypots in the top 100. And we do it in nineteen seconds, CPU-only, with no network — comfortably inside every hard constraint. We're honest that this is a proxy: we use it for deltas and regression-catching, not to predict absolute rank."

---

## **Slide 9: Technologies Used**

| Tech | Where | Why chosen |
| :--- | :--- | :--- |
| **Python 3.12** | ranking engine | Ecosystem, readability, the JD's stated language |
| **scikit-learn** | TF-IDF vectorizer | Battle-tested, fast sparse vectors, CPU-only |
| **NumPy** | vector math / cosine | Vectorized, manylinux wheels (no build toolchain) |
| **Pure-Python BM25-Okapi** | sparse retrieval | Custom inverted index → sub-ms lookups, zero heavy deps |
| **RRF** | rank fusion | Robustly merges BM25/TF-IDF/dense without score calibration |
| **ProcessPoolExecutor** | parallel scoring | Uses all CPU cores; 1,700 candidates in ~2 s |
| **Next.js 16 + React** | dashboard | Server components, streaming, fast recruiter UI |
| **Docker + Makefile** | reproduction | One-command Stage-3 reproduction, offline, unmodified |
| *(optional)* sentence-transformers | precompute only | Dense recall **off the timed path** — keeps ranking network/GPU-free |

**Deliberately avoided in the ranking path:** hosted LLM APIs (spec forbids), GPUs, Redis-over-network — all gated off to guarantee reproducibility.

> **Script:** "Every technology was chosen for CPU-only, offline reproducibility. numpy and scikit-learn do the heavy lifting on manylinux wheels — no build toolchain, no GPU, no network. Anything heavier, like dense embeddings, lives in optional precompute, never in the timed run. That's a deliberate engineering decision, not a limitation."

---

# **Thank You**
### Questions?

**NextHire** — ranking candidates the way a great recruiter would.
*Repository: github.com/Unique-exe19/nexthire · Reproduce: `make reproduce`*
