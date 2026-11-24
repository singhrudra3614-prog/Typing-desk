import { NextRequest, NextResponse } from 'next/server';
import { trackAdEvent } from '@/src/db/repositories.ts';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const slotKey = String(body.slotKey || '').slice(0, 64);
    const eventType = body.eventType === 'click' ? 'click' : 'impression';

    if (!slotKey) {
      return NextResponse.json({ error: 'slotKey is required' }, { status: 400 });
    }

    await trackAdEvent(slotKey, eventType);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/ads/track failed:', error);
    return NextResponse.json({ error: 'Failed to record ad event' }, { status: 500 });
  }
}
