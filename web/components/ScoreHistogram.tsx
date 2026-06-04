'use client';

interface ScoreHistogramProps {
  scores: number[];
}

const BUCKETS = 10;

export function ScoreHistogram({ scores }: ScoreHistogramProps) {
  if (!scores.length) return null;

  // Build histogram buckets [0-0.1, 0.1-0.2, ..., 0.9-1.0]
  const buckets = Array.from({ length: BUCKETS }, (_, i) => ({
    min: i / BUCKETS,
    max: (i + 1) / BUCKETS,
    count: 0,
    label: `${(i * 10).toFixed(0)}–${((i + 1) * 10).toFixed(0)}`,
  }));

  for (const s of scores) {
    const idx = Math.min(BUCKETS - 1, Math.floor(s * BUCKETS));
    buckets[idx].count++;
  }

  const maxCount = Math.max(...buckets.map(b => b.count), 1);

  return (
    <div className="glass" style={{ padding: '16px 20px' }}>
      <div style={{
        fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase',
        letterSpacing: '0.8px', fontWeight: 600, marginBottom: 10,
      }}>
        Score Distribution
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 3,
        height: 48,
      }}>
        {buckets.map((b, i) => {
          const h = Math.max(3, (b.count / maxCount) * 48);
          const isHighScore = b.min >= 0.7;
          const isMidScore  = b.min >= 0.4;
          const color = isHighScore ? '#ffffff' : isMidScore ? '#a0a0a0' : '#444444';
          return (
            <div
              key={i}
              title={`${b.label}%: ${b.count} candidates`}
              style={{
                flex: 1,
                height: h,
                background: color,
                borderRadius: '3px 3px 0 0',
                opacity: b.count === 0 ? 0.15 : 0.85,
                transition: 'height 0.4s ease',
                cursor: 'default',
                boxShadow: b.count > 0 ? `0 0 6px ${color}30` : 'none',
              }}
            />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>0%</span>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>50%</span>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>100%</span>
      </div>
    </div>
  );
}
