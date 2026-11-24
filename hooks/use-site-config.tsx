'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './use-auth';

export interface SiteSettings {
  id: number;
  key: string;
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
  enabledModes: string;
  enabledModesList: string[];
}

export interface AdPlacement {
  id: number;
  slotKey: string;
  name: string;
  placement: string;
  adType: 'placeholder' | 'custom_banner' | 'sponsor_card' | 'adsense';
  title: string;
  description: string;
  imageUrl: string;
  ctaText: string;
  targetUrl: string;
  adsenseClient: string;
  adsenseSlot: string;
  dimensions: string;
  isActive: boolean;
  impressions: number;
  clicks: number;
}

export interface WordPack {
  id: number;
  title: string;
  category: string;
  difficulty: string;
  words: string[];
  isActive: boolean;
}

interface SiteConfigContextType {
  settings: SiteSettings | null;
  ads: AdPlacement[];
  wordPacks: WordPack[];
  communityStats: { totalPlayers: number; totalMatches: number };
  loading: boolean;
  refreshSiteConfig: () => Promise<void>;
  reportNavigation: (pagePath: string, activeTab: string) => void;
}

const SiteConfigContext = createContext<SiteConfigContextType>({
  settings: null,
  ads: [],
  wordPacks: [],
  communityStats: { totalPlayers: 0, totalMatches: 0 },
  loading: true,
  refreshSiteConfig: async () => {},
  reportNavigation: () => {},
});

function getOrCreateStorageId(storage: Storage, key: string): string {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    storage.setItem(key, generated);
    return generated;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function SiteConfigProvider({ children }: { children: React.ReactNode }) {
  const { user, getIdToken } = useAuth();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [ads, setAds] = useState<AdPlacement[]>([]);
  const [wordPacks, setWordPacks] = useState<WordPack[]>([]);
  const [communityStats, setCommunityStats] = useState({
    totalPlayers: 0,
    totalMatches: 0,
  });
  const [loading, setLoading] = useState(true);

  const navStateRef = useRef({ pagePath: '/', activeTab: 'home' });
  const idsRef = useRef<{ visitorId: string; sessionToken: string } | null>(null);

  const fetchBootstrap = useCallback(async () => {
    try {
      const res = await fetch('/api/site/bootstrap', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      if (Array.isArray(data.ads)) setAds(data.ads);
      if (Array.isArray(data.wordPacks)) setWordPacks(data.wordPacks);
      if (data.communityStats) setCommunityStats(data.communityStats);
    } catch (err) {
      console.error('Failed to bootstrap site config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/site/bootstrap', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (data.settings) setSettings(data.settings);
        if (Array.isArray(data.ads)) setAds(data.ads);
        if (Array.isArray(data.wordPacks)) setWordPacks(data.wordPacks);
        if (data.communityStats) setCommunityStats(data.communityStats);
      })
      .catch((err) => {
        console.error('Failed to bootstrap site config:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const sendVisitPing = useCallback(
    async (deltaSec: number, isPageView: boolean, useBeacon = false) => {
      if (typeof window === 'undefined') return;
      if (!idsRef.current) {
        idsRef.current = {
          visitorId: getOrCreateStorageId(window.localStorage, 'tq_visitor_id'),
          sessionToken: getOrCreateStorageId(window.sessionStorage, 'tq_session_token'),
        };
      }

      const payload = {
        visitorId: idsRef.current.visitorId,
        sessionToken: idsRef.current.sessionToken,
        userUid: user?.uid || null,
        userEmail: user?.email || null,
        userName: user?.displayName || null,
        pagePath: navStateRef.current.pagePath,
        activeTab: navStateRef.current.activeTab,
        referrer: document.referrer || 'direct',
        screenRes: `${window.screen.width}x${window.screen.height}`,
        deltaSec,
        isPageView,
      };

      if (useBeacon && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], {
          type: 'application/json',
        });
        navigator.sendBeacon('/api/analytics/visit', blob);
        return;
      }

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        const token = user ? await getIdToken() : null;
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        await fetch('/api/analytics/visit', {
          method: isPageView ? 'POST' : 'PATCH',
          headers,
          body: JSON.stringify(payload),
        });
      } catch {
        // Ignore transient analytics failures
      }
    },
    [user, getIdToken]
  );

  // Initial visit + 15-second usage time heartbeat
  useEffect(() => {
    if (typeof window === 'undefined') return;
    navStateRef.current.pagePath = window.location.pathname || '/';
    sendVisitPing(0, true);

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        sendVisitPing(15, false);
      }
    }, 15000);

    const handlePageHide = () => {
      sendVisitPing(5, false, true);
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [sendVisitPing]);

  const reportNavigation = useCallback(
    (pagePath: string, activeTab: string) => {
      navStateRef.current = { pagePath, activeTab };
      sendVisitPing(0, true);
    },
    [sendVisitPing]
  );

  return (
    <SiteConfigContext.Provider
      value={{
        settings,
        ads,
        wordPacks,
        communityStats,
        loading,
        refreshSiteConfig: fetchBootstrap,
        reportNavigation,
      }}
    >
      {children}
    </SiteConfigContext.Provider>
  );
}

export const useSiteConfig = () => useContext(SiteConfigContext);
