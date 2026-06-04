'use client';

import type { RankedCandidate } from '@/types/candidate';

interface PodiumCardProps {
  candidate: RankedCandidate;
  onClick: () => void;
}

const PODIUM_CONFIGS = {
  1: {
    height: 130,
    gradient: 'linear-gradient(135deg, #ffffff, #888888)',
    glow: 'rgba(255, 255, 255, 0.15)',
    label: 'GOLD',
    order: 2,  // center
  },
  2: {
    height: 100,
    gradient: 'linear-gradient(135deg, #cccccc, #555555)',
    glow: 'rgba(200, 200, 200, 0.1)',
    label: 'SILVER',
    order: 1,  // left
  },
  3: {
    height: 80,
    gradient: 'linear-gradient(135deg, #888888, #222222)',
    glow: 'rgba(100, 100, 100, 0.08)',
    label: 'BRONZE',
    order: 3,  // right
  },
} as const;

const TrophyIcon = ({ rank }: { rank: 1 | 2 | 3 }) => {
  const color = rank === 1 ? '#ffffff' : rank === 2 ? '#cccccc' : '#888888';
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" />
      <path d="M12 2a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4 4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Z" />
    </svg>
  );
};

const LocationIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export function PodiumCard({ candidate, onClick }: PodiumCardProps) {
  const rank = (candidate.rank === 1 || candidate.rank === 2 || candidate.rank === 3) ? candidate.rank : 3;
  const cfg = PODIUM_CONFIGS[rank];

  return (
    <div
      className="podium-card"
      style={{ order: cfg.order, '--glow-color': cfg.glow } as any}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      {/* Trophy Icon */}
      <div style={{
        marginBottom: 8,
        filter: `drop-shadow(0 0 8px ${cfg.glow})`,
        animation: rank === 1 ? 'float 3s ease-in-out infinite' : 'none',
      }}>
        <TrophyIcon rank={rank} />
      </div>

      {/* Score ring */}
      <div style={{
        width: rank === 1 ? 64 : 54,
        height: rank === 1 ? 64 : 54,
        borderRadius: '50%',
        background: cfg.gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: rank === 1 ? '1.1rem' : '0.9rem',
        fontWeight: 900,
        color: '#000000',
        fontFamily: 'JetBrains Mono, monospace',
        boxShadow: `0 0 20px ${cfg.glow}, 0 0 40px ${cfg.glow}40`,
        marginBottom: 10,
        flexShrink: 0,
        border: '1px solid rgba(255,255,255,0.4)',
      }}>
        {(candidate.score * 100).toFixed(0)}
      </div>

      {/* Name & title */}
      <div style={{ textAlign: 'center', minWidth: 0 }}>
        <div style={{
          fontWeight: 700,
          fontSize: rank === 1 ? '0.9rem' : '0.82rem',
          color: 'var(--text-primary)',
          marginBottom: 3,
          lineHeight: 1.3,
        }}>
          {candidate.name ?? candidate.candidate_id}
        </div>
        <div style={{
          fontSize: '0.7rem',
          color: 'var(--text-secondary)',
          marginBottom: 4,
          lineHeight: 1.3,
        }}>
          {candidate.current_title}
        </div>
        {candidate.location && (
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            <LocationIcon /> {candidate.location}
          </div>
        )}
      </div>

      {/* Top skills */}
      {candidate.dimensions?.skills.must_have_hits && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center',
          marginTop: 8,
        }}>
          {candidate.dimensions.skills.must_have_hits.slice(0, 2).map(s => (
            <span key={s} style={{
              padding: '2px 7px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 20,
              fontSize: '0.6rem',
              color: '#ffffff',
              fontWeight: 600,
            }}>
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Podium base */}
      <div style={{
        width: '100%',
        height: cfg.height,
        background: `linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)`,
        borderTop: `1px solid rgba(255,255,255,0.12)`,
        marginTop: 'auto',
        borderRadius: '0 0 12px 12px',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: 8,
        fontSize: '0.65rem',
        fontWeight: 700,
        color: 'var(--text-secondary)',
        letterSpacing: '1px',
      }}>
        #{rank}
      </div>
    </div>
  );
}
