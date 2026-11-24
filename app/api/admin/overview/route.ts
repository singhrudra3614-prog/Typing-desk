import { NextRequest, NextResponse } from 'next/server';
import { HttpAuthError, requireAdminUser } from '@/src/lib/auth-server.ts';
import { getAdminOverviewData } from '@/src/db/repositories.ts';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdminUser(req);
    const data = await getAdminOverviewData();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('GET /api/admin/overview failed:', error);
    return NextResponse.json(
      { error: 'Failed to load admin overview.' },
      { status: 500 }
    );
  }
}
