

"use client";

import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { League, SocialRank, UserProfile } from '@/types';
import { DEFAULT_SOCIAL_RANKS } from '@/types';

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
  const [socialRanks, setSocialRanks] = useState<SocialRank[]>(DEFAULT_SOCIAL_RANKS);

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
          unlockedAvatars: data.unlockedAvatars || ['Avatar00.png'],
          leaderboardPoints: data.leaderboardPoints || 0,
          trophies: data.trophies || 0,
          gamesPlayed: data.gamesPlayed || 0,
          hasChangedName: data.hasChangedName || false,
          leagues: data.leagues || [],
        });
      } else {
        setUserProfile(null);
      }
      setLoading(false);
  };
  
  useEffect(() => {
    // Ranks are now hardcoded in types, no need to fetch.
    setSocialRanks(DEFAULT_SOCIAL_RANKS.sort((a,b) => a.threshold - b.threshold));
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
            unlockedAvatars: data.unlockedAvatars || ['Avatar00.png'],
            leaderboardPoints: data.leaderboardPoints || 0,
            trophies: data.trophies || 0,
            gamesPlayed: data.gamesPlayed || 0,
            hasChangedName: data.hasChangedName || false,
            leagues: data.leagues || [],
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
