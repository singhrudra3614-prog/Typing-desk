import { NextRequest, NextResponse } from 'next/server';
import { HttpAuthError, requireAdminUser } from '@/src/lib/auth-server.ts';
import {
  deleteAdPlacementInDb,
  logAdminAction,
  upsertAdPlacementInDb,
} from '@/src/db/repositories.ts';

async function handleUpsert(req: NextRequest) {
  try {
    const { dbUser } = await requireAdminUser(req);
    const body = await req.json();

    const slotKey = String(body.slotKey || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 60);
    const name = String(body.name || '').trim().slice(0, 80);

    if (!slotKey || !name) {
      return NextResponse.json({ error: 'slotKey and name are required.' }, { status: 400 });
    }

    const saved = await upsertAdPlacementInDb({
      id: typeof body.id === 'number' ? body.id : undefined,
      slotKey,
      name,
      placement: String(body.placement || 'in_feed').slice(0, 40),
      adType: String(body.adType || 'placeholder').slice(0, 40),
      title: String(body.title || 'Sponsored Placement').slice(0, 120),
      description: String(body.description || '').slice(0, 260),
      imageUrl: String(body.imageUrl || '').slice(0, 300),
      ctaText: String(body.ctaText || 'Learn More').slice(0, 40),
      targetUrl: String(body.targetUrl || 'https://example.com').slice(0, 300),
      adsenseClient: String(body.adsenseClient || '').slice(0, 80),
      adsenseSlot: String(body.adsenseSlot || '').slice(0, 80),
      dimensions: String(body.dimensions || '728x90').slice(0, 30),
      isActive: body.isActive !== false,
    });

    await logAdminAction({
      adminUid: dbUser.uid,
      adminEmail: dbUser.email,
      action: body.id ? 'UPDATE_AD_PLACEMENT' : 'CREATE_AD_PLACEMENT',
      targetType: 'ad_placement',
      targetId: slotKey,
      details: `${name} (${saved.adType}, active=${saved.isActive})`,
    });

    return NextResponse.json({ ad: saved });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Ad placement save failed:', error);
    return NextResponse.json({ error: 'Failed to save ad placement.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handleUpsert(req);
}

export async function PATCH(req: NextRequest) {
  return handleUpsert(req);
}

export async function DELETE(req: NextRequest) {
  try {
    const { dbUser } = await requireAdminUser(req);
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: 'Valid ad ID is required.' }, { status: 400 });
    }
    await deleteAdPlacementInDb(id);

    await logAdminAction({
      adminUid: dbUser.uid,
      adminEmail: dbUser.email,
      action: 'DELETE_AD_PLACEMENT',
      targetType: 'ad_placement',
      targetId: String(id),
      details: `Removed ad placement #${id}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('DELETE /api/admin/ads failed:', error);
    return NextResponse.json({ error: 'Failed to delete ad placement.' }, { status: 500 });
  }
}
