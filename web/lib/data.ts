// lib/data.ts
// Server-side data loading for the NextHire dashboard.
// Reads submission.csv + sidecar debug JSON + enriches with candidate profiles.

import fs from 'fs';
import path from 'path';
import type { RankedCandidate, ScoreBreakdown, DimensionDetail } from '@/types/candidate';

const DATASET_DIR = path.resolve(process.cwd(), '..', 'dataset', 'India_runs_data_and_ai_challenge');
const SUBMISSION_CSV  = path.resolve(process.cwd(), '..', 'submission.csv');
const SAMPLE_CSV      = path.resolve(process.cwd(), '..', 'sample_submission_out.csv');
const SIDECAR_JSON    = path.resolve(process.cwd(), '..', 'submission_debug.json');
const SAMPLE_SIDECAR  = path.resolve(process.cwd(), '..', 'sample_submission_out_debug.json');
const FULL_JSON       = path.join(DATASET_DIR, 'candidates.json');
const SAMPLE_JSON     = path.join(DATASET_DIR, 'sample_candidates.json');

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSV(content: string): { candidate_id: string; rank: number; score: number; reasoning: string }[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  return lines.slice(1).map(line => {
    const cleanLine = line.replace(/\r$/, '');
    // Handle quoted reasoning with commas
    const m = cleanLine.match(/^([^,]+),(\d+),([\d.]+),(.*)$/);
    if (!m) return null;
    return {
      candidate_id: m[1].trim(),
      rank: parseInt(m[2]),
      score: parseFloat(m[3]),
      reasoning: m[4].replace(/^"|"$/g, '').trim(),
    };
  }).filter(Boolean) as any[];
}

// ── Profile Loader — streams only the needed IDs ──────────────────────────────

interface RawProfile {
  candidate_id: string;
  profile: {
    anonymized_name: string;
    headline: string;
    summary: string;
    current_title: string;
    current_company: string;
    current_company_size: string;
    current_industry: string;
    location: string;
    country: string;
    years_of_experience: number;
  };
  skills: { name: string; proficiency: string; endorsements: number; duration_months?: number }[];
  career_history: {
    company: string;
    title: string;
    start_date: string;
    end_date: string | null;
    duration_months: number;
    is_current: boolean;
    industry: string;
    company_size: string;
    description: string;
  }[];
  education: {
    institution: string;
    degree: string;
    field_of_study: string;
    start_year: number;
    end_year: number;
    tier?: string;
  }[];
  redrob_signals: {
    open_to_work_flag: boolean;
    notice_period_days: number;
    recruiter_response_rate: number;
    avg_response_time_hours: number;
    github_activity_score: number;
    last_active_date: string;
    preferred_work_mode: string;
    interview_completion_rate: number;
    profile_completeness_score: number;
    willing_to_relocate: boolean;
    linkedin_connected: boolean;
    verified_email: boolean;
    verified_phone: boolean;
    offer_acceptance_rate: number;
    saved_by_recruiters_30d: number;
    expected_salary_range_inr_lpa: { min: number; max: number };
  };
}

function loadProfileMap(jsonPath: string, targetIds: Set<string>): Map<string, RawProfile> {
  const map = new Map<string, RawProfile>();
  if (!fs.existsSync(jsonPath)) return map;
  try {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const firstChar = raw.trimStart()[0];

    if (firstChar === '[') {
      // JSON array (sample_candidates.json)
      const data: RawProfile[] = JSON.parse(raw);
      for (const c of data) {
        if (targetIds.has(c.candidate_id)) {
          map.set(c.candidate_id, c);
        }
      }
    } else {
      // JSONL (candidates.json) — parse line by line
      const lines = raw.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const c: RawProfile = JSON.parse(trimmed);
          if (targetIds.has(c.candidate_id)) {
            map.set(c.candidate_id, c);
            // Early exit once we have all needed candidates
            if (map.size === targetIds.size) break;
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  } catch (e) {
    console.warn('Could not load profiles:', e);
  }
  return map;
}

// ── AI skill keywords for filtering ──────────────────────────────────────────

const AI_SKILL_KWS = [
  'nlp', 'ml', 'llm', 'embedding', 'vector', 'transformer', 'bert', 'gpt',
  'rag', 'pytorch', 'tensorflow', 'faiss', 'ranking', 'retrieval', 'pinecone',
  'search', 'fine-tun', 'lora', 'sentence', 'huggingface', 'milvus',
  'elasticsearch', 'opensearch', 'mlflow', 'recommendation', 'bm25', 'qdrant',
  'weaviate', 'reranking', 'semantic', 'information retrieval',
];

function isAISkill(name: string): boolean {
  const lower = name.toLowerCase();
  return AI_SKILL_KWS.some(kw => lower.includes(kw));
}

// ── Build scoreBreakdown from dimensions (real data) ──────────────────────────

function buildScoreBreakdown(dims: DimensionDetail | undefined, score: number): ScoreBreakdown {
  if (!dims) {
    // Fallback: deterministic offsets (no randomness)
    return {
      semantic:   Math.min(1, score * 1.05),
      bm25:       Math.min(1, score * 0.95),
      tfidf:      Math.min(1, score * 0.90),
      dense:      Math.min(1, score * 0.88),
      skills:     Math.min(1, score * 1.00),
      career:     Math.min(1, score * 0.92),
      experience: Math.min(1, score * 0.85 + 0.1),
      behavioral: Math.min(1, score * 0.88),
    };
  }
  return {
    semantic:   dims.semantic.score,
    bm25:       dims.semantic.bm25,
    tfidf:      dims.semantic.tfidf,
    dense:      dims.semantic.dense,
    skills:     dims.skills.score,
    career:     dims.career.score,
    experience: dims.experience.score,
    behavioral: dims.behavioral.score,
  };
}

// ── Main data loader ──────────────────────────────────────────────────────────

export async function getRankedCandidates(): Promise<RankedCandidate[]> {
  // 1. Find CSV
  let csvPath = SUBMISSION_CSV;
  let sidecarPath = SIDECAR_JSON;
  let jsonPath = FULL_JSON;
  let usingSample = false;

  if (!fs.existsSync(csvPath)) {
    csvPath = SAMPLE_CSV;
    sidecarPath = SAMPLE_SIDECAR;
    jsonPath = SAMPLE_JSON;
    usingSample = true;
  }

  if (!fs.existsSync(csvPath)) {
    return getMockData();
  }

  // 2. Parse CSV
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);

  // 3. Load sidecar JSON (real score breakdowns + reasoning_long + disqualifiers)
  let sidecarMap: Record<string, any> = {};
  if (fs.existsSync(sidecarPath)) {
    try {
      sidecarMap = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
    } catch (e) {
      console.warn('Could not parse sidecar JSON:', e);
    }
  }

  // 4. Load candidate profiles
  const targetIds = new Set(rows.map(r => r.candidate_id));
  const profileMap = loadProfileMap(jsonPath, targetIds);

  // 5. Build enriched candidates
  return rows.map(row => {
    const profile = profileMap.get(row.candidate_id);
    const sidecar = sidecarMap[row.candidate_id];

    const dims: DimensionDetail | undefined = sidecar?.dimensions;
    const scoreBreakdown = buildScoreBreakdown(dims, row.score);

    // Best AI-relevant skills
    const aiSkills = profile?.skills
      ?.filter(s => isAISkill(s.name))
      .sort((a, b) => {
        // Sort by proficiency: expert > advanced > intermediate > beginner
        const profOrder: Record<string, number> = { expert: 4, advanced: 3, intermediate: 2, beginner: 1 };
        return (profOrder[b.proficiency] ?? 0) - (profOrder[a.proficiency] ?? 0);
      })
      .map(s => s.name)
      .slice(0, 8) ?? [];

    return {
      candidate_id:   row.candidate_id,
      rank:           row.rank,
      score:          row.score,
      reasoning:      row.reasoning,

      // Sidecar enrichment
      reasoning_long:  sidecar?.reasoning_long,
      disqualifiers:   sidecar?.disqualifiers ?? [],
      dimensions:      dims,
      penalty:         sidecar?.penalty,
      contributions:   sidecar?.contributions ?? [],

      // Profile data
      name:               profile?.profile.anonymized_name,
      headline:           profile?.profile.headline,
      summary:            profile?.profile.summary,
      current_title:      profile?.profile.current_title,
      current_company:    profile?.profile.current_company,
      current_company_size: profile?.profile.current_company_size,
      current_industry:   profile?.profile.current_industry,
      location:           profile?.profile.location,
      country:            profile?.profile.country,
      years_of_experience: profile?.profile.years_of_experience,
      skills:             aiSkills,
      all_skills:         profile?.skills,
      career_history:     profile?.career_history,
      education:          profile?.education,

      // Redrob signals
      open_to_work:             profile?.redrob_signals.open_to_work_flag,
      notice_period_days:       profile?.redrob_signals.notice_period_days,
      recruiter_response_rate:  profile?.redrob_signals.recruiter_response_rate,
      avg_response_time_hours:  profile?.redrob_signals.avg_response_time_hours,
      github_activity_score:    profile?.redrob_signals.github_activity_score,
      last_active_date:         profile?.redrob_signals.last_active_date,
      preferred_work_mode:      profile?.redrob_signals.preferred_work_mode,
      interview_completion_rate: profile?.redrob_signals.interview_completion_rate,
      profile_completeness:     profile?.redrob_signals.profile_completeness_score,
      willing_to_relocate:      profile?.redrob_signals.willing_to_relocate,
      linkedin_connected:       profile?.redrob_signals.linkedin_connected,
      verified_email:           profile?.redrob_signals.verified_email,
      verified_phone:           profile?.redrob_signals.verified_phone,
      offer_acceptance_rate:    profile?.redrob_signals.offer_acceptance_rate,
      saved_by_recruiters_30d:  profile?.redrob_signals.saved_by_recruiters_30d,

      // Backward compat
      scoreBreakdown,
    };
  });
}

// ── Mock data for zero-dataset fallback ──────────────────────────────────────

function getMockData(): RankedCandidate[] {
  const titles = [
    'Senior ML Engineer', 'AI Research Engineer', 'NLP Engineer',
    'Recommendation Systems Engineer', 'Search Engineer', 'Data Scientist',
    'Applied ML Scientist', 'Ranking Engineer',
  ];
  return Array.from({ length: 20 }, (_, i) => ({
    candidate_id: `CAND_${String(i + 1).padStart(7, '0')}`,
    rank: i + 1,
    score: Math.max(0.1, 0.99 - i * 0.045),
    reasoning: `${titles[i % titles.length]} with ${(5 + i * 0.3).toFixed(1)} yrs; strong NLP and vector search background; active on platform.`,
    reasoning_long: `Ranked #${i + 1} with strong semantic alignment to the Senior AI/ML Engineer JD. Matched must-have skills including embeddings, FAISS, and NLP. Career history shows sustained product company experience. Open to work with short notice period.`,
    name: `Candidate ${i + 1}`,
    headline: `${titles[i % titles.length]} | AI/ML`,
    current_title: titles[i % titles.length],
    current_company: ['Flipkart', 'Swiggy', 'Zomato', 'Razorpay', 'CRED'][i % 5],
    location: ['Bangalore', 'Hyderabad', 'Pune', 'Noida', 'Mumbai'][i % 5],
    country: 'India',
    years_of_experience: 5 + i * 0.3,
    skills: ['NLP', 'PyTorch', 'FAISS', 'Vector Search', 'LLMs'].slice(0, 3 + (i % 3)),
    open_to_work: i % 3 !== 2,
    notice_period_days: [0, 15, 30, 60][i % 4],
    recruiter_response_rate: 0.5 + (i % 5) * 0.1,
    github_activity_score: 30 + (i % 7) * 10,
    preferred_work_mode: ['hybrid', 'remote', 'onsite', 'flexible'][i % 4],
    interview_completion_rate: 0.6 + (i % 4) * 0.1,
    profile_completeness: 65 + (i % 4) * 10,
    disqualifiers: [],
    dimensions: {
      semantic: { score: 0.8 - i * 0.02, bm25: 0.75 - i * 0.02, tfidf: 0.7 - i * 0.02 },
      skills:   { score: 0.85 - i * 0.025, must_have_hits: ['Embeddings', 'FAISS', 'NLP'], nice_hits: ['PyTorch'], must_hit_count: 6, assessment_score: 0.8 },
      career:   { score: 0.78 - i * 0.02 },
      experience: { score: 0.95, years: 5 + i * 0.3 },
      behavioral: { score: 0.72 - i * 0.02, open_to_work: i % 3 !== 2, notice_days: [0, 15, 30, 60][i % 4] },
    },
    scoreBreakdown: {
      semantic: 0.8 - i * 0.02,
      bm25: 0.75 - i * 0.02,
      tfidf: 0.7 - i * 0.02,
      skills: 0.85 - i * 0.025,
      career: 0.78 - i * 0.02,
      experience: 0.95,
      behavioral: 0.72 - i * 0.02,
    },
  }));
}
