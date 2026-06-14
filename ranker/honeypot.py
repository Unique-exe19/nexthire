"""
honeypot.py
-----------
Honeypot / impossible-profile detection for the NextHire ranking engine.

The Redrob spec (§7) embeds ~80 honeypot candidates with *subtly impossible*
profiles (e.g. "8 years of experience at a company founded 3 years ago",
"'expert' proficiency in 10 skills with 0 months used"). They are forced to
relevance tier 0 in the ground truth, and a submission with >10% honeypots in
its top 100 is DISQUALIFIED at Stage 3.

We do not special-case candidate IDs (the spec discourages it). Instead we detect
the *internal contradictions* that define a honeypot and apply a hard score
multiplier so they collapse well below rank 100. All checks are pure-Python,
deterministic, and defensive against missing fields.
"""

from typing import Tuple, List


def _year(date_str) -> int:
    """Extract the 4-digit year from a 'YYYY-MM-DD' string, or 0 if unparseable."""
    try:
        return int(str(date_str)[:4])
    except (ValueError, TypeError):
        return 0


def honeypot_flags(c: dict) -> Tuple[float, List[str]]:
    """
    Returns (penalty_multiplier, flags).
      penalty: float in (0, 1]; 1.0 = clean, lower = more impossible.
      flags:   human-readable strings naming each contradiction found.
    Multiple independent contradictions compound multiplicatively.
    """
    penalty = 1.0
    flags: List[str] = []

    p = c.get("profile", {})
    yoe = p.get("years_of_experience", 0) or 0
    history = c.get("career_history", []) or []
    skills = c.get("skills", []) or []
    education = c.get("education", []) or []

    yoe_months = yoe * 12.0

    # ── 1. Total tenure wildly exceeds stated years of experience ──────────────
    # Allow generous slack (1.6x) for legitimately overlapping/concurrent roles.
    total_tenure = sum(j.get("duration_months", 0) or 0 for j in history)
    if yoe > 0 and total_tenure > yoe_months * 1.6 + 12:
        penalty *= 0.03
        flags.append(
            f"Impossible timeline: {total_tenure} months of career history vs "
            f"{yoe:.1f} yrs stated experience"
        )

    # ── 2. A single role lasts longer than the candidate's whole career ────────
    if yoe > 0:
        longest = max((j.get("duration_months", 0) or 0 for j in history), default=0)
        if longest > yoe_months + 12:
            penalty *= 0.10
            flags.append(
                f"Impossible tenure: a single role spans {longest} months but total "
                f"experience is only {yoe:.1f} yrs"
            )

    # ── 3. Employment predates plausible workforce entry (graduation) ──────────
    grad_year = max((e.get("end_year", 0) or 0 for e in education), default=0)
    if grad_year:
        earliest_job = min(
            (_year(j.get("start_date")) for j in history if _year(j.get("start_date"))),
            default=0,
        )
        # Working 2+ years before finishing education is a fabrication signal.
        if earliest_job and earliest_job < grad_year - 2:
            penalty *= 0.10
            flags.append(
                f"Impossible timeline: career starts {earliest_job}, "
                f"before education completed ({grad_year})"
            )

    # ── 4. High proficiency claimed with ~0 months of actual usage ─────────────
    impossible_skills = 0
    for s in skills:
        prof = (s.get("proficiency") or "").lower()
        dur = s.get("duration_months", None)
        if prof in ("expert", "advanced") and dur is not None and dur <= 1:
            impossible_skills += 1
    if impossible_skills >= 4:
        penalty *= 0.05
        flags.append(
            f"Inflated proficiency: {impossible_skills} 'expert/advanced' skills "
            f"with ~0 months of stated usage"
        )

    # ── 5. Current-job tenure exceeds candidate's age-plausible career ─────────
    # (years_of_experience effectively zero but multi-year roles claimed)
    if yoe <= 0.5 and total_tenure >= 24:
        penalty *= 0.05
        flags.append(
            f"Contradiction: {total_tenure} months of roles with ~0 stated experience"
        )

    return penalty, flags
