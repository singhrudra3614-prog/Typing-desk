'use client';

import React, { useState } from 'react';
import { Palette, Check, Settings2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const THEMES = [
  { id: 'cyberpunk', name: 'Cyberpunk', colors: ['#06b6d4', '#ec4899', '#a855f7'] },
  { id: 'retro', name: 'Retro Neon', colors: ['#facc15', '#f97316', '#ef4444'] },
  { id: 'minimalist', name: 'Minimalist', colors: ['#94a3b8', '#cbd5e1', '#64748b'] }
];

export default function ThemeSelector() {
  const { user, profile } = useAuth();
  const currentTheme = profile?.activeTheme || 'cyberpunk';
  const [isEditing, setIsEditing] = useState(false);

  const customizations = profile?.themeCustomizations?.[currentTheme] || {
    primary: THEMES.find(t => t.id === currentTheme)?.colors[0] || '#06b6d4',
    accent: THEMES.find(t => t.id === currentTheme)?.colors[1] || '#ec4899'
  };

  const selectTheme = async (themeId: string) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        activeTheme: themeId
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const updateColor = async (type: 'primary' | 'accent', color: string) => {
    if (!user || !profile) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      const newCustomizations = {
        ...(profile.themeCustomizations || {}),
        [currentTheme]: {
          ...customizations,
          [type]: color
        }
      };
      await updateDoc(userRef, {
        themeCustomizations: newCustomizations
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  return (
    <div className="bg-glass rounded-3xl p-8 border border-white/10">
      <div className="flex items-center justify-between mb-6">
        <h4 className="text-lg font-display font-bold flex items-center gap-2">
          <Palette className="text-neon-cyan" size={18} />
          INTERFACE THEME
        </h4>
        <button 
          onClick={() => setIsEditing(!isEditing)}
          className={cn(
            "p-2 rounded-xl transition-all",
            isEditing ? "bg-neon-cyan text-slate-950" : "text-slate-400 hover:text-white"
          )}
        >
          <Settings2 size={18} />
        </button>
      </div>

      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.div 
            key="editing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="space-y-6"
          >
            <div className="space-y-4">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Customizing: {THEMES.find(t => t.id === currentTheme)?.name}</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Primary Color</label>
                  <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/10">
                    <input 
                      type="color" 
                      value={customizations.primary}
                      onChange={(e) => updateColor('primary', e.target.value)}
                      className="w-8 h-8 rounded-lg bg-transparent border-none cursor-pointer"
                    />
                    <span className="font-mono text-[10px] text-white">{customizations.primary.toUpperCase()}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Accent Color</label>
                  <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/10">
                    <input 
                      type="color" 
                      value={customizations.accent}
                      onChange={(e) => updateColor('accent', e.target.value)}
                      className="w-8 h-8 rounded-lg bg-transparent border-none cursor-pointer"
                    />
                    <span className="font-mono text-[10px] text-white">{customizations.accent.toUpperCase()}</span>
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setIsEditing(false)}
              className="w-full py-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10"
            >
              Back to Presets
            </button>
          </motion.div>
        ) : (
          <motion.div 
            key="presets"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="grid grid-cols-1 gap-3"
          >
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => selectTheme(theme.id)}
                className={cn(
                  "flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left group",
                  currentTheme === theme.id 
                    ? "bg-white/10 border-neon-cyan shadow-[0_0_15px_rgba(6,182,212,0.1)]" 
                    : "bg-white/5 border-transparent hover:border-white/20"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {theme.colors.map((c, i) => {
                      // Apply customization to preview if active
                      let colorToUse = c;
                      if (currentTheme === theme.id && profile?.themeCustomizations?.[theme.id]) {
                        if (i === 0) colorToUse = profile.themeCustomizations[theme.id].primary;
                        if (i === 1) colorToUse = profile.themeCustomizations[theme.id].accent;
                      }
                      
                      return (
                        <div 
                          key={i} 
                          className="w-4 h-4 rounded-full border border-slate-900" 
                          style={{ backgroundColor: colorToUse }}
                        />
                      );
                    })}
                  </div>
                  <span className={cn(
                    "font-bold text-sm",
                    currentTheme === theme.id ? "text-white" : "text-slate-400"
                  )}>
                    {theme.name}
                  </span>
                </div>
                {currentTheme === theme.id && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-5 h-5 rounded-full bg-neon-cyan flex items-center justify-center"
                  >
                    <Check size={12} className="text-slate-950 font-bold" />
                  </motion.div>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
