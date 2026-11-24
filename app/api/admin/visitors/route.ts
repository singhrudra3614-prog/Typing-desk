import { NextRequest, NextResponse } from 'next/server';
import { HttpAuthError, requireAdminUser } from '@/src/lib/auth-server.ts';
import { clearVisitorLogsInDb, logAdminAction } from '@/src/db/repositories.ts';

export async function DELETE(req: NextRequest) {
  try {
    const { dbUser } = await requireAdminUser(req);
    await clearVisitorLogsInDb();

    await logAdminAction({
      adminUid: dbUser.uid,
      adminEmail: dbUser.email,
      action: 'CLEAR_VISITOR_LOGS',
      targetType: 'visitor_logs',
      targetId: 'all',
      details: 'Cleared all visitor history records',
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('DELETE /api/admin/visitors failed:', error);
    return NextResponse.json({ error: 'Failed to clear visitor logs.' }, { status: 500 });
  }
}
