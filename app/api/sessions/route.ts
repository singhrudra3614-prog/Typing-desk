import { NextRequest, NextResponse } from 'next/server';
import { HttpAuthError, requireAuthenticatedUser } from '@/src/lib/auth-server.ts';
import { recordGameSession } from '@/src/db/repositories.ts';

export async function POST(req: NextRequest) {
  try {
    const { dbUser } = await requireAuthenticatedUser(req);
    const body = await req.json();

    const gameMode = String(body.gameMode || '').slice(0, 64);
    if (!gameMode) {
      return NextResponse.json({ error: 'gameMode is required.' }, { status: 400 });
    }

    const session = await recordGameSession(dbUser.id, dbUser.uid, {
      gameMode,
      difficulty: String(body.difficulty || 'beginner').slice(0, 32),
      wpm: Number(body.wpm || 0),
      accuracy: Number(body.accuracy || 0),
      score: Number(body.score || 0),
      wordsTyped: Number(body.wordsTyped || 0),
      durationSec: Number(body.durationSec || 0),
      success: body.success !== false,
    });

    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('POST /api/sessions failed:', error);
    return NextResponse.json({ error: 'Failed to save session.' }, { status: 500 });
  }
}
