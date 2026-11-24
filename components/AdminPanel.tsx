'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Eye,
  Megaphone,
  Sliders,
  BookOpen,
  Gamepad2,
  ClipboardList,
  RefreshCw,
  Search,
  Download,
  Trash2,
  Ban,
  CheckCircle2,
  Plus,
  Edit3,
  ArrowLeft,
  Clock,
  Activity,
  MousePointerClick,
  ShieldCheck,
  AlertTriangle,
  Save,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useAuth } from '@/hooks/use-auth';
import { useSiteConfig, AdPlacement, SiteSettings } from '@/hooks/use-site-config';
import { cn } from '@/lib/utils';

type AdminTab =
  | 'overview'
  | 'visitors'
  | 'users'
  | 'ads'
  | 'settings'
  | 'wordpacks'
  | 'sessions'
  | 'audit';

interface AdminUserRow {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  photoUrl: string;
  role: string;
  isBanned: boolean;
  banReason: string;
  xp: number;
  level: number;
  coins: number;
  totalWordsTyped: number;
  averageWpm: number;
  averageAccuracy: number;
  bestWpm: number;
  totalTimeSpentSec: number;
  lastSeenAt: string;
  createdAt: string;
}

interface VisitorLogRow {
  id: number;
  visitorId: string;
  sessionToken: string;
  userUid: string | null;
  userEmail: string | null;
  userName: string | null;
  pagePath: string;
  activeTab: string;
  referrer: string;
  deviceType: string;
  browser: string;
  os: string;
  screenRes: string;
  ipMasked: string;
  country: string;
  durationSec: number;
  pageViews: number;
  startedAt: string;
  lastPingAt: string;
}

interface SessionAuditRow {
  id: number;
  userUid: string;
  displayName: string | null;
  email: string | null;
  gameMode: string;
  difficulty: string;
  wpm: number;
  accuracy: number;
  score: number;
  wordsTyped: number;
  durationSec: number;
  success: boolean;
  createdAt: string;
}

interface WordPackRow {
  id: number;
  title: string;
  category: string;
  difficulty: string;
  wordsJson: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

interface AuditLogRow {
  id: number;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

interface OverviewPayload {
  kpis: {
    totalUsers: number;
    activeVisitorsNow: number;
    visitsToday: number;
    totalVisits: number;
    uniqueVisitors: number;
    totalUsageSec: number;
    avgUsageSec: number;
    totalPageViews: number;
    totalSessions: number;
    globalAvgWpm: number;
    globalAvgAccuracy: number;
    topWpm: number;
    adImpressions: number;
    adClicks: number;
  };
  charts: {
    dailyTraffic: { date: string; visits: number; usageMinutes: number }[];
    dailyEngagement30d: {
      dateKey: string;
      date: string;
      activeUsers: number;
      gameSessions: number;
      usageMinutes: number;
      avgWpm: number;
    }[];
    modeBreakdown: { mode: string; sessions: number; avgWpm: number }[];
    deviceBreakdown: { device: string; count: number }[];
  };
  users: AdminUserRow[];
  visitors: VisitorLogRow[];
  ads: AdPlacement[];
  settings: SiteSettings | null;
  wordPacks: WordPackRow[];
  sessions: SessionAuditRow[];
  auditLogs: AuditLogRow[];
}

const ALL_GAME_MODES = [
  { id: 'zombie', label: 'Zombie Attack' },
  { id: 'space', label: 'Space Shooter' },
  { id: 'car', label: 'Car Racing' },
  { id: 'ninja', label: 'Ninja Slash' },
  { id: 'coding', label: 'CMD Line Hero' },
  { id: 'survival', label: 'Survival Mode' },
  { id: 'duel', label: 'Typing Duel (1v1)' },
  { id: 'practice', label: 'Practice Lab' },
  { id: 'timed-rush', label: 'Timed Rush' },
  { id: 'accuracy-gauntlet', label: 'Accuracy Gauntlet' },
  { id: 'syntax-master', label: 'Syntax Master' },
];

function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec || 0));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const rem = sec % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${rem}s`;
  if (mins > 0) return `${mins}m ${rem}s`;
  return `${rem}s`;
}

export default function AdminPanel({ onExit }: { onExit?: () => void }) {
  const { user, isAdmin, getIdToken, signIn } = useAuth();
  const { refreshSiteConfig } = useSiteConfig();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [liveAutoRefresh, setLiveAutoRefresh] = useState(true);
  const [engagementView, setEngagementView] = useState<'all' | 'users_matches' | 'usage_speed'>('all');

  // Filters
  const [visitorSearch, setVisitorSearch] = useState('');
  const [visitorFilter, setVisitorFilter] = useState<'all' | 'active' | 'signed_in' | 'guest'>('all');
  const [userSearch, setUserSearch] = useState('');
  const [sessionModeFilter, setSessionModeFilter] = useState('all');

  // Edit User Modal
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [userEditForm, setUserEditForm] = useState({
    role: 'user',
    xp: 0,
    coins: 0,
    level: 1,
    isBanned: false,
    banReason: '',
  });

  // Ad Editor Modal
  const [editingAd, setEditingAd] = useState<Partial<AdPlacement> | null>(null);

  // Site Settings Draft
  const [settingsDraft, setSettingsDraft] = useState<{
    siteName: string;
    heroHeadline: string;
    heroSubheading: string;
    announcementEnabled: boolean;
    announcementText: string;
    announcementType: 'info' | 'promo' | 'warning';
    maintenanceMode: boolean;
    maintenanceMessage: string;
    adsEnabled: boolean;
    registrationOpen: boolean;
    aiFeaturesEnabled: boolean;
    multiplayerEnabled: boolean;
    defaultDifficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    xpMultiplier: number;
    coinMultiplier: number;
    enabledModesList: string[];
  } | null>(null);

  // Word Pack Form
  const [newPack, setNewPack] = useState({
    title: '',
    category: 'Speed Training',
    difficulty: 'beginner',
    wordsText: '',
  });

  const notify = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = await getIdToken();
      if (!token) throw new Error('Authentication token missing.');
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      return json;
    },
    [getIdToken]
  );

  const loadOverview = useCallback(
    async (silent = false) => {
      if (!user) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setErrorMsg(null);

      try {
        const json: OverviewPayload = await authFetch('/api/admin/overview', {
          cache: 'no-store',
        });
        setData(json);
        setNowMs(Date.now());

        if (json.settings) {
          let modes: string[] = ALL_GAME_MODES.map((m) => m.id);
          try {
            const parsed = JSON.parse(json.settings.enabledModes);
            if (Array.isArray(parsed)) modes = parsed;
          } catch {
            // keep default
          }
          setSettingsDraft({
            siteName: json.settings.siteName,
            heroHeadline: json.settings.heroHeadline,
            heroSubheading: json.settings.heroSubheading,
            announcementEnabled: json.settings.announcementEnabled,
            announcementText: json.settings.announcementText || '',
            announcementType: json.settings.announcementType || 'info',
            maintenanceMode: json.settings.maintenanceMode,
            maintenanceMessage: json.settings.maintenanceMessage,
            adsEnabled: json.settings.adsEnabled,
            registrationOpen: json.settings.registrationOpen,
            aiFeaturesEnabled: json.settings.aiFeaturesEnabled,
            multiplayerEnabled: json.settings.multiplayerEnabled,
            defaultDifficulty: json.settings.defaultDifficulty || 'beginner',
            xpMultiplier: json.settings.xpMultiplier || 1,
            coinMultiplier: json.settings.coinMultiplier || 1,
            enabledModesList: modes,
          });
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load admin data.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user, authFetch]
  );

  useEffect(() => {
    if (!user || !isAdmin) return;
    const timer = window.setTimeout(() => {
      void loadOverview(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, isAdmin, loadOverview]);

  useEffect(() => {
    if (!user || !isAdmin || !liveAutoRefresh) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadOverview(true);
      }
    }, 10000);
    return () => window.clearInterval(interval);
  }, [user, isAdmin, liveAutoRefresh, loadOverview]);

  const filteredVisitors = useMemo(() => {
    if (!data?.visitors) return [];
    const fiveMinAgo = nowMs - 5 * 60 * 1000;
    const term = visitorSearch.trim().toLowerCase();

    return data.visitors.filter((v) => {
      const isOnline = new Date(v.lastPingAt).getTime() >= fiveMinAgo;
      if (visitorFilter === 'active' && !isOnline) return false;
      if (visitorFilter === 'signed_in' && !v.userUid) return false;
      if (visitorFilter === 'guest' && v.userUid) return false;
      if (!term) return true;
      return (
        (v.userEmail || '').toLowerCase().includes(term) ||
        (v.userName || '').toLowerCase().includes(term) ||
        v.visitorId.toLowerCase().includes(term) ||
        v.pagePath.toLowerCase().includes(term) ||
        (v.activeTab || '').toLowerCase().includes(term) ||
        v.browser.toLowerCase().includes(term) ||
        v.os.toLowerCase().includes(term) ||
        v.deviceType.toLowerCase().includes(term)
      );
    });
  }, [data, visitorSearch, visitorFilter, nowMs]);

  const filteredUsers = useMemo(() => {
    if (!data?.users) return [];
    const term = userSearch.trim().toLowerCase();
    if (!term) return data.users;
    return data.users.filter(
      (u) =>
        u.email.toLowerCase().includes(term) ||
        u.displayName.toLowerCase().includes(term) ||
        u.role.toLowerCase().includes(term)
    );
  }, [data, userSearch]);

  const filteredSessions = useMemo(() => {
    if (!data?.sessions) return [];
    if (sessionModeFilter === 'all') return data.sessions;
    return data.sessions.filter((s) => s.gameMode === sessionModeFilter);
  }, [data, sessionModeFilter]);

  const exportVisitorsCsv = () => {
    if (!filteredVisitors.length) return;
    const headers = [
      'ID',
      'VisitorID',
      'UserEmail',
      'UserName',
      'PagePath',
      'ActiveTab',
      'UsageSeconds',
      'PageViews',
      'Device',
      'Browser',
      'OS',
      'Country',
      'StartedAt',
      'LastPingAt',
    ];
    const rows = filteredVisitors.map((v) => [
      v.id,
      v.visitorId,
      v.userEmail || 'Guest',
      v.userName || 'Guest',
      v.pagePath,
      v.activeTab || '',
      v.durationSec,
      v.pageViews,
      v.deviceType,
      v.browser,
      v.os,
      v.country,
      v.startedAt,
      v.lastPingAt,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `typequest-visitors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Visitor history exported as CSV.');
  };

  const handleSaveSettings = async () => {
    if (!settingsDraft) return;
    try {
      await authFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(settingsDraft),
      });
      await Promise.all([loadOverview(true), refreshSiteConfig()]);
      notify('Website settings saved and applied live.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save settings.');
    }
  };

  const handleSaveUserEdit = async () => {
    if (!editingUser) return;
    try {
      await authFetch('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({
          userId: editingUser.id,
          ...userEditForm,
        }),
      });
      setEditingUser(null);
      await loadOverview(true);
      notify(`Updated user ${editingUser.displayName}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update user.');
    }
  };

  const handleDeleteUser = async (target: AdminUserRow) => {
    try {
      await authFetch(`/api/admin/users?id=${target.id}`, { method: 'DELETE' });
      await loadOverview(true);
      notify(`Deleted user ${target.email}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete user.');
    }
  };

  const handleSaveAd = async () => {
    if (!editingAd) return;
    try {
      await authFetch('/api/admin/ads', {
        method: editingAd.id ? 'PATCH' : 'POST',
        body: JSON.stringify(editingAd),
      });
      setEditingAd(null);
      await Promise.all([loadOverview(true), refreshSiteConfig()]);
      notify('Ad placement saved and updated live.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save ad placement.');
    }
  };

  const handleToggleAd = async (ad: AdPlacement) => {
    try {
      await authFetch('/api/admin/ads', {
        method: 'PATCH',
        body: JSON.stringify({ ...ad, isActive: !ad.isActive }),
      });
      await Promise.all([loadOverview(true), refreshSiteConfig()]);
      notify(`${ad.name} ${!ad.isActive ? 'enabled' : 'paused'}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to toggle ad.');
    }
  };

  const handleDeleteAd = async (id: number) => {
    try {
      await authFetch(`/api/admin/ads?id=${id}`, { method: 'DELETE' });
      await Promise.all([loadOverview(true), refreshSiteConfig()]);
      notify('Ad placement deleted.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete ad.');
    }
  };

  const handleCreateWordPack = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authFetch('/api/admin/word-packs', {
        method: 'POST',
        body: JSON.stringify(newPack),
      });
      setNewPack({ title: '', category: 'Speed Training', difficulty: 'beginner', wordsText: '' });
      await Promise.all([loadOverview(true), refreshSiteConfig()]);
      notify('Custom word pack published.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create word pack.');
    }
  };

  const handleToggleWordPack = async (pack: WordPackRow) => {
    try {
      await authFetch('/api/admin/word-packs', {
        method: 'PATCH',
        body: JSON.stringify({ id: pack.id, isActive: !pack.isActive }),
      });
      await Promise.all([loadOverview(true), refreshSiteConfig()]);
      notify(`${pack.title} ${!pack.isActive ? 'activated' : 'disabled'}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update word pack.');
    }
  };

  const handleDeleteWordPack = async (id: number) => {
    try {
      await authFetch(`/api/admin/word-packs?id=${id}`, { method: 'DELETE' });
      await Promise.all([loadOverview(true), refreshSiteConfig()]);
      notify('Word pack deleted.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete word pack.');
    }
  };

  const handleDeleteSession = async (id: number) => {
    try {
      await authFetch(`/api/admin/sessions?id=${id}`, { method: 'DELETE' });
      await loadOverview(true);
      notify('Game session removed.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to remove session.');
    }
  };

  const handleClearVisitors = async () => {
    try {
      await authFetch('/api/admin/visitors', { method: 'DELETE' });
      await loadOverview(true);
      notify('Visitor history cleared.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to clear visitor history.');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
          <ShieldCheck className="mx-auto text-neon-cyan" size={36} />
          <h1 className="text-xl font-display font-bold text-white">Administrator Sign-In Required</h1>
          <p className="text-sm text-slate-400">
            Sign in with your administrator Google account to manage users, visitor analytics, ad slots, and site configuration.
          </p>
          <button
            onClick={signIn}
            className="w-full py-3 px-4 rounded-xl bg-neon-cyan text-slate-950 font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
          <AlertTriangle className="mx-auto text-amber-400" size={36} />
          <h1 className="text-xl font-display font-bold text-white">Access Restricted</h1>
          <p className="text-sm text-slate-400">
            Your account ({user.email}) does not currently have administrator permissions.
          </p>
          {onExit && (
            <button
              onClick={onExit}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-sm font-medium hover:bg-slate-700"
            >
              Return to TypeQuest
            </button>
          )}
        </div>
      </div>
    );
  }

  const navItems: { id: AdminTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'visitors', label: 'Visitor History', icon: Eye },
    { id: 'users', label: 'Users & Roles', icon: Users },
    { id: 'ads', label: 'Ad Placeholders', icon: Megaphone },
    { id: 'settings', label: 'Website Control', icon: Sliders },
    { id: 'wordpacks', label: 'Word Packs', icon: BookOpen },
    { id: 'sessions', label: 'Game Sessions', icon: Gamepad2 },
    { id: 'audit', label: 'Audit Logs', icon: ClipboardList },
  ];

  const ctrPercent =
    data?.kpis.adImpressions && data.kpis.adImpressions > 0
      ? ((data.kpis.adClicks / data.kpis.adImpressions) * 100).toFixed(2)
      : '0.00';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 bg-slate-900/70 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 flex flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center justify-between px-3 py-2 mb-6">
            <span className="font-display font-bold text-lg text-white tracking-tight whitespace-nowrap">
              TypeQuest Admin
            </span>
            {onExit && (
              <button
                onClick={onExit}
                className="lg:hidden inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white"
              >
                <ArrowLeft size={14} />
                <span>Site</span>
              </button>
            )}
          </div>

          <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0',
                    active
                      ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent'
                  )}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:block pt-6 border-t border-slate-800 mt-6">
          <div className="px-3 mb-3">
            <p className="text-xs font-medium text-slate-400 truncate">{user.email}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Administrator Access</p>
          </div>
          {onExit && (
            <button
              onClick={onExit}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Back to Website</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 px-6 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-2 text-sm text-slate-400 min-w-0">
            <span>Admin</span>
            <span>/</span>
            <span className="text-white font-semibold truncate">
              {navItems.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => loadOverview(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              <span>Refresh Data</span>
            </button>
            {onExit && (
              <button
                onClick={onExit}
                className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neon-cyan/15 border border-neon-cyan/30 hover:bg-neon-cyan/25 text-xs font-semibold text-neon-cyan transition-colors whitespace-nowrap"
              >
                <ArrowLeft size={14} />
                <span>Live Site</span>
              </button>
            )}
          </div>
        </header>

        {/* Feedback Banners */}
        {errorMsg && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-red-300 hover:text-white">
              <X size={16} />
            </button>
          </div>
        )}
        {toastMsg && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{toastMsg}</span>
          </div>
        )}

        <main className="flex-1 p-6 space-y-6 overflow-x-hidden">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-28 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse"
                />
              ))}
            </div>
          ) : !data ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-10 text-center">
              <p className="text-slate-400 text-sm">No admin telemetry available yet.</p>
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* KPI Strip */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      {
                        label: 'Active Visitors Now',
                        value: data.kpis.activeVisitorsNow,
                        sub: `${data.kpis.visitsToday} visits today`,
                        icon: Activity,
                      },
                      {
                        label: 'Total Website Usage Time',
                        value: formatDuration(data.kpis.totalUsageSec),
                        sub: `Avg ${formatDuration(data.kpis.avgUsageSec)} per visit`,
                        icon: Clock,
                      },
                      {
                        label: 'Registered Users',
                        value: data.kpis.totalUsers,
                        sub: `${data.kpis.uniqueVisitors} unique visitors`,
                        icon: Users,
                      },
                      {
                        label: 'Matches & Global WPM',
                        value: `${data.kpis.totalSessions} (${data.kpis.globalAvgWpm} WPM)`,
                        sub: `Top ${data.kpis.topWpm} WPM · ${data.kpis.globalAvgAccuracy}% acc`,
                        icon: Gamepad2,
                      },
                      {
                        label: 'Total Visits Logged',
                        value: data.kpis.totalVisits,
                        sub: `${data.kpis.totalPageViews} total page views`,
                        icon: Eye,
                      },
                      {
                        label: 'Ad Impressions',
                        value: data.kpis.adImpressions.toLocaleString(),
                        sub: `${data.ads.filter((a) => a.isActive).length} active slots`,
                        icon: Megaphone,
                      },
                      {
                        label: 'Ad Clicks & CTR',
                        value: `${data.kpis.adClicks} (${ctrPercent}%)`,
                        sub: 'Across all placements',
                        icon: MousePointerClick,
                      },
                      {
                        label: 'Site Status',
                        value: data.settings?.maintenanceMode ? 'Maintenance' : 'Live',
                        sub: `${data.settings?.xpMultiplier || 1}x XP · ${data.settings?.adsEnabled ? 'Ads On' : 'Ads Off'}`,
                        icon: ShieldCheck,
                      },
                    ].map((kpi, i) => {
                      const Icon = kpi.icon;
                      return (
                        <div
                          key={i}
                          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between"
                        >
                          <div className="flex items-center justify-between text-slate-400">
                            <span className="text-xs font-medium">{kpi.label}</span>
                            <Icon size={16} />
                          </div>
                          <p className="text-2xl font-mono font-bold tabular-nums text-white mt-2">
                            {kpi.value}
                          </p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums mt-1">
                            {kpi.sub}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Real-Time 30-Day Daily Active Users & Game Engagement Line Chart */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-base font-semibold text-white">
                            30-Day Daily Active Users &amp; Game Engagement
                          </h3>
                          <button
                            onClick={() => setLiveAutoRefresh((prev) => !prev)}
                            className={cn(
                              'px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap',
                              liveAutoRefresh
                                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                : 'bg-slate-800 border-slate-700 text-slate-400'
                            )}
                          >
                            {liveAutoRefresh ? 'Live 10s Sync: On' : 'Live Sync: Paused'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Real-time 30-day trend of active users, game sessions, usage minutes, and average WPM · Last synced{' '}
                          <span className="font-mono tabular-nums text-slate-300">
                            {new Date(nowMs).toLocaleTimeString()}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800 self-start lg:self-auto">
                        {(
                          [
                            { id: 'all', label: 'All Metrics' },
                            { id: 'users_matches', label: 'Users & Matches' },
                            { id: 'usage_speed', label: 'Usage & Speed' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => setEngagementView(opt.id)}
                            className={cn(
                              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                              engagementView === opt.id
                                ? 'bg-slate-800 text-white'
                                : 'text-slate-400 hover:text-white'
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                      <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 px-4 py-3">
                        <p className="text-[11px] text-slate-400">30-Day Peak DAU</p>
                        <p className="text-lg font-mono font-bold tabular-nums text-neon-cyan mt-0.5">
                          {Math.max(0, ...(data.charts.dailyEngagement30d || []).map((d) => d.activeUsers))}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 px-4 py-3">
                        <p className="text-[11px] text-slate-400">30-Day Matches</p>
                        <p className="text-lg font-mono font-bold tabular-nums text-neon-pink mt-0.5">
                          {(data.charts.dailyEngagement30d || []).reduce((sum, d) => sum + d.gameSessions, 0)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 px-4 py-3">
                        <p className="text-[11px] text-slate-400">30-Day Usage Time</p>
                        <p className="text-lg font-mono font-bold tabular-nums text-neon-purple mt-0.5">
                          {(data.charts.dailyEngagement30d || []).reduce((sum, d) => sum + d.usageMinutes, 0)}m
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 px-4 py-3">
                        <p className="text-[11px] text-slate-400">Peak Daily Avg WPM</p>
                        <p className="text-lg font-mono font-bold tabular-nums text-emerald-400 mt-0.5">
                          {Math.max(0, ...(data.charts.dailyEngagement30d || []).map((d) => d.avgWpm))}
                        </p>
                      </div>
                    </div>

                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.charts.dailyEngagement30d || []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis
                            dataKey="date"
                            stroke="#64748b"
                            fontSize={11}
                            minTickGap={20}
                          />
                          <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '0.75rem',
                              fontSize: '12px',
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                          {(engagementView === 'all' || engagementView === 'users_matches') && (
                            <Line
                              type="monotone"
                              dataKey="activeUsers"
                              name="Daily Active Users"
                              stroke="#06b6d4"
                              strokeWidth={2.5}
                              dot={false}
                              activeDot={{ r: 5 }}
                              isAnimationActive={false}
                            />
                          )}
                          {(engagementView === 'all' || engagementView === 'users_matches') && (
                            <Line
                              type="monotone"
                              dataKey="gameSessions"
                              name="Game Matches"
                              stroke="#ec4899"
                              strokeWidth={2.5}
                              dot={false}
                              activeDot={{ r: 5 }}
                              isAnimationActive={false}
                            />
                          )}
                          {(engagementView === 'all' || engagementView === 'usage_speed') && (
                            <Line
                              type="monotone"
                              dataKey="usageMinutes"
                              name="Usage (min)"
                              stroke="#a855f7"
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 5 }}
                              isAnimationActive={false}
                            />
                          )}
                          {(engagementView === 'all' || engagementView === 'usage_speed') && (
                            <Line
                              type="monotone"
                              dataKey="avgWpm"
                              name="Avg WPM"
                              stroke="#22c55e"
                              strokeWidth={2}
                              strokeDasharray="4 4"
                              dot={false}
                              activeDot={{ r: 5 }}
                              isAnimationActive={false}
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                      <div className="mb-4">
                        <h3 className="text-base font-semibold text-white">
                          7-Day Visitor Traffic & Usage Minutes
                        </h3>
                        <p className="text-xs text-slate-400">
                          Daily sessions and cumulative website usage time
                        </p>
                      </div>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={data.charts.dailyTraffic}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                            <YAxis stroke="#64748b" fontSize={11} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#0f172a',
                                borderColor: '#334155',
                                borderRadius: '0.75rem',
                                fontSize: '12px',
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="visits"
                              name="Visits"
                              stroke="#06b6d4"
                              fill="#06b6d4"
                              fillOpacity={0.18}
                            />
                            <Area
                              type="monotone"
                              dataKey="usageMinutes"
                              name="Usage (min)"
                              stroke="#a855f7"
                              fill="#a855f7"
                              fillOpacity={0.15}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                      <div className="mb-4">
                        <h3 className="text-base font-semibold text-white">
                          Game Mode Popularity & Average WPM
                        </h3>
                        <p className="text-xs text-slate-400">
                          Session volume and typing speed across modes
                        </p>
                      </div>
                      <div className="h-64 w-full">
                        {data.charts.modeBreakdown.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-slate-500">
                            No game sessions recorded yet.
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.charts.modeBreakdown}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis dataKey="mode" stroke="#64748b" fontSize={11} />
                              <YAxis stroke="#64748b" fontSize={11} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#0f172a',
                                  borderColor: '#334155',
                                  borderRadius: '0.75rem',
                                  fontSize: '12px',
                                }}
                              />
                              <Bar dataKey="sessions" name="Matches" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                              <Bar dataKey="avgWpm" name="Avg WPM" fill="#ec4899" radius={[6, 6, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick Recent Visitors & Devices */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-semibold text-white">Recent Visitors</h3>
                        <button
                          onClick={() => setActiveTab('visitors')}
                          className="text-xs font-medium text-neon-cyan hover:underline"
                        >
                          View All History
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="py-2 pr-4 font-medium">Visitor</th>
                              <th className="py-2 pr-4 font-medium">Page / Tab</th>
                              <th className="py-2 pr-4 font-medium">Device</th>
                              <th className="py-2 pr-4 font-medium text-right">Usage Time</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {data.visitors.slice(0, 6).map((v) => (
                              <tr key={v.id} className="hover:bg-slate-800/30">
                                <td className="py-2.5 pr-4">
                                  <p className="font-medium text-slate-200 truncate max-w-[180px]">
                                    {v.userEmail || `Guest (${v.visitorId.slice(0, 8)})`}
                                  </p>
                                </td>
                                <td className="py-2.5 pr-4 text-slate-400 font-mono">
                                  {v.pagePath} · {v.activeTab}
                                </td>
                                <td className="py-2.5 pr-4 text-slate-400 capitalize">
                                  {v.deviceType} · {v.browser}
                                </td>
                                <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-neon-cyan">
                                  {formatDuration(v.durationSec)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                      <h3 className="text-base font-semibold text-white mb-4">Device Breakdown</h3>
                      <div className="space-y-3">
                        {data.charts.deviceBreakdown.length === 0 ? (
                          <p className="text-xs text-slate-500">No device data yet.</p>
                        ) : (
                          data.charts.deviceBreakdown.map((d) => {
                            const pct =
                              data.kpis.totalVisits > 0
                                ? Math.round((d.count / data.visitors.length) * 100)
                                : 0;
                            return (
                              <div key={d.device} className="space-y-1.5">
                                <div className="flex justify-between text-xs">
                                  <span className="capitalize text-slate-300 font-medium">{d.device}</span>
                                  <span className="font-mono tabular-nums text-slate-400">
                                    {d.count} ({pct}%)
                                  </span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                                  <div
                                    className="h-full bg-neon-cyan"
                                    style={{ width: `${Math.min(100, pct)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: VISITOR HISTORY & WEBSITE USAGE TIME */}
              {activeTab === 'visitors' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-xs text-slate-400">Active Now (5m)</p>
                      <p className="text-2xl font-mono font-bold tabular-nums text-emerald-400 mt-1">
                        {data.kpis.activeVisitorsNow}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-xs text-slate-400">Total Website Usage Time</p>
                      <p className="text-2xl font-mono font-bold tabular-nums text-neon-cyan mt-1">
                        {formatDuration(data.kpis.totalUsageSec)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-xs text-slate-400">Avg. Time per Session</p>
                      <p className="text-2xl font-mono font-bold tabular-nums text-white mt-1">
                        {formatDuration(data.kpis.avgUsageSec)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-xs text-slate-400">Unique Visitors</p>
                      <p className="text-2xl font-mono font-bold tabular-nums text-white mt-1">
                        {data.kpis.uniqueVisitors}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                          <input
                            type="text"
                            value={visitorSearch}
                            onChange={(e) => setVisitorSearch(e.target.value)}
                            placeholder="Search email, visitor ID, browser..."
                            className="pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-neon-cyan w-64"
                          />
                        </div>
                        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800">
                          {(['all', 'active', 'signed_in', 'guest'] as const).map((f) => (
                            <button
                              key={f}
                              onClick={() => setVisitorFilter(f)}
                              className={cn(
                                'px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap',
                                visitorFilter === f
                                  ? 'bg-slate-800 text-white'
                                  : 'text-slate-400 hover:text-white'
                              )}
                            >
                              {f.replace('_', ' ')}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={exportVisitorsCsv}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white whitespace-nowrap"
                        >
                          <Download size={14} />
                          <span>Export CSV</span>
                        </button>
                        <button
                          onClick={handleClearVisitors}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-xs font-medium text-red-300 whitespace-nowrap"
                        >
                          <Trash2 size={14} />
                          <span>Clear Logs</span>
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="py-2.5 pr-4 font-medium">Visitor / User</th>
                            <th className="py-2.5 pr-4 font-medium">Page & Tab</th>
                            <th className="py-2.5 pr-4 font-medium">Device / Browser</th>
                            <th className="py-2.5 pr-4 font-medium">Origin</th>
                            <th className="py-2.5 pr-4 font-medium text-right">Page Views</th>
                            <th className="py-2.5 pr-4 font-medium text-right">Usage Time</th>
                            <th className="py-2.5 font-medium text-right">Last Active</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {filteredVisitors.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-10 text-center text-slate-500">
                                No visitor sessions match the current filter.
                              </td>
                            </tr>
                          ) : (
                            filteredVisitors.map((v) => {
                              const isOnline =
                                nowMs - new Date(v.lastPingAt).getTime() < 5 * 60 * 1000;
                              return (
                                <tr key={v.id} className="hover:bg-slate-800/30">
                                  <td className="py-3 pr-4">
                                    <p className="font-medium text-white">
                                      {v.userName || v.userEmail || 'Guest Visitor'}
                                    </p>
                                    <p className="text-[11px] text-slate-500 font-mono">
                                      {v.userEmail || `ID: ${v.visitorId.slice(0, 12)}`}
                                    </p>
                                  </td>
                                  <td className="py-3 pr-4 font-mono text-slate-300">
                                    {v.pagePath} · {v.activeTab}
                                    <p className="text-[11px] text-slate-500 truncate max-w-[160px]">
                                      Ref: {v.referrer || 'direct'}
                                    </p>
                                  </td>
                                  <td className="py-3 pr-4 text-slate-300 capitalize">
                                    {v.deviceType} · {v.browser} · {v.os}
                                    {v.screenRes && (
                                      <p className="text-[11px] text-slate-500 font-mono">
                                        {v.screenRes}
                                      </p>
                                    )}
                                  </td>
                                  <td className="py-3 pr-4 text-slate-400 font-mono">
                                    {v.country}
                                    <p className="text-[11px] text-slate-500">{v.ipMasked}</p>
                                  </td>
                                  <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-300">
                                    {v.pageViews}
                                  </td>
                                  <td className="py-3 pr-4 text-right font-mono tabular-nums font-semibold text-neon-cyan">
                                    {formatDuration(v.durationSec)}
                                  </td>
                                  <td className="py-3 text-right font-mono tabular-nums text-slate-400">
                                    {isOnline ? (
                                      <span className="text-emerald-400 font-semibold">Online</span>
                                    ) : (
                                      new Date(v.lastPingAt).toLocaleString()
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: USERS & ACCESS CONTROL */}
              {activeTab === 'users' && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-white">Registered Users</h3>
                      <p className="text-xs text-slate-400">
                        Manage user roles, XP, coins, bans, and website usage totals
                      </p>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search user name, email, role..."
                        className="pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-neon-cyan w-64"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 pr-4 font-medium">User</th>
                          <th className="py-2.5 pr-4 font-medium">Role</th>
                          <th className="py-2.5 pr-4 font-medium text-right">Level / XP</th>
                          <th className="py-2.5 pr-4 font-medium text-right">Coins</th>
                          <th className="py-2.5 pr-4 font-medium text-right">Best WPM</th>
                          <th className="py-2.5 pr-4 font-medium text-right">Site Time</th>
                          <th className="py-2.5 pr-4 font-medium">Status</th>
                          <th className="py-2.5 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredUsers.map((u) => (
                          <tr key={u.id} className="hover:bg-slate-800/30">
                            <td className="py-3 pr-4">
                              <p className="font-semibold text-white">{u.displayName}</p>
                              <p className="text-[11px] text-slate-500 font-mono">{u.email}</p>
                            </td>
                            <td className="py-3 pr-4 capitalize font-medium text-slate-300">
                              {u.role}
                            </td>
                            <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-300">
                              Lv.{u.level} · {u.xp.toLocaleString()} XP
                            </td>
                            <td className="py-3 pr-4 text-right font-mono tabular-nums text-amber-400">
                              {u.coins.toLocaleString()}
                            </td>
                            <td className="py-3 pr-4 text-right font-mono tabular-nums text-neon-cyan">
                              {u.bestWpm} WPM ({u.averageAccuracy}%)
                            </td>
                            <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-300">
                              {formatDuration(u.totalTimeSpentSec)}
                            </td>
                            <td className="py-3 pr-4">
                              {u.isBanned ? (
                                <span className="text-red-400 font-semibold">Banned</span>
                              ) : (
                                <span className="text-emerald-400 font-medium">Active</span>
                              )}
                            </td>
                            <td className="py-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingUser(u);
                                    setUserEditForm({
                                      role: u.role,
                                      xp: u.xp,
                                      coins: u.coins,
                                      level: u.level,
                                      isBanned: u.isBanned,
                                      banReason: u.banReason || '',
                                    });
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                                  title="Edit user"
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400"
                                  title="Delete user"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 4: AD PLACEHOLDERS & MONETIZATION */}
              {activeTab === 'ads' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-white">Ad Placeholders & Sponsor Slots</h3>
                      <p className="text-xs text-slate-400">
                        Control every ad slot across the landing page, hub, sidebar, and post-game screen
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setEditingAd({
                          slotKey: `custom_slot_${Date.now().toString().slice(-4)}`,
                          name: 'New Ad Placement',
                          placement: 'in_feed',
                          adType: 'placeholder',
                          title: 'Sponsor Title Here',
                          description: 'Describe the partner offer or ad placement.',
                          ctaText: 'Learn More',
                          targetUrl: 'https://example.com',
                          dimensions: '728x90',
                          isActive: true,
                        })
                      }
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neon-cyan text-slate-950 font-semibold text-xs hover:opacity-90 whitespace-nowrap"
                    >
                      <Plus size={14} />
                      <span>New Ad Slot</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {data.ads.map((ad) => {
                      const ctr =
                        ad.impressions > 0
                          ? ((ad.clicks / ad.impressions) * 100).toFixed(2)
                          : '0.00';
                      return (
                        <div
                          key={ad.id}
                          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between gap-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <span className="font-mono">{ad.slotKey}</span>
                                <span aria-hidden="true">·</span>
                                <span className="capitalize">{ad.adType.replace('_', ' ')}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">{ad.dimensions}</span>
                              </div>
                              <h4 className="text-base font-semibold text-white mt-1">{ad.name}</h4>
                              <p className="text-xs text-slate-400 mt-1 line-clamp-2">{ad.title}</p>
                            </div>

                            <button
                              onClick={() => handleToggleAd(ad)}
                              className={cn(
                                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0',
                                ad.isActive
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              )}
                            >
                              {ad.isActive ? 'Active' : 'Paused'}
                            </button>
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
                            <div className="flex items-center gap-5 font-mono tabular-nums text-slate-300">
                              <span>{ad.impressions.toLocaleString()} impr</span>
                              <span>{ad.clicks.toLocaleString()} clicks</span>
                              <span className="text-neon-cyan">{ctr}% CTR</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEditingAd({ ...ad })}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
                              >
                                <Edit3 size={12} />
                                <span>Configure</span>
                              </button>
                              <button
                                onClick={() => handleDeleteAd(ad.id)}
                                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 5: FULL WEBSITE CONTROLS */}
              {activeTab === 'settings' && settingsDraft && (
                <div className="space-y-6 max-w-4xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-white">Website Configuration & Access</h3>
                      <p className="text-xs text-slate-400">
                        Modify live site copy, maintenance mode, announcements, multipliers, and enabled game modes
                      </p>
                    </div>
                    <button
                      onClick={handleSaveSettings}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neon-cyan text-slate-950 font-semibold text-xs hover:opacity-90 whitespace-nowrap"
                    >
                      <Save size={14} />
                      <span>Save All Changes</span>
                    </button>
                  </div>

                  {/* Site Identity */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                    <h4 className="text-sm font-semibold text-white">Branding & Hero Copy</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5">Site Name</label>
                        <input
                          type="text"
                          value={settingsDraft.siteName}
                          onChange={(e) =>
                            setSettingsDraft({ ...settingsDraft, siteName: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5">Default Difficulty</label>
                        <select
                          value={settingsDraft.defaultDifficulty}
                          onChange={(e) =>
                            setSettingsDraft({
                              ...settingsDraft,
                              defaultDifficulty: e.target.value as SiteSettings['defaultDifficulty'],
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                          <option value="expert">Expert</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Hero Headline</label>
                      <input
                        type="text"
                        value={settingsDraft.heroHeadline}
                        onChange={(e) =>
                          setSettingsDraft({ ...settingsDraft, heroHeadline: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Hero Subheading</label>
                      <textarea
                        rows={2}
                        value={settingsDraft.heroSubheading}
                        onChange={(e) =>
                          setSettingsDraft({ ...settingsDraft, heroSubheading: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
                      />
                    </div>
                  </div>

                  {/* Feature Toggles & Multipliers */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
                    <h4 className="text-sm font-semibold text-white">Platform Toggles & Economy</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        { key: 'adsEnabled', label: 'Enable Ad Placeholders Across Site' },
                        { key: 'aiFeaturesEnabled', label: 'Enable AI Coach & AI Lessons' },
                        { key: 'multiplayerEnabled', label: 'Enable 1v1 Multiplayer Duels' },
                        { key: 'registrationOpen', label: 'Allow New Player Sign-Ups' },
                      ].map((toggle) => {
                        const checked = Boolean(
                          settingsDraft[toggle.key as keyof typeof settingsDraft]
                        );
                        return (
                          <label
                            key={toggle.key}
                            className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer"
                          >
                            <span className="text-xs font-medium text-slate-200">{toggle.label}</span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setSettingsDraft({
                                  ...settingsDraft,
                                  [toggle.key]: e.target.checked,
                                })
                              }
                              className="w-4 h-4 accent-cyan-400"
                            />
                          </label>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5">
                          Global XP Multiplier (1x – 10x)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={settingsDraft.xpMultiplier}
                          onChange={(e) =>
                            setSettingsDraft({
                              ...settingsDraft,
                              xpMultiplier: Number(e.target.value) || 1,
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5">
                          Global Coin Multiplier (1x – 10x)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={settingsDraft.coinMultiplier}
                          onChange={(e) =>
                            setSettingsDraft({
                              ...settingsDraft,
                              coinMultiplier: Number(e.target.value) || 1,
                            })
                          }
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Announcement & Maintenance */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                    <h4 className="text-sm font-semibold text-white">Announcement & Maintenance</h4>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-xs font-medium text-slate-200">Show Top Announcement Banner</span>
                      <input
                        type="checkbox"
                        checked={settingsDraft.announcementEnabled}
                        onChange={(e) =>
                          setSettingsDraft({
                            ...settingsDraft,
                            announcementEnabled: e.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-cyan-400"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <select
                        value={settingsDraft.announcementType}
                        onChange={(e) =>
                          setSettingsDraft({
                            ...settingsDraft,
                            announcementType: e.target.value as 'info' | 'promo' | 'warning',
                          })
                        }
                        className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      >
                        <option value="info">Info</option>
                        <option value="promo">Promo</option>
                        <option value="warning">Warning</option>
                      </select>
                      <input
                        type="text"
                        value={settingsDraft.announcementText}
                        onChange={(e) =>
                          setSettingsDraft({
                            ...settingsDraft,
                            announcementText: e.target.value,
                          })
                        }
                        placeholder="Announcement message shown across the site..."
                        className="sm:col-span-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                      <span className="text-xs font-medium text-red-200">
                        Maintenance Mode (blocks non-admin visitors)
                      </span>
                      <input
                        type="checkbox"
                        checked={settingsDraft.maintenanceMode}
                        onChange={(e) =>
                          setSettingsDraft({
                            ...settingsDraft,
                            maintenanceMode: e.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-red-500"
                      />
                    </div>
                    <input
                      type="text"
                      value={settingsDraft.maintenanceMessage}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          maintenanceMessage: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>

                  {/* Game Mode Access Control */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                    <h4 className="text-sm font-semibold text-white">Enabled Game Modes</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {ALL_GAME_MODES.map((m) => {
                        const enabled = settingsDraft.enabledModesList.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              const next = enabled
                                ? settingsDraft.enabledModesList.filter((id) => id !== m.id)
                                : [...settingsDraft.enabledModesList, m.id];
                              setSettingsDraft({ ...settingsDraft, enabledModesList: next });
                            }}
                            className={cn(
                              'px-3 py-2.5 rounded-xl border text-xs font-medium text-left flex items-center justify-between transition-colors',
                              enabled
                                ? 'bg-neon-cyan/10 border-neon-cyan/30 text-white'
                                : 'bg-slate-950 border-slate-800 text-slate-500'
                            )}
                          >
                            <span>{m.label}</span>
                            <span className="text-[11px]">{enabled ? 'On' : 'Off'}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 6: CUSTOM WORD PACKS */}
              {activeTab === 'wordpacks' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <form
                    onSubmit={handleCreateWordPack}
                    className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 h-fit"
                  >
                    <h3 className="text-base font-semibold text-white">Create Global Word Pack</h3>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Pack Title</label>
                      <input
                        type="text"
                        required
                        value={newPack.title}
                        onChange={(e) => setNewPack({ ...newPack, title: e.target.value })}
                        placeholder="e.g. React Hooks Drill"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Category</label>
                        <input
                          type="text"
                          value={newPack.category}
                          onChange={(e) => setNewPack({ ...newPack, category: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Difficulty</label>
                        <select
                          value={newPack.difficulty}
                          onChange={(e) => setNewPack({ ...newPack, difficulty: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Words (comma or newline separated)
                      </label>
                      <textarea
                        rows={5}
                        required
                        value={newPack.wordsText}
                        onChange={(e) => setNewPack({ ...newPack, wordsText: e.target.value })}
                        placeholder="useState, useEffect, useMemo, callback, promise..."
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-xl bg-neon-cyan text-slate-950 font-semibold text-xs hover:opacity-90"
                    >
                      Publish Word Pack
                    </button>
                  </form>

                  <div className="lg:col-span-2 space-y-3">
                    {data.wordPacks.map((pack) => {
                      let words: string[] = [];
                      try {
                        words = JSON.parse(pack.wordsJson);
                      } catch {
                        words = [];
                      }
                      return (
                        <div
                          key={pack.id}
                          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <span>{pack.category}</span>
                              <span aria-hidden="true">·</span>
                              <span className="capitalize">{pack.difficulty}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">{words.length} words</span>
                            </div>
                            <h4 className="text-sm font-semibold text-white mt-1">{pack.title}</h4>
                            <p className="text-xs font-mono text-slate-500 truncate mt-1">
                              {words.slice(0, 10).join(', ')}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleToggleWordPack(pack)}
                              className={cn(
                                'px-3 py-1.5 rounded-lg text-xs font-medium',
                                pack.isActive
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400'
                              )}
                            >
                              {pack.isActive ? 'Active' : 'Hidden'}
                            </button>
                            <button
                              onClick={() => handleDeleteWordPack(pack.id)}
                              className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 7: GAME SESSIONS */}
              {activeTab === 'sessions' && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-white">Recorded Typing Sessions</h3>
                      <p className="text-xs text-slate-400">
                        Inspect player performance or moderate invalid leaderboard scores
                      </p>
                    </div>
                    <select
                      value={sessionModeFilter}
                      onChange={(e) => setSessionModeFilter(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                    >
                      <option value="all">All Game Modes</option>
                      {ALL_GAME_MODES.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 pr-4 font-medium">Player</th>
                          <th className="py-2.5 pr-4 font-medium">Mode</th>
                          <th className="py-2.5 pr-4 font-medium text-right">WPM</th>
                          <th className="py-2.5 pr-4 font-medium text-right">Accuracy</th>
                          <th className="py-2.5 pr-4 font-medium text-right">Score</th>
                          <th className="py-2.5 pr-4 font-medium text-right">Played At</th>
                          <th className="py-2.5 text-right font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredSessions.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-slate-500">
                              No sessions recorded for this filter.
                            </td>
                          </tr>
                        ) : (
                          filteredSessions.map((s) => (
                            <tr key={s.id} className="hover:bg-slate-800/30">
                              <td className="py-3 pr-4">
                                <p className="font-medium text-white">{s.displayName || 'Unknown'}</p>
                                <p className="text-[11px] text-slate-500 font-mono">{s.email || s.userUid}</p>
                              </td>
                              <td className="py-3 pr-4 capitalize text-slate-300">
                                {s.gameMode} · {s.difficulty}
                              </td>
                              <td className="py-3 pr-4 text-right font-mono tabular-nums text-neon-cyan font-semibold">
                                {s.wpm}
                              </td>
                              <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-300">
                                {s.accuracy}%
                              </td>
                              <td className="py-3 pr-4 text-right font-mono tabular-nums text-white font-semibold">
                                {s.score.toLocaleString()}
                              </td>
                              <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-400">
                                {new Date(s.createdAt).toLocaleString()}
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  onClick={() => handleDeleteSession(s.id)}
                                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 8: AUDIT LOGS */}
              {activeTab === 'audit' && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-white">Administrator Audit Trail</h3>
                    <p className="text-xs text-slate-400">
                      Every configuration change, user update, and ad edit is logged here
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 pr-4 font-medium">Timestamp</th>
                          <th className="py-2.5 pr-4 font-medium">Admin</th>
                          <th className="py-2.5 pr-4 font-medium">Action</th>
                          <th className="py-2.5 pr-4 font-medium">Target</th>
                          <th className="py-2.5 font-medium">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {data.auditLogs.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-10 text-center text-slate-500">
                              No admin actions recorded yet.
                            </td>
                          </tr>
                        ) : (
                          data.auditLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-800/30">
                              <td className="py-3 pr-4 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                                {new Date(log.createdAt).toLocaleString()}
                              </td>
                              <td className="py-3 pr-4 font-mono text-slate-300">{log.adminEmail}</td>
                              <td className="py-3 pr-4 font-mono text-neon-cyan">{log.action}</td>
                              <td className="py-3 pr-4 font-mono text-slate-400">
                                {log.targetType} #{log.targetId}
                              </td>
                              <td className="py-3 text-slate-300">{log.details}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Edit User: {editingUser.displayName}</h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Role</label>
                <select
                  value={userEditForm.role}
                  onChange={(e) => setUserEditForm({ ...userEditForm, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <option value="user">User</option>
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Level</label>
                  <input
                    type="number"
                    min={1}
                    value={userEditForm.level}
                    onChange={(e) =>
                      setUserEditForm({ ...userEditForm, level: Number(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">XP</label>
                  <input
                    type="number"
                    min={0}
                    value={userEditForm.xp}
                    onChange={(e) =>
                      setUserEditForm({ ...userEditForm, xp: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Coins</label>
                  <input
                    type="number"
                    min={0}
                    value={userEditForm.coins}
                    onChange={(e) =>
                      setUserEditForm({ ...userEditForm, coins: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono text-white"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <span className="text-xs font-medium text-red-300 flex items-center gap-2">
                  <Ban size={14} /> Ban Account
                </span>
                <input
                  type="checkbox"
                  checked={userEditForm.isBanned}
                  onChange={(e) =>
                    setUserEditForm({ ...userEditForm, isBanned: e.target.checked })
                  }
                  className="w-4 h-4 accent-red-500"
                />
              </label>

              {userEditForm.isBanned && (
                <input
                  type="text"
                  value={userEditForm.banReason}
                  onChange={(e) =>
                    setUserEditForm({ ...userEditForm, banReason: e.target.value })
                  }
                  placeholder="Reason for suspension..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-medium text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveUserEdit}
                className="px-4 py-2 rounded-lg bg-neon-cyan text-slate-950 text-xs font-semibold"
              >
                Save User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Ad Modal */}
      {editingAd && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">
                {editingAd.id ? `Configure ${editingAd.name}` : 'Create Ad Placement'}
              </h3>
              <button onClick={() => setEditingAd(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Slot Key</label>
                <input
                  type="text"
                  value={editingAd.slotKey || ''}
                  disabled={Boolean(editingAd.id)}
                  onChange={(e) => setEditingAd({ ...editingAd, slotKey: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={editingAd.name || ''}
                  onChange={(e) => setEditingAd({ ...editingAd, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Ad Type</label>
                <select
                  value={editingAd.adType || 'placeholder'}
                  onChange={(e) =>
                    setEditingAd({
                      ...editingAd,
                      adType: e.target.value as AdPlacement['adType'],
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                >
                  <option value="placeholder">Placeholder</option>
                  <option value="custom_banner">Custom Banner</option>
                  <option value="sponsor_card">Sponsor Card</option>
                  <option value="adsense">AdSense Unit</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Placement</label>
                <select
                  value={editingAd.placement || 'in_feed'}
                  onChange={(e) => setEditingAd({ ...editingAd, placement: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                >
                  <option value="top_banner">Top Banner</option>
                  <option value="in_feed">Hub In-Feed</option>
                  <option value="sidebar">Sidebar</option>
                  <option value="post_game">Post-Game</option>
                  <option value="footer">Footer Strip</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Dimensions</label>
                <input
                  type="text"
                  value={editingAd.dimensions || '728x90'}
                  onChange={(e) => setEditingAd({ ...editingAd, dimensions: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Headline / Title</label>
              <input
                type="text"
                value={editingAd.title || ''}
                onChange={(e) => setEditingAd({ ...editingAd, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Description</label>
              <textarea
                rows={2}
                value={editingAd.description || ''}
                onChange={(e) => setEditingAd({ ...editingAd, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">CTA Button Text</label>
                <input
                  type="text"
                  value={editingAd.ctaText || ''}
                  onChange={(e) => setEditingAd({ ...editingAd, ctaText: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Target URL (https://)</label>
                <input
                  type="url"
                  value={editingAd.targetUrl || ''}
                  onChange={(e) => setEditingAd({ ...editingAd, targetUrl: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>
            </div>

            {editingAd.adType === 'adsense' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">AdSense Publisher ID</label>
                  <input
                    type="text"
                    value={editingAd.adsenseClient || ''}
                    onChange={(e) => setEditingAd({ ...editingAd, adsenseClient: e.target.value })}
                    placeholder="ca-pub-0000000000000000"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">AdSense Slot ID</label>
                  <input
                    type="text"
                    value={editingAd.adsenseSlot || ''}
                    onChange={(e) => setEditingAd({ ...editingAd, adsenseSlot: e.target.value })}
                    placeholder="1234567890"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white"
                  />
                </div>
              </div>
            )}

            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
              <span className="text-xs font-medium text-slate-200">Slot Active on Website</span>
              <input
                type="checkbox"
                checked={editingAd.isActive !== false}
                onChange={(e) => setEditingAd({ ...editingAd, isActive: e.target.checked })}
                className="w-4 h-4 accent-cyan-400"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingAd(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-medium text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAd}
                className="px-4 py-2 rounded-lg bg-neon-cyan text-slate-950 text-xs font-semibold"
              >
                Save Ad Placement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
