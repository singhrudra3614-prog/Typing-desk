import { NextRequest, NextResponse } from 'next/server';
import { HttpAuthError, requireAdminUser } from '@/src/lib/auth-server.ts';
import { logAdminAction, updateSiteSettingsInDb } from '@/src/db/repositories.ts';

export async function PATCH(req: NextRequest) {
  try {
    const { dbUser } = await requireAdminUser(req);
    const body = await req.json();

    const patch: Record<string, unknown> = {};
    if (typeof body.siteName === 'string') patch.siteName = body.siteName.slice(0, 60);
    if (typeof body.heroHeadline === 'string') patch.heroHeadline = body.heroHeadline.slice(0, 120);
    if (typeof body.heroSubheading === 'string') patch.heroSubheading = body.heroSubheading.slice(0, 300);
    if (typeof body.announcementEnabled === 'boolean') patch.announcementEnabled = body.announcementEnabled;
    if (typeof body.announcementText === 'string') patch.announcementText = body.announcementText.slice(0, 240);
    if (typeof body.announcementType === 'string' && ['info', 'promo', 'warning'].includes(body.announcementType)) {
      patch.announcementType = body.announcementType;
    }
    if (typeof body.maintenanceMode === 'boolean') patch.maintenanceMode = body.maintenanceMode;
    if (typeof body.maintenanceMessage === 'string') patch.maintenanceMessage = body.maintenanceMessage.slice(0, 300);
    if (typeof body.adsEnabled === 'boolean') patch.adsEnabled = body.adsEnabled;
    if (typeof body.registrationOpen === 'boolean') patch.registrationOpen = body.registrationOpen;
    if (typeof body.aiFeaturesEnabled === 'boolean') patch.aiFeaturesEnabled = body.aiFeaturesEnabled;
    if (typeof body.multiplayerEnabled === 'boolean') patch.multiplayerEnabled = body.multiplayerEnabled;
    if (typeof body.defaultDifficulty === 'string' && ['beginner', 'intermediate', 'advanced', 'expert'].includes(body.defaultDifficulty)) {
      patch.defaultDifficulty = body.defaultDifficulty;
    }
    if (typeof body.xpMultiplier === 'number') {
      patch.xpMultiplier = Math.max(1, Math.min(10, Math.round(body.xpMultiplier)));
    }
    if (typeof body.coinMultiplier === 'number') {
      patch.coinMultiplier = Math.max(1, Math.min(10, Math.round(body.coinMultiplier)));
    }
    if (Array.isArray(body.enabledModesList)) {
      const cleaned = body.enabledModesList.map((m: unknown) => String(m).slice(0, 40));
      patch.enabledModes = JSON.stringify(cleaned);
    } else if (typeof body.enabledModes === 'string') {
      patch.enabledModes = body.enabledModes;
    }

    const updated = await updateSiteSettingsInDb(patch);

    await logAdminAction({
      adminUid: dbUser.uid,
      adminEmail: dbUser.email,
      action: 'UPDATE_SITE_SETTINGS',
      targetType: 'site_settings',
      targetId: 'global_config',
      details: `Updated settings keys: ${Object.keys(patch).join(', ')}`,
    });

    return NextResponse.json({ settings: updated });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('PATCH /api/admin/settings failed:', error);
    return NextResponse.json({ error: 'Failed to update site settings.' }, { status: 500 });
  }
}
