"use client";

import { useState, useEffect, createContext, useContext, type ReactNode, useRef, useMemo } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { League, SocialRank, UserProfile } from '@/types';
import { DEFAULT_SOCIAL_RANKS } from '@/types';
import { getSocialRanks } from '@/lib/actions/admin';
import { useToast } from './use-toast';
import { getSocialRankForUser, sendSystemMail } from '@/lib/actions/user';
import { Award, Crown, Gem, Shield, ShieldCheck, Star } from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
    Shield, ShieldCheck, Award, Gem, Crown, Star
};


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
  const prevRankName = useRef<string | null>(null);
  const { toast } = useToast();

  const mappedSocialRanks = useMemo(() => {
    return socialRanks.map(rank => ({
        ...rank,
        icon: iconMap[rank.icon as any] || Shield
    }));
  }, [socialRanks]);


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
    const fetchRanks = async () => {
        const { ranks } = await getSocialRanks();
        if (ranks) {
             setSocialRanks(ranks.sort((a,b) => a.threshold - b.threshold));
        } else {
            setSocialRanks(DEFAULT_SOCIAL_RANKS);
        }
    };
    fetchRanks();

    const settingsRef = doc(db, 'game_settings', 'social_ranks');
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists()) {
            const ranksData = docSnap.data().list || DEFAULT_SOCIAL_RANKS;
            setSocialRanks(ranksData.sort((a: SocialRank, b: SocialRank) => a.threshold - b.threshold));
        }
    });

    return () => unsubscribe();
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

          const profile: UserProfile = {
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
          };
          setUserProfile(profile);

          const currentRank = getSocialRankForUser(profile.leaderboardPoints, mappedSocialRanks);
          if (currentRank && prevRankName.current && currentRank.name !== prevRankName.current) {
               sendSystemMail(user.uid, {
                   subject: `🎉 تهانينا على ترقيتك!`,
                   body: `لقد وصلت إلى لقب "${currentRank.name}"! استمر في اللعب لتحقيق المزيد. وهذه هدية بسيطة منا.`,
                   coins: 3,
               });
          }
          prevRankName.current = currentRank?.name || null;

        } else {
          setUserProfile(null);
          prevRankName.current = null;
        }
        setLoading(false);
      });
      return () => unsubscribeProfile();
    }
  }, [user, mappedSocialRanks, toast]);

  const refreshUserProfile = () => {
    if(user) {
      fetchUserProfile(user);
    }
  }

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, socialRanks: mappedSocialRanks, refreshUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
