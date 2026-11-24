import { NextRequest, NextResponse } from 'next/server';
import { HttpAuthError, requireAuthenticatedUser } from '@/src/lib/auth-server.ts';

export async function POST(req: NextRequest) {
  try {
    const { dbUser } = await requireAuthenticatedUser(req);
    return NextResponse.json({ user: dbUser });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('POST /api/user/sync failed:', error);
    return NextResponse.json({ error: 'Failed to sync user.' }, { status: 500 });
  }
}
