'use client';

import { useEffect, useState } from 'react';
import type { RankedCandidate } from '@/types/candidate';
import { RadarChart } from './RadarChart';
import { CareerTimeline } from './CareerTimeline';

// ── Inline SVGs ─────────────────────────────────────────────────────────────
const TargetIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

const BriefcaseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }}>
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

const RadioIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }}>
    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
    <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
    <circle cx="12" cy="12" r="2" />
    <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
    <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
  </svg>
);

const LocationIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const SemanticIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="m14.5 9.5-5 5" />
    <path d="M10 9.5h4.5V14" />
  </svg>
);

const SkillsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

const CareerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const BehavioralIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const MessageIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const LightningIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const MicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>
);

const GithubIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

const ClipboardIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const BookmarkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
  </svg>
);

const CheckSquareIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 11 12 14 22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const WarningIcon = ({ size = 14, color = 'currentColor', style }: { size?: number; color?: string; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const CheckIcon = ({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CrossIcon = ({ size = 12, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

interface CandidateDrawerProps {
  candidate: RankedCandidate;
  onClose: () => void;
}

function ScorePill({ icon, label, value, color, sub }: { icon: React.ReactNode; label: string; value: number; color: string; sub?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '9px 14px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--border)',
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>{icon}</span>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{label}</span>
          {sub && <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 80, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{
            width: `${value * 100}%`, height: '100%',
            background: color, borderRadius: 2,
            transition: 'width 0.8s ease',
          }} />
        </div>
        <span style={{
          fontSize: '0.72rem', fontWeight: 700, color,
          fontFamily: 'JetBrains Mono, monospace', width: 32, textAlign: 'right',
        }}>
          {(value * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function SignalRow({ icon, label, value, color = 'var(--text-secondary)' }: {
  icon: React.ReactNode; label: string; value: string; color?: string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>{icon}</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{
      fontSize: '0.68rem', color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.8px',
      fontWeight: 600, marginBottom: 10,
    }}>
      {title}
    </div>
  );
}

export function CandidateDrawer({ candidate, onClose }: CandidateDrawerProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'career' | 'signals'>('overview');

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const scoreColor = candidate.score >= 0.8 ? '#10b981'
    : candidate.score >= 0.6 ? '#ffffff'
    : candidate.score >= 0.4 ? '#f59e0b'
    : '#f43f5e';

  const dims = candidate.dimensions;
  const hasSidecar = !!dims;

  return (
    <>
      {/* Overlay */}
      <div className="drawer-overlay" onClick={onClose} />

      {/* Drawer */}
      <div className="drawer">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          padding: '20px 24px 0',
          borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0,
          background: 'var(--bg-surface)',
          zIndex: 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Rank + score */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{
                  padding: '3px 12px', borderRadius: 20,
                  fontSize: '0.7rem', fontWeight: 700,
                  background: candidate.rank <= 3
                    ? 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))'
                    : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${candidate.rank <= 3 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)'}`,
                  color: candidate.rank <= 3 ? '#ffffff' : 'var(--text-secondary)',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  Rank #{candidate.rank}
                </div>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  border: `2px solid ${scoreColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 700, color: scoreColor,
                  fontFamily: 'JetBrains Mono, monospace',
                  boxShadow: `0 0 12px ${scoreColor}20`,
                }}>
                  {(candidate.score * 100).toFixed(0)}
                </div>
                {candidate.disqualifiers && candidate.disqualifiers.length > 0 && (
                  <div style={{
                    padding: '3px 10px', borderRadius: 20,
                    fontSize: '0.65rem', fontWeight: 700,
                    background: 'rgba(245,158,11,0.12)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    color: '#fbbf24',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <WarningIcon size={12} color="#fbbf24" /> {candidate.disqualifiers.length} flag{candidate.disqualifiers.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>

              <h2 style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.5px', marginBottom: 3 }}>
                {candidate.name ?? candidate.candidate_id}
              </h2>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                {candidate.current_title}
                {candidate.current_company && ` @ ${candidate.current_company}`}
              </div>
              {candidate.location && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <LocationIcon /> {candidate.location}
                  {candidate.country && candidate.country !== 'India' && `, ${candidate.country}`}
                </div>
              )}
            </div>

            {/* Close button */}
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--text-muted)', cursor: 'pointer',
              padding: '6px 10px', fontSize: '1rem', lineHeight: 1, flexShrink: 0,
            }}>✕</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: '-1px' }}>
            {(['overview', 'career', 'signals'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${activeTab === tab ? 'var(--accent-primary)' : 'transparent'}`,
                  color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '0.75rem',
                  fontWeight: activeTab === tab ? 700 : 500,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.2s',
                  letterSpacing: '0.3px',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {tab === 'overview' ? <TargetIcon /> : tab === 'career' ? <BriefcaseIcon /> : <RadioIcon />}
                <span>{tab}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 24px' }}>

          {/* ── OVERVIEW TAB ─────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <>
              {/* Quick tags */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                {candidate.open_to_work && (
                  <span className="skill-tag primary">✓ Open to Work</span>
                )}
                {candidate.notice_period_days !== undefined && (
                  <span className="skill-tag secondary">
                    {candidate.notice_period_days === 0 ? 'Immediate' : `${candidate.notice_period_days}d notice`}
                  </span>
                )}
                {candidate.preferred_work_mode && (
                  <span className="skill-tag primary" style={{ textTransform: 'capitalize' }}>
                    {candidate.preferred_work_mode}
                  </span>
                )}
                {candidate.years_of_experience !== undefined && (
                  <span className="skill-tag secondary">
                    {candidate.years_of_experience.toFixed(1)} yrs exp
                  </span>
                )}
                {candidate.willing_to_relocate && (
                  <span className="skill-tag secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4.5 16.5c-1.5 1.26-2.5 3.19-2.5 5.5h10c0-2.31-1-4.24-2.5-5.5" />
                      <path d="M12 2C6 2 2 6 2 12c0 2.45.88 4.7 2.33 6.46L12 12l7.67 6.46A10.01 10.01 0 0 0 22 12c0-6-4-10-10-10z" />
                    </svg>
                    <span>Will Relocate</span>
                  </span>
                )}
              </div>

              {/* AI Rationale */}
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  padding: '14px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                }}>
                  <div style={{ fontSize: '0.68rem', color: '#ffffff', fontWeight: 700, marginBottom: 6, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                      <rect x="9" y="9" width="6" height="6" />
                      <line x1="9" y1="1" x2="9" y2="4" />
                      <line x1="15" y1="1" x2="15" y2="4" />
                      <line x1="9" y1="20" x2="9" y2="23" />
                      <line x1="15" y1="20" x2="15" y2="23" />
                      <line x1="20" y1="9" x2="23" y2="9" />
                      <line x1="20" y1="15" x2="23" y2="15" />
                      <line x1="1" y1="9" x2="4" y2="9" />
                      <line x1="1" y1="15" x2="4" y2="15" />
                    </svg>
                    <span>AI RANKING RATIONALE</span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                    {candidate.reasoning_long ?? candidate.reasoning}
                  </p>
                </div>
              </div>

              {/* Disqualifiers */}
              {candidate.disqualifiers && candidate.disqualifiers.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    padding: '12px 16px',
                    background: 'rgba(245,158,11,0.06)',
                    border: '1px solid rgba(245,158,11,0.25)',
                    borderRadius: 12,
                  }}>
                    <div style={{ fontSize: '0.68rem', color: '#fbbf24', fontWeight: 700, marginBottom: 8, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <WarningIcon size={14} color="#fbbf24" />
                      <span>RANKING FLAGS</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {candidate.disqualifiers.map((d, i) => (
                        <div key={i} style={{
                          display: 'flex', gap: 8, alignItems: 'flex-start',
                          fontSize: '0.75rem', color: '#fcd34d', lineHeight: 1.4,
                        }}>
                          <span style={{ color: '#f59e0b', flexShrink: 0 }}>•</span>
                          <span>{d}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Score breakdown */}
              {candidate.scoreBreakdown && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader title="Score Breakdown" />
                  {/* Radar */}
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                    <RadarChart breakdown={candidate.scoreBreakdown} size={220} />
                  </div>
                  {/* Bars */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <ScorePill
                      icon={<SemanticIcon />}
                      label="Semantic Match"
                      value={candidate.scoreBreakdown.semantic}
                      color="#ffffff"
                      sub={hasSidecar ? `BM25: ${(dims!.semantic.bm25 * 100).toFixed(0)}%  TF-IDF: ${(dims!.semantic.tfidf * 100).toFixed(0)}%` : undefined}
                    />
                    <ScorePill
                      icon={<SkillsIcon />}
                      label="Skills Depth"
                      value={candidate.scoreBreakdown.skills}
                      color="#cccccc"
                      sub={hasSidecar && dims!.skills.must_hit_count > 0
                        ? `${dims!.skills.must_hit_count} must-have skills matched`
                        : undefined}
                    />
                    <ScorePill icon={<CareerIcon />} label="Career Quality" value={candidate.scoreBreakdown.career} color="#a0a0a0" />
                    <ScorePill icon={<CalendarIcon />} label="Experience Fit" value={candidate.scoreBreakdown.experience} color="#888888" />
                    <ScorePill icon={<BehavioralIcon />} label="Behavioral Signals" value={candidate.scoreBreakdown.behavioral} color="#666666" />
                  </div>
                </div>
              )}

              {/* Explainable AI Score Contributions */}
              {candidate.contributions && candidate.contributions.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader title="Explainable AI Score Contributions" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {candidate.contributions.map((contrib, i) => {
                      const isPositive = contrib.delta >= 0;
                      const deltaColor = isPositive ? '#10b981' : '#f43f5e';
                      const deltaText = isPositive ? `+${(contrib.delta * 100).toFixed(1)}%` : `${(contrib.delta * 100).toFixed(1)}%`;
                      return (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            borderRadius: '10px',
                            gap: '12px'
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffffff', marginBottom: '2px' }}>
                              {contrib.dimension}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              {contrib.reason}
                            </div>
                          </div>
                          <div style={{
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: deltaColor,
                            fontFamily: 'JetBrains Mono, monospace',
                            background: isPositive ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)',
                            border: `1px solid ${isPositive ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`,
                            padding: '4px 8px',
                            borderRadius: '6px',
                            whiteSpace: 'nowrap'
                          }}>
                            {deltaText}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}


              {/* Matched JD Skills */}
              {hasSidecar && dims!.skills.must_have_hits.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader title="Matched JD Skills" />
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 700, marginBottom: 5, letterSpacing: '0.3px' }}>
                      ✓ MUST-HAVE ({dims!.skills.must_hit_count})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {dims!.skills.must_have_hits.map(s => (
                        <span key={s} style={{
                          padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600,
                          background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399',
                        }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  {dims!.skills.nice_hits.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 5, letterSpacing: '0.3px' }}>
                        ✓ NICE-TO-HAVE ({dims!.skills.nice_hits.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {dims!.skills.nice_hits.map(s => (
                          <span key={s} className="skill-tag primary">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* All AI skills from profile */}
              {candidate.skills && candidate.skills.length > 0 && !hasSidecar && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader title="Relevant AI/ML Skills" />
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {candidate.skills.map(s => (
                      <span key={s} className="skill-tag primary">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Candidate ID */}
              <div style={{
                fontSize: '0.65rem', color: 'var(--text-muted)',
                textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', marginTop: 10,
              }}>
                {candidate.candidate_id}
                {candidate.penalty !== undefined && candidate.penalty < 1 && (
                  <span style={{ marginLeft: 8, color: '#f59e0b' }}>
                    penalty: ×{candidate.penalty.toFixed(2)}
                  </span>
                )}
              </div>
            </>
          )}

          {/* ── CAREER TAB ───────────────────────────────────────────────── */}
          {activeTab === 'career' && (
            <>
              {/* Summary */}
              {candidate.summary && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader title="Professional Summary" />
                  <p style={{
                    fontSize: '0.8rem', color: 'var(--text-secondary)',
                    lineHeight: 1.65, margin: 0,
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                  }}>
                    {candidate.summary}
                  </p>
                </div>
              )}

              {/* Career timeline */}
              {candidate.career_history && candidate.career_history.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader title="Work History" />
                  <CareerTimeline history={candidate.career_history} />
                </div>
              )}

              {/* Education */}
              {candidate.education && candidate.education.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <SectionHeader title="Education" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {candidate.education.map((edu, i) => (
                      <div key={i} style={{
                        padding: '10px 14px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                      }}>
                        <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: 2 }}>
                          {edu.degree} · {edu.field_of_study}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                          {edu.institution}
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            {edu.start_year} – {edu.end_year}
                          </span>
                          {edu.tier && edu.tier !== 'unknown' && (
                            <span style={{
                              padding: '1px 8px', borderRadius: 20, fontSize: '0.62rem', fontWeight: 700,
                              background: edu.tier === 'tier_1'
                                ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                              border: `1px solid ${edu.tier === 'tier_1' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
                              color: edu.tier === 'tier_1' ? '#ffffff' : 'var(--text-secondary)',
                            }}>
                              {edu.tier.replace('_', ' ').toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All skills list */}
              {candidate.all_skills && candidate.all_skills.length > 0 && (
                <div>
                  <SectionHeader title={`All Skills (${candidate.all_skills.length})`} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {candidate.all_skills.map(s => (
                      <span key={s.name} style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 500,
                        background: s.proficiency === 'expert' || s.proficiency === 'advanced'
                          ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${s.proficiency === 'expert' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
                        color: s.proficiency === 'expert' ? '#ffffff' : 'var(--text-secondary)',
                      }}>
                        {s.name}
                        {s.proficiency === 'expert' && <span style={{ marginLeft: 3, fontSize: '0.55rem', color: '#ffffff' }}>★</span>}
                        {s.endorsements !== undefined && s.endorsements > 0 && (
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 4 }}>• {s.endorsements}</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── SIGNALS TAB ──────────────────────────────────────────────── */}
          {activeTab === 'signals' && (
            <>
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '4px 14px',
                marginBottom: 16,
              }}>
                {candidate.recruiter_response_rate !== undefined && (
                  <SignalRow
                    icon={<MessageIcon />} label="Recruiter Response Rate"
                    value={`${(candidate.recruiter_response_rate * 100).toFixed(0)}%`}
                    color={candidate.recruiter_response_rate >= 0.6 ? '#10b981' : '#f59e0b'}
                  />
                )}
                {candidate.avg_response_time_hours !== undefined && (
                  <SignalRow
                    icon={<LightningIcon />} label="Avg Response Time"
                    value={candidate.avg_response_time_hours <= 24
                      ? `${candidate.avg_response_time_hours.toFixed(0)}h`
                      : `${(candidate.avg_response_time_hours / 24).toFixed(1)} days`}
                    color={candidate.avg_response_time_hours <= 24 ? '#10b981'
                      : candidate.avg_response_time_hours <= 72 ? '#f59e0b' : '#f43f5e'}
                  />
                )}
                {candidate.interview_completion_rate !== undefined && (
                  <SignalRow
                    icon={<MicIcon />} label="Interview Completion"
                    value={`${(candidate.interview_completion_rate * 100).toFixed(0)}%`}
                    color={candidate.interview_completion_rate >= 0.7 ? '#10b981' : '#f59e0b'}
                  />
                )}
                {candidate.github_activity_score !== undefined && (
                  <SignalRow
                    icon={<GithubIcon />} label="GitHub Activity"
                    value={candidate.github_activity_score < 0 ? 'Not linked' : `${candidate.github_activity_score.toFixed(0)}/100`}
                    color={candidate.github_activity_score >= 60 ? '#10b981'
                      : candidate.github_activity_score < 0 ? 'var(--text-muted)' : '#f59e0b'}
                  />
                )}
                {candidate.profile_completeness !== undefined && (
                  <SignalRow
                    icon={<ClipboardIcon />} label="Profile Completeness"
                    value={`${candidate.profile_completeness.toFixed(0)}%`}
                    color={candidate.profile_completeness >= 80 ? '#10b981' : '#f59e0b'}
                  />
                )}
                {candidate.last_active_date && (
                  <SignalRow
                    icon={<ClockIcon />} label="Last Active"
                    value={candidate.last_active_date}
                    color="var(--text-secondary)"
                  />
                )}
                {candidate.notice_period_days !== undefined && (
                  <SignalRow
                    icon={<CalendarIcon />} label="Notice Period"
                    value={candidate.notice_period_days === 0 ? 'Immediately available' : `${candidate.notice_period_days} days`}
                    color={candidate.notice_period_days <= 30 ? '#10b981'
                      : candidate.notice_period_days <= 60 ? '#f59e0b' : '#f43f5e'}
                  />
                )}
                {candidate.saved_by_recruiters_30d !== undefined && (
                  <SignalRow
                    icon={<BookmarkIcon />} label="Saved by Recruiters (30d)"
                    value={String(candidate.saved_by_recruiters_30d)}
                    color={candidate.saved_by_recruiters_30d >= 3 ? '#10b981' : 'var(--text-secondary)'}
                  />
                )}
                {candidate.offer_acceptance_rate !== undefined && candidate.offer_acceptance_rate >= 0 && (
                  <SignalRow
                    icon={<CheckSquareIcon />} label="Offer Acceptance Rate"
                    value={`${(candidate.offer_acceptance_rate * 100).toFixed(0)}%`}
                    color={candidate.offer_acceptance_rate >= 0.7 ? '#10b981' : '#f59e0b'}
                  />
                )}
              </div>

              {/* Verification */}
              <div style={{ marginBottom: 16 }}>
                <SectionHeader title="Verification" />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    {
                      icon: (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }}>
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                      ),
                      label: 'Email', ok: candidate.verified_email
                    },
                    {
                      icon: (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }}>
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                      ),
                      label: 'Phone', ok: candidate.verified_phone
                    },
                    {
                      icon: (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }}>
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                      ),
                      label: 'LinkedIn', ok: candidate.linkedin_connected
                    },
                  ].map(({ icon, label, ok }) => (
                    <div key={label} style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
                      background: ok ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${ok ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`,
                      color: ok ? '#34d399' : 'var(--text-muted)',
                      display: 'inline-flex', alignItems: 'center',
                    }}>
                      {ok ? <CheckIcon color="#34d399" /> : <CrossIcon color="var(--text-muted)" />}
                      {icon}
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expected salary */}
              {candidate.current_industry && (
                <div>
                  <SectionHeader title="Industry" />
                  <div style={{
                    padding: '8px 14px', borderRadius: 10, fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                  }}>
                    {candidate.current_industry}
                    {candidate.current_company_size && (
                      <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        · {candidate.current_company_size} employees
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
