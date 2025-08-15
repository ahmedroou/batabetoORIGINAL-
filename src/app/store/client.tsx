
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Save,
  Loader2,
  CircleDollarSign,
  Trash2,
  PlusCircle,
  Trophy,
  Crown,
  Gem,
  Shield,
  Star,
  Award,
  Settings,
  Filter,
  Download,
  Upload,
  Check,
  Search,
  Sparkles,
  Lock,
  Unlock,
  ShoppingCart,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AVATAR_IDS } from "@/data/avatars";
import { PUNISHMENT_AVATAR_IDS } from "@/data/punishment-avatars";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AvatarPrice, SocialRank, UserProfile } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { getAvatarPrices, getPunishmentAvatarPrices } from "@/lib/actions/user/queries";
import { purchaseAvatar, purchasePunishmentAvatar } from "@/lib/actions/user/currency";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
// Helpers & Maps
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
// Avatar Card (reusable & memoized)
// -----------------------------
interface AvatarTileProps {
  avatarId: string;
  price: Omit<AvatarPrice, "avatarId"> | undefined;
  isUnlocked: boolean;
  isEquipped: boolean;
  disabled?: boolean;
  onPurchase: (avatarId: string, currency: 'coins' | 'diamonds', price: number) => void;
  onEquip: (avatarId: string) => void;
}

const AvatarTile = React.memo(function AvatarTile({
  avatarId,
  price,
  isUnlocked,
  isEquipped,
  disabled,
  onPurchase,
  onEquip
}: AvatarTileProps) {
  const isForSale = price && price.price >= 0;
  const currency = price?.currency || 'coins';
  const Icon = currency === 'coins' ? CircleDollarSign : Gem;
  const color = currency === 'coins' ? 'text-yellow-400' : 'text-sky-400';

  return (
    <div className="relative group space-y-2">
      <PlayerAvatar
        avatarId={avatarId}
        className={cn(
          "w-full aspect-square rounded-xl border-2 transition-all",
          isEquipped ? "border-purple-400 ring-2 ring-purple-400/60" : "border-muted",
          !isUnlocked && "grayscale"
        )}
      />
      {isEquipped && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            <span>الحالية</span>
          </div>
      )}
       <div className="h-10 mt-2">
            {isUnlocked ? (
                isEquipped ? (
                     <Button variant="ghost" disabled className="w-full">تم تجهيزها</Button>
                ) : (
                    <Button variant="outline" className="w-full" onClick={() => onEquip(avatarId)} disabled={disabled}>تجهيز</Button>
                )
            ) : isForSale ? (
                <Button className="w-full gap-1.5" onClick={() => onPurchase(avatarId, currency, price!.price)} disabled={disabled}>
                    <ShoppingCart className="w-4 h-4"/>
                    {price!.price}
                    <Icon className={cn("w-4 h-4", color)}/>
                </Button>
            ) : (
                 <Button variant="outline" disabled className="w-full"><Lock className="ml-2 w-4 h-4"/> غير متاح</Button>
            )}
       </div>
    </div>
  );
});

AvatarTile.displayName = 'AvatarTile';

// -----------------------------
// Main Store Client
// -----------------------------
export default function AdminStoreClient() {
  const { toast } = useToast();
  const router = useRouter();
  const { userProfile, loading, refreshUserProfile } = useAuth();

  // Avatars State
  const [prices, setPrices] = useState<Record<string, Omit<AvatarPrice, "avatarId">>>({});
  const [punishmentPrices, setPunishmentPrices] = useState<Record<string, Omit<AvatarPrice, "avatarId">>>({});
  
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // UI state
  const [storeTab, setStoreTab] = useState<"regular" | "punishment">("regular");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);

  const [itemToPurchase, setItemToPurchase] = useState<{avatarId: string, currency: 'coins' | 'diamonds', price: number} | null>(null);

  const fetchPageData = useCallback(async () => {
    setIsLoadingData(true);
    const [pricesResult, punishmentPricesResult] = await Promise.all([
      getAvatarPrices(),
      getPunishmentAvatarPrices(),
    ]);

    if (pricesResult.success && pricesResult.prices) {
      const priceMap = pricesResult.prices.reduce((acc, item) => {
        acc[item.avatarId] = { price: item.price, currency: item.currency || "coins" };
        return acc;
      }, {} as Record<string, Omit<AvatarPrice, "avatarId">>);
      setPrices(priceMap);
    } else if (!pricesResult.success) {
      toast({ title: "خطأ", description: pricesResult.error, variant: "destructive" });
    }

    if (punishmentPricesResult.success && punishmentPricesResult.prices) {
      const priceMap = punishmentPricesResult.prices.reduce((acc, item) => {
        acc[item.avatarId] = { price: item.price, currency: item.currency || "coins" };
        return acc;
      }, {} as Record<string, Omit<AvatarPrice, "avatarId">>);
      setPunishmentPrices(priceMap);
    } else if (!punishmentPricesResult.success) {
      toast({ title: "خطأ", description: punishmentPricesResult.error, variant: "destructive" });
    }

    setIsLoadingData(false);
  }, [toast]);

  useEffect(() => {
    if (!loading) fetchPageData();
  }, [loading, fetchPageData]);

  const visibleAvatarIds = useMemo(() => {
    const all = storeTab === "regular" ? AVATAR_IDS : PUNISHMENT_AVATAR_IDS;
    return all.filter((id) => id.toLowerCase().includes(debouncedQuery.toLowerCase()));
  }, [storeTab, debouncedQuery]);
  
  const handleConfirmPurchase = async () => {
      if(!itemToPurchase || !userProfile) return;

      setIsSubmitting(true);
      const action = storeTab === 'regular' ? purchaseAvatar : purchasePunishmentAvatar;
      const result = await action(userProfile.uid, itemToPurchase.avatarId);

      if(result.success) {
          toast({title: "تم الشراء بنجاح!"});
          await refreshUserProfile?.();
      } else {
          toast({title: "فشل الشراء", description: result.error, variant: "destructive"})
      }
      setIsSubmitting(false);
      setItemToPurchase(null);
  }

  const handleEquip = async (avatarId: string) => {
       if(!userProfile) return;
       toast({title: "قيد التطوير", description: `تم اختيار ${avatarId} كشخصية لك (سيتم حفظها قريبًا).`});
  }

  if (loading) {
      return (
          <main dir="rtl" className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
              <Loader2 className="w-12 h-12 animate-spin"/>
          </main>
      )
  }

  const currentPrices = storeTab === "regular" ? prices : punishmentPrices;
  
  return (
    <main dir="rtl" className="min-h-screen bg-[radial-gradient(50%_50%_at_50%_10%,rgba(147,51,234,0.12),transparent_60%),linear-gradient(to_bottom_right,rgba(2,6,23,0.9),rgba(17,24,39,0.9))] text-foreground">
      <div className="container relative z-10 mx-auto px-4 py-8">
        <header className="relative mb-8 text-center">
          <h1 className="mx-auto inline-flex items-center gap-3 rounded-2xl bg-black/20 px-6 py-3 text-2xl font-bold text-purple-200 backdrop-blur">
            <ShoppingCart className="h-6 w-6" /> المتجر
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">تصفح واشترِ شخصيات جديدة لتتميز بها داخل اللعبة.</p>
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="absolute start-0 top-0">
            <ArrowLeft />
          </Button>
        </header>

        <Card className="border-purple-500/20 bg-black/30">
            <CardHeader className="gap-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
                  <div>
                    <CardTitle>شخصيات متاحة للشراء</CardTitle>
                    <CardDescription>استخدم رصيدك من الكوينز والألماس لفتح شخصيات جديدة.</CardDescription>
                  </div>
                    <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 rounded-xl bg-black/30 p-2">
                      <Button variant={storeTab === "regular" ? "default" : "outline"} onClick={() => setStoreTab("regular")}>
                        المتجر العادي
                      </Button>
                      <Button variant={storeTab === "punishment" ? "default" : "outline"} onClick={() => setStoreTab("punishment")}>
                        متجر العقوبات
                      </Button>
                    </div>
                     <div className="relative">
                        <Search className="pointer-events-none absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث برقم/اسم الصورة" className="w-[220px] pe-8" />
                    </div>
                  </div>
                </div>
            </CardHeader>
            <CardContent>
                {isLoadingData ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {Array.from({ length: 18 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-square w-full rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <ScrollArea className="h-[65vh] rounded-md border border-purple-500/20 bg-black/20 p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {visibleAvatarIds.map((id) => (
                        <AvatarTile
                          key={id}
                          avatarId={id}
                          price={currentPrices[id]}
                          isUnlocked={userProfile?.unlockedAvatars?.includes(id) || (storeTab === 'punishment' && userProfile?.unlockedPunishmentAvatars?.includes(id)) || false}
                          isEquipped={userProfile?.avatarId === id}
                          disabled={isSubmitting}
                          onPurchase={(avatarId, currency, price) => setItemToPurchase({avatarId, currency, price})}
                          onEquip={handleEquip}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}
            </CardContent>
        </Card>
      </div>

       <AlertDialog open={!!itemToPurchase} onOpenChange={() => setItemToPurchase(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد الشراء</AlertDialogTitle>
                <AlertDialogDescription>
                   هل أنت متأكد من رغبتك في شراء هذه الشخصية مقابل {itemToPurchase?.price} {prettyCurrency(itemToPurchase?.currency || 'coins')}؟
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
