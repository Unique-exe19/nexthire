'use client';

interface Job {
  company: string;
  title: string;
  start_date: string;
  end_date: string | null;
  duration_months: number;
  is_current: boolean;
  industry: string;
  company_size: string;
  description?: string;
}

interface CareerTimelineProps {
  history: Job[];
}

function formatDuration(months: number): string {
  if (months < 1) return '<1m';
  if (months < 12) return `${months}m`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m > 0 ? `${y}y ${m}m` : `${y}y`;
}

function formatYear(dateStr: string): string {
  try {
    return new Date(dateStr).getFullYear().toString();
  } catch {
    return dateStr.slice(0, 4);
  }
}

const AI_TITLE_KWS = [
  'ml', 'ai', 'machine learning', 'nlp', 'data scientist', 'research',
  'ranking', 'search', 'recommendation', 'applied', 'algorithm',
];

function isAIRole(title: string): boolean {
  const lower = title.toLowerCase();
  return AI_TITLE_KWS.some(kw => lower.includes(kw));
}

export function CareerTimeline({ history }: CareerTimelineProps) {
  if (!history || history.length === 0) return null;

  // Sort by start_date descending (most recent first)
  const sorted = [...history].sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );

  return (
    <div style={{ position: 'relative' }}>
      {/* Vertical line */}
      <div style={{
        position: 'absolute',
        left: 11,
        top: 6,
        bottom: 6,
        width: 2,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.05) 100%)',
        borderRadius: 1,
      }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingLeft: 28 }}>
        {sorted.map((job, i) => {
          const aiRole = isAIRole(job.title);
          const dotColor = job.is_current
            ? '#10b981'
            : aiRole
            ? '#ffffff'
            : 'var(--text-muted)';

          return (
            <div key={i} style={{ position: 'relative' }}>
              {/* Dot */}
              <div style={{
                position: 'absolute',
                left: -22,
                top: 3,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: dotColor,
                boxShadow: job.is_current ? `0 0 8px ${dotColor}` : 'none',
                border: '2px solid var(--bg-surface)',
              }} />

              {/* Content */}
              <div>
                <div style={{
                  display: 'flex', alignItems: 'flex-start',
                  justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
                }}>
                  <div>
                    <div style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: aiRole ? '#ffffff' : 'var(--text-primary)',
                      lineHeight: 1.3,
                    }}>
                      {job.title}
                      {aiRole && <span style={{ marginLeft: 5, fontSize: '0.6rem', color: '#ffffff' }}>●</span>}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 1 }}>
                      {job.company}
                      {job.company_size && (
                        <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                          ({job.company_size})
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {formatYear(job.start_date)} – {job.is_current ? 'Present' : (job.end_date ? formatYear(job.end_date) : '?')}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>
                      {formatDuration(job.duration_months)}
                    </div>
                  </div>
                </div>

                {/* Industry tag */}
                {job.industry && (
                  <div style={{ marginTop: 3 }}>
                    <span style={{
                      fontSize: '0.6rem',
                      padding: '1px 7px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 20,
                      color: 'var(--text-muted)',
                    }}>
                      {job.industry}
                    </span>
                  </div>
                )}

                {/* Job Description */}
                {job.description && (
                  <p style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary)',
                    marginTop: 6,
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {job.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
