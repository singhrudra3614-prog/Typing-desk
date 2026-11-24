'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Medal, Crown, Target, Zap, Loader2, ChevronRight, Hash } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { cn } from '@/lib/utils';

interface LeaderboardEntry {
  userId: string;
  displayName: string;
  wpm: number;
  accuracy?: number;
  score: number;
  updatedAt: string;
  photoURL?: string;
}

const MODES = [
  { id: 'all', name: 'Overall Top' },
  { id: 'zombie', name: 'Zombie Attack' },
  { id: 'space', name: 'Space Shooter' },
  { id: 'car', name: 'Car Racing' },
  { id: 'ninja', name: 'Ninja Slash' },
  { id: 'coding', name: 'CMD Line Hero' },
  { id: 'timed-rush', name: 'Timed Rush' },
  { id: 'accuracy-gauntlet', name: 'Accuracy Gauntlet' },
];

export default function Leaderboard() {
  const [selectedMode, setSelectedMode] = useState(MODES[0].id);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchLeaderboard() {
      setIsLoading(true);
      try {
        // Fast SQL leaderboard query first
        const res = await fetch(
          `/api/leaderboard?mode=${encodeURIComponent(selectedMode)}`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          const json = await res.json();
          const sqlRows = (json.entries || []).map((row: {
            userUid: string;
            displayName: string;
            wpm: number;
            accuracy?: number;
            score: number;
            createdAt: string;
            photoUrl?: string;
          }) => ({
            userId: row.userUid,
            displayName: row.displayName || 'Typist',
            wpm: row.wpm,
            accuracy: row.accuracy,
            score: row.score,
            updatedAt: row.createdAt,
            photoURL: row.photoUrl || '',
          }));

          if (!cancelled && sqlRows.length > 0) {
            setEntries(sqlRows);
            setIsLoading(false);
            return;
          }
        }

        // Fallback to Firestore if SQL leaderboard has no entries for this mode yet
        if (selectedMode !== 'all') {
          const q = query(
            collection(db, `leaderboards/${selectedMode}/entries`),
            orderBy('score', 'desc'),
            limit(15)
          );
          const snapshot = await getDocs(q);
          const fbData = snapshot.docs.map((d) => ({
            userId: d.id,
            ...d.data(),
          })) as LeaderboardEntry[];
          if (!cancelled) {
            setEntries(fbData);
          }
        } else if (!cancelled) {
          setEntries([]);
        }
      } catch (err) {
        console.error('Leaderboard fetch error:', err);
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchLeaderboard();
    return () => {
      cancelled = true;
    };
  }, [selectedMode]);

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-64 space-y-1.5 shrink-0">
          <p className="text-xs text-slate-400 font-semibold mb-3 pl-3">Game Modes</p>
          {MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setSelectedMode(mode.id)}
              className={cn(
                'w-full text-left px-4 py-2.5 rounded-xl font-medium text-sm transition-colors flex items-center justify-between group whitespace-nowrap',
                selectedMode === mode.id
                  ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              )}
            >
              <span>{mode.name}</span>
              <ChevronRight
                size={14}
                className={cn(
                  'transition-transform',
                  selectedMode === mode.id ? 'rotate-90' : 'opacity-0 group-hover:opacity-100'
                )}
              />
            </button>
          ))}
        </div>

        <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
            <div className="flex items-center gap-3">
              <Trophy className="text-neon-cyan" size={20} />
              <h3 className="font-display font-bold text-white text-lg">Global Rankings</h3>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-400">
              <span className="flex items-center gap-1"><Zap size={12} /> Speed</span>
              <span className="flex items-center gap-1"><Target size={12} /> Score</span>
            </div>
          </div>

          <div className="p-2">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-80 flex flex-col items-center justify-center gap-3"
                >
                  <Loader2 className="text-neon-cyan animate-spin" size={28} />
                  <p className="text-xs font-medium text-slate-400">Loading rankings...</p>
                </motion.div>
              ) : entries.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-80 flex flex-col items-center justify-center gap-3 text-center p-8"
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-500">
                    <Hash size={24} />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1">No scores recorded yet</h4>
                    <p className="text-slate-400 text-xs">Complete a match in this mode to claim the top rank.</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="divide-y divide-slate-800/60"
                >
                  {entries.map((entry, index) => (
                    <div
                      key={`${entry.userId}-${index}`}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-white/5 transition-colors rounded-xl"
                    >
                      <div className="w-8 flex justify-center shrink-0">
                        {index === 0 ? (
                          <Crown className="text-amber-400" size={18} />
                        ) : index === 1 ? (
                          <Medal className="text-slate-300" size={17} />
                        ) : index === 2 ? (
                          <Medal className="text-orange-400" size={17} />
                        ) : (
                          <span className="text-slate-500 font-mono tabular-nums text-sm font-semibold">
                            {index + 1}
                          </span>
                        )}
                      </div>

                      <div className="w-9 h-9 rounded-lg bg-slate-800 overflow-hidden border border-slate-700 shrink-0">
                        {entry.photoURL ? (
                          <img
                            src={entry.photoURL}
                            alt={entry.displayName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <Target size={14} />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{entry.displayName}</p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums">
                          {new Date(entry.updatedAt).toLocaleDateString()}
                          {typeof entry.accuracy === 'number' ? ` · ${entry.accuracy}% acc` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-6 text-right shrink-0">
                        <div>
                          <p className="text-[11px] text-slate-500 font-medium">WPM</p>
                          <p className="text-base font-mono font-bold tabular-nums text-neon-cyan">{entry.wpm}</p>
                        </div>
                        <div className="w-24">
                          <p className="text-[11px] text-slate-500 font-medium">Score</p>
                          <p className="text-base font-mono font-bold tabular-nums text-white">
                            {entry.score.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
