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

    yoe_months = yoe * 12.0

    # ── 1. Total tenure wildly exceeds stated years of experience ──────────────
    # This is the canonical honeypot ("8 yrs exp at a company founded 3 yrs ago"
    # generalizes to: career months >> experience). Allow generous slack (2.0x +
    # 12mo) for genuinely overlapping/concurrent roles before flagging.
    total_tenure = sum(j.get("duration_months", 0) or 0 for j in history)
    if yoe >= 1 and total_tenure > yoe_months * 2.0 + 12:
        penalty *= 0.05
        flags.append(
            f"Impossible timeline: {total_tenure} months ({total_tenure/12:.1f}y) of career "
            f"history vs {yoe:.1f}y stated experience"
        )

    # ── 2. A single role lasts longer than the candidate's whole career +slack ──
    if yoe >= 1:
        longest = max((j.get("duration_months", 0) or 0 for j in history), default=0)
        if longest > yoe_months + 24:
            penalty *= 0.10
            flags.append(
                f"Impossible tenure: a single role spans {longest} months "
                f"({longest/12:.1f}y) but total experience is only {yoe:.1f}y"
            )

    # ── 3. Many high-proficiency skills with ~0 months of actual usage ─────────
    # ("'expert' in 10 skills with 0 years used" — spec §7 example). Require a
    # high count so a couple of unfilled duration fields don't trip it.
    impossible_skills = 0
    for s in skills:
        prof = (s.get("proficiency") or "").lower()
        dur = s.get("duration_months", None)
        if prof == "expert" and dur is not None and dur == 0:
            impossible_skills += 1
    if impossible_skills >= 5:
        penalty *= 0.10
        flags.append(
            f"Inflated proficiency: {impossible_skills} 'expert' skills with 0 months "
            f"of stated usage"
        )

    return penalty, flags
