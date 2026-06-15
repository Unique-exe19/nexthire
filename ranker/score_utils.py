"""
score_utils.py
--------------
Enhanced scoring functions for NextHire AI Recruiter Ranking Engine.

Improvements over v1:
  - score_skills: adds skill duration_months weighting
  - _career_trajectory_score: recency-weighted + company size bonus + job-hopping detection
  - compute_disqualifier_penalty: salary mismatch + job-hopping penalties
  - generate_reasoning: rich structured explanation with per-dimension evidence
  - generate_long_reasoning: multi-paragraph explanation for dashboard display
"""

import re
import math
from datetime import date, datetime
from typing import Any

from job_description import (
    MUST_HAVE_SKILLS, NICE_TO_HAVE_SKILLS,
    DISQUALIFIER_TITLES, POSITIVE_TITLES,
    PURE_CONSULTING_COMPANIES, POSITIVE_INDUSTRIES, NEGATIVE_INDUSTRIES,
    JD_PREFERRED_LOCATIONS, JD_PREFERRED_COUNTRIES,
    experience_score, notice_period_score,
    BEHAVIORAL_WEIGHTS, JD_SALARY_MIDPOINT_LPA,
)

TODAY = date.today()


# ─────────────────────────────────────────────────────────────────────────────
# Text helpers
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().strip())


def _text_contains(text: str, keyword: str) -> bool:
    return keyword.lower() in text.lower()


# Token extractor for word-boundary matching. Keeps alphanumerics plus the few
# in-token symbols that appear in tech terms (+, #, ., -), e.g. "c++", "a/b",
# "bm25", "e5", "sentence-transformers".
_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9\+\#\.\-]*")


def _token_set(text: str) -> set:
    return set(_TOKEN_RE.findall(text.lower()))


def _kw_matches(kw: str, text_lower: str, token_set: set) -> bool:
    """
    Robust keyword match that avoids substring false positives.

    The naive `kw in text` approach matched non-AI profiles on short codes:
    "ann" hit "channel/planning/scanned", "rag" hit "storage/fragment",
    "go" hit "google/category", "java" hit "javascript", "map" hit "mapping".
    That inflated skill scores across the whole pool and helped keyword-stuffer
    honeypots. Rules:
      - multi-token phrases ("vector search", "sentence-transformers", "a/b testing")
        → substring match on normalized text (low false-positive risk),
      - short single tokens (≤4 chars: ann, rag, e5, go, map, bge, bm25, java, …)
        → EXACT token membership only,
      - longer single tokens (python, pinecone, retrieval, …)
        → token membership OR substring (handles minor morphology).
    """
    kw = kw.lower()
    if any(ch in kw for ch in (" ", "/")):
        return kw in text_lower
    if len(kw) <= 4:
        return kw in token_set
    return kw in token_set or kw in text_lower


def _any_match(text: str, keyword_set: set) -> bool:
    return any(_text_contains(text, kw) for kw in keyword_set)


def build_candidate_text(c: dict) -> str:
    """Concatenate all free-text fields into one searchable string."""
    parts = []
    p = c.get("profile", {})
    parts.append(p.get("headline", ""))
    parts.append(p.get("summary", ""))
    parts.append(p.get("current_title", ""))
    parts.append(p.get("current_industry", ""))
    for job in c.get("career_history", []):
        parts.append(job.get("title", ""))
        parts.append(job.get("company", ""))
        parts.append(job.get("description", ""))
        parts.append(job.get("industry", ""))
    for skill in c.get("skills", []):
        parts.append(skill.get("name", ""))
    for cert in c.get("certifications", []):
        parts.append(cert.get("name", ""))
        parts.append(cert.get("issuer", ""))
    for edu in c.get("education", []):
        parts.append(edu.get("field_of_study", ""))
        parts.append(edu.get("degree", ""))
    return " ".join(filter(None, parts))


# ─────────────────────────────────────────────────────────────────────────────
# Skill Scoring
# ─────────────────────────────────────────────────────────────────────────────

_PROFICIENCY_WEIGHT = {
    "expert":       1.0,
    "advanced":     0.85,
    "intermediate": 0.65,
    "beginner":     0.35,
}


def score_skills(c: dict, candidate_text: str) -> tuple:
    """
    Returns (score_0_to_1, evidence_dict).
    evidence_dict contains must_have_hits, nice_hits for explainability.
    """
    skills_list = c.get("skills", [])
    skill_names_lower = {s.get("name", "").lower() for s in skills_list}
    skill_token_set = _token_set(" ".join(skill_names_lower))
    text_lower = candidate_text.lower()
    text_token_set = _token_set(candidate_text)
    combined_tokens = skill_token_set | text_token_set

    def has_skill(kw: str) -> bool:
        # Exact skill-name match first, then word-boundary-aware match in the
        # combined skill + free-text token space (no substring false positives).
        if kw in skill_names_lower:
            return True
        return _kw_matches(kw, text_lower, combined_tokens)

    # Track which keywords actually hit (for explainability)
    must_hits_kws = [kw for kw in MUST_HAVE_SKILLS if has_skill(kw)]
    nice_hits_kws  = [kw for kw in NICE_TO_HAVE_SKILLS if has_skill(kw)]

    must_score = min(1.0, len(must_hits_kws) / 6.0)   # 6+ → full score
    nice_score = min(1.0, len(nice_hits_kws) / 5.0)   # 5+ → full score

    # Proficiency quality with skill duration bonus
    proficiency_score = 0.0
    all_jd_kws = MUST_HAVE_SKILLS | NICE_TO_HAVE_SKILLS
    matched_skill_objs = [
        s for s in skills_list
        if any(_kw_matches(kw, s.get("name", "").lower(), _token_set(s.get("name", "")))
               for kw in all_jd_kws)
    ]
    if matched_skill_objs:
        weighted = []
        for s in matched_skill_objs:
            prof_w = _PROFICIENCY_WEIGHT.get(s.get("proficiency", "beginner"), 0.35)
            endorse_w = math.log1p(s.get("endorsements", 0) + 1)
            # Bonus for explicit duration months (evidence of sustained use)
            duration_bonus = min(0.3, s.get("duration_months", 0) / 60.0)
            weighted.append(prof_w * endorse_w * (1 + duration_bonus))
        proficiency_score = min(1.0, sum(weighted) / (len(matched_skill_objs) * 3))

    # Redrob platform assessment scores
    assessment_scores = c.get("redrob_signals", {}).get("skill_assessment_scores", {})
    assessment_score = 0.0
    if assessment_scores:
        relevant = [
            v / 100.0 for k, v in assessment_scores.items()
            if any(_kw_matches(kw, k.lower(), _token_set(k)) for kw in all_jd_kws)
        ]
        if relevant:
            assessment_score = sum(relevant) / len(relevant)

    score = (
        0.45 * must_score
        + 0.25 * nice_score
        + 0.20 * proficiency_score
        + 0.10 * assessment_score
    )

    evidence = {
        "must_have_hits": [kw.title() for kw in must_hits_kws[:8]],
        "nice_hits": [kw.title() for kw in nice_hits_kws[:5]],
        "must_hit_count": len(must_hits_kws),
        "nice_hit_count": len(nice_hits_kws),
        "proficiency_score": round(proficiency_score, 3),
        "assessment_score": round(assessment_score, 3),
    }
    return score, evidence


# ─────────────────────────────────────────────────────────────────────────────
# Career Quality Scoring
# ─────────────────────────────────────────────────────────────────────────────

def _is_consulting_only(c: dict) -> bool:
    history = c.get("career_history", [])
    if not history:
        return False
    consulting_months = 0
    total_months = 0
    for job in history:
        company_lower = job.get("company", "").lower()
        duration = job.get("duration_months", 0)
        total_months += duration
        if any(cc in company_lower for cc in PURE_CONSULTING_COMPANIES):
            consulting_months += duration
    if total_months == 0:
        return False
    return consulting_months / total_months > 0.85


def _has_job_hopping(c: dict) -> tuple:
    """
    Detect job-hopping: avg tenure < 14 months with 2+ short stints across 3+ roles.
    Returns (is_hopper, avg_tenure_months, short_stint_count).
    """
    history = c.get("career_history", [])
    if len(history) < 3:
        return False, 0, 0
    tenures = [j.get("duration_months", 0) for j in history]
    avg_tenure = sum(tenures) / len(tenures)
    short_stints = sum(1 for t in tenures if t < 12)
    is_hopper = avg_tenure < 14 and short_stints >= 2
    return is_hopper, round(avg_tenure, 1), short_stints


def _current_title_score(title: str) -> float:
    tl = title.lower()
    if any(pt in tl for pt in POSITIVE_TITLES):
        return 1.0
    if any(dt in tl for dt in DISQUALIFIER_TITLES):
        return 0.05
    return 0.35


def _company_size_bonus(company_size: str) -> float:
    """Larger product companies signal more structured ML work."""
    size_bonus = {
        "1-10": 0.05, "11-50": 0.1, "51-200": 0.15,
        "201-500": 0.2, "501-1000": 0.22, "1001-5000": 0.25,
        "5001-10000": 0.22, "10001+": 0.20,
    }
    return size_bonus.get(company_size, 0.10)


def _career_trajectory_score(c: dict) -> float:
    history = c.get("career_history", [])
    if not history:
        return 0.1

    positive_role_months = 0.0
    product_industry_months = 0.0
    consulting_months = 0.0
    company_size_bonus_total = 0.0
    total_months = sum(j.get("duration_months", 0) for j in history)
    if total_months == 0:
        total_months = 1

    # Sort by recency (most recent first)
    sorted_history = sorted(
        history,
        key=lambda j: j.get("start_date", "2000-01-01"),
        reverse=True,
    )

    for i, job in enumerate(sorted_history):
        # Recency weighting: most recent role counts 1.6x, 2nd 1.3x, rest 1.0x
        recency_w = 1.6 if i == 0 else (1.3 if i == 1 else 1.0)
        duration = job.get("duration_months", 0) * recency_w
        company_lower = job.get("company", "").lower()
        title_lower = job.get("title", "").lower()
        industry_lower = job.get("industry", "").lower()
        desc_lower = job.get("description", "").lower()

        # AI/ML role detection
        ai_kws = [
            "machine learning", "nlp", "ranking", "retrieval", "embedding",
            "vector", "llm", "ai model", "deep learning", "neural", "transformers",
            "recommendation", "search engine", "information retrieval",
        ]
        if (any(pt in title_lower for pt in POSITIVE_TITLES) or
                any(kw in desc_lower for kw in ai_kws)):
            positive_role_months += duration

        # Product industry
        if any(ind in industry_lower for ind in POSITIVE_INDUSTRIES):
            product_industry_months += duration

        # Consulting
        if any(cc in company_lower for cc in PURE_CONSULTING_COMPANIES):
            consulting_months += duration

        # Company size bonus (weighted by recency)
        company_size_bonus_total += _company_size_bonus(job.get("company_size", "")) * recency_w

    positive_ratio = positive_role_months / total_months
    product_ratio = product_industry_months / total_months
    consulting_ratio = consulting_months / total_months
    avg_size_bonus = min(0.15, company_size_bonus_total / (len(history) * 1.3))

    score = (
        0.48 * min(1.0, positive_ratio * 1.5)
        + 0.28 * min(1.0, product_ratio * 1.3)
        + 0.18 * max(0.0, 1.0 - consulting_ratio * 1.2)
        + 0.06 * avg_size_bonus * 6
    )
    return min(1.0, score)


def _location_score(c: dict) -> float:
    p = c.get("profile", {})
    location = p.get("location", "").lower()
    country = p.get("country", "").lower()
    willing = c.get("redrob_signals", {}).get("willing_to_relocate", False)

    if any(loc in location for loc in JD_PREFERRED_LOCATIONS):
        return 1.0
    if country in JD_PREFERRED_COUNTRIES:
        return 0.7
    if willing:
        return 0.4
    return 0.25


def score_career_quality(c: dict, candidate_text: str) -> float:
    current_title = c.get("profile", {}).get("current_title", "")
    title_score = _current_title_score(current_title)
    trajectory_score = _career_trajectory_score(c)
    location_score = _location_score(c)

    # Education tier bonus
    edu_score = 0.5
    for edu in c.get("education", []):
        tier = edu.get("tier", "unknown")
        field = edu.get("field_of_study", "").lower()
        tier_map = {"tier_1": 1.0, "tier_2": 0.85, "tier_3": 0.65, "tier_4": 0.45, "unknown": 0.5}
        field_bonus = 0.1 if any(f in field for f in [
            "computer", "machine learning", "ai", "data science",
            "statistics", "mathematics", "information"
        ]) else 0.0
        edu_score = max(edu_score, min(1.0, tier_map.get(tier, 0.5) + field_bonus))

    return (
        0.35 * title_score
        + 0.40 * trajectory_score
        + 0.15 * location_score
        + 0.10 * edu_score
    )


# ─────────────────────────────────────────────────────────────────────────────
# Disqualifier Detection
# ─────────────────────────────────────────────────────────────────────────────

def compute_disqualifier_penalty(c: dict, candidate_text: str) -> tuple:
    """
    Returns (penalty_multiplier, disqualifiers_list).
    penalty: float in [0, 1] — 1.0 = no penalty, lower = penalized
    disqualifiers: list of human-readable strings explaining what fired
    """
    penalty = 1.0
    disqualifiers = []
    p = c.get("profile", {})
    current_title = p.get("current_title", "").lower()

    # 1. Hard disqualifier: completely wrong role
    hard_disq_titles = {
        "marketing manager", "accountant", "hr manager",
        "customer support", "civil engineer",
        "graphic designer", "content writer",
    }
    if any(dt in current_title for dt in hard_disq_titles):
        penalty *= 0.10
        disqualifiers.append(f"Current title '{p.get('current_title', '')}' is unrelated to AI/ML")

    # 2. Consulting-only career
    if _is_consulting_only(c):
        penalty *= 0.40
        disqualifiers.append("Career predominantly in IT services/consulting (>85%)")

    # 3. Keyword-trap: AI skills listed but zero evidence in career history
    history = c.get("career_history", [])
    history_text = " ".join(
        j.get("description", "") + " " + j.get("title", "") for j in history
    ).lower()
    ai_career_kws = [
        "machine learning", "nlp", "vector", "embedding", "model", "training",
        "ranking", "retrieval", "deep learning", "neural", "pytorch", "tensorflow",
    ]
    has_ai_in_career = any(kw in history_text for kw in ai_career_kws)
    skills_list = c.get("skills", [])
    ai_skill_count = sum(
        1 for s in skills_list
        if any(kw in s["name"].lower() for kw in [
            "nlp", "ml", "llm", "embedding", "vector", "transformer",
            "bert", "gpt", "rag",
        ])
    )
    if ai_skill_count >= 3 and not has_ai_in_career:
        penalty *= 0.50
        disqualifiers.append("AI skills listed but no AI/ML evidence in career history (keyword trap)")

    # 4. Very junior (< 2 years) for a senior role
    yoe = p.get("years_of_experience", 0)
    if yoe < 2:
        penalty *= 0.50
        disqualifiers.append(f"Insufficient experience ({yoe:.1f} yrs) for a Senior role")

    # 5. Job-hopping detection
    is_hopper, avg_tenure, short_stints = _has_job_hopping(c)
    if is_hopper:
        penalty *= 0.75
        disqualifiers.append(f"Frequent job changes: avg tenure {avg_tenure:.0f} months, {short_stints} short stints")

    # 6. Salary mismatch (if expected salary is way above JD midpoint)
    salary = c.get("redrob_signals", {}).get("expected_salary_range_inr_lpa", {})
    if salary:
        sal_min = salary.get("min", 0)
        sal_max = salary.get("max", 0)
        sal_mid = (sal_min + sal_max) / 2 if sal_max > 0 else 0
        if sal_mid > JD_SALARY_MIDPOINT_LPA * 2.0 and sal_mid > 0:
            penalty *= 0.85
            disqualifiers.append(
                f"Expected salary ({sal_mid:.0f} LPA) significantly above JD range (~{JD_SALARY_MIDPOINT_LPA:.0f} LPA)"
            )

    return penalty, disqualifiers


# ─────────────────────────────────────────────────────────────────────────────
# Behavioral Signal Scoring
# ─────────────────────────────────────────────────────────────────────────────

def _days_since(date_str: str) -> int:
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
        return (TODAY - d).days
    except Exception:
        return 9999


def score_behavioral(c: dict) -> float:
    sig = c.get("redrob_signals", {})

    # 1. Recency
    days_inactive = _days_since(sig.get("last_active_date", "2020-01-01"))
    if days_inactive <= 7:
        recency = 1.0
    elif days_inactive <= 30:
        recency = 0.90
    elif days_inactive <= 90:
        recency = 0.70
    elif days_inactive <= 180:
        recency = 0.45
    elif days_inactive <= 365:
        recency = 0.20
    else:
        recency = 0.05

    # 2. Availability
    open_flag = 1.0 if sig.get("open_to_work_flag", False) else 0.3
    notice = notice_period_score(sig.get("notice_period_days", 90))
    availability = 0.5 * open_flag + 0.5 * notice

    # 3. Responsiveness
    rr = sig.get("recruiter_response_rate", 0.0)
    art_hours = sig.get("avg_response_time_hours", 200)
    if art_hours <= 24:
        rt_score = 1.0
    elif art_hours <= 72:
        rt_score = 0.80
    elif art_hours <= 168:
        rt_score = 0.55
    elif art_hours <= 336:
        rt_score = 0.30
    else:
        rt_score = 0.10
    icr = sig.get("interview_completion_rate", 0.5)
    responsiveness = 0.40 * rr + 0.30 * rt_score + 0.30 * icr

    # 4. Engagement
    completeness = sig.get("profile_completeness_score", 50) / 100
    verified = (
        0.4 * int(sig.get("verified_email", False))
        + 0.4 * int(sig.get("verified_phone", False))
        + 0.2 * int(sig.get("linkedin_connected", False))
    )
    endorsements = min(1.0, sig.get("endorsements_received", 0) / 50)
    engagement = 0.4 * completeness + 0.3 * verified + 0.3 * endorsements

    # 5. GitHub activity
    gh = sig.get("github_activity_score", -1)
    github = 0.20 if gh < 0 else gh / 100.0

    # 6. Recruiter signal (saved count in last 30d)
    saved = min(1.0, sig.get("saved_by_recruiters_30d", 0) / 10)

    bw = BEHAVIORAL_WEIGHTS
    return (
        bw["recency"] * recency
        + bw["availability"] * availability
        + bw["responsiveness"] * responsiveness
        + bw["engagement"] * engagement
        + bw["github"] * github
        + bw["recruiter_signal"] * saved
    )


# ─────────────────────────────────────────────────────────────────────────────
# Reasoning Generator — Short (CSV column)
# ─────────────────────────────────────────────────────────────────────────────

def _soft_concern(c: dict, scores: dict, rank: int) -> str:
    """Derive one honest concern from the profile when no hard disqualifier fired."""
    p = c.get("profile", {})
    sig = c.get("redrob_signals", {})
    yoe = p.get("years_of_experience", 0) or 0
    notice = sig.get("notice_period_days", 90)
    rr = sig.get("recruiter_response_rate", 1.0)
    days_inactive = _days_since(sig.get("last_active_date", "2020-01-01"))
    if yoe > 12:
        return f"{yoe:.0f}y is above the JD's 5-9y sweet spot"
    if yoe and yoe < 5:
        return f"{yoe:.1f}y is below the JD's 5-9y target"
    if days_inactive > 120:
        return f"inactive ~{days_inactive // 30} months"
    if rr < 0.3:
        return f"low recruiter response rate ({rr:.0%})"
    if notice and notice > 60:
        return f"long notice period ({notice}d)"
    if scores.get("semantic", 1) < 0.4:
        return "fit rests on career signal more than explicit JD keywords"
    return ""


# Verbs/phrases that signal a concrete shipped artifact in a job description.
_SHIPPED_PHRASES = (
    "recommendation system", "search engine", "ranking system", "retrieval system",
    "recommender", "vector search", "semantic search", "rag pipeline", "search platform",
    "ranking pipeline", "personalization", "matching system", "embedding pipeline",
)


def _career_fact(c: dict) -> str:
    """
    Extract ONE concrete, verifiable fact from career history to ground the
    reasoning (Stage-4 'specific facts' + 'variation'). Returns '' if none found.
    Cites only what is literally in the profile — never invented.
    """
    history = c.get("career_history", []) or []
    # Prefer the current/most-recent role.
    ordered = sorted(history, key=lambda j: j.get("start_date", ""), reverse=True)
    for j in ordered:
        company = (j.get("company", "") or "").strip()
        desc = (j.get("description", "") or "").lower()
        for ph in _SHIPPED_PHRASES:
            if ph in desc:
                if company:
                    return f"built a {ph} at {company}"
                return f"built a {ph}"
    # Fallback: name current company + industry (still a real, specific fact).
    if ordered:
        j = ordered[0]
        company = (j.get("company", "") or "").strip()
        industry = (j.get("industry", "") or "").strip()
        if company and industry:
            return f"currently at {company} ({industry})"
        if company:
            return f"currently at {company}"
    return ""


def generate_reasoning(c: dict, scores: dict, rank: int, evidence: dict = None,
                       disqualifiers: list = None) -> str:
    """
    Concise, recruiter-style reasoning for the CSV column.

    Designed to pass the Stage-4 reasoning checks (spec §3): references specific
    profile facts (incl. a concrete career-history fact), connects to the JD
    (Senior AI/ML retrieval/ranking role), is rank-aware in tone, and states an
    honest concern where one exists.
    """
    p = c.get("profile", {})
    sig = c.get("redrob_signals", {})
    title = p.get("current_title", "Unknown")
    yoe = p.get("years_of_experience", 0) or 0
    location = p.get("location", "")

    # Prefer verified must-have JD-skill hits as evidence (no hallucinated skills).
    jd_skills = (evidence or {}).get("must_have_hits", [])[:3]

    # 1. Fact clause: who they are.
    head = f"{title}, {yoe:.1f}y"
    if location:
        head += f", {location}"
    head += ". "

    # 2. JD-linked evidence clause.
    if jd_skills:
        evidence_clause = f"Direct JD-skill evidence: {', '.join(jd_skills)}. "
    else:
        evidence_clause = "Fit rests on career trajectory rather than explicit retrieval/ranking keywords. "

    # 2b. Concrete career-history fact (grounds the reasoning, boosts variation).
    fact = _career_fact(c)
    fact_clause = (fact[0].upper() + fact[1:] + ". ") if fact else ""

    # 3. Rank-aware framing (tone matches position).
    if rank <= 10:
        frame = "Strong fit for the retrieval/ranking role. "
    elif rank <= 50:
        frame = "Solid adjacent fit. "
    else:
        frame = "Below the clear cutoff; included on balance of signals. "

    # 4. Availability signal (the JD weights "actually hireable" heavily). Lowest priority.
    avail = []
    if sig.get("open_to_work_flag", False):
        avail.append("open to work")
    notice = sig.get("notice_period_days", 90)
    if notice is not None and notice <= 30:
        avail.append(f"{notice}d notice")
    avail_clause = (", ".join(avail) + ". ") if avail else ""

    # 5. Honest concern (hard disqualifier first, else a derived soft concern). High priority.
    concern = (disqualifiers[0] if disqualifiers else _soft_concern(c, scores, rank))
    if concern and len(concern) > 90:
        concern = concern[:87] + "..."
    concern_clause = f"Concern: {concern}." if concern else ""

    # Assemble with priority. The honest concern must never be the truncated tail,
    # so head + evidence + frame + concern is the guaranteed "core". The career
    # fact and availability clause are added only while we stay within budget,
    # fact first (more specific). Pick the richest variant that fits.
    CAP = 240
    core = (head + evidence_clause + frame + concern_clause).strip()
    candidates = [
        (head + evidence_clause + fact_clause + frame + avail_clause + concern_clause).strip(),
        (head + evidence_clause + fact_clause + frame + concern_clause).strip(),
        (head + evidence_clause + frame + avail_clause + concern_clause).strip(),
        core,
    ]
    reason = next((c for c in candidates if len(c) <= CAP), None)
    if reason is None:
        reason = core[:CAP].rsplit(" ", 1)[0].rstrip(",.;") + "."
    return reason


# ─────────────────────────────────────────────────────────────────────────────
# Reasoning Generator — Long (for dashboard)
# ─────────────────────────────────────────────────────────────────────────────

def generate_long_reasoning(c: dict, scores: dict, rank: int, evidence: dict = None,
                             disqualifiers: list = None) -> str:
    """
    Generate a rich multi-sentence explanation for the dashboard's AI Rationale panel.
    Returns a string with ≤500 characters split across clear points.
    """
    p = c.get("profile", {})
    sig = c.get("redrob_signals", {})
    title = p.get("current_title", "Unknown")
    yoe = p.get("years_of_experience", 0)

    lines = []

    # Opening sentence
    score_pct = round(scores.get("final", 0) * 100)
    lines.append(f"Ranked #{rank} with an overall match score of {score_pct}%.")

    # Semantic fit
    sem = scores.get("semantic", 0)
    if sem >= 0.7:
        lines.append(f"Strong semantic alignment with the JD (semantic score: {sem:.0%}).")
    elif sem >= 0.4:
        lines.append(f"Moderate semantic overlap with the JD (score: {sem:.0%}).")

    # Skills evidence
    if evidence:
        must_hits = evidence.get("must_have_hits", [])
        if must_hits:
            lines.append(f"Matched {len(must_hits)} must-have JD skills: {', '.join(must_hits[:4])}.")
        nice_hits = evidence.get("nice_hits", [])
        if nice_hits:
            lines.append(f"Also matched nice-to-have: {', '.join(nice_hits[:3])}.")

    # Career quality
    career_s = scores.get("career", 0)
    if career_s >= 0.75:
        lines.append("Career history shows sustained AI/ML product company experience.")
    elif career_s >= 0.5:
        lines.append("Career history has relevant AI/ML exposure with some product company experience.")
    else:
        lines.append("Limited direct AI/ML product company experience in career history.")

    # Behavioral signals
    open_work = sig.get("open_to_work_flag", False)
    notice = sig.get("notice_period_days", 90)
    rr = sig.get("recruiter_response_rate", 0)
    gh = sig.get("github_activity_score", -1)

    beh_points = []
    if open_work:
        beh_points.append("actively open to new roles")
    if notice <= 30:
        beh_points.append(f"{notice}-day notice period")
    if rr >= 0.7:
        beh_points.append(f"{rr:.0%} recruiter response rate")
    if gh >= 60:
        beh_points.append(f"GitHub activity score {gh:.0f}/100")
    if beh_points:
        lines.append("Platform signals: " + ", ".join(beh_points) + ".")

    # Disqualifiers
    if disqualifiers:
        lines.append("⚠ Flags: " + "; ".join(disqualifiers[:2]) + ".")

    result = " ".join(lines)
    if len(result) > 500:
        result = result[:497] + "..."
    return result
