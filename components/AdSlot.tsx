'use client';

import React, { useEffect, useRef } from 'react';
import { ExternalLink, Megaphone } from 'lucide-react';
import { useSiteConfig, AdPlacement } from '@/hooks/use-site-config';
import { cn } from '@/lib/utils';

function getSafeHref(url: string | undefined): string {
  if (!url) return '#';
  const trimmed = url.trim();
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return '#';
  }
  return '#';
}

export function AdSlot({
  slotKey,
  className,
}: {
  slotKey: string;
  className?: string;
}) {
  const { settings, ads } = useSiteConfig();
  const trackedRef = useRef<string | null>(null);

  const slot: AdPlacement | undefined = ads.find(
    (a) => a.slotKey === slotKey && a.isActive
  );

  useEffect(() => {
    if (!settings?.adsEnabled || !slot) return;
    if (trackedRef.current === slot.slotKey) return;
    trackedRef.current = slot.slotKey;

    fetch('/api/ads/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotKey: slot.slotKey, eventType: 'impression' }),
    }).catch(() => {});
  }, [settings?.adsEnabled, slot]);

  if (!settings?.adsEnabled || !slot) {
    return null;
  }

  const handleClick = () => {
    fetch('/api/ads/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotKey: slot.slotKey, eventType: 'click' }),
    }).catch(() => {});
  };

  const href = getSafeHref(slot.targetUrl);

  if (slot.adType === 'adsense') {
    return (
      <div
        className={cn(
          'rounded-2xl border border-slate-800/80 bg-slate-900/50 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3',
          className
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
            <span>Sponsored</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{slot.dimensions || 'Responsive'}</span>
          </div>
          <p className="text-sm font-semibold text-slate-100 truncate mt-0.5">{slot.title}</p>
          {slot.adsenseClient && (
            <p className="text-xs font-mono text-slate-500 mt-0.5">
              AdSense Unit: {slot.adsenseClient} / {slot.adsenseSlot || 'auto'}
            </p>
          )}
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
        >
          <span>{slot.ctaText || 'Learn More'}</span>
          <ExternalLink size={13} />
        </a>
      </div>
    );
  }

  if (slot.adType === 'placeholder') {
    return (
      <div
        className={cn(
          'rounded-2xl border border-dashed border-slate-700/80 bg-slate-900/40 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4',
          className
        )}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
            <Megaphone size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>Ad Placeholder</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{slot.dimensions || '728x90'}</span>
            </div>
            <p className="text-sm font-semibold text-slate-200 truncate mt-0.5">{slot.title}</p>
            {slot.description && (
              <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{slot.description}</p>
            )}
          </div>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-700 bg-slate-800/70 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
        >
          <span>{slot.ctaText || 'Advertise Here'}</span>
          <ExternalLink size={13} />
        </a>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4',
        className
      )}
    >
      <div className="flex items-center gap-4 min-w-0">
        {slot.imageUrl ? (
          <img
            src={getSafeHref(slot.imageUrl)}
            alt={slot.title}
            referrerPolicy="no-referrer"
            className="w-14 h-14 rounded-xl object-cover border border-slate-800 shrink-0"
          />
        ) : (
          <div className="w-11 h-11 rounded-xl bg-neon-cyan/10 border border-neon-cyan/25 flex items-center justify-center text-neon-cyan shrink-0">
            <Megaphone size={18} />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>Sponsored</span>
            <span aria-hidden="true">·</span>
            <span>{slot.name}</span>
          </div>
          <p className="text-sm font-semibold text-white truncate mt-0.5">{slot.title}</p>
          {slot.description && (
            <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">{slot.description}</p>
          )}
        </div>
      </div>

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-neon-cyan/15 border border-neon-cyan/30 hover:bg-neon-cyan/25 text-xs font-semibold text-neon-cyan transition-colors whitespace-nowrap shrink-0"
      >
        <span>{slot.ctaText || 'Learn More'}</span>
        <ExternalLink size={13} />
      </a>
    </div>
  );
}
