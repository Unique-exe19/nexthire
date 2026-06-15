'use client';

import { useState, useEffect } from 'react';

// EvalMetricsPanel — surfaces the offline evaluation report (proxy NDCG/MAP/P@10
// + honeypot rate) from /api/eval. Demonstrates that the ranker measures its own
// quality against the official Redrob metric, and that honeypots are kept out of
// the top-100 (Stage-3 DQ filter). Pure presentational; matches the dashboard's
// monochrome aesthetic.

interface EvalReport {
  available: boolean;
  message?: string;
  metrics?: {
    'NDCG@10': number;
    'NDCG@50': number;
    MAP: number;
    'P@10': number;
    'P@5': number;
    composite: number;
  };
  honeypot?: { in_top_100: number; rate: number; disqualified: boolean };
  tier_histogram_top100?: Record<string, number>;
  pool?: { size: number; relevant_tier3plus: number; honeypots_total: number };
  note?: string;
}

const METRIC_WEIGHTS: Record<string, string> = {
  'NDCG@10': '0.50',
  'NDCG@50': '0.30',
  MAP: '0.15',
  'P@10': '0.05',
};

export function EvalMetricsPanel() {
  const [report, setReport] = useState<EvalReport | null>(null);

  useEffect(() => {
    fetch('/api/eval')
      .then((r) => r.json())
      .then(setReport)
      .catch(() => setReport({ available: false, message: 'eval unavailable' }));
  }, []);

  if (!report) return null;

  if (!report.available || !report.metrics) {
    return (
      <div
        style={{
          border: '1px solid #1a1a1a',
          borderRadius: 12,
          padding: '16px 20px',
          background: '#0a0a0a',
          color: '#666',
          fontSize: 13,
        }}
      >
        Offline eval not generated yet — run{' '}
        <code style={{ color: '#9ca3af' }}>python ranker/evaluate.py</code> to populate
        NDCG / MAP / honeypot metrics.
      </div>
    );
  }

  const m = report.metrics;
  const hp = report.honeypot!;
  const metricCards = [
    { label: 'NDCG@10', value: m['NDCG@10'] },
    { label: 'NDCG@50', value: m['NDCG@50'] },
    { label: 'MAP', value: m.MAP },
    { label: 'P@10', value: m['P@10'] },
  ];

  return (
    <div
      style={{
        border: '1px solid #1a1a1a',
        borderRadius: 12,
        padding: '18px 20px',
        background: 'linear-gradient(180deg,#0c0c0c,#070707)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 13, letterSpacing: 0.5, color: '#9ca3af', fontWeight: 600 }}>
          OFFLINE EVALUATION
          <span style={{ color: '#4b5563', fontWeight: 400 }}> · proxy ground truth</span>
        </div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          composite{' '}
          <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 15 }}>
            {m.composite.toFixed(4)}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
          marginBottom: 14,
        }}
      >
        {metricCards.map((c) => (
          <div
            key={c.label}
            style={{
              border: '1px solid #161616',
              borderRadius: 8,
              padding: '10px 12px',
              background: '#0a0a0a',
            }}
          >
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
              {c.label}
              {METRIC_WEIGHTS[c.label] && (
                <span style={{ color: '#374151' }}> ·w{METRIC_WEIGHTS[c.label]}</span>
              )}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e5e7eb' }}>
              {c.value.toFixed(3)}
            </div>
          </div>
        ))}
      </div>

      {/* Honeypot status — the Stage-3 disqualification filter */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          borderRadius: 8,
          border: `1px solid ${hp.disqualified ? '#7f1d1d' : '#14532d'}`,
          background: hp.disqualified ? '#1a0a0a' : '#07120a',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: hp.disqualified ? '#ef4444' : '#22c55e',
            boxShadow: `0 0 8px ${hp.disqualified ? '#ef4444' : '#22c55e'}`,
          }}
        />
        <span style={{ fontSize: 13, color: hp.disqualified ? '#fca5a5' : '#86efac' }}>
          {hp.in_top_100} honeypot{hp.in_top_100 === 1 ? '' : 's'} in top-100 (
          {(hp.rate * 100).toFixed(1)}%)
          {hp.disqualified
            ? ' — exceeds 10% DQ threshold'
            : ' — within 10% Stage-3 limit'}
        </span>
        {report.pool && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4b5563' }}>
            {report.pool.honeypots_total} traps detected in {report.pool.size.toLocaleString()} pool
          </span>
        )}
      </div>

      {report.note && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#4b5563', fontStyle: 'italic' }}>
          {report.note}
        </div>
      )}
    </div>
  );
}
