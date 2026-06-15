---
marp: true
theme: gaia
_class: lead
paginate: true
backgroundColor: #000000
color: #ffffff
---

# **NextHire: AI Recruiter Discovery & Ranking Engine**
### **Hackathon Presentation Blueprint**
*A High-Performance Two-Stage Hybrid Retrieval & Multi-Core Re-Ranking System*

Presenter: [Your Name]
Repository: [NextHire Link](file:///d:/project/nexthire)

---

## **Slide 1: Executive Summary & Project Goal**

* **Slide Goal**: Define the problem statement and the core value proposition of NextHire.
* **Key Visual**:
  ```text
  PROBLEM: Processing 100,000 resumes manually is impossible.
  Traditional search is keyword-rigid. LLM scoring is too expensive.
  
  SOLUTION: NextHire Hybrid Discovery Engine
  [100,000 Candidates] ➔ (Fast Inverted Search) ➔ [1,500 Fit] ➔ (CPU Parallel Rubric + Integrity Layer) ➔ [Top 100]
  ```

### **Slide Content**
* **The Scale Challenge**: Rank the top-100 from **100,000+ candidates (487MB)** for a *Senior AI/ML Engineer* — under **5 min, CPU-only, no network** (spec §3).
* **The trap we beat**: the dataset is seeded with keyword-stuffers and **~80 honeypots** (impossible profiles). The JD says outright: *the right answer is not the most AI keywords* — it's reasoning about what the JD **means**.
* **Our edge (3 things most teams won't do):** (1) a **JD-intent layer** that encodes the JD's explicit "do / don't want"; (2) **honeypot detection** keeping our top-100 at **0% traps**; (3) an **offline eval harness** (NDCG/MAP) so we tune without a live leaderboard.

> **Presenter Script**: 
> "Today I'm presenting NextHire. The task is to rank the top 100 from a hundred-thousand candidate pool for a Senior AI/ML Engineer — in under five minutes, CPU-only, no network. But the real challenge is that Redrob seeded the data with keyword-stuffers and about eighty honeypots with impossible profiles. The JD tells you directly: the right answer isn't the most AI keywords, it's reasoning about what the JD actually means. So we built three things most teams won't: a JD-intent layer that encodes their explicit do's and don'ts, a honeypot detector that keeps our top 100 completely trap-free, and our own offline evaluation harness so we could tune intelligently without a live leaderboard."

---

## **Slide 2: System Architecture & Data Flow**

* **Slide Goal**: High-level mapping of how the system processes data from raw JD text to dashboard visualization.
* **Visual Diagram**:

  ```text
    ┌─────────────────────────┐
    │   Job Description Text  │
    └────────────┬────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                       Stage 1: Sparse & Dense Retrieval                  │
    │     - BM25 Okapi & TF-IDF (Custom Inverted Indices)                     │
    │     - Dense Cosine Similarity (all-MiniLM-L6-v2)                        │
    │     - Reciprocal Rank Fusion (RRF) ➔ Trims 100,000 to 1,500 candidates  │
    └────────────┬────────────────────────────────────────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                       Stage 2: Parallel Scoring Rubric                  │
    │     - Multi-Core workers (ProcessPoolExecutor)                          │
    │     - Calculates: Skills Depth, Career Quality, YoE Fit, Behaviour      │
    │     - Applies: Keyword-Trap, Consulting, Job-Hopping, Salary penalties │
    └────────────┬────────────────────────────────────────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                Stage 3: Local Reasoning & Integrity Layer               │
    │     - Honeypot / impossible-profile detection (forced below top 100)    │
    │     - Deterministic, fact-grounded short + long rationales (no network) │
    └────────────┬────────────────────────────────────────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────────────────────────┐
    │ Outputs: submission.csv & submission_debug.json        │
    │ Frontend: Next.js API & Monochrome Recruiter Dashboard  │
    └────────────────────────────────────────────────────────┘
  ```

### **Presenter Script**:
> "Here is our complete architecture. We start with the raw Job Description text. We stream candidates line-by-line using Python generators. We first perform BM25, TF-IDF, and Dense Vector searches, merging them via Reciprocal Rank Fusion (RRF) to filter the pool to 1,500. Next, we run parallel structured evaluation. Finally, an integrity layer detects honeypots/impossible profiles and a deterministic, fact-grounded generator writes each rationale entirely on CPU with no network calls, as the spec requires. The output is saved and instantly visualised in our Next.js dashboard."

---

## **Slide 3: Stage 1 - Inverted Indices & Synonym Graphs**

* **Slide Goal**: Explain the performance optimization behind sparse retrieval.
* **Key Visual**:
  ```text
  [Query: "React"] ➔ Synonym Lookup ➔ [React, Next.js, Frontend, TS, JS]
  
  Inverted Index:
  "vector search" ➔ Doc 12, Doc 104, Doc 1230... (Scores computed instantly)
  ```

### **Slide Content**
* **Custom Inverted Indexing**: Avoids expensive linear scans. Instead of evaluating 100,000 profiles one-by-one, candidate profiles are indexed so lookups happen instantly for matching terms.
* **Synonym Expansion Graph**: Maps overlapping tech stacks (e.g. `react` $\leftrightarrow$ `next.js` $\leftrightarrow$ `typescript` or `pytorch` $\leftrightarrow$ `deep learning` $\leftrightarrow$ `tensor`). Prevents losing strong candidates due to resume phrasing variations.
* **Algorithmic Logic**: Implemented in [hybrid_ranker.py](file:///d:/project/nexthire/ranker/hybrid_ranker.py).
  * **BM25-Okapi**: Uses pure Python class `BM25OkapiPure` with token-frequency saturation ($k_1=1.5$) and length normalization ($b=0.75$).
  * **TF-IDF**: Fallback sparse inverted index model paired with scikit-learn's `TfidfVectorizer` (sublinear term frequency scaling).

> **Presenter Script**:
> "In Stage 1, we index the entire 487MB candidate dataset. Traditional databases do a linear scan which takes seconds. We build a custom inverted index mapping search terms to posting lists, reducing lookup latency to under a millisecond. We also implement a synonym expansion graph. If a candidate writes 'next.js' and the JD asks for 'react', our graph maps them together so candidates aren't penalized for vocabulary differences."

---

## **Slide 4: Stage 1 - Dense Retrieval & RRF Fusion**

* **Slide Goal**: Describe dense embedding search and how rankings are combined.
* **Key Visual**:
  ```text
  BM25 Ranking:   [Cand A: 1st, Cand B: 2nd, Cand C: 12th]
  TF-IDF Ranking: [Cand A: 2nd, Cand B: 1st, Cand C: 105th]
  Dense Ranking:  [Cand A: 5th, Cand B: 3rd, Cand C: 1st]
  
  RRF Fusion Score: RRF = 1 / (60 + R_bm25) + 1 / (60 + R_tfidf) + 1 / (60 + R_dense)
  Result: Cand A and Cand B rank highest, Cand C remains balanced.
  ```

### **Slide Content**
* **Dense Semantic Matching**: Implemented in [HybridRanker._dense_score](file:///d:/project/nexthire/ranker/hybrid_ranker.py#L359).
  * Uses the `sentence-transformers/all-MiniLM-L6-v2` model.
  * Encodes candidate profiles and evaluates cosine similarity.
  * Fast Approximate Nearest Neighbor (ANN) search implemented with Spotify's **Annoy Index** (`angular` metric), falling back to vectorized NumPy matrix dot-products.
* **Reciprocal Rank Fusion (RRF)**:
  * Merges rank results from BM25, TF-IDF, and (optional) Dense Embeddings.
  * Robustly balances keyword matching with semantic intent, choosing the top **1,500 candidates** for Stage 2.
* **Spec-safe by default:** the dense pass runs only in the **untimed `precompute.py`** step (spec §10.3); the **timed ranking path stays sparse** (BM25 + TF-IDF + RRF) to guarantee the 5-min, CPU-only, no-network budget. No model download or GPU is ever required to reproduce the CSV.

> **Presenter Script**:
> "To capture semantic intent, we embed candidates using Sentence Transformers. We query these embeddings using Spotify's Annoy library for fast Approximate Nearest Neighbor search. We then merge the rank positions from BM25, TF-IDF, and Dense Vector search using Reciprocal Rank Fusion, or RRF. RRF ensures that candidates who perform consistently well across keyword, frequency, and semantic matches rise to the top of our 1,500 shortlist."

---

## **Slide 5: Stage 2 - Scoring Formula (Ensemble × Gates)**

* **Slide Goal**: Detail the 5-dimension ensemble AND the multiplicative gate layers.
* **Key Visual**:
  ```text
  raw = 0.28·Semantic + 0.28·Skills + 0.22·Career + 0.10·Experience + 0.12·Behavioral

  final = raw  ×  penalty_disqualifier   (wrong role, consulting-only, keyword-trap…)
              ×  penalty_honeypot        (impossible-profile detection)
              ×  mult_JD_intent          (reads "between the lines" of the JD)
              ×  mult_availability        (unreachable ⇒ "not actually available")
  ```

### **Slide Content**
* **Additive ensemble for *fit*** (interpretable, bounded shares) — weights in [job_description.py](file:///d:/project/nexthire/ranker/job_description.py#L151).
* **Multiplicative gates for *viability*** — a fatal flaw should suppress the *whole* score, not subtract a slice. Four independent, env-toggleable layers (clean ablation).
* **Skills Depth** (28%): MUST/NICE JD-skill overlap × proficiency (Expert 1.0 → Beginner 0.35) × duration × endorsements × Redrob assessment scores.
* **Word-boundary matching (bug we fixed):** naive `kw in text` made `ann`→"ch**ann**el", `rag`→"sto**rag**e", `go`→"**Go**ogle", `java`→"**java**script" — inflating scores pool-wide and *helping keyword-stuffers*. Short tokens now require **exact token** membership. A non-AI Ops Manager dropped from 3 must-have hits → **0**.
* **Career** (22%): recency-weighted trajectory (latest role 1.6×, 2nd 1.3×) at product cos; **Experience** (10%): 5–9y sweet-spot; **Behavioral** (12%): recency, responsiveness, GitHub.

> **Presenter Script**:
> "After the 1,500-candidate shortlist, we score in two parts. First an additive ensemble for *fit* — Semantic and Skills at 28% each, Career 22%, Behavioral 12%, Experience 10%. Then four *multiplicative gates* for viability: disqualifiers, honeypots, JD-intent, and availability. A fatal flaw multiplies the whole score down rather than subtracting a slice. One important fix: our skill matcher originally did naive substring matching, so 'ann' matched 'channel' and 'go' matched 'Google' — that inflated scores and actually helped the keyword-stuffer traps. We switched to word-boundary token matching, and a non-AI Operations Manager went from three fake skill hits to zero."

---

## **Slide 6: Stage 2 - Integrity Guard & Disqualifiers**

* **Slide Goal**: Explain the penalty layer designed to catch keyword stuffing or mismatches.
* **Key Visual**:
  ```text
  Candidate X: Listed "NLP, LLM, Vector Search" in skills.
  Analysis: 0 mentions of NLP/LLMs in career history.
  Result: Keyword-Trap detected! Score multiplied by 0.50 (50% penalty).
  
  Candidate Y: 90% of career spent at TCS/Wipro.
  Result: Consulting Giant career detected! Score multiplied by 0.40 (60% penalty).
  ```

### **Slide Content**
* **The Penalty Layer**: Applied in [compute_disqualifier_penalty](file:///d:/project/nexthire/ranker/score_utils.py#L313).
* **Consulting/IT Services Filter (60% Penalty)**: Penalizes candidate profile if $>85\%$ of career history was spent at consulting companies, satisfying the JD's product company requirement.
* **Keyword Trap (50% Penalty)**: Flags candidates who list advanced AI skills but have **zero** references to AI/ML projects or titles in their actual work experience descriptions.
* **Job Hopping (25% Penalty)**: Applied to candidates averaging $<14$ months per stint.
* **Salary Mismatch (15% Penalty)**: Triggered if expected salary is $>2x$ of JD budget.

> **Presenter Script**:
> "A major weakness in traditional tools is susceptibility to keyword stuffing. NextHire features a strict integrity layer. If a candidate lists 'LLMs' as an expert skill but has zero references to machine learning in their career history descriptions, we trigger a 'Keyword-Trap' flag and cut their score by 50%. We also apply penalties for excessive job-hopping, salary mismatches, or consulting-heavy careers to align with the hiring goals of a product company."

---

## **Slide 7: Stage 3 - Local Reasoning & Integrity Layer**

* **Slide Goal**: Detail the network-free reasoning generator and honeypot integrity layer (spec: no hosted LLM, no network during ranking).
* **Key Visual**:
  ```text
  Local, deterministic, network-free reasoning for every ranked candidate:
  - Input: facts already in the candidate's profile + verified JD-skill hits.
  - Output: rank-aware, concern-bearing short (CSV) + long (dashboard) rationales.

  INTEGRITY LAYER (honeypot.py):
  - Impossible timelines (tenure > experience, jobs predating graduation)
  - Inflated proficiency (expert skills with ~0 months used) -> forced below top 100
  ```

### **Slide Content**
* **Honeypot Integrity**: Implemented in [honeypot.py](file:///d:/project/nexthire/ranker/honeypot.py). Spec §7: **>10% honeypots in top-100 ⇒ disqualified**. We detect internal contradictions (no ID special-casing): total tenure > 2× experience; a single role longer than the whole career; ≥5 "expert" skills with 0 months used.
* **The calibration story (a real engineering moment):** our first version flagged **15,378** "honeypots" — because one rule penalized people who earned a later degree (MBA/M.Tech) *while working*, which is normal in India. Our **offline eval harness caught it**, we removed the rule, and landed on **~28** high-confidence, zero-false-positive detections. **Result: 0 honeypots in the submitted top-100.**
* **Hallucination Prevention by construction**: rationales come from deterministic templates ([score_utils.py](file:///d:/project/nexthire/ranker/score_utils.py)) that cite only facts present in the profile — rank-aware, concern-bearing, no LLM, no network, nothing to hallucinate.

> **Presenter Script**:
> "Stage 3 has two jobs, both without any hosted LLM. First, integrity: Redrob seeded about 80 honeypots with subtly impossible profiles, and ranking even ten percent of them in your top 100 is an automatic disqualification. We detect them by internal contradiction — for example, more total tenure than years of experience. Here's the honest engineering moment: our first detector flagged over fifteen thousand candidates, because one rule assumed working before your graduation year is impossible — but in India, people routinely do a degree while employed. Our own eval harness surfaced this, we fixed it, and we now flag about twenty-eight with zero false positives. Zero honeypots made our final top 100. Second, reasoning: every rationale is generated locally from profile facts, so it's rank-aware, honest about concerns, and impossible to hallucinate."

---

## **Slide 7b: The Differentiator — JD-Intent Layer**

* **Slide Goal**: Show how we encode what the JD *means*, not just what it *says* — the exact skill Redrob is hiring for.
* **Key Visual**:
  ```text
  The JD literally says: "the right answer involves reasoning about the gap
  between what the JD says and what the JD means."  → we encode it directly.

  PENALTIES (JD "do NOT want")        BOOSTS (JD "ideal candidate")
  ─────────────────────────────       ──────────────────────────────
  CV/speech/robotics, no NLP/IR       shipped end-to-end at scale
  pure research, no production        pre-LLM ML/IR depth (XGBoost/LTR)
  recent-LangChain-only, no depth     external validation (OSS/papers/GitHub)
  ```

### **Slide Content**
* **Implemented in** [jd_intent.py](file:///d:/project/nexthire/ranker/jd_intent.py) as a single multiplicative adjustment (clean, ablatable).
* **Why it matters:** pure embedding similarity cannot tell a "Marketing Manager who lists AI keywords" from "an engineer who *built a recommender at a product company*." We read the career history and apply the JD's own disqualifiers and preferences.
* **Measured effect (ablation):** with JD-intent ON, candidates with the full trifecta — *shipped at scale + pre-LLM depth + external validation* — rose into the top-10, while a candidate with 16% recruiter response and "not open to work" was pushed out by the **availability multiplier** (JD: *"a 5% response rate … is not actually available — down-weight them"*). **Every top-10 placement now traces to an explicit JD sentence.**

> **Presenter Script**:
> "This is what sets us apart. The JD doesn't just list skills — it spends half a page on what they actually mean and what they explicitly don't want, and it tells you outright that the right answer is reasoning about that gap. So we encoded it. We penalize CV/speech/robotics with no NLP, pure research with no production, and recent-LangChain-only profiles with no depth. We boost demonstrable shipping, pre-LLM fundamentals, and external validation. The result is that every single one of our top-10 placements can be justified by pointing at a specific sentence in the JD — which is exactly what they'll ask us to do in the interview."

---

## **Slide 7c: Offline Evaluation Harness — Measuring in the Dark**

* **Slide Goal**: Show we built the exact thing the JD asks for — an evaluation framework — to tune without a live leaderboard.
* **Key Visual**:
  ```text
  Leaderboard is HIDDEN (spec §8). JD wants engineers who "design evaluation
  frameworks for ranking systems — NDCG, MRR, MAP." So we built one.

  evaluate.py → proxy ground truth (relevance tiers 0-5, honeypots forced to 0)
              → official metric: 0.50·NDCG@10 + 0.30·NDCG@50 + 0.15·MAP + 0.05·P@10
              → honeypot-rate DQ check
  ```

### **Slide Content**
* **Why:** no live leaderboard, no per-submission feedback — flying blind is the default. We built a rule-based proxy ground truth and scored ourselves with the **organizers' exact composite metric**.
* **How we use it:** ablation and regression-catching (we trust *deltas between runs*, not absolute values). It caught the 15,378-honeypot bug and validated every scoring change.
* **Surfaced live in the dashboard** via `/api/eval` → an "Offline Evaluation" panel showing NDCG@10/50, MAP, P@10, composite, and the honeypot rate with the 10% DQ line.

> **Presenter Script**:
> "There's no live leaderboard — you submit and find out your score at the very end. The JD explicitly wants people who design evaluation frameworks, so rather than guess, we built one. evaluate.py constructs a proxy ground truth from JD-derived rules, forces honeypots to tier zero, and scores us with the organizers' exact composite formula. We use it for ablations — every change we made was validated against it, and it's what caught our honeypot over-flagging. We even surface it live in the dashboard, so a recruiter sees our NDCG, MAP, and honeypot rate in real time."

---

## **Slide 8: Performance, Compute Compliance & Reproducibility**

* **Slide Goal**: Prove we meet every hard spec constraint and reproduce in one command.
* **Compute Compliance (spec §3 — violate any ⇒ Stage-3 disqualification):**

| Constraint | Limit | NextHire | ✓ |
| :--- | :--- | :--- | :---: |
| Runtime | ≤ 5 min | **~20 s** (100k, CPU) | ✅ |
| Memory | ≤ 16 GB | within budget | ✅ |
| Compute | CPU only, no GPU | CPU-only (`NEXTHIRE_ALLOW_GPU=0`) | ✅ |
| **Network** | **off** | **0 calls in ranking path** | ✅ |
| Disk | ≤ 5 GB intermediate | cache < 1.5 GB | ✅ |

* **The network story (why this matters):** an earlier version called the **Gemini API** to re-rank the top 15 — a direct §3 violation that would have been **disqualified at Stage 3**. We removed it entirely; all reasoning is now local. Determinism is guaranteed by a stable `(-score, candidate_id)` tie-break and zero RNG.
* **One-command reproduction:** `make reproduce` (or `python ranker/ranker.py --input … --output …`). A **`Dockerfile`** pins CPU-only + network-off and installs only manylinux wheels (numpy, scikit-learn) — builds and runs unmodified, doubling as the mandatory sandbox (spec §10.5).
* **Optional `precompute.py`:** moves index construction out of the timed window (spec §10.3 permits this); the ranking step still runs standalone.

### **Engineering optimizations**
* **Two-stage retrieve-and-rerank:** sparse retrieval over the full pool, then deep scoring on only ~1,500 — bypasses 98.5% of expensive work.
* **Custom inverted indices:** sub-millisecond term lookups vs O(N) linear scans.
* **Multi-core scoring:** `ProcessPoolExecutor` across all CPU cores; flat memory via line-by-line streaming.

> **Presenter Script**:
> "Every one of these is a hard constraint — break any and you're disqualified at Stage 3, regardless of score. We run in about twenty seconds on CPU, fully offline. That last point is critical: an earlier version of our own system called the Gemini API to re-rank the top candidates — that's a direct spec violation that would have disqualified us. We caught it, ripped it out, and made all reasoning local. The whole thing reproduces with one command, and our Dockerfile pins CPU-only and network-off so the organizers' sandbox runs it unmodified."

---

## **Slide 9: Modern Monochrome Recruiter Dashboard**

* **Slide Goal**: Showcase the UI layout and features.
* **Key Visual**:
  ```text
  [ Interactive Filters: Remote/Hybrid | Notice Period | Open To Work ]
  ┌──────────────────────────────────────────────────────────────────┐
  │ Candidate ID: CAND_0018499    Rank: #1        Score: 99.0%       │
  │ Current Title: Senior ML Engineer (Flipkart)                     │
  │                                                                  │
  │ Radar Chart Metrics:                                             │
  │   Semantic:  ████████ 92%     Skills:   █████████ 96%            │
  │   Career:    ███████ 85%      Behavior: █████████ 90%            │
  │                                                                  │
  │ AI Rationale: "Strong NLP/Vector search matching. 7.2 years      │
  │ experience at product company. 30 days notice period."           │
  └──────────────────────────────────────────────────────────────────┘
  ```

### **Slide Content**
* **Theme**: Premium monochrome developer aesthetic. No distracting colors—color is reserved strictly for status signals (Green = Verified, Amber = Warning, Red = Disqualified Flag).
* **Interactive Weight Control**: Recruiters can adjust metric weight sliders to trigger background recalculation.
* **Rich Candidate Insights**: Features radar charts, full career histories, active relocation statuses, and recruiter activity.

> **Presenter Script**:
> "Here is a mockup of our Recruiter Console. It uses a premium monochrome theme where colors are reserved purely for action points or flags. Clicking any candidate opens a drawer showing an interactive radar chart, their career history timeline, and the AI rationale. Recruiters can also adjust scoring sliders on the fly to recalculate and prioritize different hiring aspects."

---

## **Slide 10: Production Infrastructure Architecture**

* **Slide Goal**: Describe the deployment and infrastructure layer.
* **System Component Flow**:
  ```text
  [ Next.js API Request ] ➔ [ Redis Queue (Job Enqueued) ] ➔ [ Background Worker (worker.py) ]
                                                                     │
  [ Live Progress Logs ]  ◀─── [ Redis Pub/Sub Events ] ◀─────────────┘
  ```

### **Bullet Points**
* **Decoupled Architecture**: Recalculation jobs are enqueued to a Redis task queue (`BullMQ` pattern), separating Web thread lifecycles from heavy Python CPU workloads.
* **Asynchronous worker.py**: A background worker daemon pops jobs from Redis and executes the ranking pipeline.
* **Redis Pub/Sub Log Streaming**: Streams worker terminal outputs directly back to the Next.js API endpoint in real-time.
* **Circuit Breaker Safety**: In the absence of a running Redis instance, the API route spawns a local python subprocess directly to process results, guaranteeing high availability.

> **Presenter Script**:
> "For a production deployment, we decoupled the web server from the ranking engine. Recalculation requests are pushed onto a Redis task queue. A background Python worker daemon processes the queue and streams live stdout logs back to the web server using Redis Pub/Sub. If Redis experiences an outage, our Next.js API automatically triggers a circuit breaker fallback, running the ranking script as a subprocess to keep the app functional."

---

## **Slide 11: Validation, Quality Assurance & Summary**

* **Slide Goal**: Conclude with test results and future plans.
* **Format validation (validate.py)** — passes every spec §3 / §6 check: exactly 100 rows, unique ranks 1–100, unique `CAND_XXXXXXX` IDs, strictly non-increasing scores, deterministic tie-break.
* **Offline quality (evaluate.py, proxy):** NDCG@10 saturated, **0 honeypots in top-100** (well under the 10% DQ line) — the Stage-3 filter we explicitly defend against.
* **Stage-readiness:** §1 format ✅ · §3 reproduce/compute ✅ (one command, Docker, offline) · §4 reasoning ✅ (rank-aware, fact-grounded, honest concerns) · §5 defense ✅ (every choice traces to a JD sentence).
* **Honest roadmap:** fit JD-intent weights via learning-to-rank (LightGBM/LambdaMART) on labeled data; sharpen the proxy with a small human-labeled set; optional dense pass on the full pool.

> **Presenter Script**:
> "To close: our output passes every format rule — 100 rows, unique ranks, monotonic scores, deterministic tie-breaks. On our offline harness, honeypots in the top 100 are zero, comfortably under the ten-percent disqualification line. We're ready across the board: one-command reproduction, fully offline, Docker for the sandbox; reasoning that's rank-aware and honest about concerns; and most importantly, every ranking decision traces back to a specific sentence in the JD — so when you ask us to defend our work, we can. Honest next step: with labeled data we'd fit the JD-intent weights with a learning-to-rank model instead of setting them by hand. Thank you — happy to take questions."
