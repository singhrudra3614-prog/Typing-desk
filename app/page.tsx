'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap,
  Trophy,
  Target,
  Award,
  Play,
  Shield,
  Gamepad2,
  Gauge,
  Brain,
  Flame,
  Rocket,
  LogOut,
  Star,
  Sword,
  Skull,
  ShieldCheck,
  ShoppingBag,
  Package,
  Check,
  Lock,
  AlertTriangle,
  Megaphone,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useSiteConfig } from '@/hooks/use-site-config';
import { GlowButton, StatsCard } from '@/components/ui/shared';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import AICoach from '@/components/AICoach';
import ThemeSelector from '@/components/ThemeSelector';
import MultiplayerLobby from '@/components/MultiplayerLobby';
import Leaderboard from '@/components/Leaderboard';
import AILessonGenerator from '@/components/AILessonGenerator';
import { AdSlot } from '@/components/AdSlot';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const TypingGame = dynamic(() => import('@/components/TypingGame/CanvasGame'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center gap-4">
      <Skull className="text-neon-cyan animate-bounce" size={48} />
      <h3 className="text-2xl font-display font-black mb-4 uppercase">Initializing Engine...</h3>
    </div>
  ),
});

const MultiplayerGame = dynamic(() => import('@/components/MultiplayerGame'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center gap-4">
      <Sword className="text-neon-pink animate-spin" size={48} />
      <h3 className="text-2xl font-display font-black mb-4 uppercase text-neon-pink">Syncing Duel State...</h3>
    </div>
  ),
});

const AdminPanel = dynamic(() => import('@/components/AdminPanel'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-sm font-medium text-slate-400">Loading Admin Console...</p>
    </div>
  ),
});

const SHOP_THEMES = [
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Core',
    desc: 'High-contrast cyan and magenta interface palette.',
    cost: 0,
    colors: ['#06b6d4', '#ec4899', '#a855f7'],
  },
  {
    id: 'retro',
    name: 'Retro Neon',
    desc: 'Warm amber, sunset orange, and arcade crimson highlights.',
    cost: 150,
    colors: ['#facc15', '#f97316', '#ef4444'],
  },
  {
    id: 'minimalist',
    name: 'Minimalist Slate',
    desc: 'Distraction-free cool silver and slate tones for deep focus.',
    cost: 200,
    colors: ['#94a3b8', '#cbd5e1', '#64748b'],
  },
];

export default function Home() {
  const [hoveredGame, setHoveredGame] = useState<string | null>(null);
  const [hoveredChallenge, setHoveredChallenge] = useState<string | null>(null);
  const { user, profile, dbUser, isAdmin, loading, signIn, signOut, getIdToken, refreshDbUser } = useAuth();
  const { settings, communityStats, reportNavigation } = useSiteConfig();

  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [customWords, setCustomWords] = useState<string[] | undefined>(undefined);
  const [difficultyOverride, setDifficultyOverride] = useState<'beginner' | 'intermediate' | 'advanced' | 'expert' | null>(null);
  const difficulty = difficultyOverride ?? settings?.defaultDifficulty ?? 'beginner';
  const [showPublicRankings, setShowPublicRankings] = useState(false);

  const [activeTab, setActiveTab] = useState<'games' | 'leaderboard' | 'locker' | 'shop' | 'admin'>('games');

  const [isLobbyOpen, setIsLobbyOpen] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [isPlayer1, setIsPlayer1] = useState(true);
  const [shopStatus, setShopStatus] = useState<string | null>(null);

  const switchTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    reportNavigation('/', tab);
  };

  const currentTheme = dbUser?.activeTheme || profile?.activeTheme || 'cyberpunk';
  const themeClass = `theme-${currentTheme}`;
  const customizations = profile?.themeCustomizations?.[currentTheme];

  const themeStyles = customizations
    ? ({
        '--neon-cyan': customizations.primary,
        '--neon-pink': customizations.accent,
      } as React.CSSProperties)
    : {};

  const unlockedThemesList: string[] = (() => {
    if (dbUser?.unlockedThemes) {
      try {
        const parsed = JSON.parse(dbUser.unlockedThemes);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fallback
      }
    }
    return profile?.unlockedThemes || ['cyberpunk'];
  })();

  const handleThemeAction = async (action: 'unlock' | 'equip', themeId: string) => {
    setShopStatus(null);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/user/shop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, themeId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setShopStatus(json.error || 'Action failed.');
        return;
      }
      if (user) {
        const nextUnlocked = action === 'unlock' && !unlockedThemesList.includes(themeId)
          ? [...unlockedThemesList, themeId]
          : unlockedThemesList;
        await updateDoc(doc(db, 'users', user.uid), {
          activeTheme: themeId,
          unlockedThemes: nextUnlocked,
          ...(json.user?.coins !== undefined ? { coins: json.user.coins } : {}),
        }).catch(() => {});
      }
      await refreshDbUser();
      setShopStatus(
        action === 'unlock' ? `Unlocked and equipped ${themeId}!` : `Equipped ${themeId}!`
      );
    } catch {
      setShopStatus('Unable to complete transaction right now.');
    }
  };

  const enabledModes = settings?.enabledModesList?.length
    ? settings.enabledModesList
    : [
        'zombie',
        'space',
        'car',
        'ninja',
        'coding',
        'survival',
        'duel',
        'practice',
        'timed-rush',
        'accuracy-gauntlet',
        'syntax-master',
      ];

  const siteName = settings?.siteName || 'TypeQuest';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-neon-cyan/20 border-t-neon-cyan rounded-full animate-spin" />
          <p className="font-display text-sm text-neon-cyan tracking-widest uppercase">
            Loading {siteName}...
          </p>
        </div>
      </div>
    );
  }

  // Maintenance curtain for non-admins
  if (settings?.maintenanceMode && !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-3xl border border-slate-800 bg-slate-900/70 p-10 text-center space-y-5">
          <AlertTriangle className="mx-auto text-amber-400" size={40} />
          <h1 className="text-3xl font-display font-bold text-white">{siteName} Maintenance</h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            {settings.maintenanceMessage || 'Scheduled upgrades are underway. We will be back shortly.'}
          </p>
          {!user ? (
            <button
              onClick={signIn}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
            >
              Administrator Sign-In
            </button>
          ) : (
            <button
              onClick={signOut}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
            >
              Sign Out
            </button>
          )}
        </div>
      </div>
    );
  }

  // Banned user curtain
  if (user && dbUser?.isBanned) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl border border-red-500/30 bg-slate-900 p-8 text-center space-y-4">
          <Shield className="mx-auto text-red-400" size={40} />
          <h1 className="text-2xl font-display font-bold text-white">Account Suspended</h1>
          <p className="text-sm text-slate-300">
            {dbUser.banReason || 'Your account has been suspended by an administrator.'}
          </p>
          <button
            onClick={signOut}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Fullscreen Admin Panel tab
  if (user && isAdmin && activeTab === 'admin') {
    return <AdminPanel onExit={() => switchTab('games')} />;
  }

  const announcementBanner = settings?.announcementEnabled && settings.announcementText && (
    <div
      className={cn(
        'w-full px-4 py-2.5 text-xs font-medium text-center flex items-center justify-center gap-2 border-b',
        settings.announcementType === 'warning'
          ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
          : settings.announcementType === 'promo'
          ? 'bg-neon-pink/15 border-neon-pink/30 text-pink-100'
          : 'bg-neon-cyan/15 border-neon-cyan/30 text-cyan-100'
      )}
    >
      <Megaphone size={14} />
      <span>{settings.announcementText}</span>
    </div>
  );

  // Unauthenticated Landing Page
  if (!user) {
    return (
      <div className={cn('relative min-h-screen overflow-hidden bg-slate-950 flex flex-col', 'theme-cyberpunk')} style={themeStyles}>
        {announcementBanner}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

        <div className="relative z-10 container mx-auto px-6 pt-20 pb-16 flex-1">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
            >
              <p className="text-xs font-semibold text-neon-cyan tracking-widest uppercase mb-4">
                {siteName} · {communityStats.totalPlayers} Players · {communityStats.totalMatches} Matches Logged
              </p>
              <h1 className="text-5xl md:text-7xl font-display font-black tracking-tight mb-6 text-balance">
                {settings?.heroHeadline || 'Level Up Your Fingers'}
              </h1>
              <p className="text-lg text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
                {settings?.heroSubheading ||
                  'TypeQuest isn’t a test—it’s a battlefield. Defeat zombies, race against AI, and master the keyboard through high-octane arcade action.'}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                {settings?.registrationOpen !== false ? (
                  <GlowButton size="lg" variant="cyan" onClick={signIn}>
                    <Play className="fill-current" size={18} />
                    Start Your Quest
                  </GlowButton>
                ) : (
                  <div className="px-6 py-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-medium text-slate-300">
                    New sign-ups are temporarily paused
                  </div>
                )}
                <GlowButton
                  size="lg"
                  variant="pink"
                  className="bg-transparent border-glass"
                  onClick={() => setShowPublicRankings((prev) => !prev)}
                >
                  <Gamepad2 size={18} />
                  {showPublicRankings ? 'Hide Leaderboards' : 'View Leaderboards'}
                </GlowButton>
              </div>
            </motion.div>

            <div className="mt-10">
              <AdSlot slotKey="header_banner" className="text-left" />
            </div>

            {showPublicRankings && (
              <div className="mt-12 text-left">
                <Leaderboard />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 text-left">
              {[
                {
                  icon: Skull,
                  title: 'Zombie Attack',
                  desc: "Type words to eliminate rising undead hordes. Don't let them breach the gate.",
                  color: 'cyan',
                },
                {
                  icon: Rocket,
                  title: 'Space Shooter',
                  desc: 'Intercept incoming fleets by typing commands at light speed. Pure adrenaline.',
                  color: 'pink',
                },
                {
                  icon: Brain,
                  title: 'AI Adaptive',
                  desc: 'AI analyzes your patterns and missed keys to generate targeted training drills.',
                  color: 'purple',
                },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="p-7 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors"
                >
                  <feature.icon className={`mb-4 text-neon-${feature.color}`} size={32} />
                  <h3 className="text-lg font-display font-bold mb-2 text-white">{feature.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-12">
              <AdSlot slotKey="footer_strip" className="text-left" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Hub View
  if (!selectedGame) {
    const allModes = [
      {
        id: 'zombie',
        name: 'ZOMBIE ATTACK',
        theme: 'cyan',
        icon: Skull,
        difficulty: 'Beginner+',
        desc: 'Eliminate rising undead hordes by typing words. Precision and speed are your weapons.',
      },
      {
        id: 'space',
        name: 'SPACE SHOOTER',
        theme: 'pink',
        icon: Rocket,
        difficulty: 'Intermediate',
        desc: 'Intercept incoming alien fleets in deep space with rapid-fire commands.',
      },
      {
        id: 'car',
        name: 'CAR RACING',
        theme: 'green',
        icon: Flame,
        difficulty: 'Expert',
        desc: 'Push your engine to the redline. Every correct word shifts gears and accelerates.',
      },
      {
        id: 'ninja',
        name: 'NINJA SLASH',
        theme: 'purple',
        icon: Sword,
        difficulty: 'Advanced',
        desc: 'Slice through flying targets with rhythmic keystrokes in this test of timing.',
      },
      {
        id: 'coding',
        name: 'CMD LINE HERO',
        theme: 'cyan',
        icon: Zap,
        difficulty: 'Specialist',
        desc: 'Master real programming syntax and CLI commands in a race against the clock.',
      },
      {
        id: 'survival',
        name: 'SURVIVAL MODE',
        theme: 'pink',
        icon: Shield,
        difficulty: 'Adaptive',
        desc: 'The game adapts to your speed as threats converge. Endure as long as possible.',
      },
      {
        id: 'duel',
        name: 'TYPING DUEL',
        theme: 'cyan',
        icon: Sword,
        difficulty: 'Competitive',
        desc: 'Real-time 1v1 battle. Out-type your opponent in a live competitive duel.',
        isMultiplayer: true,
      },
      {
        id: 'practice',
        name: 'PRACTICE LAB',
        theme: 'purple',
        icon: Target,
        difficulty: 'Zen Mode',
        desc: 'Stress-free environment with custom word lists, admin word packs, and speed presets.',
      },
    ].filter((g) => {
      if (g.isMultiplayer && settings?.multiplayerEnabled === false) return false;
      return enabledModes.includes(g.id);
    });

    const allChallenges = [
      {
        id: 'timed-rush',
        name: 'TIMED RUSH',
        theme: 'cyan',
        icon: Zap,
        objective: 'Type as many as possible',
        limit: '60 SECONDS',
        desc: 'Pure speed. Every word adds to your total before the timer hits zero.',
      },
      {
        id: 'accuracy-gauntlet',
        name: 'ACCURACY GAUNTLET',
        theme: 'green',
        icon: Target,
        objective: 'Maintain 99%+ Accuracy',
        limit: '5 MINUTES',
        desc: 'Precision is paramount. Keep accuracy above 99% to complete the gauntlet.',
      },
      {
        id: 'syntax-master',
        name: 'SYNTAX MASTER',
        theme: 'purple',
        icon: Brain,
        objective: 'Master code syntax',
        limit: '120 SECONDS',
        desc: 'Complex brackets, symbols, and developer terminology under time pressure.',
      },
    ].filter((c) => enabledModes.includes(c.id));

    const effectiveXp = dbUser?.xp ?? profile?.xp ?? 0;
    const effectiveLevel = dbUser?.level ?? profile?.level ?? 1;
    const effectiveCoins = dbUser?.coins ?? profile?.coins ?? 0;
    const effectiveAvgWpm = dbUser?.averageWpm ?? profile?.averageWpm ?? 0;
    const effectiveBestWpm = dbUser?.bestWpm ?? profile?.bestWpm ?? 0;
    const effectiveAcc = dbUser?.averageAccuracy ?? profile?.averageAccuracy ?? 0;
    const effectiveWords = dbUser?.totalWordsTyped ?? profile?.totalWordsTyped ?? 0;

    return (
      <div className={cn('min-h-screen bg-slate-950 flex flex-col', themeClass)} style={themeStyles}>
        {announcementBanner}

        {/* Top Bar Contract: Brand — Nav Links — Primary Action */}
        <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
          <div className="container mx-auto px-6 h-16 flex items-center justify-between gap-8">
            <button
              onClick={() => switchTab('games')}
              className="text-xl font-display font-black text-neon-cyan tracking-tight whitespace-nowrap shrink-0 uppercase"
            >
              {siteName}
            </button>

            <nav className="hidden md:flex items-center gap-6 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <button
                onClick={() => switchTab('games')}
                className={cn(
                  'py-2 border-b-2 transition-colors whitespace-nowrap shrink-0',
                  activeTab === 'games'
                    ? 'text-neon-cyan border-neon-cyan'
                    : 'border-transparent hover:text-white'
                )}
              >
                Battlefront
              </button>
              <button
                onClick={() => switchTab('leaderboard')}
                className={cn(
                  'py-2 border-b-2 transition-colors whitespace-nowrap shrink-0',
                  activeTab === 'leaderboard'
                    ? 'text-neon-cyan border-neon-cyan'
                    : 'border-transparent hover:text-white'
                )}
              >
                Rankings
              </button>
              <button
                onClick={() => switchTab('locker')}
                className={cn(
                  'py-2 border-b-2 transition-colors whitespace-nowrap shrink-0',
                  activeTab === 'locker'
                    ? 'text-neon-cyan border-neon-cyan'
                    : 'border-transparent hover:text-white'
                )}
              >
                Locker
              </button>
              <button
                onClick={() => switchTab('shop')}
                className={cn(
                  'py-2 border-b-2 transition-colors whitespace-nowrap shrink-0',
                  activeTab === 'shop'
                    ? 'text-neon-cyan border-neon-cyan'
                    : 'border-transparent hover:text-white'
                )}
              >
                Shop
              </button>
              {isAdmin && (
                <button
                  onClick={() => switchTab('admin')}
                  className="py-1.5 px-3 rounded-lg bg-neon-cyan/15 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/25 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <ShieldCheck size={14} />
                  <span>Admin Panel</span>
                </button>
              )}
            </nav>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-3 bg-slate-900 px-3.5 py-1.5 rounded-full border border-slate-800 text-xs font-mono tabular-nums">
                <span className="flex items-center gap-1 text-orange-400">
                  <Flame size={14} />
                  {profile?.streak || 0}
                </span>
                <span className="flex items-center gap-1 text-yellow-400">
                  <Star size={14} />
                  {effectiveCoins}
                </span>
              </div>
              {isAdmin && (
                <button
                  onClick={() => switchTab('admin')}
                  className="md:hidden px-3 py-1.5 rounded-lg bg-neon-cyan/15 border border-neon-cyan/30 text-neon-cyan text-xs font-semibold whitespace-nowrap"
                >
                  Admin
                </button>
              )}
              <button
                onClick={signOut}
                title="Sign Out"
                className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-red-500/10 hover:border-red-500/30 text-slate-400 hover:text-red-400 transition-colors"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>

          {/* Mobile quick tab bar */}
          <div className="flex md:hidden border-t border-slate-800/80 px-4 py-2 gap-2 overflow-x-auto">
            {(['games', 'leaderboard', 'locker', 'shop'] as const).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap',
                  activeTab === t ? 'bg-neon-cyan/15 text-neon-cyan' : 'text-slate-400'
                )}
              >
                {t === 'games' ? 'Battlefront' : t}
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
            <div>
              <p className="text-neon-cyan font-display uppercase tracking-widest text-xs mb-1">
                {activeTab === 'games'
                  ? `Welcome back, ${dbUser?.displayName || profile?.displayName || 'Player'}`
                  : activeTab === 'leaderboard'
                  ? 'Global Rankings'
                  : activeTab === 'locker'
                  ? 'Equipped Gear & Achievements'
                  : 'Coin Exchange'}
              </p>
              <h1 className="text-3xl font-display font-bold text-white">
                {activeTab === 'games'
                  ? 'Ready for Battle'
                  : activeTab === 'leaderboard'
                  ? 'Top Speed Typists'
                  : activeTab === 'locker'
                  ? 'Your Locker'
                  : 'Theme Shop'}
              </h1>
            </div>

            <div className="flex items-center gap-4 bg-slate-900/70 border border-slate-800 p-3 rounded-2xl">
              <div className="w-11 h-11 rounded-xl bg-neon-purple/20 flex items-center justify-center text-neon-purple font-display font-black text-lg border border-neon-purple/30 tabular-nums">
                {effectiveLevel}
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">
                  Level {effectiveLevel} · {effectiveXp.toLocaleString()} XP
                  {(settings?.xpMultiplier || 1) > 1 && (
                    <span className="text-neon-pink ml-2 font-semibold">
                      ({settings?.xpMultiplier}x Boost Active)
                    </span>
                  )}
                </p>
                <div className="w-48 h-2 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(effectiveXp % 1000) / 10}%` }}
                    className="h-full bg-neon-purple"
                  />
                </div>
              </div>
            </div>
          </div>

          {activeTab === 'games' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8 font-mono">
                <StatsCard label="Avg. WPM" value={effectiveAvgWpm} icon={Gauge} color="cyan" />
                <StatsCard label="Best WPM" value={effectiveBestWpm} icon={Trophy} color="pink" />
                <StatsCard
                  label="Daily Streak"
                  value={profile?.streak || 0}
                  icon={Flame}
                  color="purple"
                  trend={(profile?.streak || 0) > 0 ? 'Active' : 'New'}
                  trendLabel="streak"
                />
                <StatsCard label="Accuracy" value={`${effectiveAcc}%`} icon={Target} color="green" />
                <StatsCard label="Total Words" value={effectiveWords} icon={Shield} color="cyan" />
              </div>

              <div className="mb-8">
                <AdSlot slotKey="header_banner" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 space-y-10">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <h3 className="text-xl font-display font-bold flex items-center gap-2 text-white">
                        <Gamepad2 className="text-neon-cyan" size={20} />
                        <span>Select Game Mode</span>
                      </h3>

                      <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        {(['beginner', 'intermediate', 'advanced', 'expert'] as const).map((d) => (
                          <button
                            key={d}
                            onClick={() => setDifficultyOverride(d)}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-colors whitespace-nowrap',
                              difficulty === d
                                ? 'bg-neon-cyan text-slate-950'
                                : 'text-slate-400 hover:text-white'
                            )}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {allModes.map((game) => (
                        <motion.button
                          key={game.id}
                          whileHover={{ scale: 1.015, y: -3 }}
                          onMouseEnter={() => setHoveredGame(game.id)}
                          onMouseLeave={() => setHoveredGame(null)}
                          onClick={() =>
                            game.isMultiplayer ? setIsLobbyOpen(true) : setSelectedGame(game.id)
                          }
                          className="group relative h-44 rounded-2xl overflow-hidden text-left border border-slate-800 hover:border-slate-700 bg-slate-900/60"
                        >
                          <div className={`absolute inset-0 bg-neon-${game.theme}/5 transition-colors group-hover:bg-neon-${game.theme}/15`} />
                          <div className="relative h-full p-6 flex flex-col justify-between">
                            <div className={`w-11 h-11 rounded-xl bg-neon-${game.theme}/15 flex items-center justify-center text-neon-${game.theme} border border-neon-${game.theme}/25`}>
                              <game.icon size={22} />
                            </div>
                            <div>
                              <p className="text-xs text-slate-400 font-medium">{game.difficulty}</p>
                              <h4 className="text-xl font-display font-bold mt-0.5 text-white">
                                {game.name}
                              </h4>
                            </div>
                          </div>

                          <AnimatePresence>
                            {hoveredGame === game.id && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-20 bg-slate-950/95 p-6 flex flex-col justify-center"
                              >
                                <p className={`text-xs font-semibold text-neon-${game.theme} mb-2`}>
                                  {game.name}
                                </p>
                                <p className="text-slate-300 text-xs leading-relaxed mb-4">
                                  {game.desc}
                                </p>
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                                  <Play size={12} className="fill-current" />
                                  Play Mode
                                </span>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <AdSlot slotKey="hub_mid_banner" />

                  {allChallenges.length > 0 && (
                    <div>
                      <h3 className="text-xl font-display font-bold flex items-center gap-2 mb-6 text-white">
                        <Award className="text-neon-pink" size={20} />
                        <span>Typing Challenges</span>
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {allChallenges.map((challenge) => (
                          <motion.button
                            key={challenge.id}
                            whileHover={{ scale: 1.015, y: -3 }}
                            onMouseEnter={() => setHoveredChallenge(challenge.id)}
                            onMouseLeave={() => setHoveredChallenge(null)}
                            onClick={() => setSelectedGame(challenge.id)}
                            className="group relative h-56 rounded-2xl overflow-hidden text-left border border-slate-800 hover:border-slate-700 bg-slate-900/60"
                          >
                            <div className="relative h-full p-6 flex flex-col justify-between">
                              <div className="space-y-3">
                                <div className={`w-10 h-10 rounded-xl bg-neon-${challenge.theme}/15 flex items-center justify-center text-neon-${challenge.theme} border border-neon-${challenge.theme}/25`}>
                                  <challenge.icon size={20} />
                                </div>
                                <div>
                                  <h4 className="text-lg font-display font-bold text-white leading-tight">
                                    {challenge.name}
                                  </h4>
                                  <p className={`text-xs font-medium text-neon-${challenge.theme} mt-1`}>
                                    {challenge.objective}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-400">
                                <span>{challenge.limit}</span>
                                <Play size={14} className={`text-neon-${challenge.theme}`} />
                              </div>
                            </div>

                            <AnimatePresence>
                              {hoveredChallenge === challenge.id && (
                                <motion.div
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  className="absolute inset-0 z-20 bg-slate-950/95 p-6 flex flex-col justify-center"
                                >
                                  <p className="text-slate-300 text-xs leading-relaxed mb-4">
                                    {challenge.desc}
                                  </p>
                                  <div className="text-xs font-mono text-neon-cyan">
                                    2.5x XP · Rare Badge Reward
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  {settings?.aiFeaturesEnabled !== false && (
                    <>
                      <AICoach />
                      <AILessonGenerator
                        onStartLesson={(words) => {
                          setCustomWords(words);
                          setSelectedGame('ai-lesson');
                        }}
                      />
                    </>
                  )}
                  <ThemeSelector />
                  <AdSlot slotKey="sidebar_promo" />
                </div>
              </div>

              <div className="mt-10">
                <AdSlot slotKey="footer_strip" />
              </div>
            </>
          )}

          {activeTab === 'leaderboard' && (
            <div className="py-4">
              <Leaderboard />
            </div>
          )}

          {activeTab === 'locker' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <Package className="text-neon-cyan" size={18} />
                  <h3 className="text-base font-semibold text-white">Unlocked Themes</h3>
                </div>
                {shopStatus && (
                  <p className="text-xs text-neon-cyan font-medium">{shopStatus}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {SHOP_THEMES.filter((t) => unlockedThemesList.includes(t.id)).map((theme) => {
                    const equipped = currentTheme === theme.id;
                    return (
                      <div
                        key={theme.id}
                        className={cn(
                          'rounded-xl border p-4 flex flex-col justify-between gap-4',
                          equipped
                            ? 'border-neon-cyan bg-neon-cyan/10'
                            : 'border-slate-800 bg-slate-950/60'
                        )}
                      >
                        <div>
                          <div className="flex gap-1.5 mb-3">
                            {theme.colors.map((c, idx) => (
                              <span
                                key={idx}
                                className="w-4 h-4 rounded-full border border-slate-800"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                          <h4 className="text-sm font-semibold text-white">{theme.name}</h4>
                          <p className="text-xs text-slate-400 mt-1">{theme.desc}</p>
                        </div>
                        <button
                          onClick={() => handleThemeAction('equip', theme.id)}
                          disabled={equipped}
                          className={cn(
                            'w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5',
                            equipped
                              ? 'bg-neon-cyan text-slate-950'
                              : 'bg-slate-800 hover:bg-slate-700 text-white'
                          )}
                        >
                          {equipped && <Check size={13} />}
                          <span>{equipped ? 'Equipped' : 'Equip Theme'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                <h3 className="text-base font-semibold text-white">Badges & Milestones</h3>
                {(profile?.unlockedBadges?.length || 0) === 0 ? (
                  <p className="text-xs text-slate-400">
                    Complete Typing Challenges (Timed Rush, Accuracy Gauntlet, Syntax Master) to earn rare badges.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {profile?.unlockedBadges?.map((b, i) => (
                      <div
                        key={i}
                        className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2 text-xs font-medium text-white"
                      >
                        <Trophy size={14} className="text-neon-cyan" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'shop' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <ShoppingBag className="text-neon-cyan" size={22} />
                  <div>
                    <h3 className="text-base font-semibold text-white">Unlockable Interface Themes</h3>
                    <p className="text-xs text-slate-400">
                      Earn coins by completing typing battles and spend them here
                    </p>
                  </div>
                </div>
                <div className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-sm font-bold text-yellow-400 tabular-nums">
                  Balance: {effectiveCoins} Coins
                </div>
              </div>

              {shopStatus && (
                <div className="px-4 py-3 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 text-xs font-medium text-neon-cyan">
                  {shopStatus}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {SHOP_THEMES.map((theme) => {
                  const unlocked = unlockedThemesList.includes(theme.id);
                  const equipped = currentTheme === theme.id;
                  return (
                    <div
                      key={theme.id}
                      className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 flex flex-col justify-between gap-5"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex gap-2">
                            {theme.colors.map((c, idx) => (
                              <span
                                key={idx}
                                className="w-5 h-5 rounded-full border border-slate-700"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                          <span className="font-mono text-xs font-semibold text-yellow-400 tabular-nums">
                            {theme.cost === 0 ? 'Free' : `${theme.cost} Coins`}
                          </span>
                        </div>
                        <h4 className="text-lg font-display font-bold text-white">{theme.name}</h4>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{theme.desc}</p>
                      </div>

                      {unlocked ? (
                        <button
                          onClick={() => handleThemeAction('equip', theme.id)}
                          disabled={equipped}
                          className={cn(
                            'w-full py-2.5 rounded-xl text-xs font-semibold',
                            equipped
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-800 hover:bg-slate-700 text-white'
                          )}
                        >
                          {equipped ? 'Currently Equipped' : 'Equip from Locker'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleThemeAction('unlock', theme.id)}
                          disabled={effectiveCoins < theme.cost}
                          className="w-full py-2.5 rounded-xl bg-neon-cyan text-slate-950 font-semibold text-xs hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
                        >
                          <Lock size={13} />
                          <span>Unlock for {theme.cost} Coins</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        <AnimatePresence>
          {isLobbyOpen && (
            <MultiplayerLobby
              onClose={() => setIsLobbyOpen(false)}
              onStartMatch={(mid, p1) => {
                setActiveMatchId(mid);
                setIsPlayer1(p1);
                setIsLobbyOpen(false);
                setSelectedGame('duel');
              }}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen bg-slate-950 overflow-hidden flex flex-col', themeClass)} style={themeStyles}>
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/5">
        <button
          onClick={() => {
            setSelectedGame(null);
            setActiveMatchId(null);
            setCustomWords(undefined);
          }}
          className="text-sm font-medium text-slate-400 hover:text-white flex items-center gap-2 transition-colors"
        >
          <LogOut size={16} className="rotate-180" />
          Back to Hub
        </button>
        <h2 className="text-lg font-display font-bold text-neon-cyan tracking-tight uppercase">
          {selectedGame}
        </h2>
        <div className="w-24" />
      </header>

      <div className="flex-1 relative flex items-center justify-center p-6">
        {selectedGame === 'duel' && activeMatchId ? (
          <MultiplayerGame
            matchId={activeMatchId}
            isPlayer1={isPlayer1}
            onGameEnd={() => {
              setSelectedGame(null);
              setActiveMatchId(null);
            }}
          />
        ) : (
          <TypingGame
            mode={selectedGame}
            difficulty={difficulty}
            customWords={customWords}
            onGameEnd={() => {
              setSelectedGame(null);
              setCustomWords(undefined);
            }}
          />
        )}
      </div>
    </div>
  );
}
