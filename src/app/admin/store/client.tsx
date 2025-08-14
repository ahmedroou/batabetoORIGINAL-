
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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AVATAR_IDS } from "@/data/avatars";
import { PUNISHMENT_AVATAR_IDS } from "@/data/punishment-avatars";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AvatarPrice, SocialRank, UserProfile } from "@/types";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  setAvatarPrices,
  setPunishmentAvatarPrices,
  setDefaultAvatar,
  setSocialRanks,
  addPermissionToRank,
  removePermissionFromRank,
  getAvatarPrices,
  getPunishmentAvatarPrices,
  getDefaultAvatar,
} from "@/lib/actions/admin";
import { getRanks, getTopUsers } from "@/lib/actions/user";
import { cn } from "@/lib/utils";
import { ALL_PERMISSIONS } from "@/data/permissions";
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
const rankIconMap: Record<string, LucideIcon> = {
  Shield,
  Award,
  Gem,
  Crown,
  Star,
};

const prettyCurrency = (c: "coins" | "diamonds") =>
  c === "coins" ? "كوينز" : "ألماس";

// A tiny debounce hook to keep the UI responsive on large lists
function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// Deep-equality-like compare for simple price objects
const isSamePrice = (
  a?: Omit<AvatarPrice, "avatarId">,
  b?: Omit<AvatarPrice, "avatarId">
) => !a || !b ? a === b : a.price === b.price && a.currency === b.currency;

// -----------------------------
// Avatar Card (reusable)
// -----------------------------
interface AvatarTileProps {
  avatarId: string;
  price: Omit<AvatarPrice, "avatarId"> | undefined;
  basePrice: Omit<AvatarPrice, "avatarId"> | undefined;
  isDefault: boolean;
  disabled?: boolean;
  onPriceChange: (price: number) => void;
  onCurrencyChange: (currency: "coins" | "diamonds") => void;
  onSetDefault?: () => void;
}

function AvatarTile({
  avatarId,
  price,
  basePrice,
  isDefault,
  disabled,
  onPriceChange,
  onCurrencyChange,
  onSetDefault,
}: AvatarTileProps) {
  const changed = !isSamePrice(price, basePrice);
  const showLock = !price || price.price < 0;

  return (
    <div className="space-y-2">
      <div className="relative group">
        <PlayerAvatar
          avatarId={avatarId}
          className={cn(
            "w-full aspect-square rounded-xl border-2 transition-all",
            changed ? "border-purple-400" : "border-muted",
            isDefault && "ring-2 ring-yellow-400/60"
          )}
        />
        {isDefault && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            <span>الافتراضية</span>
          </div>
        )}
        {showLock && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/60 text-white">
            <Lock className="h-8 w-8" />
          </div>
        )}
        {!!onSetDefault && (
          <button
            type="button"
            title="تعيين كشخصية افتراضية"
            onClick={onSetDefault}
            className={cn(
              "absolute top-2 left-2 grid h-8 w-8 place-items-center rounded-full bg-black/40 backdrop-blur hover:bg-black/60 transition",
              isDefault && "text-yellow-400"
            )}
          >
            <Star className={cn("h-5 w-5", isDefault && "fill-current")}/>
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          type="number"
          inputMode="numeric"
          className="text-center"
          value={price?.price ?? ""}
          onChange={(e) => onPriceChange(Number(e.target.value))}
          placeholder="السعر"
          disabled={disabled || isDefault}
        />
        <Select
          value={(price?.currency as "coins" | "diamonds") || "coins"}
          onValueChange={(v: "coins" | "diamonds") => onCurrencyChange(v)}
          disabled={disabled || isDefault}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="coins">
              <div className="flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4 text-yellow-500" />
                <span>كوينز</span>
              </div>
            </SelectItem>
            <SelectItem value="diamonds">
              <div className="flex items-center gap-2">
                <Gem className="h-4 w-4 text-blue-400" />
                <span>ألماس</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {changed && (
        <div className="text-xs text-purple-300">لم يتم الحفظ</div>
      )}
    </div>
  );
}

// -----------------------------
// Main Admin Store
// -----------------------------
export default function AdminStoreClient() {
  const { toast } = useToast();
  const router = useRouter();
  const { userProfile, loading } = useAuth();

  // Avatars State
  const [basePrices, setBasePrices] = useState<Record<string, Omit<AvatarPrice, "avatarId">>>({});
  const [prices, setPrices] = useState<Record<string, Omit<AvatarPrice, "avatarId">>>({});
  const [basePunishmentPrices, setBasePunishmentPrices] = useState<Record<string, Omit<AvatarPrice, "avatarId">>>({});
  const [punishmentPrices, setPunishmentPrices] = useState<Record<string, Omit<AvatarPrice, "avatarId">>>({});
  const [defaultAvatarId, setDefaultAvatarId] = useState<string>("Avatar00.png");

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Ranks State
  const [ranks, setRanks] = useState<SocialRank[]>([]);
  const [isSavingRanks, setIsSavingRanks] = useState(false);
  const [selectedRankForPermissions, setSelectedRankForPermissions] = useState<SocialRank | null>(null);
  const [isUpdatingPermission, setIsUpdatingPermission] = useState(false);

  // Leaderboards
  const [topCoinsUsers, setTopCoinsUsers] = useState<UserProfile[]>([]);
  const [topPointsUsers, setTopPointsUsers] = useState<UserProfile[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useState<"avatars" | "ranks">("avatars");
  const [storeTab, setStoreTab] = useState<"regular" | "punishment">("regular");
  const [query, setQuery] = useState("");
  const [showOnlyChanged, setShowOnlyChanged] = useState(false);
  const [density, setDensity] = useState<"cozy" | "compact">("cozy");

  const debouncedQuery = useDebounced(query, 250);

  useEffect(() => {
    if (!loading && !userProfile?.isAdmin) {
      router.push("/");
    }
  }, [userProfile, loading, router]);

  const fetchPageData = useCallback(async () => {
    setIsLoadingData(true);
    const [pricesResult, punishmentPricesResult, ranksResult, defaultAvatarResult, topCoinsResult, topPointsResult] =
      await Promise.all([
        getAvatarPrices(),
        getPunishmentAvatarPrices(),
        getRanks(),
        getDefaultAvatar(),
        getTopUsers("coins", 5),
        getTopUsers("leaderboardPoints", 5),
      ]);

    // Regular
    if (pricesResult.success && pricesResult.prices) {
      const priceMap = pricesResult.prices.reduce((acc, item) => {
        acc[item.avatarId] = { price: item.price, currency: item.currency || "coins" };
        return acc;
      }, {} as Record<string, Omit<AvatarPrice, "avatarId">>);
      setBasePrices(priceMap);
      setPrices(priceMap);
    } else if (!pricesResult.success) {
      toast({ title: "خطأ", description: pricesResult.error, variant: "destructive" });
    }

    // Punishment
    if (punishmentPricesResult.success && punishmentPricesResult.prices) {
      const priceMap = punishmentPricesResult.prices.reduce((acc, item) => {
        acc[item.avatarId] = { price: item.price, currency: item.currency || "coins" };
        return acc;
      }, {} as Record<string, Omit<AvatarPrice, "avatarId">>);
      setBasePunishmentPrices(priceMap);
      setPunishmentPrices(priceMap);
    } else if (!punishmentPricesResult.success) {
      toast({ title: "خطأ", description: punishmentPricesResult.error, variant: "destructive" });
    }

    // Default avatar
    if (defaultAvatarResult.success && defaultAvatarResult.avatarId) {
      setDefaultAvatarId(defaultAvatarResult.avatarId);
    }

    // Ranks
    if (ranksResult) {
      const sorted = ranksResult.sort((a, b) => a.threshold - b.threshold);
      setRanks(sorted);
      setSelectedRankForPermissions(sorted[0] ?? null);
    }

    setTopCoinsUsers(topCoinsResult || []);
    setTopPointsUsers(topPointsResult || []);

    setIsLoadingData(false);
  }, [toast]);

  useEffect(() => {
    if (userProfile?.isAdmin) fetchPageData();
  }, [userProfile?.isAdmin, fetchPageData]);

  // Warn on unsaved changes
  const dirtyRegular = useMemo(() =>
    Object.keys(prices).some((id) => !isSamePrice(prices[id], basePrices[id])),
  [prices, basePrices]);
  const dirtyPunish = useMemo(() =>
    Object.keys(punishmentPrices).some((id) => !isSamePrice(punishmentPrices[id], basePunishmentPrices[id])),
  [punishmentPrices, basePunishmentPrices]);

  const hasDirty = dirtyRegular || dirtyPunish;
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasDirty]);

  // Keyboard: Ctrl/Cmd+S to save current store tab
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s";
      if (isSave) {
        e.preventDefault();
        if (activeTab === "avatars") {
          handleSavePrices(storeTab);
        } else if (activeTab === "ranks") {
          handleSaveRanks();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, storeTab, prices, punishmentPrices, ranks]);

  // -----------------------------
  // Prices helpers
  // -----------------------------
  const visibleAvatarIds = useMemo(() => {
    const all = storeTab === "regular" ? AVATAR_IDS : PUNISHMENT_AVATAR_IDS;
    const map = storeTab === "regular" ? prices : punishmentPrices;
    const base = storeTab === "regular" ? basePrices : basePunishmentPrices;
    const filtered = all.filter((id) => id.toLowerCase().includes(debouncedQuery.toLowerCase()));
    if (!showOnlyChanged) return filtered;
    return filtered.filter((id) => !isSamePrice(map[id], base[id]));
  }, [storeTab, prices, punishmentPrices, basePrices, basePunishmentPrices, debouncedQuery, showOnlyChanged]);

  const setPrice = (id: string, v: number) => {
    if (storeTab === "regular") setPrices((p) => ({ ...p, [id]: { ...(p[id] || { price: 0, currency: "coins" }), price: Number(v) } }));
    else setPunishmentPrices((p) => ({ ...p, [id]: { ...(p[id] || { price: 0, currency: "coins" }), price: Number(v) } }));
  };
  const setCurrency = (id: string, v: "coins" | "diamonds") => {
    if (storeTab === "regular") setPrices((p) => ({ ...p, [id]: { ...(p[id] || { price: 0, currency: "coins" }), currency: v } }));
    else setPunishmentPrices((p) => ({ ...p, [id]: { ...(p[id] || { price: 0, currency: "coins" }), currency: v } }));
  };

  const handleSetDefault = async (id: string) => {
    const res = await setDefaultAvatar(id);
    if (res.success) {
      setDefaultAvatarId(id);
      // Ensure default avatar is always free coins=0
      setPrices((p) => ({ ...p, [id]: { price: 0, currency: "coins" } }));
      toast({ title: "تم التعيين", description: `${id} أصبحت الشخصية الافتراضية (مجانية).` });
    } else {
      toast({ title: "خطأ", description: res.error, variant: "destructive" });
    }
  };

  const handleSavePrices = async (tab: "regular" | "punishment") => {
    setIsSaving(true);
    const current = tab === "regular" ? prices : punishmentPrices;
    const base = tab === "regular" ? basePrices : basePunishmentPrices;

    // Save only changed items
    const changed: AvatarPrice[] = Object.entries(current)
      .filter(([id, p]) => !isSamePrice(p, base[id]))
      .map(([avatarId, p]) => ({ avatarId, price: p.price ?? 0, currency: (p.currency as any) || "coins" }));

    const action = tab === "regular" ? setAvatarPrices : setPunishmentAvatarPrices;
    const res = await action(changed);
    if (res.success) {
      toast({ title: "تم الحفظ", description: `تم حفظ ${changed.length} عنصرًا بنجاح.` });
      if (tab === "regular") setBasePrices({ ...prices });
      else setBasePunishmentPrices({ ...punishmentPrices });
    } else {
      toast({ title: "فشل الحفظ", description: res.error, variant: "destructive" });
    }
    setIsSaving(false);
  };

  const bulkApply = (payload: { price?: number; currency?: "coins" | "diamonds" }) => {
    const ids = visibleAvatarIds; // apply on currently visible (after search/filter)
    if (storeTab === "regular") {
      setPrices((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          next[id] = {
            price: payload.price ?? next[id]?.price ?? 0,
            currency: payload.currency ?? (next[id]?.currency || "coins"),
          };
        });
        return next;
      });
    } else {
      setPunishmentPrices((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          next[id] = {
            price: payload.price ?? next[id]?.price ?? 0,
            currency: payload.currency ?? (next[id]?.currency || "coins"),
          };
        });
        return next;
      });
    }
  };

  // Export / Import (JSON)
  const downloadRef = useRef<HTMLAnchorElement | null>(null);
  const handleExport = () => {
    const data = {
      regular: prices,
      punishment: punishmentPrices,
      defaultAvatarId,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    if (!downloadRef.current) return;
    downloadRef.current.href = url;
    downloadRef.current.download = `store-config-${Date.now()}.json`;
    downloadRef.current.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        if (json?.regular) setPrices(json.regular);
        if (json?.punishment) setPunishmentPrices(json.punishment);
        if (json?.defaultAvatarId) setDefaultAvatarId(json.defaultAvatarId);
        toast({ title: "تم الاستيراد", description: "تم تحميل الإعدادات من الملف." });
      } catch (err: any) {
        toast({ title: "فشل الاستيراد", description: err?.message || "صيغة الملف غير صحيحة.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // -----------------------------
  // Ranks
  // -----------------------------
  const handleRankChange = (index: number, field: keyof SocialRank, value: string | number) => {
    setRanks((prev) => {
      const copy = [...prev];
      (copy[index] as any)[field] = value;
      return copy;
    });
  };

  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);
  const confirmRemoveRank = (index: number) => setPendingRemoveIndex(index);
  const actuallyRemoveRank = () => {
    if (pendingRemoveIndex == null) return;
    setRanks((prev) => prev.filter((_, i) => i !== pendingRemoveIndex));
    setPendingRemoveIndex(null);
  };

  const handleAddRank = () => {
    const last = ranks[ranks.length - 1]?.threshold ?? 0;
    setRanks((prev) => [
      ...prev,
      { threshold: last + 100, name: "لقب جديد", icon: "Star", permissions: [] },
    ]);
  };

  const handleSaveRanks = async () => {
    setIsSavingRanks(true);
    // validate
    const sorted = [...ranks].sort((a, b) => a.threshold - b.threshold);
    const dup = new Set<number>();
    sorted.forEach((r) => {
      if (dup.has(r.threshold)) {
        toast({ title: "تحذير", description: "هناك عتبات مكررة للألقاب. تأكد من تفرّدها.", variant: "destructive" });
      }
      dup.add(r.threshold);
    });

    const res = await setSocialRanks(sorted);
    if (res.success) {
      toast({ title: "تم الحفظ", description: "تم حفظ الألقاب بنجاح." });
      setRanks(sorted);
    } else {
      toast({ title: "فشل الحفظ", description: res.error, variant: "destructive" });
    }
    setIsSavingRanks(false);
  };

  const handlePermissionToggle = async (permissionId: string) => {
    if (!selectedRankForPermissions) return;
    setIsUpdatingPermission(true);
    const has = selectedRankForPermissions.permissions?.includes(permissionId as any);
    const action = has ? removePermissionFromRank : addPermissionToRank;
    const res = await action(selectedRankForPermissions.name, permissionId);
    if (res.success) {
      await fetchPageData();
    } else {
      toast({ title: "خطأ", description: res.error, variant: "destructive" });
    }
    setIsUpdatingPermission(false);
  };

  // -----------------------------
  // Render helpers
  // -----------------------------
  const renderTopUsers = (users: UserProfile[], field: "coins" | "leaderboardPoints") => {
    if (isLoadingData) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      );
    }
    if (!users.length) return <p className="text-center text-muted-foreground">لا يوجد بيانات.</p>;
    return (
      <div className="space-y-2">
        {users.map((u, i) => (
          <div key={u.uid} className="flex items-center justify-between rounded-md bg-muted p-2">
            <div className="flex items-center gap-2">
              <span className="w-6 text-center font-bold">{i + 1}.</span>
              <PlayerAvatar avatarId={u.avatarId} className="h-8 w-8" />
              <span className="font-semibold">{u.name}</span>
            </div>
            <span className="font-bold text-primary">
              {u[field]} {field === "coins" ? "كوينز" : "نقطة"}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const currentPrices = storeTab === "regular" ? prices : punishmentPrices;
  const currentBase = storeTab === "regular" ? basePrices : basePunishmentPrices;

  return (
    <main dir="rtl" className="min-h-screen bg-[radial-gradient(50%_50%_at_50%_10%,rgba(147,51,234,0.12),transparent_60%),linear-gradient(to_bottom_right,rgba(2,6,23,0.9),rgba(17,24,39,0.9))] text-foreground">
      <a ref={downloadRef} className="hidden" />
      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />

      <div className="container relative z-10 mx-auto px-4 py-8">
        <header className="relative mb-8 text-center">
          <h1 className="mx-auto inline-flex items-center gap-3 rounded-2xl bg-black/20 px-6 py-3 text-2xl font-bold text-purple-200 backdrop-blur">
            <Settings className="h-6 w-6" /> لوحة إدارة المتجر والألقاب
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">تعديل أسعار الشخصيات، الأفاتارات العقابية، الألقاب والصلاحيات — بسرعة وأمان.</p>
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin")} className="absolute start-0 top-0">
            <ArrowLeft />
          </Button>
        </header>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="bg-black/30">
            <CardHeader className="pb-2">
              <CardDescription>الشخصيات</CardDescription>
              <CardTitle className="text-2xl">{AVATAR_IDS.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-black/30">
            <CardHeader className="pb-2">
              <CardDescription>العقوبات</CardDescription>
              <CardTitle className="text-2xl">{PUNISHMENT_AVATAR_IDS.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-black/30">
            <CardHeader className="pb-2">
              <CardDescription>ألقاب مفعّلة</CardDescription>
              <CardTitle className="text-2xl">{ranks.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-black/30">
            <CardHeader className="pb-2">
              <CardDescription>حالة التعديلات</CardDescription>
              <CardTitle className={cn("text-2xl", hasDirty ? "text-yellow-400" : "text-emerald-400")}>{hasDirty ? "غير محفوظ" : "محفوظ"}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mt-8">
          <TabsList className="grid w-full grid-cols-2 bg-black/30">
            <TabsTrigger value="avatars">إدارة الشخصيات</TabsTrigger>
            <TabsTrigger value="ranks">إدارة الألقاب والصلاحيات</TabsTrigger>
          </TabsList>

          {/* Avatars */}
          <TabsContent value="avatars" className="space-y-6 pt-4">
            <Card className="border-purple-500/20 bg-black/30">
              <CardHeader className="gap-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
                  <div>
                    <CardTitle>متجر الشخصيات</CardTitle>
                    <CardDescription>عدّل الأسعار ونوع العملة وابحث بسرعة. الشخصية الافتراضية مجانية دائمًا.</CardDescription>
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

                    <div className="flex items-center gap-2 rounded-xl bg-black/30 p-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث برقم/اسم الصورة" className="w-[220px] pe-8" />
                      </div>
                      <Button variant={showOnlyChanged ? "default" : "outline"} onClick={() => setShowOnlyChanged((s) => !s)}>
                        <Filter className="me-2 h-4 w-4" /> فقط المعدّلة
                      </Button>
                      <Select value={density} onValueChange={(v: any) => setDensity(v)}>
                        <SelectTrigger className="w-28"><SelectValue placeholder="الكثافة"/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cozy">مريح</SelectItem>
                          <SelectItem value="compact">مضغوط</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl bg-black/30 p-2">
                      <Button variant="outline" onClick={() => bulkApply({ currency: "coins" })}>اجعل العملة كوينز</Button>
                      <Button variant="outline" onClick={() => bulkApply({ currency: "diamonds" })}>اجعل العملة ألماس</Button>
                      <Button variant="outline" onClick={() => bulkApply({ price: 0 })}>تصفير الأسعار الظاهرة</Button>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl bg-black/30 p-2">
                      <Button variant="outline" onClick={handleExport}>
                        <Download className="me-2 h-4 w-4" /> تصدير JSON
                      </Button>
                      <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="me-2 h-4 w-4" /> استيراد JSON
                      </Button>
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
                    <div className={cn(
                      "grid gap-3",
                      density === "cozy" && "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
                      density === "compact" && "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
                    )}>
                      {visibleAvatarIds.map((id) => (
                        <AvatarTile
                          key={id}
                          avatarId={id}
                          price={currentPrices[id]}
                          basePrice={currentBase[id]}
                          isDefault={storeTab === "regular" && id === defaultAvatarId}
                          disabled={isLoadingData}
                          onPriceChange={(v) => setPrice(id, v)}
                          onCurrencyChange={(v) => setCurrency(id, v)}
                          onSetDefault={storeTab === "regular" ? () => handleSetDefault(id) : undefined}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>

              <CardFooter className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-muted-foreground">
                  {storeTab === "regular" ? (
                    <>الشخصية الافتراضية الحالية: <span className="font-medium text-purple-300">{defaultAvatarId}</span></>
                  ) : (
                    <>عدد العناصر الظاهرة: <span className="font-medium text-purple-300">{visibleAvatarIds.length}</span></>
                  )}
                </div>
                <Button onClick={() => handleSavePrices(storeTab)} disabled={isSaving || isLoadingData}>
                  {isSaving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}
                  {isSaving ? "جاري الحفظ..." : "حفظ التغييرات"}
                </Button>
              </CardFooter>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-purple-500/20 bg-black/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5"/> أقوى اللاعبين</CardTitle>
                  <CardDescription>أعلى 5 لاعبين من حيث نقاط الصدارة.</CardDescription>
                </CardHeader>
                <CardContent>{renderTopUsers(topPointsUsers, "leaderboardPoints")}</CardContent>
              </Card>
              <Card className="border-purple-500/20 bg-black/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-yellow-500"/> أغنى اللاعبين</CardTitle>
                  <CardDescription>أعلى 5 لاعبين من حيث الكوينز.</CardDescription>
                </CardHeader>
                <CardContent>{renderTopUsers(topCoinsUsers, "coins")}</CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Ranks */}
          <TabsContent value="ranks" className="space-y-6 pt-4">
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="border-purple-500/20 bg-black/30 lg:col-span-2">
                <CardHeader>
                  <CardTitle>إدارة الألقاب الاجتماعية</CardTitle>
                  <CardDescription>تحكم في ألقاب اللاعبين حسب نقاط الصدارة. استخدم Ctrl/Cmd+S للحفظ السريع.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {isLoadingData ? (
                      <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : (
                      ranks.map((rank, index) => {
                        const IconComp = rankIconMap[rank.icon] || Star;
                        return (
                          <div key={`${rank.name}-${index}`} className="flex items-center gap-2 rounded-md bg-black/20 p-2">
                            <Input
                              type="number"
                              className="w-28"
                              value={rank.threshold}
                              onChange={(e) => handleRankChange(index, "threshold", parseInt(e.target.value || "0", 10))}
                              placeholder="النقاط"
                            />
                            <Input
                              className="flex-1"
                              value={rank.name}
                              onChange={(e) => handleRankChange(index, "name", e.target.value)}
                              placeholder="اسم اللقب"
                            />
                            <Select value={rank.icon} onValueChange={(v) => handleRankChange(index, "icon", v)}>
                              <SelectTrigger className="w-36">
                                <SelectValue>
                                  <div className="flex items-center gap-2">
                                    <IconComp className="h-4 w-4" />
                                    <span>{rank.icon}</span>
                                  </div>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {Object.keys(rankIconMap).map((name) => {
                                  const I = rankIconMap[name];
                                  return (
                                    <SelectItem key={name} value={name}>
                                      <div className="flex items-center gap-2"><I className="h-4 w-4"/><span>{name}</span></div>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            <Button size="icon" variant="destructive" onClick={() => confirmRemoveRank(index)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })
                    )}
                    <Button variant="outline" className="w-full" onClick={handleAddRank}>
                      <PlusCircle className="me-2 h-4 w-4" /> إضافة لقب جديد
                    </Button>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button onClick={handleSaveRanks} disabled={isSavingRanks}>
                    {isSavingRanks ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}
                    {isSavingRanks ? "جاري الحفظ..." : "حفظ تغييرات الألقاب"}
                  </Button>
                </CardFooter>
              </Card>

              <Card className="border-purple-500/20 bg-black/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5"/> صلاحيات الألقاب</CardTitle>
                  <CardDescription>اختر لقبًا ثم فعّل/عطّل الصلاحيات.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="mb-2 inline-block">اختر اللقب</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {ranks.map((r) => (
                        <Button key={r.name} variant={selectedRankForPermissions?.name === r.name ? "default" : "outline"} className="justify-start" onClick={() => setSelectedRankForPermissions(r)}>
                          {r.name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-2 inline-block">قائمة الصلاحيات</Label>
                    <ScrollArea className="h-[45vh] rounded-md border border-purple-500/20 bg-black/20 p-3">
                      <div className="space-y-3">
                        {selectedRankForPermissions ? (
                          ALL_PERMISSIONS.map((perm) => {
                            const has = selectedRankForPermissions.permissions?.includes(perm.id as any);
                            return (
                              <div key={perm.id} className="flex items-center justify-between rounded-lg bg-black/30 p-2">
                                <div>
                                  <p className="font-semibold">{perm.name}</p>
                                  <p className="text-xs text-muted-foreground">{perm.description}</p>
                                </div>
                                <Button size="icon" variant={has ? "secondary" : "default"} onClick={() => handlePermissionToggle(perm.id)} disabled={isUpdatingPermission}>
                                  {isUpdatingPermission ? <Loader2 className="h-4 w-4 animate-spin" /> : has ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                                </Button>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-center text-muted-foreground">اختر لقبًا لتعديل صلاحياته.</p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Sticky Save Bar */}
      {hasDirty && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-purple-500/20 bg-black/70 backdrop-blur">
          <div className="container mx-auto flex items-center justify-between gap-3 p-3">
            <p className="text-sm text-yellow-300">لديك تعديلات غير محفوظة. استخدم Ctrl/Cmd+S للحفظ السريع.</p>
            {activeTab === "avatars" ? (
              <Button onClick={() => handleSavePrices(storeTab)} disabled={isSaving}>
                {isSaving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}
                {isSaving ? "جاري الحفظ..." : "حفظ المتجر"}
              </Button>
            ) : (
              <Button onClick={handleSaveRanks} disabled={isSavingRanks}>
                {isSavingRanks ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}
                {isSavingRanks ? "جاري الحفظ..." : "حفظ الألقاب"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Confirm remove rank */}
      <AlertDialog open={pendingRemoveIndex !== null} onOpenChange={(open) => !open && setPendingRemoveIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف اللقب؟</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف هذا اللقب نهائيًا. لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={actuallyRemoveRank} className="bg-destructive hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
