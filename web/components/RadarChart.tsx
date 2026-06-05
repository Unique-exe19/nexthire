'use client';

import type { ScoreBreakdown } from '@/types/candidate';

interface RadarChartProps {
  breakdown: ScoreBreakdown;
  size?: number;
}

const LABELS = [
  { key: 'semantic',   label: 'Semantic\nMatch' },
  { key: 'skills',     label: 'Skills\nDepth' },
  { key: 'career',     label: 'Career\nQuality' },
  { key: 'experience', label: 'Experience\nFit' },
  { key: 'behavioral', label: 'Behavioral\nSignals' },
];

export function RadarChart({ breakdown, size = 200 }: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const n = LABELS.length;

  const angles = LABELS.map((_, i) => (Math.PI * 2 * i) / n - Math.PI / 2);
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];

  function gridPoints(level: number) {
    return angles.map(a => ({
      x: cx + r * level * Math.cos(a),
      y: cy + r * level * Math.sin(a),
    }));
  }

  const dataValues = LABELS.map(({ key }) => (breakdown as any)[key] ?? 0);
  const dataPoints = angles.map((a, i) => ({
    x: cx + r * dataValues[i] * Math.cos(a),
    y: cy + r * dataValues[i] * Math.sin(a),
  }));

  function pointsStr(pts: { x: number; y: number }[]) {
    return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }

  const labelR = r * 1.38;
  const labelPositions = angles.map((a, i) => ({
    x: cx + labelR * Math.cos(a),
    y: cy + labelR * Math.sin(a),
    label: LABELS[i].label,
    value: dataValues[i],
  }));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      {/* Grid polygons */}
      {gridLevels.map(level => (
        <polygon
          key={level}
          points={pointsStr(gridPoints(level))}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
      ))}

      {/* Grid spokes */}
      {angles.map((a, i) => (
        <line
          key={i}
          x1={cx} y1={cy}
          x2={cx + r * Math.cos(a)}
          y2={cy + r * Math.sin(a)}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
      ))}

      {/* Data polygon */}
      <polygon
        points={pointsStr(dataPoints)}
        fill="rgba(255,255,255,0.06)"
        stroke="url(#radarGradient)"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Data dots */}
      {dataPoints.map((pt, i) => (
        <circle
          key={i}
          cx={pt.x} cy={pt.y}
          r={4}
          fill="#ffffff"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1.5"
        />
      ))}

      {/* Labels */}
      {labelPositions.map(({ x, y, label, value }, i) => {
        const lines = label.split('\n');
        return (
          <text key={i} textAnchor="middle" dominantBaseline="middle">
            {lines.map((line, li) => (
              <tspan
                key={li}
                x={x}
                dy={li === 0 ? (y - cy) * 0 : '1.1em'}
                y={li === 0 ? y - (lines.length === 2 ? 7 : 0) : undefined}
                className="radar-label"
              >
                {line}
              </tspan>
            ))}
            <tspan
              x={x}
              y={y + (lines.length === 2 ? 16 : 10)}
              style={{
                fontSize: '0.6rem',
                fill: value >= 0.7 ? '#10b981' : value >= 0.4 ? '#ffffff' : '#f59e0b',
                fontWeight: 700,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {(value * 100).toFixed(0)}%
            </tspan>
          </text>
        );
      })}

      <defs>
        <linearGradient id="radarGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#555555" />
        </linearGradient>
      </defs>
    </svg>
  );
}
