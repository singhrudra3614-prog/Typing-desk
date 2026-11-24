'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { GlowButton } from './ui/shared';

export default function AICoach() {
  const { profile } = useAuth();
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generateFeedback = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });

      if (!res.ok) throw new Error('Failed to fetch from coach API');
      
      const data = await res.json();
      if (data.text) {
        setReport(data.text);
      } else {
        throw new Error('No text returned from coach API');
      }
    } catch (error) {
      console.error('Coaching error:', error);
      setReport("The matrix is currently offline. Keep training, Recruit!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-glass rounded-3xl p-8 border border-neon-purple/20 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-10 text-neon-purple">
        <Brain size={120} strokeWidth={1} />
      </div>

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-neon-purple/20 flex items-center justify-center text-neon-purple border border-neon-purple/30">
            <Brain size={20} />
          </div>
          <div>
            <h3 className="text-xl font-display font-bold">AI TACTICAL COACH</h3>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-black">Powered by Neural-Z</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {report ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-8"
            >
              <div className="bg-neon-purple/5 border-l-4 border-neon-purple p-4 rounded-r-xl italic text-slate-300 leading-relaxed">
                &quot;{report.trim()}&quot;
              </div>
              <button 
                onClick={() => setReport(null)}
                className="mt-4 text-xs text-neon-purple hover:text-white transition-colors flex items-center gap-1 font-bold uppercase tracking-widest"
              >
                Get Fresh Intel <ArrowRight size={12} />
              </button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-8"
            >
              <p className="text-slate-400 text-sm mb-6">
                Ready for a tactical analysis of your current performance? Neural-Z will scan your session data and optimize your training path.
              </p>
              <GlowButton 
                variant="purple" 
                size="md" 
                onClick={generateFeedback}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Analyzing Data...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Initialize Analysis
                  </>
                )}
              </GlowButton>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Coach Sentiment</p>
            <p className="text-sm font-bold text-neon-green">AGGRESSIVE GROWTH</p>
          </div>
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Next Goal</p>
            <p className="text-sm font-bold text-neon-cyan">LEVEL { (profile?.level || 1) + 1 }</p>
          </div>
        </div>
      </div>
    </div>
  );
}
