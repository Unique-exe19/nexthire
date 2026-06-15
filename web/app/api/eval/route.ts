import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Serves the offline evaluation report produced by `python ranker/evaluate.py`
// (proxy NDCG@10/50, MAP, P@10, composite, and honeypot rate). The dashboard
// renders this to demonstrate that the system measures its own ranking quality
// against the official metric — the JD explicitly wants engineers who design
// evaluation frameworks (NDCG/MRR/MAP).
export async function GET() {
  const reportPath = path.resolve(process.cwd(), '..', 'eval_report.json');
  try {
    if (!fs.existsSync(reportPath)) {
      return NextResponse.json(
        { available: false, message: 'Run `python ranker/evaluate.py` to generate eval_report.json' },
        { status: 200 },
      );
    }
    const data = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    return NextResponse.json({ available: true, ...data });
  } catch (e: any) {
    return NextResponse.json({ available: false, message: e?.message ?? 'read error' }, { status: 200 });
  }
}
