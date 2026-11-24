import { NextRequest, NextResponse } from 'next/server';
import { HttpAuthError, requireAdminUser } from '@/src/lib/auth-server.ts';
import { deleteGameSessionInDb, logAdminAction } from '@/src/db/repositories.ts';

export async function DELETE(req: NextRequest) {
  try {
    const { dbUser } = await requireAdminUser(req);
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: 'Valid session ID is required.' }, { status: 400 });
    }

    await deleteGameSessionInDb(id);

    await logAdminAction({
      adminUid: dbUser.uid,
      adminEmail: dbUser.email,
      action: 'DELETE_GAME_SESSION',
      targetType: 'game_session',
      targetId: String(id),
      details: `Removed session #${id}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('DELETE /api/admin/sessions failed:', error);
    return NextResponse.json({ error: 'Failed to delete session.' }, { status: 500 });
  }
}
