# Architecture Decision Record (ADR)

Design decisions behind NextHire, with the *why* and the alternatives considered.
This is the document to read before the Stage-5 defend-your-work interview — every
choice below can be defended in one sentence that traces back to the JD or the spec.

---

### ADR-01 — Two-stage retrieve-then-rerank, not score-everything

**Decision.** Sparse retrieval (BM25 + TF-IDF + RRF) shortlists ~1,500–2,500 of the
100k pool; expensive structured scoring runs only on that shortlist.

**Why.** Scoring all 100k with the full rubric (and any dense model) blows the
5-minute CPU budget (spec §3). Recruiters search a live pool — this is the same
latency-quality tradeoff the JD says it cares about.

**Alternative rejected.** Embed + cosine over the whole pool: slower, and it ranks
keyword-stuffers highly — the exact trap the JD built into the dataset.

---

### ADR-02 — High-recall union on the first stage

**Decision.** The shortlist is the keyword top-1500 **unioned** with any candidate
who has a positive AI/ML title *and* real AI/ML evidence in career history.

**Why.** The JD's "right answer" explicitly includes Tier-5 candidates who *built*
ranking/search systems but don't buzzword-stuff their profile. A pure keyword
first-pass drops them before they are ever scored. The union recovered ~200 such
candidates at negligible cost.

**Alternative rejected.** Raising the keyword cutoff to top-5000: more compute, still
keyword-biased, doesn't specifically protect the structural-signal candidates.

---

### ADR-03 — Additive ensemble × multiplicative gates

**Decision.**
`final = (0.28·sem + 0.28·skills + 0.22·career + 0.10·exp + 0.12·behavioral)
× disqualifier × honeypot × jd_intent × availability`.

**Why.** "Fit" dimensions should each contribute a bounded, interpretable share, so
we add them. "Is this person viable / real / available" are gates — a fatal flaw
should suppress the *whole* score, not subtract a slice — so they multiply.

**Alternative rejected.** One flat weighted sum with penalties as negative terms:
a honeypot with enough positive keywords could still net out high.

---

### ADR-04 — Word-boundary skill matching, not substring

**Decision.** Short skill codes (≤4 chars: `ann`, `rag`, `e5`, `go`, `map`, `bm25`…)
must match as whole tokens; only multi-word phrases match as substrings.

**Why.** Substring matching made `ann` hit "ch**ann**el", `rag` hit "sto**rag**e",
`go` hit "**Go**ogle", `java` hit "**java**script". That inflated skill scores
pool-wide and *helped* keyword-stuffers. A non-AI Operations Manager went from
3 false must-have hits to 0.

**Evidence.** Locked in by `test_skills_no_substring_false_positive`.

---

### ADR-05 — Honeypots via internal contradictions, not ID lists

**Decision.** Flag impossible profiles by self-contradiction: total tenure ≫ stated
experience; a single role longer than the whole career; many "expert" skills with 0
months used. No special-casing of candidate IDs (spec §7 discourages it).

**Why & calibration.** The first cut flagged **15,378** candidates — because one rule
("career started before graduation") fires on the ~15% of Indian professionals who
earn a later degree *while working*. That is normal, not impossible. Removing that
rule and tightening slack landed on a precise ~28, zero observed false positives.
**Result: 0 honeypots in the submitted top-100** (DQ threshold is >10%).

**Evidence.** `test_honeypot_*` (catches impossible, spares clean).

---

### ADR-06 — JD intent encoded as explicit multipliers

**Decision.** Encode the JD's "What we mean" / "Do NOT want" sections directly:
penalize CV/speech/robotics-without-NLP, pure-research-without-production, and
recent-framework-without-depth; boost demonstrable shipping, pre-LLM depth, and
external validation (OSS/papers).

**Why.** Those sections are *how the hidden ground truth was built*. Encoding them is
more reliable than hoping embedding similarity captures "product over research."

**Honesty.** On our proxy eval the layer is score-neutral (both saturate NDCG@10);
its value is *which* candidates fill the top-10 and *why* — every placement traces
to a JD sentence, which is what Stage 4/5 evaluate. Fully ablatable via
`NEXTHIRE_JD_INTENT=0`.

---

### ADR-07 — Availability as a multiplier

**Decision.** Dormant + unresponsive + not-open-to-work candidates are down-weighted
multiplicatively, not just via the 12% behavioral term.

**Why.** The JD: "a perfect-on-paper candidate who hasn't logged in for 6 months and
has a 5% response rate is, for hiring purposes, not actually available. Down-weight
them appropriately." A small additive term doesn't move a strong-on-paper profile
enough; a gate does.

---

### ADR-08 — No hosted LLM anywhere in the ranking step

**Decision.** All reasoning is generated locally by deterministic, fact-grounded
templates. The earlier Gemini re-ranking path was deleted.

**Why.** Spec §3 forbids network calls during ranking (no OpenAI/Anthropic/Cohere/
Gemini). A hosted call is an automatic Stage-3 DQ and contradicts the code at Stage 5.
Local generation also makes hallucination structurally impossible — the text can only
cite fields that exist in the profile (verified by `test_reasoning_*`).

---

### ADR-09 — Redis / dense models are optional, off the timed path

**Decision.** Redis is env-gated **off** by default; dense sentence-transformer
embeddings run only in optional `precompute.py`, never in the timed ranking step.

**Why.** Redis was reaching a *cloud* instance — a hidden network dependency that
added latency and risked Stage-3 reproduction. Dense model loading downloads weights
(network) and wants a GPU. Keeping both off the timed path guarantees the
single-command run is CPU-only, network-free, and reproducible in the Stage-3
Docker sandbox.

---

### ADR-10 — Build our own offline eval harness

**Decision.** `evaluate.py` builds a rule-based proxy ground truth and reports
NDCG@10/50, MAP, P@10, composite, and honeypot rate.

**Why.** The leaderboard is hidden (spec §8) — without an offline harness you tune
blind. And the JD explicitly wants engineers who "design evaluation frameworks for
ranking systems — NDCG, MRR, MAP." We treat it as a proxy (deltas, not absolutes)
and are upfront about its saturation limits.
