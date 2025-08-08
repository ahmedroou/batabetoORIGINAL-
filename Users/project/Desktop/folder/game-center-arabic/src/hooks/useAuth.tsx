

"use client";

import { useState, useEffect, createContext, useContext, type ReactNode, useRef, useMemo, useCallback } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot, getDoc, collection, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { League, SocialRank, UserProfile, Article, TaxDemand, Decree, DuelChallenge, PermissionId } from '@/types';
import { DEFAULT_SOCIAL_RANKS } from '@/types';
import { getRanks, getSocialRankForUser } from '@/lib/actions/user/queries';
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
  getSocialRankForUser: (points: number, allRanks?: SocialRank[]) => SocialRank | null;
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
  
  const [latestArticleDate, setLatestArticleDate] = useState<Date | null>(null);
  const [newArticlesAvailable, setNewArticlesAvailable] = useState(false);
  
  const prevRankName = useRef<string | null>(null);
  const prevPoints = useRef<number | null>(null);

  const memoizedGetSocialRankForUser = useCallback((points: number, allRanks?: SocialRank[]): SocialRank | null => {
    const ranksToUse = allRanks && allRanks.length > 0 ? allRanks : socialRanks;
    return getSocialRankForUser(points, ranksToUse);
  }, [socialRanks]);


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
        
        const currentRank = memoizedGetSocialRankForUser(data.leaderboardPoints || 0, mappedSocialRanks);
        
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
          originalAvatarToRevert: data.originalAvatarToRevert || null,
          permissions: currentRank?.permissions || [],
          unlockedPunishmentAvatars: data.unlockedPunishmentAvatars || [],
        });
      } else {
        setUserProfile(null);
      }
      setLoading(false);
  }, [mappedSocialRanks, memoizedGetSocialRankForUser]);
  
  useEffect(() => {
    const fetchRanks = async () => {
        const ranksResult = await getRanks();
        if (ranksResult.success && ranksResult.ranks) {
            setSocialRanks(ranksResult.ranks.sort((a, b) => a.threshold - b.threshold));
        } else {
            console.error("Failed to fetch ranks, using default.");
            setSocialRanks(DEFAULT_SOCIAL_RANKS.sort((a,b) => a.threshold - b.threshold));
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
      
      const unsubscribeProfile = onSnapshot(userDocRef, async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();

          const currentRank = memoizedGetSocialRankForUser(data.leaderboardPoints || 0, mappedSocialRanks);

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
            originalAvatarToRevert: data.originalAvatarToRevert || null,
            permissions: currentRank?.permissions || [],
            unlockedPunishmentAvatars: data.unlockedPunishmentAvatars || [],
          };
          setUserProfile(profile);

        } else {
          setUserProfile(null);
          prevRankName.current = null;
          prevPoints.current = null;
        }
        setLoading(false);
      });
      return () => unsubscribeProfile();
    }
  }, [user, mappedSocialRanks, memoizedGetSocialRankForUser]);
  
  
   useEffect(() => {
    if (user) {
        // This query was causing a missing index error. 
        // We will fetch all published articles and sort client-side in getPublishedArticles.
        const q = query(collection(db, 'articles'), where('isPublished', '==', true), orderBy('createdAt', 'desc'), limit(1));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const latestArticle = snapshot.docs[0].data() as Article;
                const latestDate = (latestArticle.createdAt as any)?.toDate();
                if (latestDate) {
                     setLatestArticleDate(latestDate);
                }
            }
        }, (error) => {
            // This will catch the index error. We can safely ignore it here as the UI will still function.
            console.warn("Firestore snapshot error on latest article query (this may be an index issue):", error.message);
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
              setNewArticlesAvailable(true);
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
    <AuthContext.Provider value={{ user, userProfile, loading, socialRanks: mappedSocialRanks, refreshUserProfile, getSocialRankForUser: memoizedGetSocialRankForUser, latestArticleDate, setLatestArticleDate, newArticlesAvailable }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

    