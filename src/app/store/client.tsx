
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

import { Loader2, Lock, Check, CircleDollarSign, Diamond, ShoppingCart, Search, Filter, Sparkles, ShieldAlert, Info, Star } from "lucide-react";

import { AVATAR_IDS } from "@/data/avatars";
import { PUNISHMENT_AVATAR_IDS } from "@/data/punishment-avatars";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";

import type { AvatarPrice } from "@/types";
import { getAvatarPrices, getPunishmentAvatarPrices } from "@/lib/actions/admin";
import { purchaseAvatar, purchasePunishmentAvatar } from "@/lib/actions/user";
import { cn } from "@/lib/utils";

// ————————————————————————————————————————————————
// GPT‑5 Enhanced Store Client
// Visual polish + scalable filters + responsive grid + graceful loading
// ————————————————————————————————————————————————

type Currency = "coins" | "diamonds";

type StoreTab = "regular" | "punishment";

type SortKey = "price-asc" | "price-desc" | "alpha-asc" | "alpha-desc" | "owned-first" | "unowned-first";

type FilterKey = "all" | "owned" | "unowned" | "affordable" | "free";

export default function StoreClient() {
  const { toast } = useToast();
  const router = useRouter();
  const { userProfile, loading, refreshUserProfile } = useAuth();

  // Remote price maps
  const [prices, setPrices] = useState<Record<string, Omit<AvatarPrice, "avatarId">>>({});
  const [punishmentPrices, setPunishmentPrices] = useState<Record<string, Omit<AvatarPrice, "avatarId">>>({});

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [purchaseCandidate, setPurchaseCandidate] = useState<{ avatar: AvatarPrice; type: StoreTab } | null>(null);

  const [activeTab, setActiveTab] = useState<StoreTab>("regular");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("owned-first");
  const [filterBy, setFilterBy] = useState<FilterKey>("all");
  const [visibleCount, setVisibleCount] = useState(24);

  // Local favorites (purely cosmetic)
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});

  const fetchPageData = useCallback(async () => {
    setIsLoadingData(true);
    const [pricesResult, punishmentPricesResult] = await Promise.all([
      getAvatarPrices(),
      getPunishmentAvatarPrices(),
    ]);

    if (pricesResult.success && pricesResult.prices) {
      const map = pricesResult.prices.reduce((acc, item) => {
        acc[item.avatarId] = { price: item.price, currency: item.currency || "coins" };
        return acc;
      }, {} as Record<string, Omit<AvatarPrice, "avatarId">>);
      setPrices(map);
    }

    if (punishmentPricesResult.success && punishmentPricesResult.prices) {
      const map = punishmentPricesResult.prices.reduce((acc, item) => {
        acc[item.avatarId] = { price: item.price, currency: item.currency || "coins" };
        return acc;
      }, {} as Record<string, Omit<AvatarPrice, "avatarId">>);
      setPunishmentPrices(map);
    }
    setIsLoadingData(false);
  }, []);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  // Auth redirect if not logged in
  useEffect(() => {
    if (!loading && !userProfile) {
      router.push("/login");
    }
  }, [userProfile, loading, router]);

  const currentPrices = activeTab === "regular" ? prices : punishmentPrices;
  const avatarList = activeTab === "regular" ? AVATAR_IDS : PUNISHMENT_AVATAR_IDS;
  const unlocked = activeTab === "regular" ? userProfile?.unlockedAvatars || [] : userProfile?.unlockedPunishmentAvatars || [];

  const balances = useMemo(() => ({
    coins: userProfile?.coins ?? 0,
    diamonds: userProfile?.diamonds ?? 0,
  }), [userProfile]);

  // Enriched list for UI
  const enriched = useMemo(() => {
    return avatarList.map((id) => {
      const p = currentPrices[id];
      return {
        id,
        price: p?.price ?? -1,
        currency: (p?.currency ?? "coins") as Currency,
        isOwned: unlocked.includes(id),
        isFree: (p?.price ?? -1) === 0,
      };
    });
  }, [avatarList, currentPrices, unlocked]);

  // Filters
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const byText = (x: typeof enriched[number]) => (q ? x.id.toLowerCase().includes(q) : true);

    const byFilter = (x: typeof enriched[number]) => {
      switch (filterBy) {
        case "owned":
          return x.isOwned;
        case "unowned":
          return !x.isOwned;
        case "affordable":
          if (x.price < 0) return false;
          const bal = x.currency === "coins" ? balances.coins : balances.diamonds;
          return bal >= x.price;
        case "free":
          return x.isFree;
        default:
          return true;
      }
    };

    const bySort = (a: typeof enriched[number], b: typeof enriched[number]) => {
      switch (sortBy) {
        case "price-asc":
          return (a.price === -1 ? Infinity : a.price) - (b.price === -1 ? Infinity : b.price);
        case "price-desc":
          return (b.price === -1 ? Infinity : b.price) - (a.price === -1 ? Infinity : a.price);
        case "alpha-asc":
          return a.id.localeCompare(b.id);
        case "alpha-desc":
          return b.id.localeCompare(a.id);
        case "unowned-first":
          return Number(a.isOwned) - Number(b.isOwned);
        case "owned-first":
        default:
          return Number(b.isOwned) - Number(a.isOwned);
      }
    };

    return enriched.filter(byText).filter(byFilter).sort(bySort);
  }, [enriched, searchTerm, filterBy, sortBy, balances]);

  // Pagination (within ScrollArea)
  const visibleItems = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Purchase
  const handlePurchaseConfirm = async () => {
    if (!userProfile || !purchaseCandidate) return;
    setIsSubmitting(true);

    const { avatar, type } = purchaseCandidate;
    const result = type === "regular"
      ? await purchaseAvatar(userProfile.uid, avatar.avatarId)
      : await purchasePunishmentAvatar(userProfile.uid, avatar.avatarId);

    if (result.success) {
      toast({ title: "تم الشراء بنجاح!", description: "تمت إضافة الشخصية إلى مجموعتك." });
      await refreshUserProfile?.();
    } else {
      toast({ title: "فشل الشراء", description: result.error, variant: "destructive" });
    }

    setIsSubmitting(false);
    setPurchaseCandidate(null);
  };

  const onCardClick = (id: string) => {
    const p = currentPrices[id];
    const isOwned = unlocked.includes(id);
    if (isOwned) {
      toast({ title: "مملوكة بالفعل", description: "أنت تملك هذه الشخصية." });
      return;
    }
    if (!p || p.price < 0) {
      toast({ title: "غير متاحة", description: "هذه الشخصية غير متاحة للبيع حاليًا.", variant: "destructive" });
      return;
    }
    setPurchaseCandidate({ avatar: { avatarId: id, price: p.price, currency: p.currency || "coins" }, type: activeTab });
  };

  const toggleFavorite = (id: string) => setFavorites((f) => ({ ...f, [id]: !f[id] }));

  // — UI —
  if (!userProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <main className="min-h-screen w-full bg-gray-900 bg-gradient-to-tr from-black via-gray-900 to-purple-900/50 text-white">
      {/* Cosmic background (from global.css) */}
      <div className="fixed inset-0 stars z-0" />
      <div className="fixed inset-0 twinkling z-0" />

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-6 flex flex-col items-center gap-4 text-center">
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-4xl md:text-5xl font-extrabold text-purple-300 tracking-wider flex items-center gap-3">
            <ShoppingCart className="h-10 w-10" /> متجر الشخصيات
          </motion.h1>
          <p className="text-gray-300/90">اشترِ شخصيات أسطورية وتألق داخل المجتمع 👑</p>

          {/* Balance strip */}
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="w-full">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="bg-black/40 border-purple-500/30 backdrop-blur-md">
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-sm text-gray-300">كوينز</span>
                  <span className="inline-flex items-center gap-1 text-yellow-400 font-mono text-lg"><CircleDollarSign className="h-5 w-5" />{balances.coins}</span>
                </CardContent>
              </Card>
              <Card className="bg-black/40 border-purple-500/30 backdrop-blur-md">
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-sm text-gray-300">ألماس</span>
                  <span className="inline-flex items-center gap-1 text-blue-300 font-mono text-lg"><Diamond className="h-5 w-5" />{balances.diamonds}</span>
                </CardContent>
              </Card>
              <Card className="hidden sm:block bg-black/40 border-purple-500/30 backdrop-blur-md">
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-sm text-gray-300">المملوكة</span>
                  <span className="font-mono text-lg">{unlocked.length}</span>
                </CardContent>
              </Card>
              <Card className="hidden sm:block bg-black/40 border-purple-500/30 backdrop-blur-md">
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-sm text-gray-300">المعروضة</span>
                  <span className="font-mono text-lg">{filtered.length}</span>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        </header>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as StoreTab); setVisibleCount(24); }} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-black/30 backdrop-blur-sm border border-purple-500/30 text-purple-300">
            <TabsTrigger value="regular">المتجر العادي</TabsTrigger>
            <TabsTrigger value="punishment">متجر العقوبات</TabsTrigger>
          </TabsList>

          {/* Toolbar */}
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
            <div className="lg:col-span-5">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  dir="auto"
                  className="w-full rounded-md border border-purple-500/30 bg-gray-900/70 px-10 py-2 text-sm outline-none ring-0 focus:border-purple-400"
                  placeholder="ابحث عن شخصية بالاسم…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="lg:col-span-7 grid grid-cols-2 md:grid-cols-4 gap-2">
              <select
                className="rounded-md border border-purple-500/30 bg-gray-900/70 px-3 py-2 text-sm"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
              >
                <option value="owned-first">المملوك أولاً</option>
                <option value="unowned-first">غير المملوك أولاً</option>
                <option value="price-asc">الأقل سعراً</option>
                <option value="price-desc">الأعلى سعراً</option>
                <option value="alpha-asc">أ-ي</option>
                <option value="alpha-desc">ي-أ</option>
              </select>

              <select
                className="rounded-md border border-purple-500/30 bg-gray-900/70 px-3 py-2 text-sm"
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value as FilterKey)}
              >
                <option value="all">الكل</option>
                <option value="owned">المملوكة</option>
                <option value="unowned">غير المملوكة</option>
                <option value="affordable">المتاح شراؤها</option>
                <option value="free">المجانية</option>
              </select>

              <Button variant="outline" className="border-purple-500/30" onClick={() => { setSearchTerm(""); setFilterBy("all"); setSortBy("owned-first"); }}>
                <Filter className="ml-2 h-4 w-4" />تصفية افتراضية
              </Button>

              <Button variant="secondary" className="bg-purple-600/30 hover:bg-purple-600/40 border-purple-400/30" onClick={() => toast({ title: "تلميح", description: "انقر على البطاقة للشراء السريع. استعمل النجمة للإضافة للمفضلة." })}>
                <Info className="ml-2 h-4 w-4" />مساعدة
              </Button>
            </div>
          </div>

          {/* Grid */}
          <TabsContent value="regular" className="mt-4">
            <StoreGrid
              isLoadingData={isLoadingData}
              items={visibleItems}
              hasMore={hasMore}
              onLoadMore={() => setVisibleCount((c) => c + 24)}
              onCardClick={onCardClick}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          </TabsContent>
          <TabsContent value="punishment" className="mt-4">
            <StoreGrid
              isLoadingData={isLoadingData}
              items={visibleItems}
              hasMore={hasMore}
              onLoadMore={() => setVisibleCount((c) => c + 24)}
              onCardClick={onCardClick}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Confirm */}
      <AlertDialog open={!!purchaseCandidate} onOpenChange={(o) => !o && setPurchaseCandidate(null)}>
        <AlertDialogContent className="bg-gray-900 text-white border-purple-500/40">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الشراء</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              هل تريد شراء هذه الشخصية مقابل
              {" "}
              <strong className={cn("font-bold", purchaseCandidate?.avatar.currency === "coins" ? "text-yellow-400" : "text-blue-300")}>{purchaseCandidate?.avatar.price || 0} {purchaseCandidate?.avatar.currency === "coins" ? "كوينز" : "ألماس"}</strong>؟ سيتم خصم المبلغ من رصيدك.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handlePurchaseConfirm} disabled={isSubmitting}>
              {isSubmitting ? "جاري الشراء…" : "شراء"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

// ————————————————————————————————————————————————
// Grid Component (stateless)
// ————————————————————————————————————————————————

type GridItem = {
  id: string;
  price: number; // -1 => not sold
  currency: Currency;
  isOwned: boolean;
  isFree: boolean;
};

function StoreGrid({
  isLoadingData,
  items,
  hasMore,
  onLoadMore,
  onCardClick,
  favorites,
  onToggleFavorite,
}: {
  isLoadingData: boolean;
  items: GridItem[];
  hasMore: boolean;
  onLoadMore: () => void;
  onCardClick: (id: string) => void;
  favorites: Record<string, boolean>;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <Card className="bg-black/40 border-purple-500/30 backdrop-blur-md">
      <CardContent className="p-0">
        {isLoadingData ? (
          <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="h-36 rounded-lg bg-gray-800/60 animate-pulse" />
            ))}
          </div>
        ) : (
          <ScrollArea className="h-[68vh]">
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {items.map((it) => (
                <motion.button
                  key={it.id}
                  onClick={() => onCardClick(it.id)}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "relative group text-left rounded-lg border-2 p-1 transition-all",
                    it.isOwned ? "border-green-500/80 bg-green-900/10" : "border-gray-700/60 bg-gray-900/60 hover:border-purple-400/60"
                  )}
                >
                  {/* Favorite */}
                  <div className="absolute left-1 top-1 z-10">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onToggleFavorite(it.id); }}
                      className={cn("rounded-full p-1 bg-black/40 border border-white/10", favorites[it.id] ? "text-yellow-300" : "text-white/60")}
                      aria-label={favorites[it.id] ? "إزالة من المفضلة" : "أضف إلى المفضلة"}
                    >
                      <Star className={cn("h-4 w-4", favorites[it.id] && "fill-current")}/>
                    </button>
                  </div>

                  {/* Badge owned */}
                  {it.isOwned && (
                    <div className="absolute right-1 top-1 z-10 rounded-full bg-green-600/90 text-white px-2 py-0.5 text-[10px] font-bold inline-flex items-center gap-1">
                      <Check className="h-3 w-3" /> مملوكة
                    </div>
                  )}

                  {/* Image */}
                  <div className="rounded-md overflow-hidden">
                    <PlayerAvatar avatarId={it.id} className="w-full aspect-square rounded-md border border-white/10" />
                  </div>

                  {/* Footer strip */}
                  <div className="mt-2 flex items-center justify-between">
                    <div className="truncate text-sm text-gray-200" title={it.id}>{it.id.replace(/\.png$/i, "")}</div>
                    {it.price >= 0 ? (
                      <div className={cn("ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold", it.currency === "coins" ? "bg-yellow-500/15 text-yellow-300" : "bg-blue-500/15 text-blue-300")}> 
                        {it.currency === "coins" ? <CircleDollarSign className="h-4 w-4"/> : <Diamond className="h-4 w-4"/>}
                        <span>{it.price}</span>
                      </div>
                    ) : (
                      <div className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-600/20 text-gray-300 px-2 py-0.5 text-xs font-bold">
                        <ShieldAlert className="h-4 w-4" /> غير متاح
                      </div>
                    )}
                  </div>

                  {/* Hover CTA */}
                  {!it.isOwned && it.price >= 0 && (
                    <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-t from-black/60 via-black/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                  {!it.isOwned && it.price >= 0 && (
                    <div className="absolute inset-x-2 bottom-2 flex justify-center">
                      <div className="pointer-events-none inline-flex items-center gap-2 rounded-full bg-purple-600/90 px-3 py-1 text-xs font-extrabold text-white shadow-lg group-hover:scale-[1.02] transition">
                        <Sparkles className="h-3.5 w-3.5" /> اضغط للشراء
                      </div>
                    </div>
                  )}

                  {/* Locked overlay */}
                  {!it.isOwned && it.price < 0 && (
                    <div className="absolute inset-0 rounded-lg bg-black/60 grid place-items-center text-white">
                      <Lock className="h-7 w-7" />
                    </div>
                  )}
                </motion.button>
              ))}
            </div>

            {hasMore && (
              <div className="p-4 text-center">
                <Button variant="outline" className="border-purple-500/30" onClick={onLoadMore}>عرض المزيد</Button>
              </div>
            )}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
