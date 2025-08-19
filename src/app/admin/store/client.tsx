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
  Settings,
  Filter,
  Download,
  Upload,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  setAvatarPrices,
  setPunishmentAvatarPrices,
  setDefaultAvatar,
  setSocialRanks,
  addPermissionToRank,
  removePermissionFromRank,
} from "@/lib/actions/admin/settings";
import { getAvatarPrices, getPunishmentAvatarPrices, getDefaultAvatar, getRanks, getTopUsers } from "@/lib/actions/user/queries";
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
import { motion } from "framer-motion";

/*
  AdminStoreClient.improved.tsx
  - إعادة تصميم واجهة إدارة المتجر والألقاب
  - تحسينات أداء: تجزئة المكونات، memoization، تجنب إعادة التصيير الواسعة
  - تصميم جديد: شريط أدوات جانبي، شبكة مركزة، لوحة ألقاب جانبية
  - تأثيرات لطيفة عبر framer-motion
  - ألوان جديدة وثابتة عبر متغيرات CSS

  المبدأ: لا أغير منطق عمل ال API أو دوال الـactions — فقط أرتب، أحسن الأداء، وأجعل الواجهة مريحة.
*/

/* ---------- أيقونات للألقاب ---------- */
const rankIconMap: Record<string, React.ElementType> = {
  Shield: Shield,
  Award: Trophy,
  Gem: Gem,
  Crown: Crown,
  Star: Star,
};

/* ---------- Helpers ---------- */
const prettyCurrency = (c: "coins" | "diamonds") => (c === "coins" ? "كوينز" : "ألماس");

function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const isSamePrice = (
  a?: Omit<AvatarPrice, "avatarId">,
  b?: Omit<AvatarPrice, "avatarId">,
) => !a || !b ? a === b : a.price === b.price && a.currency === b.currency;

/* ---------- AvatarTile (مكوّن مستقل ومُحسن) ---------- */
interface AvatarTileProps {
  avatarId: string;
  price: Omit<AvatarPrice, "avatarId"> | undefined;
  basePrice: Omit<AvatarPrice, "avatarId"> | undefined;
  isDefault: boolean;
  disabled?: boolean;
  onPriceChange: (id: string, price: number) => void;
  onCurrencyChange: (id: string, currency: "coins" | "diamonds") => void;
  onSetDefault?: (id: string) => void;
}

const AvatarTile = React.memo(function AvatarTile({
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
  const notForSale = price?.price === -1 || price?.price === undefined;
  const inputValue = notForSale ? "" : String(price?.price ?? "");

  return (
    <motion.div layout whileHover={{ y: -6 }} className="rounded-2xl bg-[color:var(--card)] p-3 shadow-soft"> 
      <div className="relative">
        <PlayerAvatar avatarId={avatarId} className={cn("w-full aspect-square rounded-xl border transition-all", changed ? "border-accent" : "border-muted")} />
        {isDefault && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            <span>الافتراضية</span>
          </div>
        )}
        {notForSale && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/40 text-white text-sm">غير معروض للبيع</div>
        )}
        {!!onSetDefault && (
          <button type="button" aria-label="تعيين كشخصية افتراضية" title="تعيين كشخصية افتراضية" onClick={() => onSetDefault(avatarId)} className={cn("absolute top-2 left-2 grid h-8 w-8 place-items-center rounded-full bg-black/30 hover:bg-black/50 transition", isDefault && "text-yellow-400") }>
            <Star className={cn("h-5 w-5")} />
          </button>
        )}
      </div>

      <div className="mt-3 flex gap-2 items-center">
        <Input aria-label={`سعر ${avatarId}`} type="number" inputMode="numeric" className="text-center" value={inputValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") onPriceChange(avatarId, -1);
            else {
              const n = Number(v);
              if (!Number.isNaN(n)) onPriceChange(avatarId, n);
            }
          }} placeholder="- غير معروض -" disabled={disabled || isDefault} />

        <Select value={(price?.currency as "coins" | "diamonds") || "coins"} onValueChange={(v: "coins" | "diamonds") => onCurrencyChange(avatarId, v)} disabled={disabled || isDefault}>
          <SelectTrigger className="w-28" aria-label={`اختيار عملة ${avatarId}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="coins"><div className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-yellow-300"/> <span>كوينز</span></div></SelectItem>
            <SelectItem value="diamonds"><div className="flex items-center gap-2"><Gem className="h-4 w-4 text-blue-400"/> <span>ألماس</span></div></SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <div className={cn("truncate", changed ? "text-accent" : "text-muted-foreground")}>{changed ? "لم يتم الحفظ" : "محفوظ"}</div>
        {changed && <div className="text-xs text-accent">!</div>}
      </div>
    </motion.div>
  );
});
AvatarTile.displayName = "AvatarTile";

/* ---------- RankRow (مكوّن الألقاب المحسّن) ---------- */
interface RankRowProps {
  rank: Omit<SocialRank, 'icon'> & { icon: string };
  onUpdate: (field: keyof SocialRank, value: any) => void;
  onRemove: () => void;
  disabled?: boolean;
}

const RankRow = React.memo(function RankRow({ rank, onUpdate, onRemove, disabled }: RankRowProps) {
  const IconComp = rankIconMap[rank.icon] || Star;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[color:var(--card-alt)] p-2">
      <Input type="number" className="w-24" value={String(rank.threshold)} onChange={(e) => onUpdate("threshold", parseInt(e.target.value || "0", 10))} placeholder="نقاط" disabled={disabled} />
      <Input className="flex-1" value={rank.name} onChange={(e) => onUpdate("name", e.target.value)} placeholder="اسم اللقب" disabled={disabled} />
      <Select value={rank.icon} onValueChange={(v) => onUpdate("icon", v)} disabled={disabled}>
        <SelectTrigger className="w-36"><SelectValue><div className="flex items-center gap-2"><IconComp className="h-4 w-4"/> <span>{rank.icon}</span></div></SelectValue></SelectTrigger>
        <SelectContent>
          {Object.keys(rankIconMap).map((name) => {
            const I = rankIconMap[name];
            return <SelectItem key={name} value={name}><div className="flex items-center gap-2"><I className="h-4 w-4"/><span>{name}</span></div></SelectItem>;
          })}
        </SelectContent>
      </Select>
      <Button size="icon" variant="destructive" onClick={onRemove} disabled={disabled} title="حذف اللقب"><Trash2 className="h-4 w-4"/></Button>
    </div>
  );
});
RankRow.displayName = "RankRow";

/* ---------- Main component (مصمّم ومُحسّن) ---------- */
export default function AdminStoreClient() {
  const { toast } = useToast();
  const router = useRouter();
  const { userProfile, loading } = useAuth();

  /* Avatars */
  const [basePrices, setBasePrices] = useState<Record<string, Omit<AvatarPrice, "avatarId">>>({});
  const [prices, setPrices] = useState<Record<string, Omit<AvatarPrice, "avatarId">>>({});
  const [basePunishmentPrices, setBasePunishmentPrices] = useState<Record<string, Omit<AvatarPrice, "avatarId">>>({});
  const [punishmentPrices, setPunishmentPrices] = useState<Record<string, Omit<AvatarPrice, "avatarId">>>({});
  const [defaultAvatarId, setDefaultAvatarId] = useState<string>("Avatar00.png");

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  /* Ranks */
  const [ranks, setRanks] = useState<SocialRank[]>([]);
  const [isSavingRanks, setIsSavingRanks] = useState(false);
  const [selectedRankForPermissions, setSelectedRankForPermissions] = useState<SocialRank | null>(null);
  const [isUpdatingPermission, setIsUpdatingPermission] = useState(false);

  /* Leaderboards */
  const [topCoinsUsers, setTopCoinsUsers] = useState<UserProfile[]>([]);
  const [topPointsUsers, setTopPointsUsers] = useState<UserProfile[]>([]);

  /* UI */
  const [activeTab, setActiveTab] = useState<"avatars" | "ranks">("avatars");
  const [storeTab, setStoreTab] = useState<"regular" | "punishment">("regular");
  const [query, setQuery] = useState("");
  const [showOnlyChanged, setShowOnlyChanged] = useState(false);
  const [density, setDensity] = useState<"cozy" | "compact">("cozy");
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null);

  const debouncedQuery = useDebounced(query, 200);

  /* guard */
  useEffect(() => {
    if (!loading && !userProfile?.isAdmin) router.push("/");
  }, [userProfile, loading, router]);

  /* Fetch */
  const fetchPageData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [pricesResult, punishmentPricesResult, ranksResult, defaultAvatarResult, topCoinsResult, topPointsResult] = await Promise.all([
        getAvatarPrices(), getPunishmentAvatarPrices(), getRanks(), getDefaultAvatar(), getTopUsers("coins", 5), getTopUsers("leaderboardPoints", 5),
      ]);

      if (pricesResult.success && pricesResult.prices) {
        const priceMap = pricesResult.prices.reduce((acc: Record<string, Omit<AvatarPrice, "avatarId">>, item) => { acc[item.avatarId] = { price: item.price, currency: item.currency || "coins" }; return acc; }, {});
        setBasePrices(priceMap); setPrices(priceMap);
      } else if (!pricesResult.success) toast({ title: "خطأ", description: pricesResult.error, variant: "destructive" });

      if (punishmentPricesResult.success && punishmentPricesResult.prices) {
        const priceMap = punishmentPricesResult.prices.reduce((acc: Record<string, Omit<AvatarPrice, "avatarId">>, item) => { acc[item.avatarId] = { price: item.price, currency: item.currency || "coins" }; return acc; }, {});
        setBasePunishmentPrices(priceMap); setPunishmentPrices(priceMap);
      } else if (!punishmentPricesResult.success) toast({ title: "خطأ", description: punishmentPricesResult.error, variant: "destructive" });

      if (defaultAvatarResult.success && defaultAvatarResult.avatarId) setDefaultAvatarId(defaultAvatarResult.avatarId);

      if (Array.isArray(ranksResult)) {
        const sorted = ranksResult.sort((a, b) => a.threshold - b.threshold);
        setRanks(sorted); setSelectedRankForPermissions(sorted[0] ?? null);
      }

      setTopCoinsUsers(topCoinsResult || []);
      setTopPointsUsers(topPointsResult || []);
    } catch (err: any) {
      toast({ title: "خطأ غير متوقع", description: err?.message || "فشل جلب البيانات", variant: "destructive" });
    } finally { setIsLoadingData(false); }
  }, [toast]);

  useEffect(() => { if (userProfile?.isAdmin) fetchPageData(); }, [userProfile?.isAdmin, fetchPageData]);

  /* Dirty state detection */
  const dirtyRegular = useMemo(() => AVATAR_IDS.some((id) => !isSamePrice(prices[id], basePrices[id])), [prices, basePrices]);
  const dirtyPunish = useMemo(() => PUNISHMENT_AVATAR_IDS.some((id) => !isSamePrice(punishmentPrices[id], basePunishmentPrices[id])), [punishmentPrices, basePunishmentPrices]);
  const hasDirty = dirtyRegular || dirtyPunish;

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (hasDirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasDirty]);

  /* Save handlers */
  const handleSavePrices = useCallback(async (tab: "regular" | "punishment") => {
    setIsSaving(true);
    const current = tab === "regular" ? prices : punishmentPrices;
    const allIds = tab === "regular" ? AVATAR_IDS : PUNISHMENT_AVATAR_IDS;
    const payload: AvatarPrice[] = allIds.map(id => ({ avatarId: id, price: current[id]?.price ?? -1, currency: current[id]?.currency ?? 'coins' }));
    const action = tab === "regular" ? setAvatarPrices : setPunishmentAvatarPrices;
    const res = await action(payload);
    if (res.success) {
      toast({ title: "تم الحفظ", description: `تم حفظ أسعار ${tab === 'regular' ? 'المتجر العادي' : 'متجر العقوبات'}.` });
      if (tab === "regular") setBasePrices({ ...prices }); else setBasePunishmentPrices({ ...punishmentPrices });
    } else toast({ title: "فشل الحفظ", description: res.error, variant: "destructive" });
    setIsSaving(false);
  }, [prices, punishmentPrices, toast]);

  const handleSaveRanks = useCallback(async () => {
    setIsSavingRanks(true);
    const sorted = [...ranks].sort((a, b) => a.threshold - b.threshold);
    const dup = new Set<number>(); let hasDup = false; sorted.forEach((r) => { if (dup.has(r.threshold)) hasDup = true; dup.add(r.threshold); });
    if (hasDup) { toast({ title: "تحذير", description: "هناك عتبات مكررة للألقاب. تأكد من تفرّدها.", variant: "destructive" }); setIsSavingRanks(false); return; }
    const res = await setSocialRanks(sorted);
    if (res.success) { toast({ title: "تم الحفظ", description: "تم حفظ الألقاب بنجاح." }); setRanks(sorted); } else toast({ title: "فشل الحفظ", description: res.error, variant: "destructive" });
    setIsSavingRanks(false);
  }, [ranks, toast]);

  /* Ctrl/Cmd + S */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s";
      if (isSave) {
        e.preventDefault(); if (activeTab === "avatars") handleSavePrices(storeTab); else if (activeTab === "ranks") handleSaveRanks();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, storeTab, handleSavePrices, handleSaveRanks]);

  /* Visible ids */
  const visibleAvatarIds = useMemo(() => {
    const all = storeTab === "regular" ? AVATAR_IDS : PUNISHMENT_AVATAR_IDS;
    const map = storeTab === "regular" ? prices : punishmentPrices;
    const base = storeTab === "regular" ? basePrices : basePunishmentPrices;
    const filtered = all.filter((id) => id.toLowerCase().includes(debouncedQuery.toLowerCase()));
    if (!showOnlyChanged) return filtered;
    return filtered.filter((id) => !isSamePrice(map[id], base[id]));
  }, [storeTab, prices, punishmentPrices, basePrices, basePunishmentPrices, debouncedQuery, showOnlyChanged]);

  /* Price/Currency handlers */
  const handlePriceChange = useCallback((id: string, value: number) => {
    if (storeTab === 'regular') setPrices((p) => ({ ...p, [id]: { ...(p[id] || { price: -1, currency: 'coins'}), price: value }}));
    else setPunishmentPrices((p) => ({ ...p, [id]: { ...(p[id] || { price: -1, currency: 'coins'}), price: value }}));
  }, [storeTab]);

  const handleCurrencyChange = useCallback((id: string, value: 'coins' | 'diamonds') => {
    if (storeTab === 'regular') setPrices((p) => ({ ...p, [id]: { ...(p[id] || { price: -1, currency: 'coins'}), currency: value }}));
    else setPunishmentPrices((p) => ({ ...p, [id]: { ...(p[id] || { price: -1, currency: 'coins'}), currency: value }}));
  }, [storeTab]);

  const handleSetDefault = async (id: string) => {
    const res = await setDefaultAvatar(id);
    if (res.success) { setDefaultAvatarId(id); setPrices((p) => ({ ...p, [id]: { price: 0, currency: "coins" } })); toast({ title: "تم التعيين", description: `${id} أصبحت الشخصية الافتراضية (مجانية).` }); }
    else toast({ title: "خطأ", description: res.error, variant: "destructive" });
  };

  const bulkApply = (payload: { price?: number; currency?: "coins" | "diamonds" }) => {
    const ids = visibleAvatarIds;
    if (storeTab === "regular") {
      setPrices((prev) => { const next = { ...prev }; ids.forEach((id) => { next[id] = { price: payload.price ?? next[id]?.price ?? -1, currency: payload.currency ?? (next[id]?.currency || "coins") }; }); return next; });
    } else {
      setPunishmentPrices((prev) => { const next = { ...prev }; ids.forEach((id) => { next[id] = { price: payload.price ?? next[id]?.price ?? -1, currency: payload.currency ?? (next[id]?.currency || "coins") }; }); return next; });
    }
  };

  /* Export/Import JSON */
  const downloadRef = useRef<HTMLAnchorElement | null>(null);
  const handleExport = () => {
    const data = { regular: prices, punishment: punishmentPrices, defaultAvatarId, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); if (!downloadRef.current) return; downloadRef.current.href = url; downloadRef.current.download = `store-config-${Date.now()}.json`; downloadRef.current.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const json = JSON.parse(String(reader.result)); if (json?.regular) setPrices(json.regular); if (json?.punishment) setPunishmentPrices(json.punishment); if (json?.defaultAvatarId) setDefaultAvatarId(json.defaultAvatarId); toast({ title: "تم الاستيراد", description: "تم تحميل الإعدادات من الملف." }); } catch (err: any) { toast({ title: "فشل الاستيراد", description: err?.message || "صيغة الملف غير صحيحة.", variant: "destructive" }); } }; reader.readAsText(file); e.target.value = ""; };

  /* Ranks management helpers */
  const handleRankChange = useCallback((index: number, field: keyof SocialRank, value: string | number) => { setRanks((prev) => { const copy = [...prev]; if (copy[index]) (copy[index] as any)[field] = value; return copy; }); }, []);
  const handleRemoveRank = useCallback((index: number) => setPendingRemoveIndex(index), []);
  const confirmRemoveRank = () => { if (pendingRemoveIndex == null) return; setRanks((prev) => prev.filter((_, i) => i !== pendingRemoveIndex)); setPendingRemoveIndex(null); };
  const handleAddRank = () => { const last = ranks[ranks.length - 1]?.threshold ?? 0; setRanks((prev) => [...prev, { threshold: last + 100, name: "لقب جديد", icon: "Star", permissions: [] }]); };

  const handlePermissionToggle = async (permissionId: string) => {
    if (!selectedRankForPermissions) return; setIsUpdatingPermission(true); const has = selectedRankForPermissions.permissions?.includes(permissionId as any); const action = has ? removePermissionFromRank : addPermissionToRank; const res = await action(selectedRankForPermissions.name, permissionId); if (res.success) { await fetchPageData(); } else { toast({ title: "خطأ", description: res.error, variant: "destructive" }); } setIsUpdatingPermission(false);
  };

  /* renderTopUsers */
  const renderTopUsers = (users: UserProfile[], field: "coins" | "leaderboardPoints") => {
    if (isLoadingData) return (<div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>);
    if (!users.length) return <p className="text-center text-muted-foreground">لا يوجد بيانات.</p>;
    return (<div className="space-y-2">{users.map((u, i) => (<div key={u.uid} className="flex items-center justify-between rounded-md bg-[color:var(--card)] p-2"><div className="flex items-center gap-2"><span className="w-6 text-center font-bold">{i+1}.</span><PlayerAvatar avatarId={u.avatarId} className="h-8 w-8" /><span className="font-semibold">{u.name}</span></div><span className="font-bold text-primary">{u[field]} {field === "coins" ? "كوينز" : "نقطة"}</span></div>))}</div>);
  };

  const currentPrices = storeTab === "regular" ? prices : punishmentPrices;
  const currentBase = storeTab === "regular" ? basePrices : basePunishmentPrices;

  /* ---------- UI layout ---------- */
  return (
    <main dir="rtl" style={{
      // Theme variables
      ['--bg' as any]: '#0b1020',
      ['--card' as any]: 'rgba(255,255,255,0.03)',
      ['--card-alt' as any]: 'rgba(255,255,255,0.02)',
      ['--accent' as any]: '#7c3aed',
      ['--muted' as any]: 'rgba(255,255,255,0.25)'
    }} className="min-h-screen bg-gradient-to-b from-[#030417] to-[#071025] text-foreground p-6">
      <a ref={downloadRef} className="hidden" />
      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />

      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white"><Settings className="h-6 w-6 text-[color:var(--accent)]"/> لوحة إدارة المتجر والألقاب</h1>
          <p className="text-sm text-muted-foreground">واجهة معاد تصميمها — أسرع، أنظف، وألطف للعين.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin')} title="العودة"><ArrowLeft/></Button>
          <Button onClick={() => handleSavePrices(storeTab)} disabled={isSaving || isLoadingData || !hasDirty}>
            {isSaving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4"/>}
            {isSaving ? 'جاري الحفظ...' : 'حفظ'}</Button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar controls */}
        <aside className="col-span-12 lg:col-span-3 sticky top-6 space-y-4">
          <Card className="bg-[color:var(--card-alt)] p-4">
            <CardHeader>
              <CardTitle>أدوات سريعة</CardTitle>
              <CardDescription>فلتر، تصدير، تطبيق جماعي — في مكان واحد.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>بحث</Label>
                <div className="relative mt-2"><Search className="absolute end-3 top-3 h-4 w-4 text-muted-foreground"/><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن avatar أو رقم" className="pe-10"/></div>
              </div>

              <div>
                <Label>المتجر</Label>
                <div className="flex gap-2 mt-2">
                  <Button variant={storeTab === 'regular' ? 'default' : 'outline'} onClick={() => setStoreTab('regular')}>عادي</Button>
                  <Button variant={storeTab === 'punishment' ? 'default' : 'outline'} onClick={() => setStoreTab('punishment')}>عقوبات</Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => bulkApply({ currency: 'coins' })}>اجعل كوينز</Button>
                <Button variant="outline" onClick={() => bulkApply({ currency: 'diamonds' })}>اجعل ألماس</Button>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => fileInputRef.current?.click()}><Upload className="me-2 h-4 w-4"/>استيراد</Button>
                <Button variant="ghost" onClick={handleExport}><Download className="me-2 h-4 w-4"/>تصدير</Button>
              </div>

              <div className="pt-2 border-t border-white/5">
                <Label>خيارات عرض</Label>
                <div className="flex gap-2 mt-2">
                  <Select value={density} onValueChange={(v: any) => setDensity(v)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="الكثافة"/></SelectTrigger>
                    <SelectContent><SelectItem value="cozy">مريح</SelectItem><SelectItem value="compact">مضغوط</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="mt-2">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={showOnlyChanged} onChange={() => setShowOnlyChanged(s => !s)} /> فقط المعدّلة</label>
                </div>
              </div>

            </CardContent>
            <CardFooter>
              <div className="w-full text-xs text-muted-foreground">الشخصية الافتراضية: <span className="text-[color:var(--accent)]">{defaultAvatarId}</span></div>
            </CardFooter>
          </Card>

          <Card className="bg-[color:var(--card-alt)] p-4">
            <CardHeader><CardTitle>إحصائيات سريعة</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-2">
                <div className="flex items-center justify-between"><span>شخصيات</span><strong>{AVATAR_IDS.length}</strong></div>
                <div className="flex items-center justify-between"><span>عقوبات</span><strong>{PUNISHMENT_AVATAR_IDS.length}</strong></div>
                <div className="flex items-center justify-between"><span>ألقاب</span><strong>{ranks.length}</strong></div>
                <div className="flex items-center justify-between"><span>حالة التعديلات</span><strong className={cn(hasDirty ? 'text-yellow-300' : 'text-emerald-400')}>{hasDirty ? 'غير محفوظ' : 'محفوظ'}</strong></div>
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* Main grid (avatars) */}
        <section className="col-span-12 lg:col-span-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="grid grid-cols-2 bg-[color:var(--card)] rounded-lg p-1 mb-4">
              <TabsTrigger value="avatars">إدارة الشخصيات</TabsTrigger>
              <TabsTrigger value="ranks">إدارة الألقاب</TabsTrigger>
            </TabsList>

            <TabsContent value="avatars">
              <Card className="bg-[color:var(--card)]">
                <CardContent>
                  {isLoadingData ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">{Array.from({ length: 12 }).map((_, i) => (<Skeleton key={i} className="aspect-square w-full rounded-xl"/>))}</div>
                  ) : (
                    <ScrollArea className="h-[65vh] rounded-lg border border-white/6 p-3">
                      <div className={cn("grid gap-3", density === 'cozy' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8')}>
                        {visibleAvatarIds.map((id) => (
                          <AvatarTile key={id} avatarId={id} price={currentPrices[id]} basePrice={currentBase[id]} isDefault={storeTab === 'regular' && id === defaultAvatarId} disabled={isLoadingData} onPriceChange={handlePriceChange} onCurrencyChange={handleCurrencyChange} onSetDefault={storeTab === 'regular' ? handleSetDefault : undefined} />
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
                <CardFooter className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">العناصر الظاهرة: <span className="text-[color:var(--accent)]">{visibleAvatarIds.length}</span></div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => bulkApply({ price: 0 })}>تصفير الأسعار الظاهرة</Button>
                    <Button onClick={() => handleSavePrices(storeTab)} disabled={isSaving || isLoadingData || !hasDirty}>{isSaving ? <Loader2 className="me-2 h-4 w-4 animate-spin"/> : <Save className="me-2 h-4 w-4"/>}{isSaving ? 'جاري الحفظ...' : 'حفظ التغييرات'}</Button>
                  </div>
                </CardFooter>
              </Card>
            </TabsContent>

            {/* Ranks tab moved to main area for better focus */}
            <TabsContent value="ranks">
              <Card className="bg-[color:var(--card)]">
                <CardHeader><CardTitle>ألقاب اللاعبين</CardTitle><CardDescription>تحكم بالألقاب وترتيبها وصلاحياتها.</CardDescription></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {isLoadingData ? (
                      <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                    ) : (
                      ranks.map((rank, index) => (
                        <RankRow key={`${rank.name}-${index}`} rank={rank as any} onUpdate={(field, value) => handleRankChange(index, field, value)} onRemove={() => handleRemoveRank(index)} disabled={isSavingRanks} />
                      ))
                    )}
                    <Button variant="outline" className="w-full" onClick={handleAddRank}><PlusCircle className="me-2 h-4 w-4"/>إضافة لقب جديد</Button>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button onClick={handleSaveRanks} disabled={isSavingRanks}>{isSavingRanks ? <Loader2 className="me-2 h-4 w-4 animate-spin"/> : <Save className="me-2 h-4 w-4"/>}{isSavingRanks ? 'جاري الحفظ...' : 'حفظ تغييرات الألقاب'}</Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

        {/* Right sidebar: ranks permissions + leaderboards */}
        <aside className="col-span-12 lg:col-span-3 sticky top-6 space-y-4">
          <Card className="bg-[color:var(--card-alt)] p-4">
            <CardHeader><CardTitle>صلاحيات اللقب</CardTitle><CardDescription>اختر لقبًا لتعديل صلاحياته.</CardDescription></CardHeader>
            <CardContent>
              <div className="mb-3">
                <Label className="mb-2 inline-block">اختر اللقب</Label>
                <div className="grid grid-cols-2 gap-2">{ranks.map((r) => (<Button key={r.name} variant={selectedRankForPermissions?.name === r.name ? 'default' : 'outline'} className="justify-start" onClick={() => setSelectedRankForPermissions(r)}>{r.name}</Button>))}</div>
              </div>

              <Label className="mb-2 inline-block">قائمة الصلاحيات</Label>
              <ScrollArea className="h-[45vh] rounded-md border border-white/6 p-3">
                <div className="space-y-3">
                  {selectedRankForPermissions ? (
                    ALL_PERMISSIONS.map((perm) => {
                      const has = selectedRankForPermissions.permissions?.includes(perm.id as any);
                      return (
                        <div key={perm.id} className="flex items-center justify-between rounded-lg bg-[color:var(--card)] p-2">
                          <div>
                            <p className="font-semibold">{perm.name}</p>
                            <p className="text-xs text-muted-foreground">{perm.description}</p>
                          </div>
                          <Button size="icon" variant={has ? 'secondary' : 'default'} onClick={() => handlePermissionToggle(perm.id)} disabled={isUpdatingPermission}>{isUpdatingPermission ? <Loader2 className="h-4 w-4 animate-spin"/> : has ? <Unlock className="h-4 w-4"/> : <Lock className="h-4 w-4"/>}</Button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-center text-muted-foreground">اختر لقبًا لتعديل صلاحياته.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="bg-[color:var(--card-alt)] p-4">
            <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5"/> أقوى اللاعبين</CardTitle><CardDescription>أعلى 5 لاعبين من حيث نقاط الصدارة.</CardDescription></CardHeader>
            <CardContent>{renderTopUsers(topPointsUsers, "leaderboardPoints")}</CardContent>
          </Card>

          <Card className="bg-[color:var(--card-alt)] p-4">
            <CardHeader><CardTitle className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-yellow-500"/> أغنى اللاعبين</CardTitle><CardDescription>أعلى 5 لاعبين من حيث الكوينز.</CardDescription></CardHeader>
            <CardContent>{renderTopUsers(topCoinsUsers, "coins")}</CardContent>
          </Card>
        </aside>
      </div>

      {/* Sticky Save Bar */}
      {hasDirty && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex items-center justify-center">
          <div className="rounded-2xl bg-[color:var(--card)] p-3 shadow-soft w-[min(1100px,95%)] flex items-center justify-between gap-4">
            <p className="text-sm text-yellow-300">لديك تعديلات غير محفوظة. استخدم Ctrl/Cmd+S للحفظ السريع.</p>
            <div className="flex gap-2">
              <Button onClick={() => handleSavePrices(storeTab)} disabled={isSaving}>{isSaving ? <Loader2 className="me-2 h-4 w-4 animate-spin"/> : <Save className="me-2 h-4 w-4"/>}{isSaving ? 'جاري الحفظ...' : 'حفظ'}</Button>
              <Button variant="outline" onClick={() => fetchPageData()}>تراجع/إعادة تحميل</Button>
            </div>
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
            <AlertDialogAction onClick={confirmRemoveRank} className="bg-destructive hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
