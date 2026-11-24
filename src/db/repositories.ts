import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  adPlacements,
  auditLogs,
  customWordPacks,
  gameSessions,
  siteSettings,
  users,
  visitorLogs,
} from './schema.ts';

function sanitizeUrl(url: string | undefined | null, fallback = ''): string {
  if (!url) return fallback;
  const trimmed = url.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return fallback;
  }
  return fallback;
}

const DEFAULT_AD_SLOTS = [
  {
    slotKey: 'header_banner',
    name: 'Top Leaderboard Banner',
    placement: 'top_banner',
    adType: 'placeholder',
    title: 'Upgrade Your Mechanical Keyboard Setup',
    description: 'Low-latency optical switches built for 150+ WPM competitive typists. Sponsored placement.',
    ctaText: 'Explore Gear',
    targetUrl: 'https://example.com/keyboards',
    dimensions: '728x90',
    isActive: true,
  },
  {
    slotKey: 'hub_mid_banner',
    name: 'Game Hub Mid-Feed Banner',
    placement: 'in_feed',
    adType: 'sponsor_card',
    title: 'TypeQuest Pro Partner Slot',
    description: 'Reach thousands of developers, speed-typers, and learners daily with native placement.',
    ctaText: 'Learn More',
    targetUrl: 'https://example.com/sponsor',
    dimensions: '970x120',
    isActive: true,
  },
  {
    slotKey: 'sidebar_promo',
    name: 'Hub Sidebar Ad Card',
    placement: 'sidebar',
    adType: 'placeholder',
    title: 'Featured Developer Sponsor',
    description: '300x250 rectangular ad unit ready for Google AdSense or direct brand campaigns.',
    ctaText: 'Visit Sponsor',
    targetUrl: 'https://example.com/dev-tools',
    dimensions: '300x250',
    isActive: true,
  },
  {
    slotKey: 'post_game_slot',
    name: 'Post-Match Interstitial Box',
    placement: 'post_game',
    adType: 'placeholder',
    title: 'Match Summary Sponsor Slot',
    description: 'High-visibility placement shown on the post-game victory & stats screen.',
    ctaText: 'View Offer',
    targetUrl: 'https://example.com/offer',
    dimensions: '468x60',
    isActive: true,
  },
  {
    slotKey: 'footer_strip',
    name: 'Footer Strip Banner',
    placement: 'footer',
    adType: 'placeholder',
    title: 'Footer Partner Placement',
    description: 'Persistent lightweight sponsor strip across TypeQuest pages.',
    ctaText: 'Check Now',
    targetUrl: 'https://example.com/partner',
    dimensions: '728x90',
    isActive: false,
  },
];

const DEFAULT_WORD_PACKS = [
  {
    title: 'TypeScript & Next.js Essentials',
    category: 'Programming',
    difficulty: 'intermediate',
    wordsJson: JSON.stringify([
      'interface', 'async', 'await', 'Promise', 'useEffect', 'useState',
      'NextResponse', 'drizzle', 'postgres', 'middleware', 'component',
      'typescript', 'schema', 'export', 'default', 'readonly',
    ]),
    isActive: true,
    createdBy: 'system',
  },
  {
    title: 'High-Speed Common Bigrams',
    category: 'Speed Training',
    difficulty: 'beginner',
    wordsJson: JSON.stringify([
      'there', 'their', 'about', 'would', 'which', 'other', 'could',
      'these', 'first', 'after', 'where', 'think', 'great', 'every',
      'world', 'still', 'should', 'never',
    ]),
    isActive: true,
    createdBy: 'system',
  },
  {
    title: 'Cybersecurity & Cloud Ops',
    category: 'DevOps',
    difficulty: 'advanced',
    wordsJson: JSON.stringify([
      'encryption', 'authentication', 'firewall', 'kubernetes', 'container',
      'telemetry', 'zero-trust', 'certificate', 'webhook', 'endpoint',
      'postgresql', 'authorization', 'payload', 'immutable', 'sandbox',
    ]),
    isActive: true,
    createdBy: 'system',
  },
];

export async function ensureDefaultsSeeded() {
  try {
    await db
      .insert(siteSettings)
      .values({ key: 'global_config' })
      .onConflictDoNothing({ target: siteSettings.key });

    for (const slot of DEFAULT_AD_SLOTS) {
      await db
        .insert(adPlacements)
        .values(slot)
        .onConflictDoNothing({ target: adPlacements.slotKey });
    }

    const existingPacks = await db
      .select({ id: customWordPacks.id })
      .from(customWordPacks)
      .limit(1);

    if (existingPacks.length === 0) {
      await db.insert(customWordPacks).values(DEFAULT_WORD_PACKS);
    }
  } catch (error) {
    console.error('Failed to seed default records:', error);
    throw new Error('Failed to initialize site configuration.', { cause: error });
  }
}

export async function getBootstrapData() {
  try {
    await ensureDefaultsSeeded();

    const [settingsRows, adsRows, packsRows, userCountRows, sessionCountRows] =
      await Promise.all([
        db
          .select()
          .from(siteSettings)
          .where(eq(siteSettings.key, 'global_config'))
          .limit(1),
        db
          .select()
          .from(adPlacements)
          .where(eq(adPlacements.isActive, true))
          .orderBy(adPlacements.id),
        db
          .select()
          .from(customWordPacks)
          .where(eq(customWordPacks.isActive, true))
          .orderBy(desc(customWordPacks.createdAt)),
        db.select({ count: sql<number>`count(*)::int` }).from(users),
        db.select({ count: sql<number>`count(*)::int` }).from(gameSessions),
      ]);

    const settings = settingsRows[0] || null;
    let enabledModes: string[] = [];
    if (settings?.enabledModes) {
      try {
        enabledModes = JSON.parse(settings.enabledModes);
      } catch {
        enabledModes = [];
      }
    }

    return {
      settings: settings
        ? { ...settings, enabledModesList: enabledModes }
        : null,
      ads: adsRows,
      wordPacks: packsRows.map((p) => {
        let words: string[] = [];
        try {
          words = JSON.parse(p.wordsJson);
        } catch {
          words = [];
        }
        return { ...p, words };
      }),
      communityStats: {
        totalPlayers: userCountRows[0]?.count ?? 0,
        totalMatches: sessionCountRows[0]?.count ?? 0,
      },
    };
  } catch (error) {
    console.error('Database bootstrap query failed:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function getOrCreateUser(input: {
  uid: string;
  email: string;
  displayName?: string;
  photoUrl?: string;
}) {
  try {
    const primaryAdminEmail = (
      process.env.ADMIN_EMAIL || 'singhrudra3614@gmail.com'
    )
      .trim()
      .toLowerCase();

    const isPrimaryAdmin = input.email.trim().toLowerCase() === primaryAdminEmail;

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.uid, input.uid))
      .limit(1);

    if (existing.length > 0) {
      const current = existing[0];
      const nextRole = isPrimaryAdmin ? 'admin' : current.role;
      const updated = await db
        .update(users)
        .set({
          email: input.email,
          displayName: input.displayName || current.displayName,
          photoUrl: input.photoUrl ?? current.photoUrl,
          role: nextRole,
          lastSeenAt: new Date(),
        })
        .where(eq(users.uid, input.uid))
        .returning();
      return updated[0];
    }

    // Also promote first user if no admin exists yet
    const existingAdmin = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'))
      .limit(1);

    const assignedRole =
      isPrimaryAdmin || existingAdmin.length === 0 ? 'admin' : 'user';

    const inserted = await db
      .insert(users)
      .values({
        uid: input.uid,
        email: input.email,
        displayName: input.displayName || input.email.split('@')[0] || 'Typist',
        photoUrl: sanitizeUrl(input.photoUrl, ''),
        role: assignedRole,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: input.email,
          lastSeenAt: new Date(),
        },
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Database getOrCreateUser failed:', error);
    throw new Error('Failed to sync user profile.', { cause: error });
  }
}

export async function recordGameSession(
  userId: number,
  userUid: string,
  payload: {
    gameMode: string;
    difficulty?: string;
    wpm: number;
    accuracy: number;
    score: number;
    wordsTyped?: number;
    durationSec?: number;
    success?: boolean;
  }
) {
  try {
    await ensureDefaultsSeeded();
    const [settings] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'global_config'))
      .limit(1);

    const xpMult = Math.max(1, settings?.xpMultiplier ?? 1);
    const coinMult = Math.max(1, settings?.coinMultiplier ?? 1);

    const safeWpm = Math.max(0, Math.min(400, Math.round(payload.wpm)));
    const safeAcc = Math.max(0, Math.min(100, Math.round(payload.accuracy)));
    const safeScore = Math.max(0, Math.round(payload.score));
    const safeWords = Math.max(0, Math.round(payload.wordsTyped || 0));
    const safeDur = Math.max(0, Math.round(payload.durationSec || 0));

    const [session] = await db
      .insert(gameSessions)
      .values({
        userId,
        userUid,
        gameMode: payload.gameMode,
        difficulty: payload.difficulty || 'beginner',
        wpm: safeWpm,
        accuracy: safeAcc,
        score: safeScore,
        wordsTyped: safeWords,
        durationSec: safeDur,
        success: payload.success ?? true,
      })
      .returning();

    const [currentUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (currentUser) {
      const xpEarned = Math.round((safeScore / 10) * xpMult);
      const coinsEarned = Math.round(Math.floor(safeScore / 100) * coinMult);
      const nextXp = currentUser.xp + xpEarned;
      const nextLevel = Math.max(currentUser.level, Math.floor(nextXp / 1000) + 1);
      const nextAvgWpm =
        currentUser.averageWpm > 0
          ? Math.round((currentUser.averageWpm + safeWpm) / 2)
          : safeWpm;
      const nextAvgAcc =
        currentUser.totalWordsTyped > 0
          ? Math.round((currentUser.averageAccuracy + safeAcc) / 2)
          : safeAcc;

      await db
        .update(users)
        .set({
          xp: nextXp,
          level: nextLevel,
          coins: currentUser.coins + coinsEarned,
          totalWordsTyped: currentUser.totalWordsTyped + safeWords,
          bestWpm: Math.max(currentUser.bestWpm, safeWpm),
          averageWpm: nextAvgWpm,
          averageAccuracy: nextAvgAcc,
          lastSeenAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    return session;
  } catch (error) {
    console.error('Database recordGameSession failed:', error);
    throw new Error('Failed to record game session.', { cause: error });
  }
}

export async function getLeaderboardFromSql(mode: string, maxRows = 25) {
  try {
    const queryBase = db
      .select({
        sessionId: gameSessions.id,
        userUid: gameSessions.userUid,
        displayName: users.displayName,
        photoUrl: users.photoUrl,
        gameMode: gameSessions.gameMode,
        wpm: gameSessions.wpm,
        accuracy: gameSessions.accuracy,
        score: gameSessions.score,
        createdAt: gameSessions.createdAt,
      })
      .from(gameSessions)
      .innerJoin(users, eq(gameSessions.userId, users.id));

    const rows =
      mode === 'all'
        ? await queryBase
            .where(eq(users.isBanned, false))
            .orderBy(desc(gameSessions.score))
            .limit(maxRows)
        : await queryBase
            .where(and(eq(gameSessions.gameMode, mode), eq(users.isBanned, false)))
            .orderBy(desc(gameSessions.score))
            .limit(maxRows);

    // Deduplicate by userUid keeping highest score
    const seen = new Set<string>();
    const deduped = [];
    for (const row of rows) {
      if (!seen.has(row.userUid)) {
        seen.add(row.userUid);
        deduped.push(row);
      }
    }
    return deduped;
  } catch (error) {
    console.error('Database getLeaderboardFromSql failed:', error);
    throw new Error('Failed to fetch leaderboard.', { cause: error });
  }
}

export async function upsertVisitorVisit(input: {
  visitorId: string;
  sessionToken: string;
  userUid?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  pagePath: string;
  activeTab?: string;
  referrer?: string;
  userAgent: string;
  deviceType: string;
  browser: string;
  os: string;
  screenRes?: string;
  ipMasked: string;
  country: string;
  deltaSec?: number;
  isPageView?: boolean;
}) {
  try {
    const delta = Math.max(0, Math.min(120, Math.round(input.deltaSec || 0)));

    const existing = await db
      .select()
      .from(visitorLogs)
      .where(eq(visitorLogs.sessionToken, input.sessionToken))
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      const [updated] = await db
        .update(visitorLogs)
        .set({
          userUid: input.userUid || row.userUid,
          userEmail: input.userEmail || row.userEmail,
          userName: input.userName || row.userName,
          pagePath: input.pagePath || row.pagePath,
          activeTab: input.activeTab || row.activeTab,
          durationSec: row.durationSec + delta,
          pageViews: input.isPageView ? row.pageViews + 1 : row.pageViews,
          lastPingAt: new Date(),
        })
        .where(eq(visitorLogs.sessionToken, input.sessionToken))
        .returning();

      if (delta > 0 && (input.userUid || row.userUid)) {
        const uidToUpdate = input.userUid || row.userUid!;
        await db
          .update(users)
          .set({
            totalTimeSpentSec: sql`${users.totalTimeSpentSec} + ${delta}`,
            lastSeenAt: new Date(),
          })
          .where(eq(users.uid, uidToUpdate));
      }

      return updated;
    }

    const [created] = await db
      .insert(visitorLogs)
      .values({
        visitorId: input.visitorId,
        sessionToken: input.sessionToken,
        userUid: input.userUid || null,
        userEmail: input.userEmail || null,
        userName: input.userName || null,
        pagePath: input.pagePath || '/',
        activeTab: input.activeTab || 'home',
        referrer: input.referrer || 'direct',
        userAgent: input.userAgent.slice(0, 300),
        deviceType: input.deviceType,
        browser: input.browser,
        os: input.os,
        screenRes: input.screenRes || '',
        ipMasked: input.ipMasked,
        country: input.country,
        durationSec: delta,
        pageViews: 1,
      })
      .onConflictDoNothing({ target: visitorLogs.sessionToken })
      .returning();

    return created || null;
  } catch (error) {
    console.error('Database upsertVisitorVisit failed:', error);
    throw new Error('Failed to record visitor telemetry.', { cause: error });
  }
}

export async function trackAdEvent(slotKey: string, eventType: 'impression' | 'click') {
  try {
    if (eventType === 'impression') {
      await db
        .update(adPlacements)
        .set({ impressions: sql`${adPlacements.impressions} + 1` })
        .where(eq(adPlacements.slotKey, slotKey));
    } else {
      await db
        .update(adPlacements)
        .set({ clicks: sql`${adPlacements.clicks} + 1` })
        .where(eq(adPlacements.slotKey, slotKey));
    }
  } catch (error) {
    console.error('Database trackAdEvent failed:', error);
    throw new Error('Failed to track ad event.', { cause: error });
  }
}

export async function purchaseOrEquipTheme(
  userId: number,
  action: 'unlock' | 'equip',
  themeId: string,
  cost: number
) {
  try {
    const [current] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!current) throw new Error('User not found.');

    let unlocked: string[] = ['cyberpunk'];
    try {
      unlocked = JSON.parse(current.unlockedThemes);
    } catch {
      unlocked = ['cyberpunk'];
    }

    if (action === 'unlock') {
      if (unlocked.includes(themeId)) {
        return current;
      }
      if (current.coins < cost) {
        throw new Error('Insufficient coins to unlock this theme.');
      }
      unlocked.push(themeId);
      const [updated] = await db
        .update(users)
        .set({
          coins: current.coins - cost,
          unlockedThemes: JSON.stringify(unlocked),
          activeTheme: themeId,
        })
        .where(eq(users.id, userId))
        .returning();
      return updated;
    } else {
      if (!unlocked.includes(themeId)) {
        throw new Error('Theme is not unlocked yet.');
      }
      const [updated] = await db
        .update(users)
        .set({ activeTheme: themeId })
        .where(eq(users.id, userId))
        .returning();
      return updated;
    }
  } catch (error) {
    console.error('Database purchaseOrEquipTheme failed:', error);
    throw error instanceof Error
      ? error
      : new Error('Failed to update locker item.', { cause: error });
  }
}

export async function logAdminAction(input: {
  adminUid: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: string;
}) {
  try {
    await db.insert(auditLogs).values({
      adminUid: input.adminUid,
      adminEmail: input.adminEmail,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId || '',
      details: input.details || '',
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

export async function getAdminOverviewData() {
  try {
    await ensureDefaultsSeeded();

    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      allUsers,
      recentVisitors,
      allAds,
      settingsRows,
      wordPacks,
      recentSessions,
      recentAuditLogs,
      activeVisitorCountRows,
      todayVisitsRows,
      visitorTotalsRows,
      sessionAggRows,
      visitors30d,
      sessions30d,
    ] = await Promise.all([
      db.select().from(users).orderBy(desc(users.lastSeenAt)).limit(250),
      db
        .select()
        .from(visitorLogs)
        .orderBy(desc(visitorLogs.lastPingAt))
        .limit(200),
      db.select().from(adPlacements).orderBy(adPlacements.id),
      db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, 'global_config'))
        .limit(1),
      db.select().from(customWordPacks).orderBy(desc(customWordPacks.createdAt)),
      db
        .select({
          id: gameSessions.id,
          userId: gameSessions.userId,
          userUid: gameSessions.userUid,
          displayName: users.displayName,
          email: users.email,
          gameMode: gameSessions.gameMode,
          difficulty: gameSessions.difficulty,
          wpm: gameSessions.wpm,
          accuracy: gameSessions.accuracy,
          score: gameSessions.score,
          wordsTyped: gameSessions.wordsTyped,
          durationSec: gameSessions.durationSec,
          success: gameSessions.success,
          createdAt: gameSessions.createdAt,
        })
        .from(gameSessions)
        .leftJoin(users, eq(gameSessions.userId, users.id))
        .orderBy(desc(gameSessions.createdAt))
        .limit(150),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(visitorLogs)
        .where(gte(visitorLogs.lastPingAt, fiveMinsAgo)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(visitorLogs)
        .where(gte(visitorLogs.startedAt, startOfToday)),
      db
        .select({
          totalVisits: sql<number>`count(*)::int`,
          uniqueVisitors: sql<number>`count(distinct ${visitorLogs.visitorId})::int`,
          totalUsageSec: sql<number>`coalesce(sum(${visitorLogs.durationSec}), 0)::int`,
          avgUsageSec: sql<number>`coalesce(round(avg(${visitorLogs.durationSec})), 0)::int`,
          totalPageViews: sql<number>`coalesce(sum(${visitorLogs.pageViews}), 0)::int`,
        })
        .from(visitorLogs),
      db
        .select({
          totalSessions: sql<number>`count(*)::int`,
          avgWpm: sql<number>`coalesce(round(avg(${gameSessions.wpm})), 0)::int`,
          avgAccuracy: sql<number>`coalesce(round(avg(${gameSessions.accuracy})), 0)::int`,
          topWpm: sql<number>`coalesce(max(${gameSessions.wpm}), 0)::int`,
        })
        .from(gameSessions),
      db
        .select({
          visitorId: visitorLogs.visitorId,
          userUid: visitorLogs.userUid,
          durationSec: visitorLogs.durationSec,
          startedAt: visitorLogs.startedAt,
        })
        .from(visitorLogs)
        .where(gte(visitorLogs.startedAt, thirtyDaysAgo)),
      db
        .select({
          userUid: gameSessions.userUid,
          wpm: gameSessions.wpm,
          wordsTyped: gameSessions.wordsTyped,
          createdAt: gameSessions.createdAt,
        })
        .from(gameSessions)
        .where(gte(gameSessions.createdAt, thirtyDaysAgo)),
    ]);

    const adSummary = allAds.reduce(
      (acc, ad) => {
        acc.impressions += ad.impressions;
        acc.clicks += ad.clicks;
        return acc;
      },
      { impressions: 0, clicks: 0 }
    );

    // Aggregate 30-day Daily Active Users & Game Engagement trends
    const engagement30dMap = new Map<
      string,
      {
        dateKey: string;
        date: string;
        activeUserIds: Set<string>;
        gameSessions: number;
        usageSec: number;
        wpmSum: number;
      }
    >();

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      engagement30dMap.set(key, {
        dateKey: key,
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        activeUserIds: new Set<string>(),
        gameSessions: 0,
        usageSec: 0,
        wpmSum: 0,
      });
    }

    for (const v of visitors30d) {
      const key = new Date(v.startedAt).toISOString().slice(0, 10);
      const bucket = engagement30dMap.get(key);
      if (bucket) {
        bucket.activeUserIds.add(v.userUid || v.visitorId);
        bucket.usageSec += v.durationSec;
      }
    }

    for (const s of sessions30d) {
      const key = new Date(s.createdAt).toISOString().slice(0, 10);
      const bucket = engagement30dMap.get(key);
      if (bucket) {
        bucket.activeUserIds.add(s.userUid);
        bucket.gameSessions += 1;
        bucket.wpmSum += s.wpm;
      }
    }

    const dailyEngagement30d = Array.from(engagement30dMap.values()).map((b) => ({
      dateKey: b.dateKey,
      date: b.date,
      activeUsers: b.activeUserIds.size,
      gameSessions: b.gameSessions,
      usageMinutes: Math.round(b.usageSec / 60),
      avgWpm: b.gameSessions > 0 ? Math.round(b.wpmSum / b.gameSessions) : 0,
    }));

    // Aggregate daily visitor & usage time chart (last 7 days)
    const dailyTraffic = dailyEngagement30d.slice(-7).map((d) => ({
      date: d.date,
      visits: visitors30d.filter(
        (v) => new Date(v.startedAt).toISOString().slice(0, 10) === d.dateKey
      ).length,
      usageMinutes: d.usageMinutes,
    }));

    // Mode breakdown
    const modeMap = new Map<
      string,
      { mode: string; count: number; totalWpm: number }
    >();
    for (const s of recentSessions) {
      const entry = modeMap.get(s.gameMode) || {
        mode: s.gameMode,
        count: 0,
        totalWpm: 0,
      };
      entry.count += 1;
      entry.totalWpm += s.wpm;
      modeMap.set(s.gameMode, entry);
    }
    const modeBreakdown = Array.from(modeMap.values()).map((m) => ({
      mode: m.mode,
      sessions: m.count,
      avgWpm: m.count > 0 ? Math.round(m.totalWpm / m.count) : 0,
    }));

    // Device breakdown
    const deviceMap = new Map<string, number>();
    for (const v of recentVisitors) {
      deviceMap.set(v.deviceType, (deviceMap.get(v.deviceType) || 0) + 1);
    }
    const deviceBreakdown = Array.from(deviceMap.entries()).map(
      ([device, count]) => ({ device, count })
    );

    return {
      kpis: {
        totalUsers: allUsers.length,
        activeVisitorsNow: activeVisitorCountRows[0]?.count ?? 0,
        visitsToday: todayVisitsRows[0]?.count ?? 0,
        totalVisits: visitorTotalsRows[0]?.totalVisits ?? 0,
        uniqueVisitors: visitorTotalsRows[0]?.uniqueVisitors ?? 0,
        totalUsageSec: visitorTotalsRows[0]?.totalUsageSec ?? 0,
        avgUsageSec: visitorTotalsRows[0]?.avgUsageSec ?? 0,
        totalPageViews: visitorTotalsRows[0]?.totalPageViews ?? 0,
        totalSessions: sessionAggRows[0]?.totalSessions ?? 0,
        globalAvgWpm: sessionAggRows[0]?.avgWpm ?? 0,
        globalAvgAccuracy: sessionAggRows[0]?.avgAccuracy ?? 0,
        topWpm: sessionAggRows[0]?.topWpm ?? 0,
        adImpressions: adSummary.impressions,
        adClicks: adSummary.clicks,
      },
      charts: {
        dailyTraffic,
        dailyEngagement30d,
        modeBreakdown,
        deviceBreakdown,
      },
      users: allUsers,
      visitors: recentVisitors,
      ads: allAds,
      settings: settingsRows[0] || null,
      wordPacks,
      sessions: recentSessions,
      auditLogs: recentAuditLogs,
    };
  } catch (error) {
    console.error('Database getAdminOverviewData failed:', error);
    throw new Error('Failed to load admin overview.', { cause: error });
  }
}

export async function updateSiteSettingsInDb(
  patch: Partial<typeof siteSettings.$inferInsert>
) {
  try {
    await ensureDefaultsSeeded();
    const [updated] = await db
      .update(siteSettings)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(siteSettings.key, 'global_config'))
      .returning();
    return updated;
  } catch (error) {
    console.error('Database updateSiteSettingsInDb failed:', error);
    throw new Error('Failed to update site settings.', { cause: error });
  }
}

export async function upsertAdPlacementInDb(input: {
  id?: number;
  slotKey: string;
  name: string;
  placement: string;
  adType: string;
  title: string;
  description?: string;
  imageUrl?: string;
  ctaText?: string;
  targetUrl?: string;
  adsenseClient?: string;
  adsenseSlot?: string;
  dimensions?: string;
  isActive: boolean;
}) {
  try {
    const cleanTarget = sanitizeUrl(input.targetUrl, 'https://example.com');
    const cleanImage = sanitizeUrl(input.imageUrl, '');

    if (input.id) {
      const [updated] = await db
        .update(adPlacements)
        .set({
          name: input.name,
          placement: input.placement,
          adType: input.adType,
          title: input.title,
          description: input.description || '',
          imageUrl: cleanImage,
          ctaText: input.ctaText || 'Learn More',
          targetUrl: cleanTarget,
          adsenseClient: input.adsenseClient || '',
          adsenseSlot: input.adsenseSlot || '',
          dimensions: input.dimensions || '728x90',
          isActive: input.isActive,
          updatedAt: new Date(),
        })
        .where(eq(adPlacements.id, input.id))
        .returning();
      return updated;
    }

    const [inserted] = await db
      .insert(adPlacements)
      .values({
        slotKey: input.slotKey,
        name: input.name,
        placement: input.placement,
        adType: input.adType,
        title: input.title,
        description: input.description || '',
        imageUrl: cleanImage,
        ctaText: input.ctaText || 'Learn More',
        targetUrl: cleanTarget,
        adsenseClient: input.adsenseClient || '',
        adsenseSlot: input.adsenseSlot || '',
        dimensions: input.dimensions || '728x90',
        isActive: input.isActive,
      })
      .onConflictDoUpdate({
        target: adPlacements.slotKey,
        set: {
          name: input.name,
          placement: input.placement,
          adType: input.adType,
          title: input.title,
          description: input.description || '',
          imageUrl: cleanImage,
          ctaText: input.ctaText || 'Learn More',
          targetUrl: cleanTarget,
          adsenseClient: input.adsenseClient || '',
          adsenseSlot: input.adsenseSlot || '',
          dimensions: input.dimensions || '728x90',
          isActive: input.isActive,
          updatedAt: new Date(),
        },
      })
      .returning();
    return inserted;
  } catch (error) {
    console.error('Database upsertAdPlacementInDb failed:', error);
    throw new Error('Failed to save ad placement.', { cause: error });
  }
}

export async function deleteAdPlacementInDb(id: number) {
  try {
    await db.delete(adPlacements).where(eq(adPlacements.id, id));
  } catch (error) {
    console.error('Database deleteAdPlacementInDb failed:', error);
    throw new Error('Failed to delete ad placement.', { cause: error });
  }
}

export async function updateUserByAdminInDb(
  targetUserId: number,
  patch: {
    role?: string;
    isBanned?: boolean;
    banReason?: string;
    xp?: number;
    coins?: number;
    level?: number;
  }
) {
  try {
    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, targetUserId))
      .returning();
    return updated;
  } catch (error) {
    console.error('Database updateUserByAdminInDb failed:', error);
    throw new Error('Failed to update user.', { cause: error });
  }
}

export async function deleteUserByAdminInDb(targetUserId: number) {
  try {
    await db.delete(users).where(eq(users.id, targetUserId));
  } catch (error) {
    console.error('Database deleteUserByAdminInDb failed:', error);
    throw new Error('Failed to delete user.', { cause: error });
  }
}

export async function createWordPackInDb(input: {
  title: string;
  category: string;
  difficulty: string;
  words: string[];
  createdBy: string;
}) {
  try {
    const [created] = await db
      .insert(customWordPacks)
      .values({
        title: input.title,
        category: input.category,
        difficulty: input.difficulty,
        wordsJson: JSON.stringify(input.words),
        isActive: true,
        createdBy: input.createdBy,
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database createWordPackInDb failed:', error);
    throw new Error('Failed to create word pack.', { cause: error });
  }
}

export async function toggleWordPackInDb(id: number, isActive: boolean) {
  try {
    const [updated] = await db
      .update(customWordPacks)
      .set({ isActive })
      .where(eq(customWordPacks.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error('Database toggleWordPackInDb failed:', error);
    throw new Error('Failed to toggle word pack.', { cause: error });
  }
}

export async function deleteWordPackInDb(id: number) {
  try {
    await db.delete(customWordPacks).where(eq(customWordPacks.id, id));
  } catch (error) {
    console.error('Database deleteWordPackInDb failed:', error);
    throw new Error('Failed to delete word pack.', { cause: error });
  }
}

export async function deleteGameSessionInDb(id: number) {
  try {
    await db.delete(gameSessions).where(eq(gameSessions.id, id));
  } catch (error) {
    console.error('Database deleteGameSessionInDb failed:', error);
    throw new Error('Failed to delete session.', { cause: error });
  }
}

export async function clearVisitorLogsInDb() {
  try {
    await db.delete(visitorLogs);
  } catch (error) {
    console.error('Database clearVisitorLogsInDb failed:', error);
    throw new Error('Failed to clear visitor logs.', { cause: error });
  }
}
