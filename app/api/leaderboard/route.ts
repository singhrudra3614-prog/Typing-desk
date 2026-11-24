import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboardFromSql } from '@/src/db/repositories.ts';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = String(searchParams.get('mode') || 'all').slice(0, 64);
    const entries = await getLeaderboardFromSql(mode, 25);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error('GET /api/leaderboard failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard.' },
      { status: 500 }
    );
  }
}
