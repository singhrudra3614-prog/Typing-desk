import { NextRequest, NextResponse } from 'next/server';
import { HttpAuthError, requireAuthenticatedUser } from '@/src/lib/auth-server.ts';
import { purchaseOrEquipTheme } from '@/src/db/repositories.ts';

const THEME_COSTS: Record<string, number> = {
  cyberpunk: 0,
  retro: 150,
  minimalist: 200,
};

export async function POST(req: NextRequest) {
  try {
    const { dbUser } = await requireAuthenticatedUser(req);
    const body = await req.json();
    const action = body.action === 'unlock' ? 'unlock' : 'equip';
    const themeId = String(body.themeId || '');

    if (!(themeId in THEME_COSTS)) {
      return NextResponse.json({ error: 'Invalid theme identifier.' }, { status: 400 });
    }

    const updated = await purchaseOrEquipTheme(
      dbUser.id,
      action,
      themeId,
      THEME_COSTS[themeId]
    );
    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const msg = error instanceof Error ? error.message : 'Shop operation failed.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
