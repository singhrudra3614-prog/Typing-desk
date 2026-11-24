'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Skull, Rocket, Target, Zap, Trophy, Shield, Flame, ClipboardList, X } from 'lucide-react';
import { getRandomWord, GAME_WORDS } from '@/lib/words';
import { useAuth } from '@/hooks/use-auth';
import { useSiteConfig } from '@/hooks/use-site-config';
import { AdSlot } from '@/components/AdSlot';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import { doc, collection, addDoc, updateDoc, increment, setDoc, getDocs, query, where, limit } from 'firebase/firestore';
import confetti from 'canvas-confetti';
import { sfx } from '@/lib/sounds';

interface Entity {
  id: string;
  word: string;
  typed: string;
  x: number;
  y: number;
  speed: number;
  type: 'enemy' | 'boss';
  color: string;
  spawnProgress?: number;
}

interface VisualFeedback {
  id: string;
  x: number;
  y: number;
  char: string;
  color: string;
  life: number;
  vx?: number;
  vy?: number;
  scale?: number;
  isCorrect?: boolean;
  angle?: number;
}

interface WordBurstParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
}

interface WordBurst {
  id: string;
  word: string;
  x: number;
  y: number;
  color: string;
  life: number;
  particles: WordBurstParticle[];
}

interface GameState {
  score: number;
  wpm: number;
  accuracy: number;
  entities: Entity[];
  isGameOver: boolean;
  combo: number;
  totalKeystrokes: number;
  correctKeystrokes: number;
  level: number;
  startTime: number | null;
  isPaused: boolean;
  timeLeft: number | null;
  objectiveFailed: boolean;
  sessionMissedKeys: Record<string, number>;
  feedbacks: VisualFeedback[];
  bursts: WordBurst[];
}

const GAME_CONFIGS: Record<string, { 
  color: string, 
  spawnRate: number, 
  speedBase: number, 
  duration?: number, 
  targetAccuracy?: number,
  reward?: { coins: number, badge: string, xpBonus: number }
}> = {
  zombie: { color: '#06b6d4', spawnRate: 3000, speedBase: 0.5 },
  space: { color: '#ec4899', spawnRate: 2000, speedBase: 0.8 },
  car: { color: '#22c55e', spawnRate: 1500, speedBase: 1.2 },
  ninja: { color: '#a855f7', spawnRate: 1000, speedBase: 1.5 },
  coding: { color: '#06b6d4', spawnRate: 3000, speedBase: 0.4 },
  survival: { color: '#ec4899', spawnRate: 2500, speedBase: 0.6 },
  'timed-rush': { 
    color: '#f59e0b', 
    spawnRate: 1500, 
    speedBase: 1.0, 
    duration: 60,
    reward: { coins: 50, badge: 'Speed Demon', xpBonus: 500 }
  },
  'accuracy-gauntlet': { 
    color: '#10b981', 
    spawnRate: 2000, 
    speedBase: 0.7, 
    duration: 300, 
    targetAccuracy: 99,
    reward: { coins: 150, badge: 'Perfect Striker', xpBonus: 1000 }
  },
  'syntax-master': { 
    color: '#3b82f6', 
    spawnRate: 2500, 
    speedBase: 0.5, 
    duration: 120,
    reward: { coins: 100, badge: 'Compiler King', xpBonus: 750 }
  },
  practice: { 
    color: '#a855f7', 
    spawnRate: 3200, 
    speedBase: 0.4 
  },
};

export const PRACTICE_THEMES: Record<string, { name: string, desc: string, icon: any, words: string[] }> = {
  beginner: {
    name: 'Beginner Warmup',
    desc: 'Short 3-4 letter words to establish muscle memory and focus on fluid keystrokes.',
    icon: Shield,
    words: GAME_WORDS.beginner
  },
  intermediate: {
    name: 'Rhythmic Flow',
    desc: '5-7 letter everyday words ideal for developing a consistent, steady pace.',
    icon: Flame,
    words: GAME_WORDS.intermediate
  },
  advanced: {
    name: 'Advanced Mastery',
    desc: 'Long 8+ letter complex words that check precision and hand-to-ear speed.',
    icon: Target,
    words: GAME_WORDS.advanced
  },
  coding: {
    name: 'Syntax & Coding',
    desc: 'Standard programming syntax, conditional brackets, and modern framework names.',
    icon: Zap,
    words: GAME_WORDS.coding
  },
  space: {
    name: 'Cosmic Exploration',
    desc: 'Celestial bodies, physics theories, quantum forces, and galaxy clusters.',
    icon: Rocket,
    words: [
      "quantum", "nebula", "asteroid", "cosmic", "supernova", "pulsar", "galaxy", "orbit", 
      "spacecraft", "astronaut", "cosmos", "alien", "stardust", "gravity", "eclipse", "constellation"
    ]
  },
  battle: {
    name: 'Warrior Combat',
    desc: 'Martial arts, razor-sharp steel blades, adrenaline triggers, and epic duals.',
    icon: Skull,
    words: [
      "shadow", "dragon", "scroll", "katana", "reflex", "stealth", "execute", "lightning", 
      "strike", "battle", "warrior", "blade", "shield", "victory", "triumph", "samurai"
    ]
  },
  custom: {
    name: 'Custom Word List',
    desc: 'Configure, paste, or test your own customized practice list for target repetition.',
    icon: ClipboardList,
    words: []
  }
};

type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export default function CanvasGame({ 
  mode, 
  difficulty: baseDifficulty, 
  customWords,
  onGameEnd 
}: { 
  mode: string, 
  difficulty: Difficulty,
  customWords?: string[],
  onGameEnd: () => void 
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { user, profile, getIdToken, refreshDbUser } = useAuth();
  const { wordPacks } = useSiteConfig();
  
  const currentTheme = profile?.activeTheme || 'cyberpunk';
  const customizations = profile?.themeCustomizations?.[currentTheme];

  const getThemeColor = useCallback((defaultColor: string) => {
    if (!customizations) return defaultColor;
    if (defaultColor === '#06b6d4') return customizations.primary;
    if (defaultColor === '#ec4899') return customizations.accent;
    return defaultColor;
  }, [customizations]);
  
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    wpm: 0,
    accuracy: 100,
    entities: [],
    isGameOver: false,
    combo: 0,
    totalKeystrokes: 0,
    correctKeystrokes: 0,
    level: 1,
    startTime: null,
    isPaused: false,
    timeLeft: null,
    objectiveFailed: false,
    sessionMissedKeys: {},
    feedbacks: [],
    bursts: [],
  });

  const stateRef = useRef(gameState);
  
  const [practiceTheme, setPracticeTheme] = useState<string>('beginner');
  const [practiceSpeed, setPracticeSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');
  const [sessionWords, setSessionWords] = useState<string[] | undefined>(
    mode === 'practice' ? GAME_WORDS.beginner : customWords
  );
  const [isCustomWordsOpen, setIsCustomWordsOpen] = useState(false);
  const [inputText, setInputText] = useState(customWords ? customWords.join(', ') : '');

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  // Configuration based on mode
  const config = GAME_CONFIGS[mode] || GAME_CONFIGS.zombie;

  // Calculate spawn rate based on levels
  const levelFactor = Math.max(0.5, 1 - (gameState.level - 1) * 0.05);
  const accountFactor = Math.max(0.8, 1 - ((profile?.level || 1) - 1) * 0.005);
  const currentSpawnRate = mode === 'practice'
    ? (practiceSpeed === 'slow' ? 4500 : practiceSpeed === 'medium' ? 3200 : 1800)
    : Math.max(500, config.spawnRate * levelFactor * accountFactor);

  const togglePause = useCallback(() => {
    setGameState(prev => ({ ...prev, isPaused: !prev.isPaused }));
  }, []);

  // Spawning logic
  const spawnEntity = useCallback(() => {
    if (stateRef.current.isGameOver || stateRef.current.isPaused) return;
    if (mode === 'practice' && !stateRef.current.startTime) return;
    
    const getDifficultyForWord = () => {
      if (mode === 'practice') return practiceTheme;
      if (mode === 'coding' || mode === 'syntax-master') return 'coding';
      if (mode === 'timed-rush') return 'rush';
      if (mode === 'accuracy-gauntlet') return 'gauntlet';
      
      const difficultyMap: Record<Difficulty, number> = {
        beginner: 1,
        intermediate: 2,
        advanced: 3,
        expert: 4
      };
      
      const sessionLevel = stateRef.current.level;
      const accountLevel = profile?.level || 1;
      const baseLevelIdx = difficultyMap[baseDifficulty];
      
      // Account level contribution: 1 tier up every 20 levels
      const accountBonus = Math.floor(accountLevel / 20);
      
      // Session level contribution: 1 tier up every 4 session levels
      const sessionBonus = Math.floor(sessionLevel / 4);
      
      // Performance-based offset
      const performanceOffset = stateRef.current.accuracy > 95 ? 1 : stateRef.current.accuracy < 80 ? -1 : 0;
      
      const effectiveLevel = baseLevelIdx + accountBonus + sessionBonus + performanceOffset;
      
      if (effectiveLevel <= 1) return 'beginner';
      if (effectiveLevel === 2) return 'intermediate';
      if (effectiveLevel === 3) return 'advanced';
      return 'expert';
    };
    
    const wordDifficulty = getDifficultyForWord();
    
    let word = '';
    if (sessionWords && sessionWords.length > 0) {
      word = sessionWords[Math.floor(Math.random() * sessionWords.length)];
    } else {
      word = getRandomWord(wordDifficulty as any);
    }
    
    let finalSpeed = 0.5;
    if (mode === 'practice') {
      const practiceSpeedMultiplier = practiceSpeed === 'slow' ? 0.35 : practiceSpeed === 'medium' ? 0.7 : 1.2;
      finalSpeed = config.speedBase * practiceSpeedMultiplier;
    } else {
      // Speed adjustments
      const speedDifficultyMultiplier: Record<Difficulty, number> = {
        beginner: 0.8,
        intermediate: 1.0,
        advanced: 1.3,
        expert: 1.6
      };
      
      const baseSpeed = config.speedBase * speedDifficultyMultiplier[baseDifficulty];
      // Dynamic speed: scale with level AND accuracy performance AND account level
      const sessionLevelBonus = (stateRef.current.level - 1) * 0.08; // 8% per session level
      const accountLevelBonus = (profile?.level || 1) * 0.01; // 1% per account level
      const performanceBoost = Math.max(0, (stateRef.current.accuracy - 90) / 100); 
      
      finalSpeed = baseSpeed * (1 + sessionLevelBonus + accountLevelBonus + performanceBoost);
    }

    const newEntity: Entity = {
      id: Math.random().toString(36).substr(2, 9),
      word: word,
      typed: '',
      x: Math.random() * (canvasRef.current?.width || 800) * 0.8 + 50,
      y: -50,
      speed: finalSpeed,
      type: 'enemy',
      color: getThemeColor(config.color),
      spawnProgress: 0,
    };

    setGameState(prev => ({
      ...prev,
      entities: [...prev.entities, newEntity]
    }));
  }, [mode, config.speedBase, config.color, baseDifficulty, getThemeColor, sessionWords, profile?.level, practiceSpeed, practiceTheme]);

  // Main Game Loop and Timer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let timerInterval: NodeJS.Timeout;

    if (config.duration && stateRef.current.startTime && !stateRef.current.isPaused && !stateRef.current.isGameOver) {
      timerInterval = setInterval(() => {
        setGameState(prev => {
          const newTime = Math.max(0, (prev.timeLeft ?? config.duration!) - 1);
          if (newTime === 0) {
            sfx.playGameOver();
            return { ...prev, timeLeft: 0, isGameOver: true };
          }
          return { ...prev, timeLeft: newTime };
        });
      }, 1000);
    }

    const render = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Single consolidated State Update for simulation step
      if (!stateRef.current.isGameOver && !stateRef.current.isPaused) {
        if (mode === 'practice' && !stateRef.current.startTime) return;
        setGameState(prev => {
          let gameOverTriggered = false;
          const updatedEntities = prev.entities.map(e => {
            let nextProgress = e.spawnProgress !== undefined ? e.spawnProgress : 0;
            if (e.y >= -20 && nextProgress < 1.0) {
              nextProgress = Math.min(1.0, nextProgress + 0.05);
            }
            return {
              ...e,
              y: e.y + e.speed,
              spawnProgress: nextProgress
            };
          }).filter(e => {
            if (e.y > canvas.height) {
              if (mode !== 'practice') {
                gameOverTriggered = true;
              }
              return false;
            }
            return true;
          });

          const updatedFeedbacks = prev.feedbacks.map(f => {
            const vy = f.isCorrect ? (f.vy ?? -1.2) : ((f.vy ?? -2.5) + 0.15);
            return { 
              ...f, 
              life: f.life - (f.isCorrect ? 0.04 : 0.05),
              x: f.x + (f.vx ?? 0),
              y: f.y + vy,
              vy,
              scale: f.isCorrect 
                ? Math.min(1.4, (f.scale ?? 0.8) + 0.02)
                : Math.max(0.6, (f.scale ?? 1.2) - 0.02),
              angle: f.angle !== undefined ? f.angle + (f.vx ?? 0) * 0.01 : 0
            };
          }).filter(f => f.life > 0);

          const updatedBursts = (prev.bursts || []).map(b => {
            const nextLife = b.life - 0.04; // Slightly slower decay (25 frames) for satisfying presence
            const nextParticles = b.particles.map(p => ({
              ...p,
              x: p.x + p.vx,
              y: p.y + p.vy,
              vx: p.vx * 0.94, // friction
              vy: p.vy * 0.94,
              alpha: Math.max(0, p.alpha - 0.04)
            })).filter(p => p.alpha > 0);

            return {
              ...b,
              life: nextLife,
              particles: nextParticles
            };
          }).filter(b => b.life > 0 || b.particles.length > 0);

          if (gameOverTriggered) {
             sfx.playGameOver();
             return { ...prev, entities: [], feedbacks: [], bursts: [], isGameOver: true };
          }
          return { 
            ...prev, 
            entities: updatedEntities, 
            feedbacks: updatedFeedbacks, 
            bursts: updatedBursts 
          };
        });
      }

      // Draw Entities
      stateRef.current.entities.forEach(entity => {
        const spawnProg = entity.spawnProgress !== undefined ? entity.spawnProgress : 1.0;
        
        ctx.save();
        
        // Ghosting effect: words become slightly more transparent as they approach the bottom
        let opacity = Math.max(0.3, 1 - (entity.y / canvas.height) * 0.7);
        // Multiply by spawn animation opacity (fade in)
        opacity = opacity * spawnProg;
        ctx.globalAlpha = opacity;

        // Visual transformation at the word coordinates
        ctx.translate(entity.x, entity.y);
        
        // Scale animation: slide-up & scale-up beautifully
        const scale = 0.75 + 0.25 * spawnProg;
        ctx.scale(scale, scale);
        
        // Offset slide-in: if spawning, slide down gently from slightly above (-15 pixels)
        const slideY = -15 * (1 - spawnProg);
        ctx.translate(0, slideY);

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        const textWidth = ctx.measureText(entity.word).width;
        ctx.roundRect(-textWidth/2 - 10, -25, textWidth + 20, 35, 8);
        ctx.fill();
        ctx.strokeStyle = entity.color + '44';
        ctx.stroke();

        ctx.font = '20px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';

        // Ghostly offset (very subtle trailing effect)
        ctx.fillStyle = entity.color + '22';
        ctx.fillText(entity.word, 1, 1);

        // Typed part
        ctx.fillStyle = entity.color;
        ctx.fillText(entity.typed, - ctx.measureText(entity.word.slice(entity.typed.length)).width / 2, 0);
        
        // Untyped part
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText(entity.word.slice(entity.typed.length), ctx.measureText(entity.typed).width / 2, 0);

        ctx.restore();
      });

      // Draw Feedbacks
      stateRef.current.feedbacks.forEach(f => {
        ctx.save();
        ctx.globalAlpha = f.life;
        
        ctx.translate(f.x, f.y);
        if (f.angle) {
          ctx.rotate(f.angle);
        }
        const currentScale = f.scale ?? 1.0;
        ctx.scale(currentScale, currentScale);
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        if (f.isCorrect) {
          // Bloom feedback circle underneath green correct letter
          ctx.beginPath();
          ctx.arc(0, 0, 13, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.45)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.font = 'bold 15px "JetBrains Mono", monospace';
          ctx.fillStyle = '#22c55e';
          ctx.fillText(f.char, 0, 0);
          
          // Tiny subtle sparkle / offset star next to positive letter
          ctx.font = '10px sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.fillText('✦', 11, -11);
        } else {
          // Error warning bad key frame indicator
          ctx.beginPath();
          ctx.roundRect(-12, -12, 24, 24, 5);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.font = 'bold 14px "JetBrains Mono", monospace';
          ctx.fillStyle = '#ef4444';
          ctx.fillText(f.char, 0, 0);

          // Diagonal strike to show visual cancel/missed key feedback
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-7, -7);
          ctx.lineTo(7, 7);
          ctx.stroke();
        }
        
        ctx.restore();
      });

      // Draw Word Bursts (Flashes & Particle Sprays)
      (stateRef.current.bursts || []).forEach(b => {
        ctx.save();
        
        // 1. Draw glowing background bloom underneath
        const glowOpacity = Math.max(0, b.life * 0.45);
        ctx.globalAlpha = glowOpacity;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 25;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.font = 'bold 22px "JetBrains Mono", monospace';
        const textWidth = ctx.measureText(b.word).width;
        ctx.roundRect(b.x - textWidth/2 - 14, b.y - 28, textWidth + 28, 41, 10);
        ctx.fill();
        
        ctx.shadowBlur = 0; // reset shadow for performance
        
        // 2. Draw the word flashing bright white and scaling up
        const scale = 1.0 + (1.0 - b.life) * 0.28; // pop-scale burst
        ctx.globalAlpha = Math.max(0, b.life);
        ctx.translate(b.x, b.y);
        ctx.scale(scale, scale);
        
        ctx.font = 'bold 22px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Solid white radiant overlay + custom colored neon outline
        ctx.fillStyle = '#ffffff';
        ctx.fillText(b.word, 0, 0);
        
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2.0;
        ctx.strokeText(b.word, 0, 0);
        
        ctx.restore();

        // 3. Draw burst particles around the word
        b.particles.forEach(p => {
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
          
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const spawnInterval = setInterval(spawnEntity, currentSpawnRate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(spawnInterval);
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [spawnEntity, currentSpawnRate, config.color, config.duration, mode]);

  // Handle Input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle pause with 'P'
      if (e.key.toLowerCase() === 'p') {
        togglePause();
        return;
      }

      if (stateRef.current.isGameOver || stateRef.current.isPaused) return;
      if (e.key.length !== 1) return; // Skip non-chars

      const key = e.key;
      setGameState(prev => {
        let startTime = prev.startTime;
        if (!startTime) startTime = Date.now();

        const newState = { ...prev, startTime, totalKeystrokes: prev.totalKeystrokes + 1 };
        
        // Find match
        let foundMatch = false;
        let matchedCharX = 0;
        let matchedCharY = 0;

        const newEntities = prev.entities.map(entity => {
          if (!foundMatch && entity.word.startsWith(entity.typed + key)) {
            foundMatch = true;
            const updatedTyped = entity.typed + key;
            
            // Calculate feedback position
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx) {
              ctx.font = '20px "JetBrains Mono", monospace';
              const textWidth = ctx.measureText(entity.word).width;
              const typedWidth = ctx.measureText(entity.typed).width;
              matchedCharX = entity.x - textWidth/2 + typedWidth + ctx.measureText(key).width/2;
              matchedCharY = entity.y;
            } else {
              matchedCharX = entity.x;
              matchedCharY = entity.y;
            }

            if (updatedTyped === entity.word) {
              // Word Complete
              sfx.playCorrect();
              confetti({
                particleCount: 20,
                spread: 30,
                origin: { x: entity.x / (canvasRef.current?.width || 1), y: entity.y / (canvasRef.current?.height || 1) },
                colors: [config.color, '#ffffff']
              });
              
              const multiplier = 1 + Math.floor(newState.combo / 10) * 0.5;
              newState.score += Math.round(entity.word.length * 10 * newState.level * multiplier);
              newState.combo += 1;
              newState.correctKeystrokes += 1;
              
              if (newState.score >= newState.level * 1000) {
                newState.level += 1;
                sfx.playLevelUp();
              }

              // Create satisfying Word Burst particles reflecting outwards in 360 degrees
              const pCount = 14;
              const bParticles = [];
              for (let i = 0; i < pCount; i++) {
                const angle = (i / pCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
                const speed = 1.8 + Math.random() * 2.8;
                bParticles.push({
                  x: entity.x + (Math.random() - 0.5) * 30,
                  y: entity.y,
                  vx: Math.cos(angle) * speed,
                  vy: Math.sin(angle) * speed,
                  color: i % 2 === 0 ? entity.color : '#ffffff',
                  size: 2 + Math.random() * 2.5,
                  alpha: 1.0
                });
              }

              const newBurst: WordBurst = {
                id: Math.random().toString(36).substr(2, 9),
                word: entity.word,
                x: entity.x,
                y: entity.y,
                color: entity.color,
                life: 1.0,
                particles: bParticles
              };

              newState.bursts = [...(newState.bursts || prev.bursts || []), newBurst];
              
              return null; // Remove word
            }
            
            return { ...entity, typed: updatedTyped };
          }
          return entity;
        }).filter(Boolean) as Entity[];

        if (foundMatch) {
          newState.entities = newEntities;
          newState.correctKeystrokes += 1;
          sfx.playKeystroke(400 + (newState.combo * 5));
          
          // Add correct feedback
          newState.feedbacks = [
            ...prev.feedbacks,
            {
              id: Math.random().toString(36).substr(2, 9),
              x: matchedCharX,
              y: matchedCharY - 20,
              char: key,
              color: '#22c55e', // Bright green
              life: 1.0,
              vx: (Math.random() - 0.5) * 0.4,
              vy: -1.2,
              scale: 0.8,
              isCorrect: true,
              angle: 0
            }
          ];
        } else {
          newState.combo = 0;
          sfx.playError();
          
          // Track most common target keys that were missed
          const activeEntity = prev.entities.find(e => e.typed.length > 0);
          if (activeEntity) {
            const targetChar = activeEntity.word[activeEntity.typed.length].toLowerCase();
            
            // Add error feedback
            const ctx = canvasRef.current?.getContext('2d');
            let errorX = activeEntity.x;
            let errorY = activeEntity.y;
            if (ctx) {
              ctx.font = '20px "JetBrains Mono", monospace';
              const textWidth = ctx.measureText(activeEntity.word).width;
              const typedWidth = ctx.measureText(activeEntity.typed).width;
              errorX = activeEntity.x - textWidth/2 + typedWidth + ctx.measureText(targetChar).width/2;
            }

            newState.feedbacks = [
              ...prev.feedbacks,
              {
                id: Math.random().toString(36).substr(2, 9),
                x: errorX,
                y: errorY - 10,
                char: key,
                color: '#ef4444', // Bright red
                life: 1.0,
                vx: (Math.random() - 0.5) * 2,
                vy: -3.0,
                scale: 1.2,
                isCorrect: false,
                angle: (Math.random() - 0.5) * 0.5
              }
            ];

            if (/^[a-z0-9]$/i.test(targetChar)) {
              newState.sessionMissedKeys = {
                ...prev.sessionMissedKeys,
                [targetChar]: (prev.sessionMissedKeys[targetChar] || 0) + 1
              };
            }
          } else {
            // General error feedback at center if no word targeted
            newState.feedbacks = [
              ...prev.feedbacks,
              {
                id: Math.random().toString(36).substr(2, 9),
                x: (canvasRef.current?.width || 1000) / 2 + (Math.random() - 0.5) * 40,
                y: (canvasRef.current?.height || 600) / 2 + (Math.random() - 0.5) * 40,
                char: key,
                color: '#ef4444',
                life: 1.0,
                vx: (Math.random() - 0.5) * 3,
                vy: -2.5,
                scale: 1.3,
                isCorrect: false,
                angle: (Math.random() - 0.5) * 0.8
              }
            ];
          }
        }

        // Calculate WPM & Accuracy
        const elapsedMinutes = (Date.now() - startTime) / 60000;
        newState.wpm = Math.round((newState.correctKeystrokes / 5) / (elapsedMinutes || 1));
        newState.accuracy = Math.round((newState.correctKeystrokes / newState.totalKeystrokes) * 100);

        // Challenge objective logic
        if (config.targetAccuracy && newState.accuracy < config.targetAccuracy && newState.totalKeystrokes > 5) {
          newState.objectiveFailed = true;
          newState.isGameOver = true;
          sfx.playGameOver();
        }

        return newState;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [config.color, togglePause, config.targetAccuracy]);

  // Save results to Firebase when game ends
  useEffect(() => {
    if (stateRef.current.isGameOver && user) {
       const saveResults = async () => {
         if (mode === 'practice') return;
         const { score, wpm, accuracy, objectiveFailed } = stateRef.current;
         const isChallengeSuccess = config.duration && !objectiveFailed;
         
         const session = {
           userId: user.uid,
           gameMode: mode,
           wpm,
           accuracy,
           score,
           timestamp: new Date().toISOString(),
           success: !!isChallengeSuccess
         };

         try {
           await addDoc(collection(db, `users/${user.uid}/sessions`), session);
           
           // Update profile
           const userRef = doc(db, 'users', user.uid);
           let xpEarned = score / 10;
           let coinsEarned = Math.floor(score / 100);
           const updates: any = {
             totalWordsTyped: increment(stateRef.current.correctKeystrokes / 5),
             bestWpm: Math.max(profile?.bestWpm || 0, wpm),
             // Simple moving average for wpm/accuracy
             averageWpm: profile ? Math.round((profile.averageWpm + wpm) / 2) : wpm,
             averageAccuracy: profile ? Math.round((profile.averageAccuracy + accuracy) / 2) : accuracy,
           };

           // Apply Challenge Rewards
           if (isChallengeSuccess && config.reward) {
             xpEarned += config.reward.xpBonus;
             coinsEarned += config.reward.coins;
             
             const currentBadges = profile?.unlockedBadges || [];
             if (!currentBadges.includes(config.reward.badge)) {
               updates.unlockedBadges = [...currentBadges, config.reward.badge];
             }
           }

           updates.xp = increment(xpEarned);
           updates.coins = increment(coinsEarned);

           await updateDoc(userRef, updates);

           // Update Leaderboard
           const leaderboardRef = doc(db, `leaderboards/${mode}/entries`, user.uid);
           const currentLeaderboardData = (await getDocs(query(collection(db, `leaderboards/${mode}/entries`), where('userId', '==', user.uid), limit(1)))).docs[0]?.data();
           
           if (!currentLeaderboardData || score > (currentLeaderboardData.score || 0)) {
             await setDoc(leaderboardRef, {
               displayName: profile?.displayName || user.email?.split('@')[0] || 'Unknown Hacker',
               wpm: Math.max(currentLeaderboardData?.wpm || 0, wpm),
               score: Math.max(currentLeaderboardData?.score || 0, score),
               updatedAt: new Date().toISOString(),
               photoURL: profile?.photoURL || ''
             }, { merge: true });
           }

           if (xpEarned > 1000 || (profile?.xp || 0) + xpEarned >= (profile?.level || 1) * 5000) {
             await updateDoc(userRef, { level: increment(1) });
           }
         } catch (error) {
           handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
         }

         // Persist session and stats to PostgreSQL backend
         try {
           const token = await getIdToken();
           if (token) {
             const elapsedSec = stateRef.current.startTime
               ? Math.max(1, Math.round((Date.now() - stateRef.current.startTime) / 1000))
               : 0;
             await fetch('/api/sessions', {
               method: 'POST',
               headers: {
                 'Content-Type': 'application/json',
                 Authorization: `Bearer ${token}`,
               },
               body: JSON.stringify({
                 gameMode: mode,
                 difficulty: baseDifficulty,
                 wpm,
                 accuracy,
                 score,
                 wordsTyped: Math.round(stateRef.current.correctKeystrokes / 5),
                 durationSec: elapsedSec,
                 success: !objectiveFailed,
               }),
             });
             refreshDbUser();
           }
         } catch (sqlErr) {
           console.error('SQL session sync error:', sqlErr);
         }
       };

       saveResults();
    }
  }, [gameState.isGameOver, user, mode, profile, config.duration, config.reward, baseDifficulty, getIdToken, refreshDbUser]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative bg-slate-950/50 rounded-3xl" ref={containerRef}>
      {/* Game HUD */}
      <div className="absolute top-8 left-8 right-8 flex justify-between items-start pointer-events-none z-20">
        <div className="flex gap-4 pointer-events-auto">
          <HUDItem label="WPM" value={gameState.wpm} color="cyan" icon={Zap} />
          <HUDItem label="ACC" value={`${gameState.accuracy}%`} color="pink" icon={Target} />
          {mode === 'practice' ? (
            <HUDItem label="WORDS COMPLETED" value={Math.floor(gameState.correctKeystrokes / 5)} color="purple" icon={Trophy} />
          ) : gameState.timeLeft !== null ? (
            <HUDItem label="TIME" value={`${gameState.timeLeft}s`} color={gameState.timeLeft < 10 ? 'pink' : 'cyan'} icon={Flame} />
          ) : (
            <HUDItem label="LEVEL" value={gameState.level} color="purple" icon={Flame} />
          )}
          <HUDItem 
            label={mode === 'practice' ? "THEME" : "DIFFICULTY"} 
            value={mode === 'practice' ? (PRACTICE_THEMES[practiceTheme]?.name || 'Custom') : baseDifficulty.toUpperCase()} 
            color="cyan" 
            icon={mode === 'practice' ? Target : Shield} 
          />
          
          <button 
            onClick={togglePause}
            className="bg-slate-950/50 backdrop-blur border border-white/20 px-5 py-3 rounded-2xl flex items-center gap-2 hover:bg-white/10 transition-all text-white group"
            title="Pause (P)"
          >
            <div className="w-2 h-4 border-l-2 border-r-2 border-white group-hover:border-neon-cyan transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-widest">Pause</span>
          </button>

          {mode === 'practice' && gameState.startTime && (
            <button 
              onClick={() => {
                setGameState(prev => ({
                  ...prev,
                  startTime: null,
                  entities: [],
                  feedbacks: [],
                  bursts: [],
                  combo: 0,
                  correctKeystrokes: 0,
                  totalKeystrokes: 0,
                  wpm: 0,
                  accuracy: 100
                }));
                sfx.playCorrect();
              }}
              className="bg-slate-950/50 backdrop-blur border border-purple-500/30 hover:border-purple-500 px-5 py-3 rounded-2xl flex items-center gap-2 hover:bg-purple-500/10 transition-all text-white group"
              title="Configure Practice Parameters"
            >
              <Target size={16} className="text-neon-purple animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-neon-purple">Change Setup</span>
            </button>
          )}

          {mode !== 'practice' && !gameState.startTime && !gameState.isGameOver && (
            <button 
              onClick={() => setIsCustomWordsOpen(true)}
              className="bg-slate-950/50 backdrop-blur border border-neon-cyan/30 hover:border-neon-cyan px-5 py-3 rounded-2xl flex items-center gap-2 hover:bg-neon-cyan/10 transition-all text-white group"
              title="Input Custom Words"
            >
              <ClipboardList size={16} className="text-neon-cyan animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-neon-cyan">Custom Words</span>
              {sessionWords && sessionWords.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[8px] rounded-full bg-neon-cyan text-slate-950 font-black">
                  {sessionWords.length}
                </span>
              )}
            </button>
          )}
        </div>
        <div className="text-right pointer-events-auto">
          {mode === 'practice' ? (
            <div className="flex flex-col items-end">
              <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Session Mode</p>
              <h2 className="text-3xl font-display font-black text-purple-400 text-glow-purple uppercase italic tracking-tighter">ZEN PRACTICE</h2>
              {gameState.startTime && (
                <button
                  onClick={() => {
                    setGameState(prev => ({ ...prev, isGameOver: true }));
                    sfx.playLevelUp();
                  }}
                  className="mt-2 bg-purple-500/10 hover:bg-purple-500/25 text-purple-300 hover:text-white px-4 py-2 border border-purple-500/25 hover:border-purple-500/50 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                >
                  Complete Session
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Total Score</p>
              <h2 className="text-4xl font-display font-black text-white text-glow-cyan">{gameState.score.toLocaleString()}</h2>
            </>
          )}
          {gameState.combo > 1 && (
            <div className="flex flex-col items-end">
              <motion.div 
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                key={gameState.combo}
                className="text-neon-pink font-display italic font-bold text-xl mt-1 tracking-tighter"
              >
                {gameState.combo}x COMBO!
              </motion.div>
              {gameState.combo >= 10 && (
                <motion.div
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="text-neon-cyan font-black text-[10px] uppercase tracking-widest mt-0.5"
                >
                  {(1 + Math.floor(gameState.combo / 10) * 0.5).toFixed(1)}x Multiplier
                </motion.div>
              )}
            </div>
          )}
        </div>
      </div>

      <canvas 
        ref={canvasRef} 
        width={1000} 
        height={600} 
        className="max-w-full max-h-full object-contain"
      />

      <AnimatePresence>
        {gameState.isPaused && !gameState.isGameOver && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="text-center p-12 bg-glass rounded-[2rem] border border-white/10"
            >
              <div className="flex justify-center gap-3 mb-6">
                <div className="w-3 h-12 bg-neon-cyan rounded-full animate-pulse" />
                <div className="w-3 h-12 bg-neon-cyan rounded-full animate-pulse [animation-delay:0.2s]" />
              </div>
              <h3 className="text-4xl font-display font-black text-white mb-2 tracking-tighter">GAME PAUSED</h3>
              <p className="text-slate-400 mb-8 uppercase tracking-widest text-xs font-bold">Combat efficiency suspended</p>
              
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={togglePause}
                className="bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 px-10 py-4 rounded-2xl font-display font-black hover:bg-neon-cyan/30 transition-all uppercase tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.2)]"
              >
                RESUME SESSION
              </motion.button>
            </motion.div>
          </motion.div>
        )}

        {gameState.isGameOver && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-8"
          >
            {mode === 'practice' ? (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', damping: 22, stiffness: 90 }}
                className="w-full max-w-lg bg-glass rounded-[2rem] p-10 border border-purple-500/30 text-center shadow-[0_0_50px_rgba(168,85,247,0.15)] flex flex-col items-center"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 10, stiffness: 120 }}
                  className="mb-6 p-4 bg-purple-500/10 border border-purple-500/20 rounded-full text-purple-400"
                >
                  <Trophy size={48} className="animate-pulse" />
                </motion.div>

                <h2 className="text-4xl font-display font-black text-white italic tracking-tighter uppercase mb-2">Practice Report</h2>
                <p className="text-xs text-slate-400 max-w-sm mb-8 leading-relaxed uppercase tracking-wider font-bold">
                  Excellent focus! Every typed word refines your muscle memory and keystroke flow. Keep up the rhythm!
                </p>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4 w-full mb-8">
                  <ResultStat label="Average Speed" value={`${gameState.wpm} WPM`} color="cyan" />
                  <ResultStat label="Key Accuracy" value={`${gameState.accuracy}%`} color="pink" />
                  <ResultStat label="Words Typed" value={Math.floor(gameState.correctKeystrokes / 5)} color="purple" />
                  <ResultStat label="Best Combo" value={`${gameState.combo} Keys`} color="green" />
                </div>

                {/* Theme Tag */}
                <div className="w-full p-4 bg-purple-950/20 border border-purple-500/15 rounded-2xl mb-8 flex justify-between items-center text-left">
                  <div>
                    <p className="text-[10px] text-purple-400 font-bold uppercase tracking-widest leading-none mb-1">PRACTICE PATHWAY</p>
                    <span className="text-sm font-display font-black text-white uppercase">{PRACTICE_THEMES[practiceTheme]?.name || 'Custom Setup'}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">SPEED LEVEL</p>
                    <span className="text-xs font-mono font-black text-neon-purple uppercase">{practiceSpeed}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-4 w-full">
                  <motion.button 
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setGameState(prev => ({
                        ...prev,
                        isGameOver: false,
                        startTime: null,
                        entities: [],
                        feedbacks: [],
                        bursts: [],
                        combo: 0,
                        correctKeystrokes: 0,
                        totalKeystrokes: 0,
                        wpm: 0,
                        accuracy: 100
                      }));
                      sfx.playCorrect();
                    }}
                    className="flex-1 bg-neon-purple text-white py-4 rounded-2xl font-display font-black hover:bg-opacity-90 transition-all uppercase tracking-widest hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] text-xs font-bold"
                  >
                    PRACTICE AGAIN
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={onGameEnd}
                    className="flex-1 bg-white/5 text-slate-400 border border-white/10 py-4 rounded-2xl font-display font-black hover:bg-white/10 hover:text-white transition-all uppercase tracking-widest text-xs font-bold"
                  >
                    EXIT TO HUB
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ 
                  type: 'spring',
                  damping: 20,
                  stiffness: 100,
                  staggerChildren: 0.1,
                  delayChildren: 0.2
                }}
                className="w-full max-w-lg bg-glass rounded-[2rem] p-10 border-2 border-neon-cyan/30 text-center"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 8, stiffness: 150 }}
                >
                  <Skull className="mx-auto mb-6 text-neon-cyan drop-shadow-[0_0_20px_rgba(6,182,212,0.6)]" size={80} />
                </motion.div>

                <motion.h2 
                  variants={{
                    hidden: { opacity: 0, y: 20, scale: 0.8 },
                    visible: { 
                      opacity: 1, 
                      y: 0, 
                      scale: 1,
                      transition: { type: 'spring', damping: 12, stiffness: 200 }
                    }
                  }}
                  className="text-6xl font-display font-black mb-2 tracking-tighter text-glow-cyan uppercase"
                >
                  {gameState.objectiveFailed ? 'FAILED' : 'COMPLETE'}
                </motion.h2>

                <motion.p 
                  variants={{
                    hidden: { opacity: 0, scale: 1.1 },
                    visible: { opacity: 1, scale: 1 }
                  }}
                  className="text-slate-400 mb-8 uppercase tracking-widest text-sm font-bold"
                >
                  {gameState.objectiveFailed ? 'Objective requirements not met' : 'Mission parameters fulfilled'}
                </motion.p>
                
                <motion.div 
                  variants={{
                    hidden: { opacity: 0 },
                    visible: { 
                      opacity: 1,
                      transition: { staggerChildren: 0.1, delayChildren: 0.4 }
                    }
                  }}
                  className="grid grid-cols-2 gap-4 mb-10"
                >
                  <ResultStat label="Words PM" value={gameState.wpm} color="cyan" />
                  <ResultStat label="Accuracy" value={gameState.accuracy + '%'} color="pink" />
                  <ResultStat label="Final Lv" value={gameState.level} color="purple" />
                  <ResultStat label="XP Gained" value={Math.round(gameState.score / 10) + (config.reward && !gameState.objectiveFailed ? config.reward.xpBonus : 0)} color="green" />
                </motion.div>

                {!gameState.objectiveFailed && config.reward && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 p-4 bg-neon-cyan/10 border border-neon-cyan/20 rounded-2xl flex items-center justify-between"
                  >
                    <div className="text-left">
                      <p className="text-[10px] text-neon-cyan font-black uppercase tracking-widest leading-none mb-2">Challenge Reward</p>
                      <div className="flex items-center gap-2">
                        <Trophy size={16} className="text-neon-cyan" />
                        <span className="text-lg font-display font-black text-white">{config.reward.badge}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-neon-pink">+{config.reward.coins} COINS</p>
                      <p className="text-[10px] text-slate-500 font-bold">BONUS GRANTED</p>
                    </div>
                  </motion.div>
                )}

                <AdSlot slotKey="post_game_slot" className="mb-6 text-left" />

                <motion.div 
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    visible: { opacity: 1, y: 0 }
                  }}
                  className="flex gap-4"
                >
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => window.location.reload()}
                    className="flex-1 bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 py-4 rounded-2xl font-display font-black hover:bg-neon-cyan/30 transition-all uppercase tracking-widest"
                  >
                    PLAY AGAIN
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onGameEnd}
                    className="flex-1 bg-white/5 text-slate-400 border border-white/10 py-4 rounded-2xl font-display font-black hover:bg-white/10 hover:text-white transition-all uppercase tracking-widest"
                  >
                    EXIT TO HUB
                  </motion.button>
                </motion.div>
              </motion.div>
            )}
          </motion.div>
        )}

        {isCustomWordsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg bg-slate-900/95 backdrop-blur border border-neon-cyan/40 rounded-3xl p-8 flex flex-col shadow-2xl relative"
            >
              <button
                onClick={() => setIsCustomWordsOpen(false)}
                className="absolute top-6 right-6 p-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white transition-all pointer-events-auto"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-2 mb-4">
                <ClipboardList className="text-neon-cyan animate-pulse" size={24} />
                <h3 className="text-2xl font-display font-black text-white italic tracking-tighter uppercase text-glow-cyan">Custom Word List</h3>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Type or paste your own list of practice words. Separate them using <span className="text-neon-cyan font-mono font-bold">commas</span>, <span className="text-neon-pink font-mono font-bold">spaces</span>, or <span className="text-neon-purple font-mono font-bold">newlines</span>. Words should be at least 2 letters long.
              </p>

              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="cyber, hacking, tactical, speed, reflex, precision, levelup"
                className="w-full h-40 bg-slate-950/85 border border-white/15 focus:border-neon-cyan focus:ring-1 focus:ring-neon-cyan/55 rounded-2xl p-4 font-mono text-sm text-slate-100 placeholder-slate-600 outline-none transition-all resize-none mb-6 pointer-events-auto"
              />

              <div className="flex flex-wrap gap-2 mb-6 pointer-events-auto">
                <button
                  onClick={() => {
                    setInputText("typescript, react, javascript, tailwind, nextjs, framework, backend, postgres, firestore, compiler, terminal, query");
                    sfx.playCorrect();
                  }}
                  className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg border border-white/5 transition-all"
                >
                  Code Terms
                </button>
                <button
                  onClick={() => {
                    setInputText("quantum, nebula, asteroid, cosmic, supernova, pulsar, galaxy, orbit, spacecraft, astronaut, cosmos, alien");
                    sfx.playCorrect();
                  }}
                  className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg border border-white/5 transition-all"
                >
                  Space Terms
                </button>
                <button
                  onClick={() => {
                    setInputText("shadow, dragon, scroll, katana, reflex, stealth, execute, lightning, strike, battle, warrior, blade, shield");
                    sfx.playCorrect();
                  }}
                  className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg border border-white/5 transition-all"
                >
                  Battle Terms
                </button>
                <button
                  onClick={() => {
                    setInputText('');
                  }}
                  className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/10 hover:border-red-500/20 transition-all ml-auto"
                >
                  Clear List
                </button>
              </div>

              <div className="flex gap-4 pointer-events-auto">
                <button
                  onClick={() => setIsCustomWordsOpen(false)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white py-3.5 rounded-2xl font-display font-black text-xs uppercase tracking-widest border border-white/10 transition-all"
                >
                  CANCEL
                </button>
                <button
                  onClick={() => {
                    // Extract words cleanly: split by commas, spaces, or newlines, filter empty and length < 2
                    const words = inputText
                      .split(/[\s,]+/)
                      .map(w => w.trim().replace(/[^a-zA-Z-]/g, ''))
                      .filter(w => w.length >= 2);
                    
                    if (words.length > 0) {
                      setSessionWords(words);
                      sfx.playCorrect();
                    } else {
                      setSessionWords(undefined);
                      sfx.playCorrect();
                    }
                    setIsCustomWordsOpen(false);
                  }}
                  className="flex-1 bg-neon-cyan text-slate-950 py-3.5 rounded-2xl font-display font-black text-xs uppercase tracking-widest hover:bg-opacity-90 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] transition-all"
                >
                  SAVE PRACTICE SET
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Starting hint or Practice Parameters Overlay */}
      {!gameState.startTime && !gameState.isGameOver && (
        mode === 'practice' ? (
          <div className="absolute inset-0 z-40 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-8 pointer-events-auto overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-4xl bg-slate-900/90 border border-purple-500/30 rounded-[2.5rem] p-8 md:p-10 shadow-[0_0_50px_rgba(168,85,247,0.15)] flex flex-col relative"
            >
              <button
                onClick={onGameEnd}
                className="absolute top-8 right-8 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all cursor-pointer"
              >
                Exit to Hub
              </button>

              <div className="flex items-center gap-3 mb-2">
                <Target className="text-purple-400 animate-pulse" size={32} />
                <h2 className="text-3xl font-display font-black text-white italic uppercase tracking-tighter text-glow-purple">Practice Lab</h2>
              </div>
              <p className="text-sm text-slate-400 max-w-2xl leading-relaxed mb-6">
                Develop ultimate hand-eye coordination and typing stamina in this stress-free environment. Select a lesson pool below or click Custom to paste your own words.
              </p>

              {/* Theme Grid */}
              <p className="text-[10px] text-purple-400 font-black uppercase tracking-widest mb-3">1. Select Practice Theme</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {Object.entries(PRACTICE_THEMES).map(([key, item]) => {
                  const Icon = item.icon;
                  const isSelected = practiceTheme === key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setPracticeTheme(key);
                        if (key === 'custom') {
                          setIsCustomWordsOpen(true);
                        } else {
                          setSessionWords(item.words);
                        }
                        sfx.playCorrect();
                      }}
                      className={`text-left p-4 rounded-2xl border transition-all flex flex-col justify-between h-32 relative ${
                        isSelected 
                          ? 'bg-purple-600/10 border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.1)]' 
                          : 'bg-white/5 border-white/5 hover:border-white/15'
                      }`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <div className={`p-2 rounded-xl ${isSelected ? 'bg-purple-500 text-white' : 'bg-white/5 text-purple-400'}`}>
                          <Icon size={16} />
                        </div>
                        {isSelected && (
                          <span className="bg-purple-500 text-white px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-full">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="mt-2">
                        <h4 className="text-xs font-display font-black text-white uppercase tracking-tight mb-0.5">{item.name}</h4>
                        <p className="text-[9px] text-slate-400 leading-tight line-clamp-2">{item.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {wordPacks.length > 0 && (
                <div className="mb-6">
                  <p className="text-[10px] text-purple-400 font-black uppercase tracking-widest mb-2">Featured Admin Word Packs</p>
                  <div className="flex flex-wrap gap-2">
                    {wordPacks.map((pack) => {
                      const packKey = `pack-${pack.id}`;
                      const isSelected = practiceTheme === packKey;
                      return (
                        <button
                          key={pack.id}
                          onClick={() => {
                            setPracticeTheme(packKey);
                            setSessionWords(pack.words);
                            sfx.playCorrect();
                          }}
                          className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                            isSelected
                              ? 'bg-purple-500/20 border-purple-400 text-white'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          {pack.title} ({pack.words.length})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Options & Start Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center border-t border-white/10 pt-6">
                <div>
                  <p className="text-[10px] text-purple-400 font-black uppercase tracking-widest mb-3">2. Choose Words Speed</p>
                  <div className="flex gap-2">
                    {(['slow', 'medium', 'fast'] as const).map((spd) => {
                      const isSelected = practiceSpeed === spd;
                      const spdLabels = {
                        slow: 'Relaxed (0.3x)',
                        medium: 'Steady (0.7x)',
                        fast: 'Intense (1.2x)'
                      };
                      return (
                        <button
                          key={spd}
                          onClick={() => {
                            setPracticeSpeed(spd);
                            sfx.playCorrect();
                          }}
                          className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest rounded-xl border transition-all ${
                            isSelected
                              ? 'bg-purple-600/20 border-purple-400 text-white font-black'
                              : 'bg-white/5 border-transparent text-slate-400 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          {spdLabels[spd]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 w-full justify-end mt-4 md:mt-0">
                  {practiceTheme === 'custom' && (
                    <button
                      onClick={() => setIsCustomWordsOpen(true)}
                      className="px-6 py-4 bg-slate-950/80 border border-purple-500/30 hover:border-purple-400 rounded-2xl text-[10px] font-black uppercase tracking-widest text-purple-300 hover:text-white transition-all flex items-center gap-2 justify-center"
                    >
                      <ClipboardList size={14} />
                      Edit Words ({sessionWords ? sessionWords.length : 0})
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (practiceTheme === 'custom' && (!sessionWords || sessionWords.length === 0)) {
                        setIsCustomWordsOpen(true);
                        return;
                      }
                      
                      setGameState(prev => ({
                        ...prev,
                        startTime: Date.now(),
                        entities: [],
                        feedbacks: [],
                        bursts: [],
                        combo: 0,
                        correctKeystrokes: 0,
                        totalKeystrokes: 0,
                        wpm: 0,
                        accuracy: 100
                      }));
                      
                      setTimeout(() => {
                        spawnEntity();
                      }, 100);
                      
                      sfx.playLevelUp();
                    }}
                    className="px-8 py-4 bg-purple-500 text-white hover:bg-purple-400 rounded-2xl text-xs font-black uppercase tracking-widest hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] transition-all flex items-center justify-center gap-2"
                  >
                    🚀 Start Practice session
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 text-center pointer-events-none w-full max-w-xl flex flex-col items-center">
            {sessionWords && sessionWords.length > 0 && (
              <div className="mb-6 bg-slate-950/80 backdrop-blur px-5 py-3 rounded-2xl border border-neon-cyan/25 inline-block pointer-events-auto max-w-md shadow-lg shadow-neon-cyan/5">
                <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black mb-1">Custom Practice Set Active ({sessionWords.length} words)</p>
                <p className="text-xs text-neon-cyan font-mono truncate max-w-xs break-all">
                  {sessionWords.slice(0, 8).join(', ')}{sessionWords.length > 8 ? '...' : ''}
                </p>
              </div>
            )}
            <p className="text-neon-cyan animate-pulse font-display font-bold uppercase tracking-[0.3em] text-sm leading-relaxed">
              Type any word to begin the combat
            </p>
          </div>
        )
      )}
    </div>
  );
}

function HUDItem({ label, value, color, icon: Icon }: any) {
  return (
    <div className={`bg-slate-950/50 backdrop-blur border border-neon-${color}/30 px-5 py-3 rounded-2xl flex items-center gap-3`}>
      <div className={`text-neon-${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter leading-none mb-1">{label}</p>
        <p className="text-xl font-mono font-black text-white leading-none">{value}</p>
      </div>
    </div>
  );
}

function ResultStat({ label, value, color }: any) {
  return (
    <motion.div 
      variants={{
        hidden: { opacity: 0, scale: 0.8 },
        visible: { opacity: 1, scale: 1 }
      }}
      className={`bg-white/5 border border-white/10 p-4 rounded-2xl text-center`}
    >
      <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-mono font-black text-neon-${color}`}>{value}</p>
    </motion.div>
  );
}
