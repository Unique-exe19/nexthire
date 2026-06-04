// types/candidate.ts
// Data types for the NextHire dashboard

export interface ScoreBreakdown {
  semantic: number;
  bm25: number;
  tfidf: number;
  dense?: number;
  skills: number;
  career: number;
  experience: number;
  behavioral: number;
}

export interface SkillEvidence {
  must_have_hits: string[];
  nice_hits: string[];
  must_hit_count: number;
  assessment_score: number;
}

export interface DimensionDetail {
  semantic: {
    score: number;
    bm25: number;
    tfidf: number;
    dense?: number;
  };
  skills: {
    score: number;
    must_have_hits: string[];
    nice_hits: string[];
    must_hit_count: number;
    assessment_score: number;
  };
  career: { score: number };
  experience: { score: number; years: number };
  behavioral: {
    score: number;
    open_to_work: boolean;
    notice_days: number;
  };
}

export interface RankedCandidate {
  candidate_id: string;
  rank: number;
  score: number;
  reasoning: string;
  reasoning_long?: string;
  disqualifiers?: string[];
  dimensions?: DimensionDetail;
  penalty?: number;

  // Enriched profile fields (from candidates.json lookup)
  name?: string;
  headline?: string;
  summary?: string;
  current_title?: string;
  current_company?: string;
  current_company_size?: string;
  current_industry?: string;
  location?: string;
  country?: string;
  years_of_experience?: number;
  skills?: string[];
  all_skills?: { name: string; proficiency: string; endorsements: number }[];
  career_history?: {
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
  education?: {
    institution: string;
    degree: string;
    field_of_study: string;
    start_year: number;
    end_year: number;
    tier?: string;
  }[];

  // Redrob signals
  open_to_work?: boolean;
  notice_period_days?: number;
  recruiter_response_rate?: number;
  avg_response_time_hours?: number;
  github_activity_score?: number;
  last_active_date?: string;
  preferred_work_mode?: string;
  interview_completion_rate?: number;
  profile_completeness?: number;
  willing_to_relocate?: boolean;
  linkedin_connected?: boolean;
  verified_email?: boolean;
  verified_phone?: boolean;
  offer_acceptance_rate?: number;
  saved_by_recruiters_30d?: number;

  // Legacy (for backward compat)
  scoreBreakdown?: ScoreBreakdown;
}

export type WorkMode = 'all' | 'remote' | 'hybrid' | 'onsite' | 'flexible';
export type SortField = 'rank' | 'score' | 'experience' | 'response_rate' | 'notice';
