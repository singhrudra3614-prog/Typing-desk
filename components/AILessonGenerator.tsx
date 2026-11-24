'use client';

import React, { useState } from 'react';
import { Sparkles, Brain, Loader2, ArrowRight, Target, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/hooks/use-auth';
import { GlowButton } from './ui/shared';

interface LessonData {
  lessonTitle: string;
  focusArea: string;
  words: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export default function AILessonGenerator({ onStartLesson }: { onStartLesson: (words: string[]) => void }) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [lesson, setLesson] = useState<LessonData | null>(null);

  const generateLesson = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const res = await fetch('/api/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });

      if (!res.ok) throw new Error('Failed to generate lesson');
      
      const data = await res.json();
      setLesson(data);
    } catch (error) {
      console.error('Lesson generation error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-glass rounded-[2.5rem] p-10 border border-white/10 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
        <Brain size={120} className="text-neon-cyan" />
      </div>

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-neon-cyan/20 flex items-center justify-center text-neon-cyan border border-neon-cyan/30">
            <Sparkles size={24} />
          </div>
          <div>
            <h3 className="text-2xl font-display font-black text-white tracking-tight">AI TRAINING LAB</h3>
            <p className="text-[10px] text-neon-cyan font-black uppercase tracking-[0.2em]">Personalized Skill Enhancement</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!lesson ? (
            <motion.div 
              key="intro"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-md font-medium">
                Our neuro-net analyzes your recent combat performance to identify structural weaknesses in your muscle memory.
              </p>
              
              <div className="flex flex-wrap gap-4 mb-10">
                <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl flex items-center gap-2">
                  <Target size={14} className="text-neon-pink" />
                  <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Target Errors</span>
                </div>
                <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl flex items-center gap-2">
                  <Zap size={14} className="text-neon-cyan" />
                  <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Optimized Bigrams</span>
                </div>
              </div>

              <GlowButton 
                onClick={generateLesson} 
                disabled={loading}
                className="w-full md:w-auto"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="animate-spin" size={18} />
                    INITIALIZING BRAINSCAN...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    CALIBRATE CUSTOM DRILL
                    <ArrowRight size={18} />
                  </div>
                )}
              </GlowButton>
            </motion.div>
          ) : (
            <motion.div 
              key="lesson"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="text-lg font-display font-black text-white uppercase">{lesson.lessonTitle}</h4>
                    <p className="text-[10px] text-neon-pink font-bold uppercase tracking-widest">{lesson.focusArea}</p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                    lesson.difficulty === 'advanced' ? 'border-neon-pink text-neon-pink' : 
                    lesson.difficulty === 'intermediate' ? 'border-neon-cyan text-neon-cyan' : 
                    'border-green-500 text-green-500'
                  }`}>
                    {lesson.difficulty}
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {lesson.words.slice(0, 8).map((word, i) => (
                    <span key={i} className="px-2 py-1 bg-white/5 rounded-lg text-xs font-mono text-slate-400">
                      {word}
                    </span>
                  ))}
                  <span className="text-xs text-slate-600 self-center">+{lesson.words.length - 8} more...</span>
                </div>
              </div>

              <div className="flex gap-4">
                <GlowButton 
                  onClick={() => onStartLesson(lesson.words)}
                  className="flex-1"
                >
                   BEGIN TRAINING
                </GlowButton>
                <button 
                  onClick={() => setLesson(null)}
                  className="px-6 rounded-2xl bg-white/5 border border-white/10 text-slate-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest"
                >
                  RE-CALIBRATE
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
