

"use client";

import { useState, useEffect, createContext, useContext, type ReactNode, useRef, useMemo, useCallback } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, getDoc, collection, query, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { League, SocialRank, UserProfile, Article } from '@/types';
import { DEFAULT_SOCIAL_RANKS } from '@/types';
import { getSocialRanks } from '@/lib/actions/admin';
import { sendSystemMail } from '@/lib/actions/user';
import { Award, Crown, Gem, Shield, ShieldCheck, Star } from 'lucide-react';
import { getPublishedArticles } from '@/lib/actions/news';

const iconMap: Record<string, React.ElementType> = {
    Shield, ShieldCheck, Award, Gem, Crown, Star
};


interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  socialRanks: SocialRank[];
  refreshUserProfile?: () => Promise<void>;
  getSocialRankForUser: (points: number, allRanks: SocialRank[]) => SocialRank | null;
  latestArticleDate: Date | null;
  setLatestArticleDate?: (date: Date) => void;
  newArticlesAvailable: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  socialRanks: [],
  getSocialRankForUser: () => null,
  latestArticleDate: null,
  newArticlesAvailable: false,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [socialRanks, setSocialRanks] = useState<SocialRank[]>([]);
  
  // State for news notifications
  const [latestArticleDate, setLatestArticleDate] = useState<Date | null>(null);
  const [newArticlesAvailable, setNewArticlesAvailable] = useState(false);
  
  const prevRankName = useRef<string | null>(null);
  const prevPoints = useRef<number | null>(null);

  const getSocialRankForUser = useCallback((points: number, allRanks: SocialRank[]): SocialRank | null => {
    if (!allRanks || allRanks.length === 0) {
        allRanks = DEFAULT_SOCIAL_RANKS;
    }
    
    const sortedRanks = [...allRanks].sort((a,b) => b.threshold - a.threshold);

    for (const rank of sortedRanks) {
        if (points >= rank.threshold) {
            return rank;
        }
    }

    return sortedRanks[sortedRanks.length -1] || null; // Return the lowest rank if no match
  }, []);


  const mappedSocialRanks = useMemo(() => {
    return socialRanks.map(rank => ({
        ...rank,
        icon: iconMap[rank.icon as any] || Shield
    }));
  }, [socialRanks]);


  const fetchUserProfile = useCallback(async (firebaseUser: User) => {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        setUserProfile({
          uid: firebaseUser.uid,
          name: data.name || firebaseUser.displayName || 'Unknown User',
          email: firebaseUser.email,
          gender: data.gender,
          isAdmin: data.isAdmin === true,
          isEditor: data.isEditor || false,
          coins: data.coins ?? 0,
          diamonds: data.diamonds ?? 0,
          avatarId: data.avatarId || 'Avatar00.png',
          unlockedAvatars: data.unlockedAvatars || ['Avatar00.png'],
          leaderboardPoints: data.leaderboardPoints || 0,
          honorPoints: data.honorPoints || 0,
          loyaltyPoints: data.loyaltyPoints || 0,
          rebellionPoints: data.rebellionPoints || 0,
          trophies: data.trophies || 0,
          gamesPlayed: data.gamesPlayed || 0,
          hasChangedName: data.hasChangedName || false,
          leagues: data.leagues || [],
          winCounts: data.winCounts || {},
          clan: data.clan || null,
          clanRole: data.clanRole,
          audienceGroups: data.audienceGroups || [],
          humiliation: data.humiliation || null,
          allegiance: data.allegiance || null,
          taxDemands: (data.taxDemands || []).filter((d: TaxDemand) => d.status === 'pending'),
          alliances: data.alliances || [],
          decrees: (data.decrees || []).filter((d: Decree) => d.until && new Date(d.until) > new Date()),
          duelChallenges: (data.duelChallenges || []).filter((d: DuelChallenge) => d.status === 'pending'),
          lastPunishmentTimestamp: data.lastPunishmentTimestamp || {},
        });
      } else {
        setUserProfile(null);
      }
      setLoading(false);
  }, []);
  
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
            gender: data.gender,
            isAdmin: data.isAdmin === true,
            isEditor: data.isEditor || false,
            coins: data.coins ?? 0,
            diamonds: data.diamonds ?? 0,
            avatarId: data.avatarId || 'Avatar00.png',
            unlockedAvatars: data.unlockedAvatars || ['Avatar00.png'],
            leaderboardPoints: data.leaderboardPoints || 0,
            honorPoints: data.honorPoints || 0,
            loyaltyPoints: data.loyaltyPoints || 0,
            rebellionPoints: data.rebellionPoints || 0,
            trophies: data.trophies || 0,
            gamesPlayed: data.gamesPlayed || 0,
            hasChangedName: data.hasChangedName || false,
            leagues: data.leagues || [],
            winCounts: data.winCounts || {},
            clan: data.clan || null,
            clanRole: data.clanRole,
            audienceGroups: data.audienceGroups || [],
            humiliation: data.humiliation || null,
            allegiance: data.allegiance || null,
            taxDemands: (data.taxDemands || []).filter((d: TaxDemand) => d.status === 'pending'),
            alliances: data.alliances || [],
            decrees: (data.decrees || []).filter((d: Decree) => d.until && new Date(d.until) > new Date()),
            duelChallenges: (data.duelChallenges || []).filter((d: DuelChallenge) => d.status === 'pending'),
            lastPunishmentTimestamp: data.lastPunishmentTimestamp || {},
          };
          setUserProfile(profile);

          const currentRank = getSocialRankForUser(profile.leaderboardPoints, mappedSocialRanks);
          
          if (currentRank && prevRankName.current && currentRank.name !== prevRankName.current && profile.leaderboardPoints > (prevPoints.current ?? -1)) {
               sendSystemMail(user.uid, {
                   subject: `🎉 تهانينا على ترقيتك!`,
                   body: `لقد وصلت إلى لقب "${currentRank.name}"! استمر في اللعب لتحقيق المزيد. وهذه هدية بسيطة منا.`,
                   coins: 3,
               });
          }
          
          prevRankName.current = currentRank?.name || null;
          prevPoints.current = profile.leaderboardPoints;


        } else {
          setUserProfile(null);
          prevRankName.current = null;
          prevPoints.current = null;
        }
        setLoading(false);
      });
      return () => unsubscribeProfile();
    }
  }, [user, mappedSocialRanks, getSocialRankForUser]);
  
  
   useEffect(() => {
    if (user) {
        // Fetch the latest article date on initial load
        const q = query(collection(db, 'articles'), where('isPublished', '==', true), orderBy('createdAt', 'desc'), limit(1));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const latestArticle = snapshot.docs[0].data() as Article;
                const latestDate = (latestArticle.createdAt as any)?.toDate();
                if (latestDate) {
                     setLatestArticleDate(latestDate);
                }
            }
        });
        return () => unsubscribe();
    }
  }, [user]);

  useEffect(() => {
      if (latestArticleDate) {
          const lastVisitString = localStorage.getItem('lastNewsVisit');
          if (lastVisitString) {
              const lastVisitDate = new Date(lastVisitString);
              setNewArticlesAvailable(latestArticleDate > lastVisitDate);
          } else {
              setNewArticlesAvailable(true); // If never visited, news are new
          }
      }
  }, [latestArticleDate]);

  const refreshUserProfile = useCallback(async () => {
    if(user) {
      setLoading(true);
      await fetchUserProfile(user);
      setLoading(false);
    }
  }, [user, fetchUserProfile]);

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, socialRanks: mappedSocialRanks, refreshUserProfile, getSocialRankForUser, latestArticleDate, setLatestArticleDate, newArticlesAvailable }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
