import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default('Anonymous Typist'),
  photoUrl: text('photo_url').default(''),
  role: text('role').notNull().default('user'), // 'admin' | 'moderator' | 'user'
  isBanned: boolean('is_banned').notNull().default(false),
  banReason: text('ban_reason').default(''),
  xp: integer('xp').notNull().default(0),
  level: integer('level').notNull().default(1),
  coins: integer('coins').notNull().default(100),
  totalWordsTyped: integer('total_words_typed').notNull().default(0),
  averageWpm: integer('average_wpm').notNull().default(0),
  averageAccuracy: integer('average_accuracy').notNull().default(100),
  bestWpm: integer('best_wpm').notNull().default(0),
  streak: integer('streak').notNull().default(0),
  activeTheme: text('active_theme').notNull().default('cyberpunk'),
  unlockedThemes: text('unlocked_themes').notNull().default('["cyberpunk"]'),
  unlockedBadges: text('unlocked_badges').notNull().default('[]'),
  totalTimeSpentSec: integer('total_time_spent_sec').notNull().default(0),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const gameSessions = pgTable('game_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  userUid: text('user_uid').notNull(),
  gameMode: text('game_mode').notNull(),
  difficulty: text('difficulty').notNull().default('beginner'),
  wpm: integer('wpm').notNull(),
  accuracy: integer('accuracy').notNull(),
  score: integer('score').notNull(),
  wordsTyped: integer('words_typed').notNull().default(0),
  durationSec: integer('duration_sec').notNull().default(0),
  success: boolean('success').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const visitorLogs = pgTable('visitor_logs', {
  id: serial('id').primaryKey(),
  visitorId: text('visitor_id').notNull(),
  sessionToken: text('session_token').notNull().unique(),
  userUid: text('user_uid'),
  userEmail: text('user_email'),
  userName: text('user_name'),
  pagePath: text('page_path').notNull().default('/'),
  activeTab: text('active_tab').default('home'),
  referrer: text('referrer').default('direct'),
  userAgent: text('user_agent').default(''),
  deviceType: text('device_type').notNull().default('desktop'),
  browser: text('browser').notNull().default('Unknown'),
  os: text('os').notNull().default('Unknown'),
  screenRes: text('screen_res').default(''),
  ipMasked: text('ip_masked').default('unknown'),
  country: text('country').default('Unknown'),
  durationSec: integer('duration_sec').notNull().default(0),
  pageViews: integer('page_views').notNull().default(1),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  lastPingAt: timestamp('last_ping_at').defaultNow().notNull(),
});

export const adPlacements = pgTable('ad_placements', {
  id: serial('id').primaryKey(),
  slotKey: text('slot_key').notNull().unique(),
  name: text('name').notNull(),
  placement: text('placement').notNull(), // 'top_banner' | 'in_feed' | 'sidebar' | 'post_game' | 'footer'
  adType: text('ad_type').notNull().default('placeholder'), // 'placeholder' | 'custom_banner' | 'sponsor_card' | 'adsense'
  title: text('title').notNull().default('Sponsored Placement'),
  description: text('description').default('Advertise your developer tool, keyboard, or course here.'),
  imageUrl: text('image_url').default(''),
  ctaText: text('cta_text').default('Learn More'),
  targetUrl: text('target_url').default('https://example.com'),
  adsenseClient: text('adsense_client').default(''),
  adsenseSlot: text('adsense_slot').default(''),
  dimensions: text('dimensions').default('728x90'),
  isActive: boolean('is_active').notNull().default(true),
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const siteSettings = pgTable('site_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  siteName: text('site_name').notNull().default('TypeQuest'),
  heroHeadline: text('hero_headline').notNull().default('Level Up Your Fingers'),
  heroSubheading: text('hero_subheading')
    .notNull()
    .default('Master typing through high-speed arcade combat, adaptive AI drills, and live global rankings.'),
  announcementEnabled: boolean('announcement_enabled').notNull().default(false),
  announcementText: text('announcement_text').default(''),
  announcementType: text('announcement_type').notNull().default('info'),
  maintenanceMode: boolean('maintenance_mode').notNull().default(false),
  maintenanceMessage: text('maintenance_message')
    .notNull()
    .default('Scheduled upgrades are underway. We will be back shortly.'),
  adsEnabled: boolean('ads_enabled').notNull().default(true),
  registrationOpen: boolean('registration_open').notNull().default(true),
  aiFeaturesEnabled: boolean('ai_features_enabled').notNull().default(true),
  multiplayerEnabled: boolean('multiplayer_enabled').notNull().default(true),
  defaultDifficulty: text('default_difficulty').notNull().default('beginner'),
  xpMultiplier: integer('xp_multiplier').notNull().default(1),
  coinMultiplier: integer('coin_multiplier').notNull().default(1),
  enabledModes: text('enabled_modes')
    .notNull()
    .default('["zombie","space","car","ninja","coding","survival","duel","practice","timed-rush","accuracy-gauntlet","syntax-master"]'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const customWordPacks = pgTable('custom_word_packs', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').notNull().default('General'),
  difficulty: text('difficulty').notNull().default('beginner'),
  wordsJson: text('words_json').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: text('created_by').default('admin'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  adminUid: text('admin_uid').notNull(),
  adminEmail: text('admin_email').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').default(''),
  details: text('details').default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(gameSessions),
}));

export const gameSessionsRelations = relations(gameSessions, ({ one }) => ({
  user: one(users, {
    fields: [gameSessions.userId],
    references: [users.id],
  }),
}));
