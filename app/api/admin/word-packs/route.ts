import { NextRequest, NextResponse } from 'next/server';
import { HttpAuthError, requireAdminUser } from '@/src/lib/auth-server.ts';
import {
  createWordPackInDb,
  deleteWordPackInDb,
  logAdminAction,
  toggleWordPackInDb,
} from '@/src/db/repositories.ts';

export async function POST(req: NextRequest) {
  try {
    const { dbUser } = await requireAdminUser(req);
    const body = await req.json();
    const title = String(body.title || '').trim().slice(0, 80);
    const category = String(body.category || 'General').trim().slice(0, 40);
    const difficulty = String(body.difficulty || 'beginner').trim().slice(0, 24);
    const rawWords = Array.isArray(body.words)
      ? body.words
      : String(body.wordsText || '')
          .split(/[\n,]+/)
          .map((w: string) => w.trim())
          .filter(Boolean);

    const words = rawWords.map((w: unknown) => String(w).trim().slice(0, 40)).filter(Boolean);

    if (!title || words.length < 3) {
      return NextResponse.json(
        { error: 'Title and at least 3 words are required.' },
        { status: 400 }
      );
    }

    const pack = await createWordPackInDb({
      title,
      category,
      difficulty,
      words,
      createdBy: dbUser.email,
    });

    await logAdminAction({
      adminUid: dbUser.uid,
      adminEmail: dbUser.email,
      action: 'CREATE_WORD_PACK',
      targetType: 'word_pack',
      targetId: String(pack.id),
      details: `${title} (${words.length} words)`,
    });

    return NextResponse.json({ pack });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('POST /api/admin/word-packs failed:', error);
    return NextResponse.json({ error: 'Failed to create word pack.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { dbUser } = await requireAdminUser(req);
    const body = await req.json();
    const id = Number(body.id);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: 'Valid pack ID required.' }, { status: 400 });
    }

    const updated = await toggleWordPackInDb(id, Boolean(body.isActive));

    await logAdminAction({
      adminUid: dbUser.uid,
      adminEmail: dbUser.email,
      action: 'TOGGLE_WORD_PACK',
      targetType: 'word_pack',
      targetId: String(id),
      details: `Set active=${Boolean(body.isActive)}`,
    });

    return NextResponse.json({ pack: updated });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('PATCH /api/admin/word-packs failed:', error);
    return NextResponse.json({ error: 'Failed to update word pack.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { dbUser } = await requireAdminUser(req);
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: 'Valid pack ID required.' }, { status: 400 });
    }

    await deleteWordPackInDb(id);

    await logAdminAction({
      adminUid: dbUser.uid,
      adminEmail: dbUser.email,
      action: 'DELETE_WORD_PACK',
      targetType: 'word_pack',
      targetId: String(id),
      details: `Deleted word pack #${id}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('DELETE /api/admin/word-packs failed:', error);
    return NextResponse.json({ error: 'Failed to delete word pack.' }, { status: 500 });
  }
}
