

"use client";

import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { League, SocialRank } from '@/types';
import { getSocialRanks } from '@/lib/actions/admin';

export interface UserProfile {
  uid: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  coins: number;
  avatarId: string;
  leaderboardPoints: number; // For social rank progression
  trophies?: number;
  gamesPlayed?: number;
  hasChangedName?: boolean;
  leagues?: {id: string; name: string}[];
  purchasedAvatars?: string[];
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  socialRanks: SocialRank[];
  refreshUserProfile?: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  socialRanks: [],
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [socialRanks, setSocialRanks] = useState<SocialRank[]>([]);

  const fetchUserProfile = async (firebaseUser: User) => {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserProfile({
          uid: firebaseUser.uid,
          name: data.name || firebaseUser.displayName || 'Unknown User',
          email: firebaseUser.email,
          isAdmin: data.isAdmin === true,
          coins: data.coins ?? 0,
          avatarId: data.avatarId || 'Avatar00.png',
          leaderboardPoints: data.leaderboardPoints || 0,
          trophies: data.trophies || 0,
          gamesPlayed: data.gamesPlayed || 0,
          hasChangedName: data.hasChangedName || false,
          leagues: data.leagues || [],
          purchasedAvatars: data.purchasedAvatars || [],
        });
      } else {
        setUserProfile(null);
      }
      setLoading(false);
  };
  
  useEffect(() => {
    const ranksDocRef = doc(db, 'game_settings', 'social_ranks');
    const unsubscribeRanks = onSnapshot(ranksDocRef, (docSnap) => {
        if (docSnap.exists() && docSnap.data().ranks) {
            const ranks = docSnap.data().ranks as SocialRank[];
            setSocialRanks(ranks.sort((a, b) => a.threshold - b.threshold));
        } else {
            // If it doesn't exist, fetch defaults and set them.
            getSocialRanks().then(res => {
                if(res.success && res.ranks) {
                    setSocialRanks(res.ranks);
                }
            })
        }
    });
    return () => unsubscribeRanks();
  }, []);

  useEffect(() => {
    setLoading(true);
    const unsubscribeAuth = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      if (!authUser) {
        setUserProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (user) {
      const userDocRef = doc(db, 'users', user.uid);
      const unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserProfile({
            uid: user.uid,
            name: data.name || user.displayName || 'Unknown User',
            email: user.email,
            isAdmin: data.isAdmin === true,
            coins: data.coins ?? 0,
            avatarId: data.avatarId || 'Avatar00.png',
            leaderboardPoints: data.leaderboardPoints || 0,
            trophies: data.trophies || 0,
            gamesPlayed: data.gamesPlayed || 0,
            hasChangedName: data.hasChangedName || false,
            leagues: data.leagues || [],
            purchasedAvatars: data.purchasedAvatars || [],
          });
        } else {
          setUserProfile(null);
        }
        setLoading(false);
      });
      return () => unsubscribeProfile();
    }
  }, [user]);

  const refreshUserProfile = () => {
    if(user) {
      fetchUserProfile(user);
    }
  }

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, socialRanks, refreshUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
