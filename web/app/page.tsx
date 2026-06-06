'use client';

import { useState, useEffect, useMemo } from 'react';
import type { RankedCandidate, WorkMode, SortField } from '@/types/candidate';
import { CandidateDrawer } from '@/components/CandidateDrawer';
import { PodiumCard } from '@/components/PodiumCard';
import { ScoreHistogram } from '@/components/ScoreHistogram';

// ── Inline SVGs ─────────────────────────────────────────────────────────────
const GlobeIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const BuildingIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <line x1="9" y1="22" x2="9" y2="16" />
    <line x1="15" y1="22" x2="15" y2="16" />
    <line x1="9" y1="16" x2="15" y2="16" />
    <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M12 6h.01M12 10h.01" />
  </svg>
);

const LocationIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
  </svg>
);

const BookIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const GitBranchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

const ZapIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const RadioIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2" />
    <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
    <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
    <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
  </svg>
);

const ShieldAlertIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const AwardIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="7" />
    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
  </svg>
);

// ── Utility helpers ───────────────────────────────────────────────────────────

function getRankBadgeClass(rank: number) {
  if (rank === 1) return 'rank-badge gold';
  if (rank === 2) return 'rank-badge silver';
  if (rank === 3) return 'rank-badge bronze';
  return 'rank-badge default';
}

function getScoreColor(score: number) {
  if (score >= 0.8) return '#10b981';
  if (score >= 0.6) return '#ffffff';
  if (score >= 0.4) return '#f59e0b';
  return '#f43f5e';
}

function getWorkModeIcon(mode?: string) {
  switch (mode) {
    case 'remote': return <GlobeIcon />;
    case 'hybrid': return <BuildingIcon />;
    case 'onsite': return <LocationIcon />;
    default: return <RefreshIcon />;
  }
}

function daysSince(dateStr?: string): number {
  if (!dateStr) return 999;
  return Math.floor((new Date('2026-06-03').getTime() - new Date(dateStr).getTime()) / 86400000);
}

function getActivitySignal(days: number): { cls: string; label: string } {
  if (days <= 7) return { cls: 'green', label: 'Active this week' };
  if (days <= 30) return { cls: 'green', label: `Active ${days}d ago` };
  if (days <= 90) return { cls: 'amber', label: `Active ${days}d ago` };
  return { cls: 'red', label: `Inactive ${days}d` };
}

// ── Core Pillars Architecture Panel ──────────────────────────────────────────
function CorePillarsSection() {
  return (
    <div className="glass animate-fade-in-up" style={{ padding: '24px', marginBottom: '28px', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{
        fontSize: '0.7rem', color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: '16px',
        textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18" /><path d="M15 3v18" /><path d="M3 9h18" /><path d="M3 15h18" />
        </svg>
        <span>Recruiter Engine Pillars & Architecture</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
              <polyline points="7.5 19.79 7.5 14.67 12 12.01 16.5 14.67 16.5 19.79" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff' }}>Semantic & Vector Search</h4>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Fuses lexical search (BM25 & TF-IDF) with deep dense vector embeddings (`SentenceTransformers` on CPU) for high-accuracy semantic candidate matching.
          </p>
        </div>

        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2" x2="12" y2="4" />
              <line x1="12" y1="20" x2="12" y2="22" />
              <line x1="2" y1="12" x2="4" y2="12" />
              <line x1="20" y1="12" x2="22" y2="12" />
              <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
              <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
              <line x1="19.07" y1="4.93" x2="17.66" y2="6.34" />
              <line x1="6.34" y1="17.66" x2="4.93" y2="19.07" />
            </svg>
            <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff' }}>LLM Ranking Workflows</h4>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            LLM reranker analyzes resume details and outputs deep semantic reasoning using Google Gemini, fallback heuristics, and pairwise scoring comparisons.
          </p>
        </div>

        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff' }}>Hybrid Scoring Systems</h4>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Combines candidate experience years, skills depth index, and career history metrics. Formulates composite scoring with customizable weight bias.
          </p>
        </div>

        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff' }}>Custom Retrieval Pipelines</h4>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Iterative candidate filtering, real-time warning/disqualifier rules, and Reciprocal Rank Fusion (RRF) for blazingly fast parallel score generation.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Interactive Connected Pipeline Graph ─────────────────────────────────────

function PipelineGraph() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const stages = [
    {
      step: '1',
      label: 'Corpus Build',
      desc: 'Streams and tokenizes candidate profiles from the 100,000 JSONL candidate pool.',
      icon: <BookIcon />
    },
    {
      step: '2',
      label: 'Sparse Search',
      desc: 'Executes fast CPU-optimized BM25 + TF-IDF with Inverted Indexing search.',
      icon: <GitBranchIcon />
    },
    {
      step: '3',
      label: 'RRF Fusion',
      desc: 'Combines BM25 and TF-IDF rank lists via Reciprocal Rank Fusion, filtering to the top 1,500 candidates.',
      icon: <ZapIcon />
    },
    {
      step: '4',
      label: 'Structured Match',
      desc: 'Concurrently evaluates skills matches (must-have/nice-to-have), proficiency weights, endorsements, and experience fit.',
      icon: <SettingsIcon />
    },
    {
      step: '5',
      label: 'Behavioral Signals',
      desc: 'Calculates active response times, notice period availability, and platform engagement metrics.',
      icon: <RadioIcon />
    },
    {
      step: '6',
      label: 'Disqualifiers',
      desc: 'Applies penalty multipliers for consulting traps, job-hopping, and salary expectation mismatches.',
      icon: <ShieldAlertIcon />
    },
    {
      step: '7',
      label: 'Ensemble & Rerank',
      desc: 'Integrates Gemini LLM re-ranking adjustments and computes composite scores to output the final top-100 ranks.',
      icon: <AwardIcon />
    },
  ];

  return (
    <div className="glass animate-fade-in-up" style={{ padding: '20px 24px', marginBottom: '28px', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{
        fontSize: '0.7rem', color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '1.2px', fontWeight: 700, marginBottom: '20px',
        textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
        <span>AI Recruiter Engine - 7-Stage Pipeline Graph</span>
      </div>

      {/* Nodes Container */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '6px',
        flexWrap: 'wrap',
      }}>
        {stages.map((s, idx) => {
          const isHovered = hoveredIndex === idx;
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                flex: '1 1 120px',
                minWidth: '120px',
                position: 'relative',
              }}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Node Card */}
              <div style={{
                width: '100%',
                padding: '14px 10px',
                background: isHovered ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.015)',
                border: isHovered ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.04)',
                borderRadius: '12px',
                textAlign: 'center',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                boxShadow: isHovered ? '0 8px 24px rgba(255,255,255,0.06)' : 'none',
              }}>
                {/* Step Circle */}
                <div style={{
                  width: '22px', height: '22px',
                  borderRadius: '50%',
                  background: isHovered ? '#ffffff' : 'rgba(255,255,255,0.08)',
                  color: isHovered ? '#000000' : 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.68rem', fontWeight: 800,
                  margin: '0 auto 8px',
                  transition: 'all 0.25s',
                  fontFamily: 'JetBrains Mono, monospace'
                }}>
                  {s.step}
                </div>

                {/* Icon */}
                <div style={{
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  color: isHovered ? '#ffffff' : 'var(--text-secondary)',
                  marginBottom: 6,
                  transition: 'color 0.25s'
                }}>
                  {s.icon}
                </div>

                {/* Label */}
                <div style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: isHovered ? '#ffffff' : 'var(--text-primary)',
                  transition: 'color 0.25s',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {s.label}
                </div>
              </div>

              {/* Connecting Arrow */}
              {idx < stages.length - 1 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '16px',
                  margin: '0 -4px',
                  zIndex: 2,
                  color: isHovered || hoveredIndex === idx + 1 ? '#ffffff' : 'var(--text-muted)',
                  transition: 'color 0.25s',
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Explanation panel */}
      <div style={{
        marginTop: '16px',
        padding: '12px 16px',
        background: 'rgba(255,255,255,0.01)',
        border: '1px solid rgba(255,255,255,0.03)',
        borderRadius: '10px',
        minHeight: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.25s'
      }}>
        <p style={{
          fontSize: '0.75rem',
          color: hoveredIndex !== null ? '#ffffff' : 'var(--text-secondary)',
          lineHeight: 1.45,
          textAlign: 'center',
          margin: 0,
          transition: 'color 0.25s'
        }}>
          {hoveredIndex !== null
            ? `${stages[hoveredIndex].label}: ${stages[hoveredIndex].desc}`
            : "Hover over any pipeline node to inspect details of the recruiter pipeline."
          }
        </p>
      </div>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="glass stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Candidate row ─────────────────────────────────────────────────────────────

function CandidateRow({
  candidate, isActive, onClick,
}: {
  candidate: RankedCandidate;
  isActive: boolean;
  onClick: () => void;
}) {
  const scoreColor = getScoreColor(candidate.score);
  const activityDays = daysSince(candidate.last_active_date);
  const activity = getActivitySignal(activityDays);
  const hasFlags = candidate.disqualifiers && candidate.disqualifiers.length > 0;

  // Use must_have_hits from dimensions if available, else fall back to skills
  const displaySkills = candidate.dimensions?.skills.must_have_hits?.slice(0, 4)
    ?? candidate.skills?.slice(0, 4)
    ?? [];

  return (
    <div
      className={`candidate-row ${isActive ? 'active' : ''}`}
      style={{ gridTemplateColumns: '44px 1fr 110px 80px' }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      {/* Rank badge */}
      <div className={getRankBadgeClass(candidate.rank)}>
        #{candidate.rank}
      </div>

      {/* Info */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            {candidate.name ?? candidate.candidate_id}
          </span>
          {candidate.open_to_work && (
            <span className="skill-tag primary" style={{ fontSize: '0.6rem', padding: '2px 7px' }}>
              ✓ Open
            </span>
          )}
          {candidate.notice_period_days !== undefined && candidate.notice_period_days <= 30 && (
            <span className="skill-tag secondary" style={{ fontSize: '0.6rem', padding: '2px 7px' }}>
              ≤30d
            </span>
          )}
          {hasFlags && (
            <span style={{
              fontSize: '0.6rem', padding: '2px 7px',
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 20, color: '#fbbf24', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 2,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>Flag</span>
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <span>{candidate.current_title}</span>
          {candidate.location && (
            <>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <LocationIcon />
                <span>{candidate.location}</span>
              </span>
            </>
          )}
          {candidate.years_of_experience !== undefined && (
            <>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span>{candidate.years_of_experience.toFixed(1)} yrs</span>
            </>
          )}
        </div>
        {/* Matched JD skills */}
        {displaySkills.length > 0 && (
          <div style={{ display: 'flex', gap: 3, marginTop: 5, flexWrap: 'wrap' }}>
            {displaySkills.map(skill => (
              <span key={skill} style={{
                padding: '2px 8px', borderRadius: 20, fontSize: '0.62rem', fontWeight: 600,
                background: candidate.dimensions?.skills.must_have_hits?.includes(skill)
                  ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${candidate.dimensions?.skills.must_have_hits?.includes(skill)
                  ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)'}`,
                color: candidate.dimensions?.skills.must_have_hits?.includes(skill)
                  ? '#34d399' : 'var(--text-secondary)',
              }}>
                {skill}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Activity */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div className={`signal-dot ${activity.cls}`} />
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{activity.label}</span>
        </div>
        {candidate.recruiter_response_rate !== undefined && (
          <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
            RR: {(candidate.recruiter_response_rate * 100).toFixed(0)}%
          </span>
        )}
        <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
          {getWorkModeIcon(candidate.preferred_work_mode)}
        </span>
      </div>

      {/* Score */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
        <div className="score-circle" style={{ borderColor: scoreColor, color: scoreColor }}>
          {(candidate.score * 100).toFixed(0)}
        </div>
        <div className="score-bar" style={{ width: '100%' }}>
          <div className="score-bar-fill" style={{ width: `${candidate.score * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

// ── Weights Panel ─────────────────────────────────────────────────────────────

interface Weights {
  semantic: number;
  skills: number;
  career: number;
  experience: number;
  behavioral: number;
}

interface WeightsPanelProps {
  weights: Weights;
  setWeights: React.Dispatch<React.SetStateAction<Weights>>;
  normalizedWeights: Weights;
}

function WeightsPanel({ weights, setWeights, normalizedWeights }: WeightsPanelProps) {
  const handleSliderChange = (key: keyof Weights, value: number) => {
    console.log(`[WeightsPanel] Slider changed: ${key} = ${value}`);
    setWeights(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleReset = () => {
    setWeights({
      semantic: 0.28,
      skills: 0.28,
      career: 0.22,
      experience: 0.10,
      behavioral: 0.12,
    });
  };

  const sliders = [
    { key: 'semantic' as const, label: 'Semantic Match', desc: 'Hybrid dense & sparse keyword alignment' },
    { key: 'skills' as const, label: 'Skills Match', desc: 'Must-have and nice-to-have skill overlap' },
    { key: 'career' as const, label: 'Career Quality', desc: 'Product company experience & trajectory' },
    { key: 'experience' as const, label: 'Experience Fit', desc: 'Target seniority years sweet spot (5-9 yrs)' },
    { key: 'behavioral' as const, label: 'Behavioral Fit', desc: 'Platform activity, notice period & responsiveness' },
  ];

  return (
    <div className="glass animate-fade-in-up" style={{ padding: '24px', marginBottom: '28px', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '1.2px', fontWeight: 700 }}>
            Dynamic Recruiter Weight Adjuster
          </span>
        </div>
        <button
          className="btn-ghost"
          onClick={handleReset}
          style={{
            padding: '5px 12px',
            fontSize: '0.72rem',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          Reset to Baseline Defaults
        </button>
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.4' }}>
        Adjust the sliders below to customize the importance of each parameter. Candidate matching scores and ranks will recalculate and resort in real-time.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {sliders.map(({ key, label, desc }) => {
          const val = weights[key];
          const pct = (normalizedWeights[key] * 100).toFixed(0);
          return (
            <div
              key={key}
              style={{
                display: 'grid',
                gridTemplateColumns: '180px 1fr 60px',
                alignItems: 'center',
                gap: '16px',
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.01)',
                border: '1px solid rgba(255,255,255,0.03)',
                borderRadius: '8px',
                transition: 'all 0.2s',
              }}
              className="slider-row"
            >
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                  {label}
                </div>
                <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                  {desc}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={val}
                  onChange={e => handleSliderChange(key, parseFloat(e.target.value))}
                  style={{
                    width: '100%',
                    accentColor: '#ffffff',
                    cursor: 'pointer',
                    background: 'rgba(255,255,255,0.1)',
                    height: '4px',
                    borderRadius: '2px',
                    outline: 'none'
                  }}
                />
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffffff', fontFamily: 'JetBrains Mono, monospace' }}>
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Filters panel ─────────────────────────────────────────────────────────────

function FiltersPanel({
  search, setSearch,
  workMode, setWorkMode,
  minScore, setMinScore,
  onlyOpenToWork, setOnlyOpenToWork,
  sortBy, setSortBy,
  total, filtered,
}: {
  search: string; setSearch: (v: string) => void;
  workMode: WorkMode; setWorkMode: (v: WorkMode) => void;
  minScore: number; setMinScore: (v: number) => void;
  onlyOpenToWork: boolean; setOnlyOpenToWork: (v: boolean) => void;
  sortBy: SortField; setSortBy: (v: SortField) => void;
  total: number; filtered: number;
}) {
  const workModes: WorkMode[] = ['all', 'remote', 'hybrid', 'onsite', 'flexible'];
  const sortOptions: { val: SortField; label: string }[] = [
    { val: 'rank', label: 'Rank' },
    { val: 'score', label: 'Score' },
    { val: 'experience', label: 'Experience' },
    { val: 'response_rate', label: 'Response Rate' },
    { val: 'notice', label: 'Notice Period' },
  ];

  return (
    <div className="glass" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ flex: '1 1 200px', minWidth: 160 }}>
          <input
            type="text"
            className="input-glass"
            placeholder="Search name, title, company, skill..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Work mode */}
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {workModes.map(mode => (
            <button
              key={mode}
              className={workMode === mode ? 'btn-primary' : 'btn-ghost'}
              style={{ padding: '5px 10px', fontSize: '0.72rem', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => setWorkMode(mode)}
            >
              {getWorkModeIcon(mode)}
              <span>{mode}</span>
            </button>
          ))}
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Sort:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortField)}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              padding: '5px 10px',
              fontSize: '0.72rem',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {sortOptions.map(o => (
              <option key={o.val} value={o.val} style={{ background: '#0d0d0d' }}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Min score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Min: {(minScore * 100).toFixed(0)}%
          </span>
          <input
            type="range" min={0} max={0.9} step={0.05}
            value={minScore}
            onChange={e => setMinScore(parseFloat(e.target.value))}
            style={{ width: 70, accentColor: 'var(--accent-primary)' }}
          />
        </div>

        {/* Open to work */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox" checked={onlyOpenToWork}
            onChange={e => setOnlyOpenToWork(e.target.checked)}
            style={{ accentColor: 'var(--accent-primary)' }}
          />
          Open to work
        </label>

        {/* Count */}
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{filtered}</span>
          <span> / {total}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [candidates, setCandidates] = useState<RankedCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RankedCandidate | null>(null);

  // Dynamic recruiter weights
  const [weights, setWeights] = useState<Weights>({
    semantic: 0.28,
    skills: 0.28,
    career: 0.22,
    experience: 0.10,
    behavioral: 0.12,
  });

  // Filters
  const [search, setSearch] = useState('');
  const [workMode, setWorkMode] = useState<WorkMode>('all');
  const [minScore, setMinScore] = useState(0);
  const [onlyOpenToWork, setOnlyOpenToWork] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>('rank');

  // Live Recalculation states
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcLogs, setRecalcLogs] = useState<string[]>([]);
  const [recalcPhase, setRecalcPhase] = useState<number>(0); // 0 = idle, 1, 2, 3, 4, 5 = completed
  const [recalcProgress, setRecalcProgress] = useState<number>(0);
  const [loadedCount, setLoadedCount] = useState<number>(0);
  const [indexedCount, setIndexedCount] = useState<number>(0);
  const [scoredCount, setScoredCount] = useState<number>(0);
  const [isHoveringBar, setIsHoveringBar] = useState(false);

  // Auto-scroll recalculated console logs
  useEffect(() => {
    if (isRecalculating) {
      const term = document.getElementById('recalc-terminal');
      if (term) {
        term.scrollTop = term.scrollHeight;
      }
    }
  }, [recalcLogs, isRecalculating]);

  const triggerRecalculate = async () => {
    setIsRecalculating(true);
    setRecalcLogs(["[SYSTEM] Starting Live Recalculation engine...", "[SYSTEM] Connecting to candidate ranking stream..."]);
    setRecalcPhase(1);
    setRecalcProgress(5);
    setLoadedCount(0);
    setIndexedCount(0);
    setScoredCount(0);
    try {
      const response = await fetch('/api/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights: normalizedWeights })
      });
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      if (!response.body) {
        throw new Error("No response body stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split('\n');
          // Keep the last partial line in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            
            // Clean stderr tag if present
            const cleanLine = line.replace('[STDERR] ', '').trim();
            
            // Append log line
            setRecalcLogs(prev => [...prev.slice(-100), cleanLine]); // Keep last 100 lines for performance

            // Parse logs to detect phase and update progress bar
            if (cleanLine.includes("Phase 1/4") || cleanLine.includes("Building candidate corpus")) {
              setRecalcPhase(1);
              setRecalcProgress(15);
            } else if (cleanLine.includes("Progress: Loaded")) {
              const match = cleanLine.match(/Progress: Loaded ([\d,]+)/);
              if (match) {
                const count = parseInt(match[1].replace(/,/g, ''));
                setLoadedCount(count);
                // Dynamically scale progress in Phase 1: from 15% to 45%
                const pct = 15 + Math.round((count / 100000) * 30);
                setRecalcProgress(pct);
              }
            } else if (cleanLine.includes("Detected JSONL")) {
              setRecalcProgress(30);
            } else if (cleanLine.includes("Loaded 100,000 candidates") || cleanLine.includes("Corpus:")) {
              setRecalcProgress(45);
              setLoadedCount(100000);
            } else if (cleanLine.includes("Phase 2/4") || cleanLine.includes("Hybrid semantic scoring")) {
              setRecalcPhase(2);
              setRecalcProgress(45);
            } else if (cleanLine.includes("Progress: TF-IDF Indexed")) {
              const match = cleanLine.match(/Progress: TF-IDF Indexed ([\d,]+)/);
              if (match) {
                const count = parseInt(match[1].replace(/,/g, ''));
                setIndexedCount(count);
                // Dynamically scale progress in Phase 2: from 45% to 80%
                const pct = 45 + Math.round((count / 100000) * 35);
                setRecalcProgress(pct);
              }
            } else if (cleanLine.includes("BM25 done")) {
              // intermediate progress
            } else if (cleanLine.includes("TF-IDF done")) {
              setIndexedCount(100000);
              setRecalcProgress(80);
            } else if (cleanLine.includes("Phase 3/4") || cleanLine.includes("Structured & behavioral scoring")) {
              setRecalcPhase(3);
              setRecalcProgress(80);
              setScoredCount(0);
            } else if (cleanLine.includes("Scoring done")) {
              setScoredCount(1500);
              setRecalcProgress(90);
            } else if (cleanLine.includes("Phase 4/4") || cleanLine.includes("Sorting and generating")) {
              setRecalcPhase(4);
              setRecalcProgress(95);
            } else if (cleanLine.includes("COMPLETED") || cleanLine.includes("Done! Written")) {
              setRecalcPhase(5);
              setRecalcProgress(100);
              setLoadedCount(100000);
              setIndexedCount(100000);
              setScoredCount(1500);
            }
          }
        }
      }

      // Refresh candidate list after success
      setLoading(true);
      const r = await fetch('/api/candidates');
      const data = await r.json();
      setCandidates(data);
      setLoading(false);
      
      // Delay modal closing slightly to allow user to see 100% completion
      setTimeout(() => {
        setIsRecalculating(false);
        setRecalcPhase(0);
        setRecalcProgress(0);
        setRecalcLogs([]);
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setRecalcLogs(prev => [...prev, `[ERROR] Recalculation failed: ${err.message}`]);
      // Keep modal open so they can read the error, but disable loading state
      setRecalcProgress(100);
      // Wait 5 seconds then close if failed
      setTimeout(() => {
        setIsRecalculating(false);
        setRecalcPhase(0);
        setRecalcProgress(0);
        setRecalcLogs([]);
      }, 5000);
    }
  };

  useEffect(() => {
    fetch('/api/candidates')
      .then(r => r.json())
      .then(data => { setCandidates(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Normalize weights to sum up to exactly 1.0 (100%)
  const normalizedWeights = useMemo(() => {
    const sum = weights.semantic + weights.skills + weights.career + weights.experience + weights.behavioral;
    if (sum === 0) {
      return { semantic: 0.2, skills: 0.2, career: 0.2, experience: 0.2, behavioral: 0.2 };
    }
    return {
      semantic: weights.semantic / sum,
      skills: weights.skills / sum,
      career: weights.career / sum,
      experience: weights.experience / sum,
      behavioral: weights.behavioral / sum,
    };
  }, [weights]);

  // Recalculate and sort candidates based on customized weights
  const recalculatedCandidates = useMemo(() => {
    if (!candidates.length) return [];

    console.log("[Recalculator] Running recalculation with normalized weights:", normalizedWeights);

    const scored = candidates.map(c => {
      const sem = c.dimensions?.semantic?.score ?? c.scoreBreakdown?.semantic ?? c.score;
      const ski = c.dimensions?.skills?.score ?? c.scoreBreakdown?.skills ?? c.score;
      const car = c.dimensions?.career?.score ?? c.scoreBreakdown?.career ?? c.score;
      const exp = c.dimensions?.experience?.score ?? c.scoreBreakdown?.experience ?? c.score;
      const beh = c.dimensions?.behavioral?.score ?? c.scoreBreakdown?.behavioral ?? c.score;
      const penalty = c.penalty ?? 1.0;

      const rawScore = (
        normalizedWeights.semantic * sem +
        normalizedWeights.skills * ski +
        normalizedWeights.career * car +
        normalizedWeights.experience * exp +
        normalizedWeights.behavioral * beh
      );

      return {
        ...c,
        score: rawScore * penalty,
      };
    });

    // Sort descending by score
    const sorted = [...scored].sort((a, b) => b.score - a.score);

    console.log("[Recalculator] Top candidate after recalculation:", sorted[0]?.name, "Score:", sorted[0]?.score);

    // Re-assign ranks 1 to N
    return sorted.map((c, index) => ({
      ...c,
      rank: index + 1,
    }));
  }, [candidates, normalizedWeights]);

  // Update selected candidate details if their score/rank has changed
  const activeSelected = useMemo(() => {
    if (!selected) return null;
    return recalculatedCandidates.find(c => c.candidate_id === selected.candidate_id) || selected;
  }, [selected, recalculatedCandidates]);

  const filtered = useMemo(() => {
    let list = recalculatedCandidates.filter(c => {
      if (search) {
        const q = search.toLowerCase();
        const hay = [
          c.name, c.current_title, c.current_company, c.location, c.current_industry,
          ...(c.skills ?? []),
          ...(c.dimensions?.skills.must_have_hits ?? []),
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (workMode !== 'all' && c.preferred_work_mode !== workMode) return false;
      if (c.score < minScore) return false;
      if (onlyOpenToWork && !c.open_to_work) return false;
      return true;
    });

    // Sort
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'score': return b.score - a.score;
        case 'experience': return (b.years_of_experience ?? 0) - (a.years_of_experience ?? 0);
        case 'response_rate': return (b.recruiter_response_rate ?? 0) - (a.recruiter_response_rate ?? 0);
        case 'notice': return (a.notice_period_days ?? 999) - (b.notice_period_days ?? 999);
        default: return a.rank - b.rank;
      }
    });

    return list;
  }, [recalculatedCandidates, search, workMode, minScore, onlyOpenToWork, sortBy]);

  const stats = useMemo(() => {
    if (!recalculatedCandidates.length) return null;
    const openCount = recalculatedCandidates.filter(c => c.open_to_work).length;
    const avgScore = recalculatedCandidates.reduce((s, c) => s + c.score, 0) / recalculatedCandidates.length;
    const immediate = recalculatedCandidates.filter(c => (c.notice_period_days ?? 999) <= 15).length;
    const withFlags = recalculatedCandidates.filter(c => c.disqualifiers && c.disqualifiers.length > 0).length;
    return { total: recalculatedCandidates.length, openCount, avgScore, immediate, withFlags };
  }, [recalculatedCandidates]);

  const top3 = useMemo(() => recalculatedCandidates.slice(0, 3), [recalculatedCandidates]);
  const allScores = useMemo(() => recalculatedCandidates.map(c => c.score), [recalculatedCandidates]);

  return (
    <div className="bg-animated" style={{ minHeight: '100vh' }}>
      {/* ── Navbar ──────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: '16px', zIndex: 50,
        background: 'rgba(5, 5, 5, 0.75)',
        backdropFilter: 'blur(20px)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '12px 24px',
        margin: '16px auto 0',
        maxWidth: '1350px',
        width: 'calc(100% - 48px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.5px' }}>
              Next<span style={{ color: 'var(--accent-primary)' }}>Hire</span>
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 8 }}>
              AI Recruiter Engine
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={triggerRecalculate}
            disabled={isRecalculating}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '10px',
              fontSize: '0.7rem',
              fontWeight: 600,
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
            className="btn-ghost"
          >
            <svg 
              width="12" 
              height="12" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className={isRecalculating ? "animate-spin" : ""}
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>{isRecalculating ? 'Recalculating...' : 'Run AI Ranker'}</span>
          </button>
          <span style={{
            padding: '4px 12px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 20, fontSize: '0.7rem', color: '#34d399', fontWeight: 600,
          }}>
            ● Live Rankings
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Redrob Hackathon 2026</span>
        </div>
      </nav>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px 80px' }}>
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <div style={{ padding: '48px 0 28px', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 16px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 30, fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 18, fontWeight: 600,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
            <span>Senior AI/ML Engineer · Redrob · Noida / Pune / Hyderabad</span>
          </div>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.4rem)',
            fontWeight: 900, letterSpacing: '-2px', lineHeight: 1.1, marginBottom: 14,
          }}>
            Intelligent{' '}
            <span style={{
              backgroundImage: 'linear-gradient(135deg, #ffffff 30%, #888888 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              Talent Discovery
            </span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', maxWidth: 540, margin: '0 auto 10px' }}>
            Hybrid semantic ranking engine — BM25 + TF-IDF fused via Reciprocal Rank Fusion,
            with structured career scoring, behavioral signals, and full explainability.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            7-stage pipeline · 100,000 candidates · Real-time filtering
          </p>
        </div>

        {/* ── Pipeline Graph ────────────────────────────────────────────────── */}
        <PipelineGraph />

        {/* ── Dynamic Recruiter Weights ────────────────────────────────────── */}
        <WeightsPanel weights={weights} setWeights={setWeights} normalizedWeights={normalizedWeights} />

        {/* ── Core Pillars Architecture Panel ────────────────────────────────── */}
        <CorePillarsSection />

        {/* ── Stats + histogram row ────────────────────────────────────────── */}
        {stats && (
          <div className="animate-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) 1.2fr', gap: 14, marginBottom: 28 }}>
            <StatCard value={stats.total.toLocaleString()} label="Candidates Ranked" sub="Full 100K pool" />
            <StatCard value={`${(stats.avgScore * 100).toFixed(0)}%`} label="Avg Match Score" sub="Weighted ensemble" />
            <StatCard value={String(stats.openCount)} label="Open to Work" sub="In top 100" />
            <StatCard value={String(stats.immediate)} label="≤15d Notice" sub="Ready to join fast" />
            <ScoreHistogram scores={allScores} />
          </div>
        )}

        {/* ── Top-3 Podium ─────────────────────────────────────────────────── */}
        {top3.length === 3 && !loading && (
          <div style={{ marginBottom: 36 }}>
            <div style={{
              fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center',
              textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, marginBottom: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="7" />
                <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
              </svg>
              <span>Top Candidates</span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
              gap: 12, flexWrap: 'wrap',
            }}>
              {top3.map(c => (
                <PodiumCard
                  key={c.candidate_id}
                  candidate={c}
                  onClick={() => setSelected(selected?.candidate_id === c.candidate_id ? null : c)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 14 }}>
          <FiltersPanel
            search={search} setSearch={setSearch}
            workMode={workMode} setWorkMode={setWorkMode}
            minScore={minScore} setMinScore={setMinScore}
            onlyOpenToWork={onlyOpenToWork} setOnlyOpenToWork={setOnlyOpenToWork}
            sortBy={sortBy} setSortBy={setSortBy}
            total={candidates.length} filtered={filtered.length}
          />
        </div>

        {/* ── Table header ─────────────────────────────────────────────────── */}
        <div style={{
          display: 'grid', gridTemplateColumns: '44px 1fr 110px 80px', gap: 16,
          padding: '6px 20px', fontSize: '0.68rem', color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600,
        }}>
          <span>Rank</span>
          <span>Candidate</span>
          <span style={{ textAlign: 'right' }}>Activity</span>
          <span style={{ textAlign: 'right' }}>Score</span>
        </div>

        {/* ── Candidate rows ───────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="glass" style={{
                height: 90, opacity: 0.3,
                animation: `pulse-glow 1.5s ease-in-out infinite`,
                animationDelay: `${i * 0.1}s`,
              }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12, color: 'var(--text-muted)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <div style={{ fontSize: '0.9rem' }}>No candidates match your filters</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {filtered.map(candidate => (
              <CandidateRow
                key={candidate.candidate_id}
                candidate={candidate}
                isActive={selected?.candidate_id === candidate.candidate_id}
                onClick={() => setSelected(
                  selected?.candidate_id === candidate.candidate_id ? null : candidate
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Candidate drawer ─────────────────────────────────────────────────── */}
      {activeSelected && (
        <CandidateDrawer candidate={activeSelected} onClose={() => setSelected(null)} />
      )}

      {/* ── Recalculation Console Overlay ────────────────────────────────────── */}
      {isRecalculating && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.95)',
          backdropFilter: 'blur(16px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            width: 'min(800px, 95vw)',
            background: '#050505',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            padding: '32px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.9), 0 0 80px rgba(255, 255, 255, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }} className="animate-fade-in-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.5px' }}>
                  AI Recruiter Ranking Engine
                </h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  Streaming live candidate corpus processing and hybrid scoring over 100,000 records.
                </p>
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.7rem',
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 700
              }}>
                {recalcProgress}%
              </div>
            </div>

            {/* Glowing progress bar with hover metrics card */}
            <div 
              style={{ position: 'relative', cursor: 'help' }}
              onMouseEnter={() => setIsHoveringBar(true)}
              onMouseLeave={() => setIsHoveringBar(false)}
            >
              {isHoveringBar && (
                <div style={{
                  position: 'absolute',
                  bottom: '22px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(5, 5, 5, 0.95)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.9), 0 0 20px rgba(255,255,255,0.05)',
                  zIndex: 200,
                  width: '320px',
                  pointerEvents: 'none',
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Pipeline Progress Metrics</span>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>● Active</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.7rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>1. Candidates Ingested:</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                        {loadedCount.toLocaleString()} / 100,000
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>2. Candidates Indexed:</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                        {indexedCount.toLocaleString()} / 100,000
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>3. Structured Scoring:</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                        {scoredCount.toLocaleString()} / 1,500
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>4. Final Shortlist:</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                        {recalcProgress >= 100 ? 100 : 0} / 100
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div style={{
                height: '10px',
                borderRadius: '5px',
                background: 'rgba(255,255,255,0.05)',
                overflow: 'hidden',
                position: 'relative',
                border: '1px solid rgba(255,255,255,0.03)'
              }}>
                <div style={{
                  height: '100%',
                  width: `${recalcProgress}%`,
                  background: 'var(--accent-primary)',
                  boxShadow: '0 0 12px #ffffff',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>

            {/* Live Progress Subtext */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: -6, marginBottom: -6 }}>
              <span>
                {recalcPhase === 1 && `Ingesting candidate pool: ${loadedCount.toLocaleString()} / 100,000 loaded`}
                {recalcPhase === 2 && `Indexing search terms: ${indexedCount.toLocaleString()} / 100,000 processed`}
                {recalcPhase === 3 && `Recalculating score dimensions: ${scoredCount.toLocaleString()} / 1,500 candidates scored`}
                {recalcPhase === 4 && `Compiling final rankings and generating explanations...`}
                {recalcPhase === 5 && `All 100,000 candidates successfully processed!`}
              </span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                {recalcPhase > 0 && recalcPhase < 5 ? 'Processing...' : recalcPhase === 5 ? 'Done' : ''}
              </span>
            </div>

            {/* 4 Phases checklist */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              {[
                { phase: 1, label: 'Stream Corpus' },
                { phase: 2, label: 'Sparse Retrieval' },
                { phase: 3, label: 'Dimension Match' },
                { phase: 4, label: 'LLM Rerank' }
              ].map(({ phase, label }) => {
                const isActive = recalcPhase === phase;
                const isCompleted = recalcPhase > phase;
                return (
                  <div 
                    key={phase} 
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      background: isActive ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)',
                      border: isActive 
                        ? '1px solid rgba(255,255,255,0.18)' 
                        : isCompleted 
                          ? '1px solid rgba(16, 185, 129, 0.2)' 
                          : '1px solid rgba(255,255,255,0.03)',
                      borderRadius: '10px',
                      boxShadow: isActive ? '0 8px 24px rgba(255,255,255,0.03)' : 'none',
                      transition: 'all 0.3s',
                    }}
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      border: isCompleted 
                        ? '1.5px solid #10b981' 
                        : isActive 
                          ? '1.5px solid #ffffff' 
                          : '1.5px solid var(--text-muted)',
                      background: isCompleted ? '#10b981' : 'transparent',
                      color: isCompleted ? '#000000' : isActive ? '#ffffff' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      transition: 'all 0.3s',
                      boxShadow: isActive ? '0 0 8px rgba(255,255,255,0.3)' : 'none',
                    }}>
                      {isCompleted ? '✓' : phase}
                    </div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600 }}>{label}</div>
                  </div>
                );
              })}
            </div>

            {/* Terminal logs viewer */}
            <div 
              style={{
                background: '#000000',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '16px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.72rem',
                color: '#a0a0a0',
                height: '220px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }} 
              id="recalc-terminal"
            >
              {recalcLogs.map((logLine, index) => {
                let color = '#a0a0a0';
                if (logLine.includes('[ERROR]') || logLine.includes('[STDERR]')) {
                  color = '#f43f5e';
                } else if (logLine.includes('[SYSTEM]')) {
                  color = '#ffffff';
                } else if (logLine.includes('COMPLETED') || logLine.includes('Done!')) {
                  color = '#10b981';
                }
                return (
                  <div key={index} style={{ lineHeight: 1.5, color }}>
                    {logLine}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
