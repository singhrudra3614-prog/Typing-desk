import { NextResponse } from 'next/server';
import { getBootstrapData } from '@/src/db/repositories.ts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getBootstrapData();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('GET /api/site/bootstrap failed:', error);
    return NextResponse.json(
      { error: 'Unable to load site configuration.' },
      { status: 500 }
    );
  }
}
