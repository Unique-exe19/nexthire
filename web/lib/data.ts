// lib/data.ts
// Server-side data loading for the NextHire dashboard.
// Reads submission.csv + sidecar debug JSON + enriches with candidate profiles.

import fs from 'fs';
import readline from 'readline';
import path from 'path';
import type { RankedCandidate, ScoreBreakdown, DimensionDetail } from '@/types/candidate';

const DATASET_DIR = path.resolve(process.cwd(), '..', 'dataset', 'India_runs_data_and_ai_challenge');
const SUBMISSION_CSV  = path.resolve(process.cwd(), '..', 'submission.csv');
const SIDECAR_JSON    = path.resolve(process.cwd(), '..', 'submission_debug.json');
const FULL_JSON       = path.join(DATASET_DIR, 'candidates.json');

// ── CSV Parser ────────────────────────────────────────────────────────────────

type CsvRow = { candidate_id: string; rank: number; score: number; reasoning: string };

function parseCSV(content: string): CsvRow[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  return lines.slice(1).map((line): CsvRow | null => {
    const cleanLine = line.replace(/\r$/, '');
    // Handle quoted reasoning with commas
    const m = cleanLine.match(/^([^,]+),(\d+),([\d.]+),(.*)$/);
    if (!m) return null;
    return {
      candidate_id: m[1].trim(),
      rank: parseInt(m[2]),
      score: parseFloat(m[3]),
      // Strip wrapping quotes and unescape CSV-doubled quotes ("" -> ").
      reasoning: m[4].trim().replace(/^"|"$/g, '').replace(/""/g, '"').trim(),
    };
  }).filter((r): r is CsvRow => r !== null);
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

async function loadProfileMap(jsonPath: string, targetIds: Set<string>): Promise<Map<string, RawProfile>> {
  const map = new Map<string, RawProfile>();
  if (!fs.existsSync(jsonPath) || targetIds.size === 0) return map;

  // A leading '[' means a JSON array (the small sample file) — parse it whole.
  // Otherwise treat it as JSONL (the 487MB candidates.json) and stream line-by-line,
  // never holding more than one line in memory, exiting as soon as every target is found.
  let firstChar = '';
  try {
    const fd = fs.openSync(jsonPath, 'r');
    const buf = Buffer.alloc(64);
    const read = fs.readSync(fd, buf, 0, 64, 0);
    fs.closeSync(fd);
    firstChar = buf.subarray(0, read).toString('utf-8').trimStart()[0] ?? '';
  } catch (e) {
    console.warn('Could not probe profile file:', e);
    return map;
  }

  if (firstChar === '[') {
    try {
      const data: RawProfile[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      for (const c of data) {
        if (targetIds.has(c.candidate_id)) map.set(c.candidate_id, c);
      }
    } catch (e) {
      console.warn('Could not load profiles (array):', e);
    }
    return map;
  }

  // JSONL streaming path
  await new Promise<void>((resolve) => {
    const stream = fs.createReadStream(jsonPath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    const finish = () => {
      rl.close();
      stream.destroy();
      resolve();
    };

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      // Cheap pre-filter: skip JSON.parse unless this line mentions a wanted id.
      // candidate_id values are unique substrings, so this avoids parsing 99.9k rows.
      let interesting = false;
      for (const id of targetIds) {
        if (trimmed.includes(id)) { interesting = true; break; }
      }
      if (!interesting) return;
      try {
        const c: RawProfile = JSON.parse(trimmed);
        if (targetIds.has(c.candidate_id)) {
          map.set(c.candidate_id, c);
          if (map.size === targetIds.size) finish(); // early exit
        }
      } catch {
        // skip malformed lines
      }
    });

    rl.on('close', () => resolve());
    stream.on('error', (e) => { console.warn('Could not load profiles (stream):', e); resolve(); });
  });

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

// Module-level cache: enriching the corpus is expensive (reads submission.csv,
// the sidecar JSON, and streams candidates.json). Re-run only when the CSV that
// drives the page changes. Keyed on path + mtime so a fresh ranker run invalidates it.
let _cache: { key: string; value: RankedCandidate[] } | null = null;

export async function getRankedCandidates(): Promise<RankedCandidate[]> {
  // 1. Locate the authoritative submission produced by the ranker over the full
  //    100,000-candidate pool. There is no sample/mock fallback: if it is missing,
  //    the ranker simply has not been run yet, so we return an empty list.
  const csvPath = SUBMISSION_CSV;
  const sidecarPath = SIDECAR_JSON;
  const jsonPath = FULL_JSON;

  if (!fs.existsSync(csvPath)) {
    console.warn(`submission.csv not found at ${csvPath}. Run the ranker first.`);
    return [];
  }

  // 1b. Serve from cache when the driving CSV is unchanged.
  const cacheKey = `${csvPath}:${fs.statSync(csvPath).mtimeMs}`;
  if (_cache && _cache.key === cacheKey) {
    return _cache.value;
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
  const profileMap = await loadProfileMap(jsonPath, targetIds);

  // 5. Build enriched candidates
  const enriched = rows.map(row => {
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

  _cache = { key: cacheKey, value: enriched };
  return enriched;
}
