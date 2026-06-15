"""
test_ranker.py
--------------
Unit tests for the NextHire ranking logic. Run with:

    cd ranker && python -m pytest test_ranker.py -v
    # or, with no pytest installed:
    cd ranker && python test_ranker.py

These lock in the behaviours that matter for the competition:
  - skill matching does NOT false-match short codes (the substring bug),
  - honeypots are caught but legitimate profiles are not (calibration),
  - JD-intent multipliers fire only on the right signals,
  - reasoning is grounded in real profile facts (no hallucination).
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from score_utils import score_skills, generate_reasoning, _career_fact
from honeypot import honeypot_flags
from jd_intent import jd_intent_adjustment


# ── Fixtures ───────────────────────────────────────────────────────────────────

def _ops_manager():
    """A non-AI Operations Manager whose free text contains substring traps."""
    return {
        "candidate_id": "CAND_0000001",
        "profile": {"current_title": "Operations Manager", "years_of_experience": 9.0,
                    "location": "Chennai"},
        "skills": [{"name": "Excel", "proficiency": "expert", "endorsements": 5, "duration_months": 40}],
        "career_history": [{"company": "Wipro", "title": "Operations Manager",
                            "description": "Managed annual planning roadmap, channels, storage and "
                                           "JavaScript dashboards. Google Ads. Scanned documents.",
                            "duration_months": 108, "start_date": "2016-01-01", "industry": "IT Services"}],
        "redrob_signals": {},
    }


def _strong_ml():
    return {
        "candidate_id": "CAND_0000002",
        "profile": {"current_title": "Senior ML Engineer", "years_of_experience": 7.0,
                    "location": "Pune"},
        "skills": [{"name": "FAISS", "proficiency": "expert", "endorsements": 30, "duration_months": 36},
                   {"name": "Sentence Transformers", "proficiency": "advanced", "endorsements": 20, "duration_months": 30},
                   {"name": "Ranking", "proficiency": "expert", "endorsements": 25, "duration_months": 40}],
        "career_history": [{"company": "Zomato", "title": "ML Engineer",
                            "description": "Shipped an end-to-end ranking system to production for "
                                           "millions of users; XGBoost learning-to-rank and semantic search.",
                            "duration_months": 48, "start_date": "2020-01-01", "industry": "Internet"}],
        "redrob_signals": {"github_activity_score": 70, "open_to_work_flag": True,
                           "notice_period_days": 15, "recruiter_response_rate": 0.8,
                           "last_active_date": "2026-06-01"},
    }


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_skills_no_substring_false_positive():
    """ann/rag/map/go/java must NOT match inside channel/storage/google/javascript."""
    score, ev = score_skills(_ops_manager(), _ops_manager()["career_history"][0]["description"])
    assert ev["must_hit_count"] == 0, f"expected 0 must-haves, got {ev['must_have_hits']}"
    assert score < 0.15, f"non-AI ops manager should score low, got {score}"


def test_skills_real_match():
    c = _strong_ml()
    from score_utils import build_candidate_text
    score, ev = score_skills(c, build_candidate_text(c))
    assert ev["must_hit_count"] >= 3, f"strong ML candidate should hit must-haves, got {ev['must_have_hits']}"
    assert score > 0.4


def test_honeypot_impossible_timeline():
    hp = {"profile": {"years_of_experience": 8},
          "career_history": [{"duration_months": 120, "start_date": "2010-01-01"},
                             {"duration_months": 120, "start_date": "2005-01-01"}],
          "skills": []}
    pen, flags = honeypot_flags(hp)
    assert pen < 0.2 and flags, "240 months of tenure vs 8y experience must flag"


def test_honeypot_inflated_proficiency():
    hp = {"profile": {"years_of_experience": 6},
          "career_history": [{"duration_months": 72, "start_date": "2020-01-01"}],
          "skills": [{"name": f"S{i}", "proficiency": "expert", "duration_months": 0} for i in range(6)]}
    pen, flags = honeypot_flags(hp)
    assert pen < 0.2 and any("proficiency" in f.lower() for f in flags)


def test_honeypot_clean_profile_not_flagged():
    """A legit senior with a later degree must NOT be flagged (the 15k false-positive bug)."""
    clean = {"profile": {"years_of_experience": 7},
             "career_history": [{"duration_months": 40, "start_date": "2019-01-01"},
                                {"duration_months": 44, "start_date": "2015-06-01"}],
             "skills": [{"name": "FAISS", "proficiency": "expert", "duration_months": 36}]}
    pen, flags = honeypot_flags(clean)
    assert pen == 1.0 and not flags, f"clean profile wrongly flagged: {flags}"


def test_jd_intent_boosts_shipper():
    mult, reasons = jd_intent_adjustment(_strong_ml())
    assert mult > 1.0, "demonstrable shipper + depth + OSS should be boosted"
    assert any("shipping" in r.lower() for r in reasons)


def test_jd_intent_neutral_when_disabled(monkeypatch=None):
    os.environ["NEXTHIRE_JD_INTENT"] = "0"
    import importlib, jd_intent
    importlib.reload(jd_intent)
    mult, reasons = jd_intent.jd_intent_adjustment(_strong_ml())
    os.environ["NEXTHIRE_JD_INTENT"] = "1"
    importlib.reload(jd_intent)
    assert mult == 1.0 and reasons == []


def test_reasoning_grounded_and_no_hallucination():
    c = _strong_ml()
    fact = _career_fact(c)
    assert "Zomato" in fact, f"career fact should cite a real employer, got {fact!r}"
    scores = {"semantic": 0.9, "skills": 0.9, "career": 0.8, "experience": 0.95, "behavioral": 0.8, "final": 0.9}
    r = generate_reasoning(c, scores, rank=1, evidence={"must_have_hits": ["Faiss", "Ranking"]})
    assert "Senior ML Engineer" in r and "7.0y" in r
    assert "Zomato" in r  # the real employer, not invented
    assert len(r) <= 240


def test_reasoning_rank_aware():
    c = _strong_ml()
    scores = {"semantic": 0.5, "skills": 0.5, "career": 0.5, "experience": 0.5, "behavioral": 0.5, "final": 0.3}
    top = generate_reasoning(c, scores, rank=3, evidence={})
    bottom = generate_reasoning(c, scores, rank=98, evidence={})
    assert "Strong fit" in top
    assert "Below the clear cutoff" in bottom


# ── Plain runner (no pytest required) ──────────────────────────────────────────

if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for fn in fns:
        try:
            fn()
            print(f"  PASS  {fn.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  FAIL  {fn.__name__}: {e}")
        except Exception as e:
            print(f"  ERROR {fn.__name__}: {type(e).__name__}: {e}")
    print(f"\n{passed}/{len(fns)} tests passed")
    sys.exit(0 if passed == len(fns) else 1)
