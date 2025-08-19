
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Loader2,
  CircleDollarSign,
  Gem,
  Search,
  Sparkles,
  Lock,
  ShoppingCart,
  Filter,
  Check,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AVATAR_IDS } from "@/data/avatars";
import { PUNISHMENT_AVATAR_IDS } from "@/data/punishment-avatars";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AvatarPrice } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAvatarPrices,
  getPunishmentAvatarPrices,
} from "@/lib/actions/user/queries";
import {
  purchaseAvatar,
  purchasePunishmentAvatar,
  updateUserAvatar,
} from "@/lib/actions/user";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// -----------------------------
// Helpers
// -----------------------------
const prettyCurrency = (c: "coins" | "diamonds") =>
  c === "coins" ? "كوينز" : "ألماس";

function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// -----------------------------
// Avatar Card
// -----------------------------
interface AvatarTileProps {
  avatarId: string;
  price: Omit<AvatarPrice, "avatarId"> | undefined;
  isUnlocked: boolean;
  isEquipped: boolean;
  canAfford: boolean;
  isSubmitting: boolean;
  onPurchase: (
    avatarId: string,
    currency: "coins" | "diamonds",
    price: number
  ) => void;
  onEquip: (avatarId: string) => void;
}

const AvatarTile = React.memo(function AvatarTile({
  avatarId,
  price,
  isUnlocked,
  isEquipped,
  canAfford,
  isSubmitting,
  onPurchase,
  onEquip,
}: AvatarTileProps) {
  const isForSale = price && price.price >= 0;
  const currency = price?.currency || "coins";
  const Icon = currency === "coins" ? CircleDollarSign : Gem;
  const isPunishment = avatarId.startsWith("Punish");

  return (
    <div className={cn(
      "group relative rounded-2xl bg-white/70 p-3 shadow-sm ring-1 ring-slate-200/70",
      "dark:bg-slate-900/50 dark:ring-slate-700/60",
      "motion-safe:transition hover:shadow-md"
    )}>
      <div className="relative">
        <PlayerAvatar
          avatarId={avatarId}
          className={cn(
            "w-full aspect-square rounded-xl border",
            "border-slate-200/70 dark:border-slate-700/60",
            isUnlocked ? "" : "grayscale",
            isEquipped && "ring-2 ring-indigo-400/70"
          )}
        />

        {/* حالة مجهّزة */}
        {isEquipped && (
          <div className="absolute top-2 end-2 flex items-center gap-1 rounded-full bg-indigo-600/80 px-2 py-1 text-[11px] text-white backdrop-blur">
            <Check className="h-3.5 w-3.5" />
            <span>مجهّزة</span>
          </div>
        )}

        {/* شارة السعر */}
        {isForSale && !isUnlocked && (
          <div className="absolute bottom-2 start-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white">
            <Icon className="h-3.5 w-3.5" />
            <span>{price!.price}</span>
          </div>
        )}
      </div>

      <div className="mt-3">
        {isUnlocked ? (
          <Button
            variant={isEquipped ? "secondary" : "default"}
            className="w-full"
            onClick={() => onEquip(avatarId)}
            disabled={isSubmitting || isEquipped}
            aria-label={isEquipped ? "تم تجهيز الشخصية" : "تجهيز الشخصية"}
          >
            {isEquipped ? (
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> تم تجهيزها
              </span>
            ) : (
              "تجهيز"
            )}
          </Button>
        ) : isForSale ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="w-full gap-1.5"
                  onClick={() => onPurchase(avatarId, currency, price!.price)}
                  disabled={isSubmitting || !canAfford}
                  aria-label={`شراء مقابل ${price!.price} ${prettyCurrency(currency)}`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  {price!.price}
                  <Icon className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              {!canAfford && (
                <TooltipContent>
                  <p>رصيدك غير كافٍ لإتمام الشراء</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button variant="outline" disabled className="w-full">
            <Lock className="ms-1 w-4 h-4" /> {isPunishment ? "لا يمكن شراؤها" : "غير متاحة"}
          </Button>
        )}
      </div>
    </div>
  );
});
AvatarTile.displayName = "AvatarTile";

// -----------------------------
// Main Store Client
// -----------------------------
export default function StoreClient() {
  const { toast } = useToast();
  const router = useRouter();
  const { userProfile, loading, refreshUserProfile } = useAuth();

  const [prices, setPrices] = useState<Record<string, Omit<AvatarPrice, "avatarId">>>({});
  const [punishmentPrices, setPunishmentPrices] = useState<Record<string, Omit<AvatarPrice, "avatarId">>>({});

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [storeTab, setStoreTab] = useState<"regular" | "punishment">("regular");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unlocked" | "locked">("all");
  const debouncedQuery = useDebounced(query, 250);

  const [itemToPurchase, setItemToPurchase] = useState<{
    avatarId: string;
    currency: "coins" | "diamonds";
    price: number;
  } | null>(null);

  const fetchPageData = useCallback(async () => {
    setIsLoadingData(true);
    const [pricesResult, punishmentPricesResult] = await Promise.all([
      getAvatarPrices(),
      getPunishmentAvatarPrices(),
    ]);

    if (pricesResult.success && pricesResult.prices) {
      const priceMap = pricesResult.prices.reduce((acc, item) => {
        acc[item.avatarId] = {
          price: item.price,
          currency: item.currency || "coins",
        };
        return acc;
      }, {} as Record<string, Omit<AvatarPrice, "avatarId">>);
      setPrices(priceMap);
    }

    if (punishmentPricesResult.success && punishmentPricesResult.prices) {
      const priceMap = punishmentPricesResult.prices.reduce((acc, item) => {
        acc[item.avatarId] = {
          price: item.price,
          currency: item.currency || "coins",
        };
        return acc;
      }, {} as Record<string, Omit<AvatarPrice, "avatarId">>);
      setPunishmentPrices(priceMap);
    }

    setIsLoadingData(false);
  }, []);

  useEffect(() => {
    if (!loading) fetchPageData();
  }, [loading, fetchPageData]);

  const handleConfirmPurchase = async () => {
    if (!itemToPurchase || !userProfile) return;

    setIsSubmitting(true);
    const action = storeTab === "regular" ? purchaseAvatar : purchasePunishmentAvatar;
    const result = await action(userProfile.uid, itemToPurchase.avatarId);

    if (result.success) {
      toast({ title: "تم الشراء بنجاح!" });
      await refreshUserProfile?.();
    } else {
      toast({ title: "فشل الشراء", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
    setItemToPurchase(null);
  };

  const handleEquip = async (avatarId: string) => {
    if (!userProfile) return;
    setIsSubmitting(true);
    const result = await updateUserAvatar(userProfile.uid, avatarId);
    if (result.success) {
      toast({ title: "تم تجهيز الشخصية بنجاح" });
      await refreshUserProfile?.();
    } else {
      toast({ title: "فشل التجهيز", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const visibleAvatarIds = useMemo(() => {
    const all = storeTab === "regular" ? AVATAR_IDS : PUNISHMENT_AVATAR_IDS;
    const unlocked = storeTab === "regular" ? userProfile?.unlockedAvatars : userProfile?.unlockedPunishmentAvatars;

    return all.filter((id) => {
      const matchesQuery = id.toLowerCase().includes(debouncedQuery.toLowerCase());
      if (!matchesQuery) return false;

      const isUnlocked = unlocked?.includes(id);
      if (filter === "unlocked") return !!isUnlocked;
      if (filter === "locked") return !isUnlocked;
      return true;
    });
  }, [storeTab, debouncedQuery, filter, userProfile]);

  if (loading || !userProfile) {
    return (
      <main
        dir="rtl"
        className={cn(
          "min-h-screen grid place-items-center",
          "bg-gradient-to-b from-slate-50 to-slate-100",
          "dark:from-slate-950 dark:to-slate-900"
        )}
      >
        <Loader2 className="w-10 h-10 animate-spin text-slate-400" />
      </main>
    );
  }

  const currentPrices = storeTab === "regular" ? prices : punishmentPrices;
  const currentUnlocked =
    storeTab === "regular"
      ? userProfile.unlockedAvatars
      : userProfile.unlockedPunishmentAvatars || [];

  const balanceChip = (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="gap-1.5 text-slate-700 dark:text-slate-200">
        <CircleDollarSign className="h-4 w-4" /> {userProfile.coins}
      </Badge>
      <Badge variant="secondary" className="gap-1.5 text-slate-700 dark:text-slate-200">
        <Gem className="h-4 w-4" /> {userProfile.diamonds}
      </Badge>
    </div>
  );

  return (
    <main
      dir="rtl"
      className={cn(
        "min-h-screen text-foreground",
        "bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900",
        // دعم حواف iPhone/Notch
        "pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]"
      )}
    >
      <div className="container relative z-10 mx-auto px-4">
        {/* رأس الصفحة */}
        <header className="relative mb-6">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <h1 className="inline-flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-2 text-xl font-bold text-slate-800 ring-1 ring-slate-200/70 backdrop-blur dark:bg-slate-900/60 dark:text-slate-100 dark:ring-slate-700/60">
              <ShoppingCart className="h-5 w-5" /> المتجر
            </h1>
            {balanceChip}
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 text-center sm:text-start">
            تصفح واشترِ شخصيات جديدة — تصميم هادئ ومريح ومتوافق مع الجوال.
          </p>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="absolute start-0 top-0"
            aria-label="رجوع"
          >
            <ArrowLeft />
          </Button>
        </header>

        {/* لوحة التحكم والنتائج */}
        <Card className="border-slate-200/70 bg-white/80 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60">
          <CardHeader className="gap-4 sticky top-0 z-10 border-b border-slate-200/60 bg-white/80 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-slate-700/50 dark:bg-slate-900/60">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
              <div className="flex items-center gap-2 rounded-xl bg-slate-100/70 p-1 ring-1 ring-slate-200/70 dark:bg-slate-800/60 dark:ring-slate-700/60">
                <Button
                  variant={storeTab === "regular" ? "default" : "ghost"}
                  onClick={() => setStoreTab("regular")}
                  className={cn("px-4", storeTab === "regular" ? "" : "text-slate-600 dark:text-slate-300")}
                >
                  المتجر العادي
                </Button>
                <Button
                  variant={storeTab === "punishment" ? "default" : "ghost"}
                  onClick={() => setStoreTab("punishment")}
                  className={cn("px-4", storeTab === "punishment" ? "" : "text-slate-600 dark:text-slate-300")}
                >
                  متجر العقوبات
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ابحث باسم/رقم الصورة"
                    className="w-[220px] pe-8 bg-white/60 dark:bg-slate-800/60"
                    aria-label="بحث"
                  />
                </div>
                <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
                  <SelectTrigger className="w-[170px] bg-white/60 dark:bg-slate-800/60">
                    <SelectValue placeholder="تصفية" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">عرض الكل</SelectItem>
                    <SelectItem value="unlocked">ما أملكه</SelectItem>
                    <SelectItem value="locked">ما لا أملكه</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoadingData ? (
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square w-full rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
                ))}
              </div>
            ) : (
              <ScrollArea className="h-[60vh] sm:h-[70vh] overscroll-contain p-4">
                {visibleAvatarIds.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {visibleAvatarIds.map((id) => {
                      const price = currentPrices[id];
                      const canAfford = price && price.price >= 0
                        ? price.currency === "coins"
                          ? userProfile.coins >= price.price
                          : userProfile.diamonds >= price.price
                        : false;
                      return (
                        <AvatarTile
                          key={id}
                          avatarId={id}
                          price={price}
                          isUnlocked={currentUnlocked.includes(id)}
                          isEquipped={userProfile.avatarId === id}
                          canAfford={canAfford}
                          isSubmitting={isSubmitting}
                          onPurchase={(avatarId, currency, priceValue) =>
                            setItemToPurchase({ avatarId, currency, price: priceValue })
                          }
                          onEquip={handleEquip}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-[40vh] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300/70 bg-slate-50/80 p-8 text-center dark:border-slate-700/60 dark:bg-slate-900/40">
                    <Filter className="w-12 h-12 opacity-60" />
                    <p className="mt-2 text-base font-semibold text-slate-700 dark:text-slate-200">لا توجد نتائج مطابقة</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">جرّب تغيير كلمات البحث أو إعدادات التصفية.</p>
                  </div>
                )}
              </ScrollArea>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 pb-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              المعروض: <span className="font-medium text-slate-700 dark:text-slate-200">{visibleAvatarIds.length}</span>
            </div>
            <div className="opacity-90">{balanceChip}</div>
          </CardFooter>
        </Card>
      </div>

      {/* حوار تأكيد الشراء */}
      <AlertDialog
        open={!!itemToPurchase}
        onOpenChange={(open) => !open && setItemToPurchase(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الشراء</AlertDialogTitle>
            <AlertDialogDescription>
              هل ترغب في شراء هذه الشخصية مقابل {itemToPurchase?.price} {prettyCurrency(itemToPurchase?.currency || "coins")}؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPurchase} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : "تأكيد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
