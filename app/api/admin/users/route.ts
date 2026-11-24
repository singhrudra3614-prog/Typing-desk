import { NextRequest, NextResponse } from 'next/server';
import { HttpAuthError, requireAdminUser } from '@/src/lib/auth-server.ts';
import {
  deleteUserByAdminInDb,
  logAdminAction,
  updateUserByAdminInDb,
} from '@/src/db/repositories.ts';

export async function PATCH(req: NextRequest) {
  try {
    const { dbUser } = await requireAdminUser(req);
    const body = await req.json();
    const userId = Number(body.userId);

    if (!userId || Number.isNaN(userId)) {
      return NextResponse.json({ error: 'Valid userId is required.' }, { status: 400 });
    }

    const patch: {
      role?: string;
      isBanned?: boolean;
      banReason?: string;
      xp?: number;
      coins?: number;
      level?: number;
    } = {};

    if (typeof body.role === 'string' && ['admin', 'moderator', 'user'].includes(body.role)) {
      patch.role = body.role;
    }
    if (typeof body.isBanned === 'boolean') {
      patch.isBanned = body.isBanned;
    }
    if (typeof body.banReason === 'string') {
      patch.banReason = body.banReason.slice(0, 200);
    }
    if (typeof body.xp === 'number') patch.xp = Math.max(0, Math.round(body.xp));
    if (typeof body.coins === 'number') patch.coins = Math.max(0, Math.round(body.coins));
    if (typeof body.level === 'number') patch.level = Math.max(1, Math.round(body.level));

    const updated = await updateUserByAdminInDb(userId, patch);

    await logAdminAction({
      adminUid: dbUser.uid,
      adminEmail: dbUser.email,
      action: 'UPDATE_USER',
      targetType: 'user',
      targetId: String(userId),
      details: `Updated fields: ${Object.keys(patch).join(', ')}`,
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('PATCH /api/admin/users failed:', error);
    return NextResponse.json({ error: 'Failed to update user.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { dbUser } = await requireAdminUser(req);
    const { searchParams } = new URL(req.url);
    const userId = Number(searchParams.get('id'));

    if (!userId || Number.isNaN(userId)) {
      return NextResponse.json({ error: 'Valid user id is required.' }, { status: 400 });
    }
    if (userId === dbUser.id) {
      return NextResponse.json({ error: 'Cannot delete your own active admin account.' }, { status: 400 });
    }

    await deleteUserByAdminInDb(userId);

    await logAdminAction({
      adminUid: dbUser.uid,
      adminEmail: dbUser.email,
      action: 'DELETE_USER',
      targetType: 'user',
      targetId: String(userId),
      details: `Deleted user record #${userId}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('DELETE /api/admin/users failed:', error);
    return NextResponse.json({ error: 'Failed to delete user.' }, { status: 500 });
  }
}
