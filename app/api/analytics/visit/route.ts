import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { upsertVisitorVisit } from '@/src/db/repositories.ts';
import { verifyBearerToken } from '@/src/lib/auth-server.ts';

function parseUserAgent(ua: string) {
  const lower = ua.toLowerCase();
  let deviceType = 'desktop';
  if (/mobile|iphone|ipod|android.*mobile|windows phone/.test(lower)) {
    deviceType = 'mobile';
  } else if (/ipad|tablet|android(?!.*mobile)/.test(lower)) {
    deviceType = 'tablet';
  }

  let browser = 'Other';
  if (lower.includes('edg/')) browser = 'Edge';
  else if (lower.includes('chrome/') && !lower.includes('chromium')) browser = 'Chrome';
  else if (lower.includes('firefox/')) browser = 'Firefox';
  else if (lower.includes('safari/') && !lower.includes('chrome')) browser = 'Safari';
  else if (lower.includes('opr/') || lower.includes('opera')) browser = 'Opera';

  let os = 'Other';
  if (lower.includes('windows')) os = 'Windows';
  else if (lower.includes('mac os') || lower.includes('macintosh')) os = 'macOS';
  else if (lower.includes('android')) os = 'Android';
  else if (lower.includes('iphone') || lower.includes('ipad')) os = 'iOS';
  else if (lower.includes('linux')) os = 'Linux';

  return { deviceType, browser, os };
}

function maskIp(rawIp: string): string {
  if (!rawIp || rawIp === 'unknown') return 'unknown';
  const clean = rawIp.split(',')[0].trim();
  const hash = crypto.createHash('sha256').update(clean).digest('hex').slice(0, 8);
  const parts = clean.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.* (${hash})`;
  }
  return `ip-${hash}`;
}

async function handleVisit(req: NextRequest) {
  try {
    const body = await req.json();
    const visitorId = String(body.visitorId || '').slice(0, 80);
    const sessionToken = String(body.sessionToken || '').slice(0, 80);

    if (!visitorId || !sessionToken) {
      return NextResponse.json({ error: 'Missing visitor session identifiers.' }, { status: 400 });
    }

    const ua = req.headers.get('user-agent') || '';
    const { deviceType, browser, os } = parseUserAgent(ua);
    const rawIp =
      req.headers.get('x-forwarded-for') ||
      req.headers.get('x-real-ip') ||
      'unknown';
    const country =
      req.headers.get('x-appengine-country') ||
      req.headers.get('cf-ipcountry') ||
      'Global';

    const decoded = await verifyBearerToken(req);

    const record = await upsertVisitorVisit({
      visitorId,
      sessionToken,
      userUid: decoded?.uid || (typeof body.userUid === 'string' ? body.userUid.slice(0, 80) : null),
      userEmail: decoded?.email || (typeof body.userEmail === 'string' ? body.userEmail.slice(0, 120) : null),
      userName: decoded?.name || (typeof body.userName === 'string' ? body.userName.slice(0, 80) : null),
      pagePath: String(body.pagePath || '/').slice(0, 120),
      activeTab: String(body.activeTab || 'home').slice(0, 60),
      referrer: String(body.referrer || 'direct').slice(0, 200),
      userAgent: ua,
      deviceType,
      browser,
      os,
      screenRes: String(body.screenRes || '').slice(0, 32),
      ipMasked: maskIp(rawIp),
      country: String(country).slice(0, 32),
      deltaSec: Number(body.deltaSec || 0),
      isPageView: Boolean(body.isPageView),
    });

    return NextResponse.json({ ok: true, id: record?.id || null });
  } catch (error) {
    console.error('Visitor telemetry error:', error);
    return NextResponse.json({ error: 'Telemetry recording failed.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handleVisit(req);
}

export async function PATCH(req: NextRequest) {
  return handleVisit(req);
}
