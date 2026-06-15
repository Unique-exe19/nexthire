"""
jd_intent.py
------------
JD-intent scoring layer.

The Redrob JD has explicit "What we mean by this" and "Things we explicitly do
NOT want" sections, and a closing note stating the right answer "involves
reasoning about the gap between what the JD says and what the JD means." Those
sections are how the hidden ground truth was constructed — so we encode them
directly as score multipliers instead of relying on keyword similarity alone.

Each function returns (multiplier, reason_or_None). A multiplier < 1.0 is a
penalty the JD asked for; > 1.0 is a boost for a signal the JD prizes. Everything
is pure-Python, deterministic, CPU-only, network-free.

The whole layer is gated by the NEXTHIRE_JD_INTENT env var (default ON) so the
ablation in METHODOLOGY.md can toggle it for measurement.
"""

import os

from job_description import (
    NLP_IR_KWS, OTHER_DOMAIN_KWS, SHIPPING_KWS, RECENT_LLM_FRAMEWORK_KWS,
    PRE_LLM_DEPTH_KWS, RESEARCH_ONLY_KWS, EXTERNAL_VALIDATION_KWS,
    JD_INTENT_WEIGHTS,
)

JD_INTENT_ENABLED = os.environ.get("NEXTHIRE_JD_INTENT", "1").lower() in ("1", "true", "yes")


def _career_text(c: dict) -> str:
    parts = []
    p = c.get("profile", {})
    parts.append(p.get("headline", ""))
    parts.append(p.get("summary", ""))
    parts.append(p.get("current_title", ""))
    for j in c.get("career_history", []):
        parts.append(j.get("title", ""))
        parts.append(j.get("description", ""))
        parts.append(j.get("industry", ""))
    return " ".join(parts).lower()


def _hits(text: str, kws) -> int:
    return sum(1 for kw in kws if kw in text)


def jd_intent_adjustment(c: dict) -> tuple:
    """
    Returns (multiplier, reasons:list[str]).
    Combines all JD-intent signals into a single multiplicative adjustment so the
    additive ensemble score stays interpretable and this layer is cleanly ablatable.
    """
    if not JD_INTENT_ENABLED:
        return 1.0, []

    text = _career_text(c)
    skills_text = " ".join(s.get("name", "") for s in c.get("skills", [])).lower()
    blob = text + " " + skills_text
    W = JD_INTENT_WEIGHTS

    mult = 1.0
    reasons = []

    nlp_ir = _hits(blob, NLP_IR_KWS)
    other_domain = _hits(blob, OTHER_DOMAIN_KWS)

    # ── PENALTY: CV/speech/robotics primary, no NLP/IR ─────────────────────────
    # "primary expertise is computer vision, speech, or robotics without
    #  significant NLP/IR exposure ... you'd be re-learning fundamentals here."
    if other_domain >= 2 and nlp_ir == 0:
        mult *= W["domain_mismatch"]
        reasons.append("Primary domain is CV/speech/robotics with no NLP/IR exposure (JD de-prioritizes)")

    # ── PENALTY: pure research without production deployment ────────────────────
    # "spent your career in pure research environments ... without any production
    #  deployment — we will not move forward."
    research = _hits(blob, RESEARCH_ONLY_KWS)
    shipped = _hits(text, SHIPPING_KWS)
    if research >= 2 and shipped == 0:
        mult *= W["pure_research"]
        reasons.append("Research-heavy profile with no production-deployment evidence (JD requires shipping)")

    # ── PENALTY: only-recent LangChain/OpenAI, no pre-LLM depth ─────────────────
    # "'AI experience' consists primarily of recent (<12mo) projects using
    #  LangChain to call OpenAI ... unless substantial pre-LLM-era ML production."
    framework = _hits(blob, RECENT_LLM_FRAMEWORK_KWS)
    depth = _hits(blob, PRE_LLM_DEPTH_KWS)
    if framework >= 1 and depth == 0 and nlp_ir <= 1:
        mult *= W["recent_framework_only"]
        reasons.append("LLM-framework usage without deeper ML/IR fundamentals (JD wants pre-LLM depth)")

    # ── BOOST: demonstrable end-to-end shipping at scale ───────────────────────
    # "shipped at least one end-to-end ranking, search, or recommendation system
    #  to real users at meaningful scale."
    if shipped >= 2 and nlp_ir >= 1:
        mult *= W["shipping_boost"]
        reasons.append("Demonstrable end-to-end shipping of relevant systems at scale")

    # ── BOOST: pre-LLM ML fundamentals ─────────────────────────────────────────
    if depth >= 2:
        mult *= W["pre_llm_depth_boost"]
        reasons.append("Strong pre-LLM ML/IR fundamentals (XGBoost/LTR/classical IR)")

    # ── BOOST: external validation (papers / talks / OSS) ──────────────────────
    # "we need to see how you think ... papers, talks, open-source."
    gh = c.get("redrob_signals", {}).get("github_activity_score", -1)
    if _hits(blob, EXTERNAL_VALIDATION_KWS) >= 1 or (gh is not None and gh >= 50):
        mult *= W["external_valid_boost"]
        reasons.append("External validation present (OSS / papers / strong GitHub)")

    return mult, reasons
