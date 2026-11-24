'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  xp: number;
  level: number;
  coins: number;
  totalWordsTyped: number;
  averageWpm: number;
  averageAccuracy: number;
  bestWpm: number;
  streak: number;
  lastLogin: string;
  unlockedThemes: string[];
  activeTheme?: string;
  unlockedAvatars: string[];
  unlockedBadges: string[];
  themeCustomizations?: Record<string, { primary: string; accent: string }>;
  missedKeys?: Record<string, number>;
}

export interface SqlUserRecord {
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
  streak: number;
  activeTheme: string;
  unlockedThemes: string;
  unlockedBadges: string;
  totalTimeSpentSec: number;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  dbUser: SqlUserRecord | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  refreshDbUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  dbUser: null,
  isAdmin: false,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  getIdToken: async () => null,
  refreshDbUser: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dbUser, setDbUser] = useState<SqlUserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const syncWithSql = useCallback(async (firebaseUser: User) => {
    try {
      const token = await firebaseUser.getIdToken();
      tokenRef.current = token;
      const res = await fetch('/api/user/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setDbUser(data.user);
        }
      }
    } catch (error) {
      console.error('SQL user sync failed:', error);
    }
  }, []);

  const refreshDbUser = useCallback(async () => {
    if (auth.currentUser) {
      await syncWithSql(auth.currentUser);
    }
  }, [syncWithSql]);

  const getIdToken = useCallback(async () => {
    if (!auth.currentUser) return null;
    try {
      const fresh = await auth.currentUser.getIdToken();
      tokenRef.current = fresh;
      return fresh;
    } catch {
      return tokenRef.current;
    }
  }, []);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      setUser(fbUser);

      if (fbUser) {
        // Sync with Cloud SQL PostgreSQL in parallel with Firestore profile
        syncWithSql(fbUser);

        const userRef = doc(db, 'users', fbUser.uid);
        try {
          const docSnap = await getDoc(userRef);
          if (!docSnap.exists()) {
            const newProfile: UserProfile = {
              uid: fbUser.uid,
              displayName: fbUser.displayName || 'Anonymous Typist',
              photoURL: fbUser.photoURL || '',
              xp: 0,
              level: 1,
              coins: 100,
              totalWordsTyped: 0,
              averageWpm: 0,
              averageAccuracy: 0,
              bestWpm: 0,
              streak: 0,
              lastLogin: new Date().toISOString(),
              unlockedThemes: ['cyberpunk'],
              activeTheme: 'cyberpunk',
              unlockedAvatars: ['default'],
              unlockedBadges: [],
            };
            await setDoc(userRef, newProfile);
            setProfile(newProfile);
          } else {
            const data = docSnap.data() as UserProfile;
            setProfile(data);

            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const lastLoginDate = new Date(data.lastLogin);
            const lastLoginTime = new Date(
              lastLoginDate.getFullYear(),
              lastLoginDate.getMonth(),
              lastLoginDate.getDate()
            ).getTime();

            const diffDays = Math.floor((today - lastLoginTime) / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
              await setDoc(
                userRef,
                {
                  streak: (data.streak || 0) + 1,
                  lastLogin: now.toISOString(),
                },
                { merge: true }
              );
            } else if (diffDays > 1) {
              await setDoc(
                userRef,
                {
                  streak: 1,
                  lastLogin: now.toISOString(),
                },
                { merge: true }
              );
            }
          }
        } catch (error) {
          console.error('Core profile initialization failed:', error);
        }

        unsubscribeProfile = onSnapshot(
          userRef,
          (snapshot) => {
            if (snapshot.exists()) {
              setProfile(snapshot.data() as UserProfile);
            }
          },
          (error) => {
            console.error('Core profile snapshot failed:', error);
          }
        );
      } else {
        tokenRef.current = null;
        setProfile(null);
        setDbUser(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, [syncWithSql]);

  const signIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  const signOut = async () => {
    try {
      await fbSignOut(auth);
      setDbUser(null);
      tokenRef.current = null;
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const isAdmin = Boolean(
    dbUser?.role === 'admin' ||
      user?.email?.toLowerCase() === 'singhrudra3614@gmail.com'
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        dbUser,
        isAdmin,
        loading,
        signIn,
        signOut,
        getIdToken,
        refreshDbUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
