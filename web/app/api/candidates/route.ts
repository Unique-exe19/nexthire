import { getRankedCandidates } from '@/lib/data';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const candidates = await getRankedCandidates();
  return NextResponse.json(candidates);
}
