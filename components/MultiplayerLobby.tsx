'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sword, Users, Zap, Trophy, Loader2, Play, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc,
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  onSnapshot, 
  serverTimestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { cn } from '@/lib/utils';

interface LobbyProps {
  onStartMatch: (matchId: string, isPlayer1: boolean) => void;
  onClose: () => void;
}

export default function MultiplayerLobby({ onStartMatch, onClose }: LobbyProps) {
  const { user, profile } = useAuth();
  const [isSearching, setIsSearching] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<any>(null);
  const [status, setStatus] = useState<'idle' | 'searching' | 'waiting' | 'starting'>('idle');
  const [isPlayer1, setIsPlayer1] = useState(true);

  const matchIdRef = useRef<string | null>(null);
  const userRef = useRef<any>(null);

  useEffect(() => {
    matchIdRef.current = matchId;
  }, [matchId]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!matchId) return;

    const unsubscribe = onSnapshot(doc(db, 'matches', matchId), (snapshot) => {
      if (!snapshot.exists()) {
        setStatus('idle');
        setMatchId(null);
        setOpponent(null);
        setIsSearching(false);
        return;
      }
      const data = snapshot.data();
      
      const p1 = data.player1.uid === user?.uid;
      setIsPlayer1(p1);
      
      const peer = p1 ? data.player2 : data.player1;
      
      if (peer) {
        setOpponent(peer);
      } else {
        setOpponent(null);
      }

      if (data.status === 'starting' || data.status === 'active') {
        setStatus('starting');
        // Small delay to show opponent found
        setTimeout(() => {
          onStartMatch(matchId, p1);
        }, 2000);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, `matches/${matchId}`));

    return () => unsubscribe();
  }, [matchId, user, onStartMatch]);

  // Leave active or waiting match logic
  const leaveMatch = async () => {
    const currentMatchId = matchIdRef.current;
    const currentUser = userRef.current;
    if (!currentMatchId || !currentUser) return;

    try {
      const matchRef = doc(db, 'matches', currentMatchId);
      const matchSnap = await getDoc(matchRef);
      if (!matchSnap.exists()) return;
      
      const matchData = matchSnap.data();
      if (matchData.status === 'waiting') {
        const isP1 = matchData.player1.uid === currentUser.uid;
        if (isP1) {
          if (matchData.player2) {
            // Promote player 2 to player 1
            await updateDoc(matchRef, {
              player1: matchData.player2,
              player2: null
            });
          } else {
            // Delete match document completely if empty
            await deleteDoc(matchRef);
          }
        } else {
          // Player 2 leaves; remove from match document
          await updateDoc(matchRef, {
            player2: null
          });
        }
      }
    } catch (err) {
      console.error("Error leaving match:", err);
    } finally {
      setMatchId(null);
      setOpponent(null);
      setStatus('idle');
      setIsSearching(false);
    }
  };

  // Unmount cleanup
  useEffect(() => {
    return () => {
      const currentMatchId = matchIdRef.current;
      const currentUser = userRef.current;
      if (currentMatchId && currentUser) {
        const runCleanup = async () => {
          try {
            const matchRef = doc(db, 'matches', currentMatchId);
            const matchSnap = await getDoc(matchRef);
            if (!matchSnap.exists()) return;
            const matchData = matchSnap.data();
            if (matchData.status === 'waiting') {
              const isP1 = matchData.player1.uid === currentUser.uid;
              if (isP1) {
                if (matchData.player2) {
                  await updateDoc(matchRef, {
                    player1: matchData.player2,
                    player2: null
                  });
                } else {
                  await deleteDoc(matchRef);
                }
              } else {
                await updateDoc(matchRef, {
                  player2: null
                });
              }
            }
          } catch (e) {
            console.error("Cleanup error:", e);
          }
        };
        runCleanup();
      }
    };
  }, []);

  const handleClose = async () => {
    await leaveMatch();
    onClose();
  };

  const findMatch = async () => {
    if (!user || !profile) return;
    setIsSearching(true);
    setStatus('searching');

    try {
      // 1. Try to find a waiting match where player2 is not yet filled
      const q = query(
        collection(db, 'matches'),
        where('status', '==', 'waiting'),
        orderBy('createdAt', 'asc'),
        limit(5)
      );

      const snapshot = await getDocs(q);
      let joined = false;

      if (!snapshot.empty) {
        for (const docSnap of snapshot.docs) {
          const matchData = docSnap.data();
          // Ensure player2 is not occupied and player1 isn't themselves
          if (!matchData.player2 && matchData.player1.uid !== user.uid) {
            await updateDoc(docSnap.ref, {
              player2: {
                uid: user.uid,
                displayName: profile.displayName || user.email?.split('@')[0] || 'Unknown Hacker',
                photoURL: profile.photoURL || '',
                wpm: 0,
                accuracy: 100,
                score: 0,
                isReady: true,
                lastUpdate: new Date().toISOString()
              }
            });
            setMatchId(docSnap.id);
            setStatus('waiting');
            joined = true;
            break;
          }
        }
      }

      if (!joined) {
        // 2. No waiting match found, create one
        const newMatch = {
          status: 'waiting',
          player1: {
            uid: user.uid,
            displayName: profile.displayName || user.email?.split('@')[0] || 'Unknown Hacker',
            photoURL: profile.photoURL || '',
            wpm: 0,
            accuracy: 100,
            score: 0,
            isReady: true,
            lastUpdate: new Date().toISOString()
          },
          createdAt: new Date().toISOString(),
          matchId: '' // Will update after creation
        };

        const docRef = await addDoc(collection(db, 'matches'), newMatch);
        await updateDoc(docRef, { matchId: docRef.id });
        setMatchId(docRef.id);
        setStatus('waiting');
      }

    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'matches');
      setIsSearching(false);
      setStatus('idle');
    }
  };

  const startDuel = async () => {
    if (!matchId) return;
    try {
      await updateDoc(doc(db, 'matches', matchId), {
        status: 'starting',
        wordSeed: Math.floor(Math.random() * 1000000),
        startTime: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error starting duel:", err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl p-6"
    >
      <div className="w-full max-w-2xl bg-glass border-2 border-neon-cyan/20 rounded-[2.5rem] overflow-hidden relative">
        <button 
          onClick={handleClose}
          className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <div className="p-12 text-center">
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-neon-cyan/20 blur-3xl rounded-full" />
              <Sword className="text-neon-cyan relative z-10" size={64} />
            </div>
          </div>

          <h2 className="text-4xl font-display font-black text-white mb-2 tracking-tighter">TYPING DUEL</h2>
          <p className="text-slate-400 mb-12 uppercase tracking-[0.3em] text-xs font-bold">Real-time competitive combat</p>

          <div className="grid grid-cols-3 gap-8 items-center mb-12">
            {/* Player 1 (You or Opponent depending on who joined) */}
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-white/5 border border-neon-cyan/30 flex items-center justify-center mx-auto mb-4 overflow-hidden">
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt="Local" className="w-full h-full object-cover" />
                ) : (
                  <Users className="text-neon-cyan" size={32} />
                )}
              </div>
              <p className="text-sm font-bold text-white truncate max-w-[120px] mx-auto">{profile?.displayName || 'YOU'}</p>
              <div className="mt-1 flex justify-center gap-1">
                <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
                <span className="text-[10px] text-neon-cyan font-black">READY</span>
              </div>
            </div>

            {/* VS Divider */}
            <div className="relative">
              <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent absolute top-1/2 left-0 right-0" />
              <div className="relative z-10 bg-slate-950 w-12 h-12 rounded-full border-2 border-white/10 flex items-center justify-center mx-auto">
                <span className="font-display font-black text-neon-pink text-xs italic">VS</span>
              </div>
            </div>

            {/* Opponent */}
            <div className="text-center">
              <div className={cn(
                "w-20 h-20 rounded-2xl bg-white/5 border flex items-center justify-center mx-auto mb-4 overflow-hidden relative",
                opponent ? "border-neon-pink/30" : "border-white/5"
              )}>
                {opponent ? (
                  <img src={opponent.photoURL || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${opponent.uid}`} alt="Peer" className="w-full h-full object-cover" />
                ) : (
                  <div className="relative">
                     {status === 'searching' || status === 'waiting' ? (
                       <Loader2 className="text-slate-700 animate-spin" size={32} />
                     ) : (
                       <Users className="text-slate-700" size={32} />
                     )}
                  </div>
                )}
              </div>
              <p className={cn(
                "text-sm font-bold truncate max-w-[120px] mx-auto",
                opponent ? "text-white" : "text-slate-600"
              )}>
                {opponent?.displayName || 'WAITING...'}
              </p>
              {opponent && (
                <div className="mt-1 flex justify-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-neon-pink animate-pulse" />
                  <span className="text-[10px] text-neon-pink font-black">LOCKED</span>
                </div>
              )}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {status === 'idle' ? (
              <motion.button
                key="start"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                onClick={findMatch}
                className="w-full max-w-sm bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 py-5 rounded-2xl font-display font-black hover:bg-neon-cyan/30 transition-all uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(6,182,212,0.1)] flex items-center justify-center gap-3"
              >
                <Play size={20} className="fill-current" />
                DEPLOY TO BATTLE
              </motion.button>
            ) : status === 'starting' ? (
              <motion.div
                key="starting"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-neon-pink font-display font-black text-4xl italic tracking-tighter"
              >
                INITIALIZING...
              </motion.div>
            ) : opponent ? (
              <motion.div
                key="opponent-found"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-6 w-full"
              >
                {isPlayer1 ? (
                  <button
                    onClick={startDuel}
                    className="w-full max-w-sm bg-neon-pink/20 text-neon-pink border border-neon-pink/50 py-5 rounded-2xl font-display font-black hover:bg-neon-pink/30 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(236,72,153,0.2)] flex items-center justify-center gap-3"
                  >
                    <Sword size={20} className="animate-bounce" />
                    COMMENCE DUEL
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex gap-1.5 justify-center items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-neon-pink animate-ping" />
                      <p className="text-neon-pink font-display font-black text-xl italic tracking-tight">
                        AWAITING HOST LAUNCH...
                      </p>
                    </div>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Ready to sync keystrokes</p>
                  </div>
                )}
                
                <button 
                  onClick={leaveMatch}
                  className="text-slate-500 hover:text-white transition-colors font-bold text-xs uppercase tracking-widest underline underline-offset-4"
                >
                  Leave Waiting Match
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="flex gap-2">
                   {[0, 1, 2].map((i) => (
                     <motion.div
                       key={i}
                       animate={{ 
                         height: [12, 24, 12],
                         opacity: [0.3, 1, 0.3]
                       }}
                       transition={{ 
                         duration: 0.8, 
                         repeat: Infinity,
                         delay: i * 0.2
                       }}
                       className="w-1.5 bg-neon-cyan rounded-full"
                     />
                   ))}
                </div>
                <p className="text-slate-500 font-black uppercase tracking-[0.2em] text-[10px]">Scanning regional sectors</p>
                <button 
                  onClick={leaveMatch}
                  className="mt-4 text-slate-500 hover:text-white transition-colors font-bold text-xs uppercase tracking-widest underline underline-offset-4"
                >
                  Cancel Protocol
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-12 grid grid-cols-2 gap-4">
             <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <Trophy size={20} className="text-neon-cyan mx-auto mb-2" />
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Global Ranked</p>
                <p className="text-sm font-black text-white">+500 XP WIN</p>
             </div>
             <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <Zap size={20} className="text-neon-pink mx-auto mb-2" />
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Speed Cap</p>
                <p className="text-sm font-black text-white">NO LIMIT</p>
             </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
