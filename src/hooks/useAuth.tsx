"use client";

import {
  useState,
  useEffect,
  createContext,
  useContext,
  type ReactNode,
  useRef,
  useCallback,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  doc,
  onSnapshot,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type {
  SocialRank,
  UserProfile,
  TaxDemand,
  Decree,
  DuelChallenge,
  Challenge,
  AllegianceRequest,
} from "@/types";
import { DEFAULT_SOCIAL_RANKS } from "@/data/social-ranks";

/** حساب الرتبة الاجتماعية محليًا (بدون نداءات خادمية) */
function getSocialRankForUser(
  points: number,
  allRanks: SocialRank[] | undefined
): SocialRank | null {
  const ranks = (allRanks?.length ? allRanks : DEFAULT_SOCIAL_RANKS).slice();
  ranks.sort((a, b) => b.threshold - a.threshold);
  for (const rank of ranks) {
    if (points >= rank.threshold) return rank;
  }
  return ranks[ranks.length - 1] ?? null;
}

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
  activeChallenges: Challenge[];
  newChallengeAvailable: boolean;
  markChallengeAsSeen: (challengeDate: Date | Timestamp) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  socialRanks: [],
  getSocialRankForUser: () => null,
  latestArticleDate: null,
  newArticlesAvailable: false,
  activeChallenges: [],
  newChallengeAvailable: false,
  markChallengeAsSeen: () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [socialRanks, setSocialRanks] = useState<SocialRank[]>([]);
  const [latestArticleDate, setLatestArticleDate] = useState<Date | null>(null);
  const [newArticlesAvailable, setNewArticlesAvailable] = useState(false);
  const [activeChallenges, setActiveChallenges] = useState<Challenge[]>([]);
  const [newChallengeAvailable, setNewChallengeAvailable] = useState(false);

  // مراجع داخليّة (قد تنفع لاحقًا للتنبيهات)
  const mountedRef = useRef<boolean>(false);

  /** دالة مرتجعة تحافظ على نفس المرجع وتستخدم socialRanks الحالية */
  const memoizedGetSocialRankForUser = useCallback(
    (points: number, allRanks?: SocialRank[]) =>
      getSocialRankForUser(points, allRanks && allRanks.length ? allRanks : socialRanks),
    [socialRanks]
  );

  /** تحويل وثيقة المستخدم إلى UserProfile بأمان الأنواع */
  const buildUserProfile = useCallback(
    (firebaseUser: User, data: DocumentData): UserProfile => {
      const now = new Date();
      const ensureDate = (v: unknown): Date | null => {
        if (!v) return null;
        if (v instanceof Timestamp) return v.toDate();
        if (typeof v === "string" || v instanceof Date) return new Date(v);
        return null;
        // نعيد null إذا كان النوع غير معروف بدل كسر الواجهة
      };

      const currentRank = memoizedGetSocialRankForUser(
        Number(data.leaderboardPoints ?? 0),
        socialRanks
      );

      return {
        uid: firebaseUser.uid,
        name: data.name || firebaseUser.displayName || "Unknown User",
        email: firebaseUser.email,
        gender: data.gender ?? null,
        isAdmin: data.isAdmin === true,
        isEditor: Boolean(data.isEditor),
        coins: Number(data.coins ?? 0),
        diamonds: Number(data.diamonds ?? 0),
        avatarId: data.avatarId || "Avatar00.png",
        unlockedAvatars: Array.isArray(data.unlockedAvatars)
          ? data.unlockedAvatars
          : ["Avatar00.png"],
        leaderboardPoints: Number(data.leaderboardPoints ?? 0),
        honorPoints: Number(data.honorPoints ?? 0),
        loyaltyPoints: Number(data.loyaltyPoints ?? 0),
        rebellionPoints: Number(data.rebellionPoints ?? 0),
        trophies: Number(data.trophies ?? 0),
        gamesPlayed: Number(data.gamesPlayed ?? 0),
        hasChangedName: Boolean(data.hasChangedName),
        leagues: Array.isArray(data.leagues) ? data.leagues : [],
        winCounts: (data.winCounts as Record<string, number>) ?? {},
        clan: data.clan ?? null,
        clanRole: data.clanRole ?? null,
        audienceGroups: Array.isArray(data.audienceGroups) ? data.audienceGroups : [],
        humiliation: data.humiliation ?? null,
        allegiance: data.allegiance ?? null,
        allegianceRequests: (Array.isArray(data.allegianceRequests)
          ? data.allegianceRequests
          : []
        ).filter((r: AllegianceRequest) => r?.status === "pending"),
        taxDemands: (Array.isArray(data.taxDemands) ? data.taxDemands : []).filter(
          (d: TaxDemand) => d?.status === "pending"
        ),
        alliances: Array.isArray(data.alliances) ? data.alliances : [],
        decrees: (Array.isArray(data.decrees) ? data.decrees : []).filter(
          (d: Decree) => {
            const untilDate = ensureDate(d?.until);
            return !!(untilDate && untilDate > now);
          }
        ),
        duelChallenges: (Array.isArray(data.duelChallenges) ? data.duelChallenges : []).filter(
          (d: DuelChallenge) => d?.status === "pending"
        ),
        lastPunishmentTimestamp: data.lastPunishmentTimestamp || {},
        originalAvatarToRevert: data.originalAvatarToRevert ?? null,
        permissions: currentRank?.permissions || [],
        unlockedPunishmentAvatars: Array.isArray(data.unlockedPunishmentAvatars)
          ? data.unlockedPunishmentAvatars
          : [],
      };
    },
    [memoizedGetSocialRankForUser, socialRanks]
  );

  /** تحميل رتب المجتمع من Firestore مع fallback افتراضي */
  useEffect(() => {
    mountedRef.current = true;

    // الرتب من إعدادات اللعبة (يفضّلها على الثابتة)
    const settingsRef = doc(db, "game_settings", "social_ranks");
    const unsubRanks = onSnapshot(
      settingsRef,
      (snap) => {
        if (!mountedRef.current) return;
        const list = (snap.data()?.list ?? DEFAULT_SOCIAL_RANKS) as SocialRank[];
        const sorted = list.slice().sort((a, b) => a.threshold - b.threshold);
        setSocialRanks(sorted);
      },
      () => {
        // عند الفشل استخدم الافتراضي ولا تكسر الواجهة
        setSocialRanks(DEFAULT_SOCIAL_RANKS.slice().sort((a, b) => a.threshold - b.threshold));
      }
    );

    return () => {
      mountedRef.current = false;
      unsubRanks();
    };
  }, []);

  /** مراقبة حالة الدخول */
  useEffect(() => {
    setLoading(true);
    const unsubAuth = onAuthStateChanged(auth!, (authUser) => {
      setUser(authUser);
      if (!authUser) {
        setUserProfile(null);
        setLoading(false);
      }
    });
    return () => unsubAuth();
  }, []);

  /** الاشتراك في تغييرات بروفايل المستخدم */
  useEffect(() => {
    if (!user) return;

    setLoading(true);
    const userDocRef = doc(db, "users", user.uid);
    const unsubProfile = onSnapshot(
      userDocRef,
      (snap) => {
        if (!snap.exists()) {
          setUserProfile(null);
          setLoading(false);
          return;
        }
        const data = snap.data();
        const profile = buildUserProfile(user, data);
        setUserProfile(profile);
        setLoading(false);
      },
      () => {
        setUserProfile(null);
        setLoading(false);
      }
    );

    return () => unsubProfile();
  }, [user, buildUserProfile]);

  /** أحدث مقال منشور لمعرفة إن كان هناك جديد بعد آخر زيارة */
  useEffect(() => {
    if (!user) return;

    const qLatest = query(
      collection(db, "articles"),
      where("isPublished", "==", true),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const unsubArticles = onSnapshot(
      qLatest,
      (snapshot) => {
        if (snapshot.empty) return;
        const docData = snapshot.docs[0].data();
        const createdAt = docData?.createdAt;
        const date =
          createdAt instanceof Timestamp
            ? createdAt.toDate()
            : createdAt
            ? new Date(createdAt)
            : null;
        if (date) setLatestArticleDate(date);
      },
      (error) => {
        // قد يحتاج اندِكس مركب — لا تكسر الواجهة
        console.warn(
          "Firestore snapshot error on latest article query (index required?):",
          error?.message
        );
      }
    );

    return () => unsubArticles();
  }, [user]);

  /** مقارنة أحدث خبر بتاريخ آخر زيارة (يتطلب window) */
  useEffect(() => {
    if (!latestArticleDate) return;
    if (typeof window === "undefined") return;

    const lastVisitString = window.localStorage.getItem("lastNewsVisit");
    if (!lastVisitString) {
      setNewArticlesAvailable(true);
      return;
    }
    const lastVisit = new Date(lastVisitString);
    setNewArticlesAvailable(latestArticleDate > lastVisit);
  }, [latestArticleDate]);

  /** الاشتراك في التحديات النشطة */
  useEffect(() => {
    if (!user) return;

    const challengesQuery = query(
      collection(db, "challenges"),
      where("endsAt", ">", Timestamp.now()),
      orderBy("endsAt", "asc"),
      limit(5)
    );

    const unsubChallenges = onSnapshot(challengesQuery, (snapshot) => {
      const fetched = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() } as unknown as Challenge)
      );
      setActiveChallenges(fetched);

      if (typeof window === "undefined") return;

      if (fetched.length === 0) {
        setNewChallengeAvailable(false);
        return;
      }

      const latest = fetched[0];
      // نستخدم createdAt إن وجد، وإلا endsAt كمرجع حديث
      const tsRaw = (latest as any).createdAt ?? (latest as any).endsAt;
      const latestMs =
        tsRaw instanceof Timestamp ? tsRaw.toMillis() : tsRaw ? new Date(tsRaw).getTime() : 0;

      const lastSeen = window.localStorage.getItem("lastChallengeView");
      const lastSeenMs = lastSeen ? parseInt(lastSeen, 10) : 0;

      setNewChallengeAvailable(latestMs > lastSeenMs);
    });

    return () => unsubChallenges();
  }, [user]);

  /** تعليم أحدث تحدٍ كمقروء */
  const markChallengeAsSeen = (challengeDate: Date | Timestamp) => {
    if (typeof window === "undefined" || !challengeDate) return;
    const ms =
      challengeDate instanceof Timestamp ? challengeDate.toMillis() : challengeDate.getTime();
    window.localStorage.setItem("lastChallengeView", String(ms));
    setNewChallengeAvailable(false);
  };

  /** تحديث يدوي للبروفايل (قراءة لحظية من Firestore) */
  const refreshUserProfile = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        setUserProfile(buildUserProfile(user, snap.data()));
      }
    } finally {
      setLoading(false);
    }
  }, [user, buildUserProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        socialRanks,
        refreshUserProfile,
        getSocialRankForUser: memoizedGetSocialRankForUser,
        latestArticleDate,
        setLatestArticleDate,
        newArticlesAvailable,
        activeChallenges,
        newChallengeAvailable,
        markChallengeAsSeen,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
