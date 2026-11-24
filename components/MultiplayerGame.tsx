'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Skull, Rocket, Target, Zap, Trophy, Shield, Flame, Users, Sword } from 'lucide-react';
import { getSeededRandomWord } from '@/lib/words';
import { useAuth } from '@/hooks/use-auth';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import confetti from 'canvas-confetti';
import { sfx } from '@/lib/sounds';
import throttle from 'lodash.throttle';

interface Entity {
  id: string;
  word: string;
  typed: string;
  x: number;
  y: number;
  speed: number;
  type: 'enemy' | 'boss';
  color: string;
}

interface MatchState {
  matchId: string;
  status: 'active' | 'finished' | 'starting';
  player1: any;
  player2: any;
  wordSeed: number;
  winner?: string;
}

export default function MultiplayerGame({ 
  matchId, 
  isPlayer1,
  onGameEnd 
}: { 
  matchId: string, 
  isPlayer1: boolean,
  onGameEnd: () => void 
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { user, profile } = useAuth();
  
  const currentTheme = profile?.activeTheme || 'cyberpunk';
  const customizations = profile?.themeCustomizations?.[currentTheme];

  const getThemeColor = useCallback((defaultColor: string) => {
    if (!customizations) return defaultColor;
    if (defaultColor === '#06b6d4') return customizations.primary;
    if (defaultColor === '#ec4899') return customizations.accent;
    return defaultColor;
  }, [customizations]);
  
  const [match, setMatch] = useState<MatchState | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [score, setScore] = useState(0);
  const [wpm, setWpm] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [combo, setCombo] = useState(0);
  const [totalKeystrokes, setTotalKeystrokes] = useState(0);
  const [correctKeystrokes, setCorrectKeystrokes] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [spawnCount, setSpawnCount] = useState(0);

  const stateRef = useRef({ 
    score, wpm, accuracy, entities, isGameOver, startTime, combo, correctKeystrokes, totalKeystrokes, spawnCount 
  });

  useEffect(() => {
    stateRef.current = { 
      score, wpm, accuracy, entities, isGameOver, startTime, combo, correctKeystrokes, totalKeystrokes, spawnCount 
    };
  }, [score, wpm, accuracy, entities, isGameOver, startTime, combo, correctKeystrokes, totalKeystrokes, spawnCount]);

  // Sync with Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'matches', matchId), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data() as MatchState;
      setMatch(data);
      if (data.status === 'finished') {
        setIsGameOver(true);
      }
    });

    return () => unsubscribe();
  }, [matchId]);

  // Throttled stat update to peer
  const syncStats = useMemo(() => throttle(async (stats: any) => {
    if (!user) return;
    try {
      const field = isPlayer1 ? 'player1' : 'player2';
      await updateDoc(doc(db, 'matches', matchId), {
        [`${field}.wpm`]: stats.wpm,
        [`${field}.accuracy`]: stats.accuracy,
        [`${field}.score`]: stats.score,
        [`${field}.lastUpdate`]: new Date().toISOString()
      });
    } catch (err) {
      console.error("Sync error", err);
    }
  }, 300), [matchId, isPlayer1, user]);

  // Spawning logic (Shared Seed)
  const spawnEntity = useCallback(() => {
    if (stateRef.current.isGameOver || !match) return;
    
    // Use wordSeed + spawnCount for unique but synchronized words
    const seed = match.wordSeed + stateRef.current.spawnCount;
    const word = getSeededRandomWord('intermediate', seed);
    
    const newEntity: Entity = {
      id: `spawn-${stateRef.current.spawnCount}`,
      word,
      typed: '',
      x: (Math.sin(seed) * 0.4 + 0.5) * (canvasRef.current?.width || 800) * 0.8 + 50,
      y: -50,
      speed: 1.0 + (stateRef.current.spawnCount * 0.05),
      type: 'enemy',
      color: isPlayer1 ? getThemeColor('#06b6d4') : getThemeColor('#ec4899'),
    };

    setEntities(prev => [...prev, newEntity]);
    setSpawnCount(prev => prev + 1);
  }, [match, isPlayer1, getThemeColor]);

  const handleGameOver = useCallback(async () => {
    if (stateRef.current.isGameOver) return;
    setIsGameOver(true);
    sfx.playGameOver();
    
    // Check winner
    const peer = isPlayer1 ? match?.player2 : match?.player1;
    let winnerId = user?.uid;
    if (peer && peer.score > stateRef.current.score) {
      winnerId = peer.uid;
    }

    try {
      await updateDoc(doc(db, 'matches', matchId), {
        status: 'finished',
        winner: winnerId
      });
    } catch (err) {
      console.error(err);
    }
  }, [match, isPlayer1, user, matchId]);

  // Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (!stateRef.current.isGameOver) {
        setEntities(prev => {
          let gameOverTriggered = false;
          const updatedEntities = prev.map(e => ({
            ...e,
            y: e.y + e.speed
          })).filter(e => {
            if (e.y > canvas.height) {
              gameOverTriggered = true;
              return false;
            }
            return true;
          });

          if (gameOverTriggered) {
             handleGameOver();
             return [];
          }
          return updatedEntities;
        });
      }

      // Draw My Entities
      stateRef.current.entities.forEach(entity => {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        const textWidth = ctx.measureText(entity.word).width;
        ctx.roundRect(entity.x - textWidth/2 - 15, entity.y - 25, textWidth + 30, 40, 12);
        ctx.fill();
        ctx.strokeStyle = (isPlayer1 ? getThemeColor('#06b6d4') : getThemeColor('#ec4899')) + '55';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = 'bold 22px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';

        ctx.fillStyle = isPlayer1 ? getThemeColor('#06b6d4') : getThemeColor('#ec4899');
        ctx.fillText(entity.typed, entity.x - ctx.measureText(entity.word.slice(entity.typed.length)).width / 2, entity.y);
        
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(entity.word.slice(entity.typed.length), entity.x + ctx.measureText(entity.typed).width / 2, entity.y);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    const spawnInterval = setInterval(spawnEntity, 2000);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(spawnInterval);
    };
  }, [spawnEntity, isPlayer1, handleGameOver, getThemeColor]);

  // Keyboard Input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (stateRef.current.isGameOver) return;
      if (e.key.length !== 1) return;

      const key = e.key;
      let matched = false;
      let wordFinished = false;
      let wordObj: any = null;

      const newEntities = stateRef.current.entities.map(entity => {
        if (!matched && entity.word.startsWith(entity.typed + key)) {
          matched = true;
          const updatedTyped = entity.typed + key;
          
          if (updatedTyped === entity.word) {
            wordFinished = true;
            wordObj = entity;
            return null;
          }
          return { ...entity, typed: updatedTyped };
        }
        return entity;
      }).filter(Boolean) as Entity[];

      setTotalKeystrokes(prev => prev + 1);
      
      if (matched) {
        setCorrectKeystrokes(prev => prev + 1);
        setEntities(newEntities);
        sfx.playCorrect();
        
        if (wordFinished) {
          const multiplier = 1 + Math.floor(stateRef.current.combo / 10) * 0.5;
          const wordScore = Math.round(wordObj.word.length * 10 * multiplier);
          setScore(prev => prev + wordScore);
          setCombo(prev => prev + 1);
          confetti({
            particleCount: 15,
            spread: 40,
            origin: { x: wordObj.x / 1000, y: wordObj.y / 600 },
            colors: [isPlayer1 ? getThemeColor('#06b6d4') : getThemeColor('#ec4899'), '#ffffff']
          });
        }
      } else {
        setCombo(0);
        sfx.playError();
      }

      if (!startTime) setStartTime(Date.now());
      
      // Calculate WPM & Acc
      if (stateRef.current.startTime) {
        const elapsed = (Date.now() - stateRef.current.startTime) / 60000;
        const newWpm = Math.round((stateRef.current.correctKeystrokes / 5) / (elapsed || 0.1));
        const newAcc = Math.round((stateRef.current.correctKeystrokes / (stateRef.current.totalKeystrokes + 1)) * 100);
        setWpm(newWpm);
        setAccuracy(newAcc);
        
        syncStats({ wpm: newWpm, accuracy: newAcc, score: stateRef.current.score });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [matchId, isPlayer1, startTime, syncStats, getThemeColor]);

  const opponent = isPlayer1 ? match?.player2 : match?.player1;
  const winner = match?.winner === user?.uid ? 'YOU' : 'OPPONENT';

  // Calculate relative lead for the progress bar
  const totalScore = score + (opponent?.score || 0);
  const myLeadPercentage = totalScore > 0 ? (score / totalScore) * 100 : 50;
  const scoreDiff = score - (opponent?.score || 0);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative bg-slate-950/90 rounded-3xl border-2 border-white/5" ref={containerRef}>
      {/* Real-time Duel HUD */}
      <div className="absolute top-0 inset-x-0 p-8 flex flex-col gap-6 pointer-events-none z-30">
        <div className="flex justify-between items-start">
          {/* You */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 bg-neon-cyan/10 border border-neon-cyan/30 px-4 py-2 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-neon-cyan/20 flex items-center justify-center">
                  <Users size={16} className="text-neon-cyan" />
              </div>
              <div>
                  <p className="text-[10px] text-neon-cyan font-black uppercase tracking-widest leading-none">YOU</p>
                  <p className="text-sm font-bold text-white">{wpm} WPM | {accuracy}%</p>
              </div>
            </div>
            <div className="text-left px-1">
              <p className="text-2xl font-display font-black text-white text-glow-cyan leading-none">{score.toLocaleString()}</p>
              {scoreDiff > 0 && (
                <p className="text-[10px] text-neon-cyan font-bold uppercase tracking-tight">+{scoreDiff.toLocaleString()} Lead</p>
              )}
            </div>
          </div>

          {/* VS Center Icon */}
          <div className="relative mt-2">
            <div className="w-12 h-12 rounded-full border-2 border-white/20 flex items-center justify-center bg-slate-950 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                <Sword className="text-white/40" size={18} />
            </div>
            {combo > 1 && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                <motion.p
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  key={combo}
                  className="text-neon-pink font-display font-black text-xl italic tracking-tighter"
                >
                  {combo} COMBO
                </motion.p>
                {combo >= 10 && (
                  <motion.p
                    initial={{ y: 5, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-neon-cyan font-black text-[10px] uppercase tracking-widest"
                  >
                    {(1 + Math.floor(combo / 10) * 0.5).toFixed(1)}x MULTIPLIER
                  </motion.p>
                )}
              </div>
            )}
          </div>

          {/* Opponent */}
          <div className="flex flex-col gap-2 items-end">
            <div className="flex items-center gap-3 bg-neon-pink/10 border border-neon-pink/30 px-4 py-2 rounded-xl text-right">
              <div>
                  <p className="text-[10px] text-neon-pink font-black uppercase tracking-widest leading-none">OPPONENT</p>
                  <p className="text-sm font-bold text-white">{opponent?.wpm || 0} WPM | {opponent?.accuracy || 100}%</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-neon-pink/20 flex items-center justify-center">
                  <Users size={16} className="text-neon-pink" />
              </div>
            </div>
            <div className="text-right px-1">
              <p className="text-2xl font-display font-black text-white text-glow-pink leading-none">{(opponent?.score || 0).toLocaleString()}</p>
              {scoreDiff < 0 && (
                <p className="text-[10px] text-neon-pink font-bold uppercase tracking-tight">+{Math.abs(scoreDiff).toLocaleString()} Lead</p>
              )}
            </div>
          </div>
        </div>

        {/* Tug-of-war Style Leaderboard Bar */}
        <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/10 relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-0.5 h-full bg-white/20 z-10" />
          </div>
          <motion.div 
            animate={{ width: `${myLeadPercentage}%` }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className="h-full bg-gradient-to-r from-neon-cyan/50 to-neon-cyan shadow-[0_0_15px_#06b6d4]" 
          />
          <div className="absolute inset-y-0 right-0 left-0 flex flex-row-reverse">
             <motion.div 
               animate={{ width: `${100 - myLeadPercentage}%` }}
               transition={{ type: 'spring', damping: 20, stiffness: 100 }}
               className="h-full bg-gradient-to-l from-neon-pink/50 to-neon-pink shadow-[0_0_15px_#ec4899]" 
             />
          </div>
          
          {/* Milestone markers */}
          <div className="absolute inset-0 flex justify-between px-2 items-center pointer-events-none opacity-30">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="w-px h-1 bg-white" />
            ))}
          </div>
        </div>
      </div>

      <canvas 
        ref={canvasRef} 
        width={1000} 
        height={600} 
        className="max-w-full max-h-full object-contain relative z-10"
      />

      <AnimatePresence>
        {isGameOver && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-8 text-center"
          >
            <motion.div
               initial={{ scale: 0.9, y: 20 }}
               animate={{ scale: 1, y: 0 }}
               className="bg-glass border-2 border-white/10 p-12 rounded-[3rem] max-w-lg w-full"
            >
               <div className="flex justify-center mb-6">
                  {match?.winner === user?.uid ? (
                    <Trophy className="text-neon-cyan drop-shadow-[0_0_15px_rgba(6,182,212,0.5)]" size={80} />
                  ) : (
                    <Skull className="text-slate-600" size={80} />
                  )}
               </div>
               <h2 className="text-6xl font-display font-black text-white italic tracking-tighter mb-2">
                 {match?.winner === user?.uid ? 'VICTORY' : 'DEFEAT'}
               </h2>
               <p className="text-slate-400 uppercase tracking-[0.4em] font-bold text-xs mb-8">Duel Concluded</p>
               
               <div className="grid grid-cols-2 gap-4 mb-10">
                  <div className="bg-white/5 p-4 rounded-2xl">
                     <p className="text-[10px] text-slate-500 font-bold mb-1">YOUR SCORE</p>
                     <p className="text-2xl font-black text-neon-cyan">{score}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl">
                     <p className="text-[10px] text-slate-500 font-bold mb-1">OPPONENT</p>
                     <p className="text-2xl font-black text-neon-pink">{opponent?.score || 0}</p>
                  </div>
               </div>

               <button 
                 onClick={onGameEnd}
                 className="w-full bg-white/10 hover:bg-white/20 text-white font-display font-black py-5 rounded-2xl transition-all uppercase tracking-widest border border-white/10"
               >
                 RETURN TO LOBBY
               </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
