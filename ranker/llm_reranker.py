"""
llm_reranker.py
---------------
LLM-powered candidate re-ranking and rationale generation.
Uses standard library urllib.request to call Google's Gemini 2.0 API.
Does not require any external dependencies or libraries.
"""

import os
import json
import urllib.request
import urllib.error
import logging

log = logging.getLogger("ranker.llm")


def rerank_top_candidates(top_candidates: list, jd_text: str) -> dict:
    """
    Sends the top candidates (usually top-10 or top-15) to Gemini to generate
    rich explainable reasoning and minor score adjustments.
    
    Returns:
        dict: candidate_id -> { "reasoning_long": str, "score_adjustment": float }
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        log.warning("GEMINI_API_KEY not found in environment. Skipping LLM reranking (will use rule-based fallback).")
        return {}

    # Prepare candidate summaries for the prompt
    candidates_summary = []
    for r in top_candidates:
        c = r["_candidate"]
        p = c.get("profile", {})
        c_summary = {
            "candidate_id": r["candidate_id"],
            "current_title": p.get("current_title", ""),
            "years_of_experience": p.get("years_of_experience", 0),
            "skills": [s["name"] for s in c.get("skills", [])[:10]],
            "must_have_hits": r["skill_evidence"].get("must_have_hits", []),
            "nice_hits": r["skill_evidence"].get("nice_hits", []),
            "disqualifiers": r["disqualifiers"],
            "raw_score": round(r["score"], 4),
            "current_company": p.get("current_company", ""),
            "education": [
                f"{e.get('degree')} in {e.get('field_of_study')} from {e.get('institution')} ({e.get('tier', 'unknown')})"
                for e in c.get("education", [])
            ]
        }
        candidates_summary.append(c_summary)

    prompt = f"""
You are a Senior Principal Technical Recruiter.
Analyze the following Job Description (JD) and the candidate profiles.
For each candidate, write a rich, recruiter-style professional explanation (under 400 characters) of why they are a strong fit (focusing on semantic alignment, skill matches, career trajectory, and explaining any red flags/disqualifiers).
Also, provide a minor score adjustment (between -0.05 and +0.05) representing any subtle qualitative signal (e.g., prestige of companies, career progression, or specific project experience) that is not fully captured by raw metrics.

Job Description:
{jd_text}

Candidates:
{json.dumps(candidates_summary, indent=2)}

You must return a JSON object matching this schema:
{{
  "candidates": [
    {{
      "candidate_id": "string (matching candidate_id exactly)",
      "reasoning_long": "string (professional recruiter-style rationale, under 400 characters)",
      "score_adjustment": float (value between -0.05 and +0.05)
    }}
  ]
}}
"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    headers = {
        "Content-Type": "application/json"
    }
    data = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2
        }
    }

    try:
        log.info(f"Calling Gemini API for {len(top_candidates)} candidates...")
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            resp_data = json.loads(response.read().decode("utf-8"))
            text_response = resp_data["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(text_response)

            result = {}
            for cand in parsed.get("candidates", []):
                cid = cand.get("candidate_id")
                if cid:
                    result[cid] = {
                        "reasoning_long": cand.get("reasoning_long", ""),
                        "score_adjustment": max(-0.05, min(0.05, cand.get("score_adjustment", 0.0)))
                    }
            log.info(f"Successfully retrieved LLM re-ranking and reasoning for {len(result)} candidates from Gemini API.")
            return result
    except Exception as e:
        log.error(f"Error calling Gemini API: {e}. Falling back to rule-based explanations.")
        return {}
