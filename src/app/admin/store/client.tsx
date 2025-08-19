
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useDeferredValue,
} from "react";
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
  RotateCcw,
  CheckSquare,
  Square,
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
import {
  getAvatarPrices,
  getPunishmentAvatarPrices,
  getDefaultAvatar,
  getRanks,
  getTopUsers,
} from "@/lib/actions/user/queries";
import { cn } from "@/lib/utils";
import { ALL_PERMISSIONS } from "@/data/permissions";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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

/* -------------------- ثوابت وأدوات -------------------- */
const rankIconMap: Record<string, React.ElementType> = {
  Shield,
  Award: Trophy,
  Gem,
  Crown,
  Star,
};

const isSamePrice = (
  a?: Omit<AvatarPrice, "avatarId">,
  b?: Omit<AvatarPrice, "avatarId">
) =>
  !a || !b ? a === b : a.price === b.price && a.currency === b.currency;

/* -------------------- مكوّن تايل الأفـاتار -------------------- */
interface AvatarTileProps {
  avatarId: string;
  price: Omit<AvatarPrice, "avatarId"> | undefined;
  basePrice: Omit<AvatarPrice, "avatarId"> | undefined;
  isDefault: boolean;
  disabled?: boolean;
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: (id: string) => void;
  onPriceChange: (id: string, price: number) => void;
  onCurrencyChange: (id: string, currency: "coins" | "diamonds") => void;
  onSetDefault?: (id: string) => void;
  onToggleForSale: (id: string, forSale: boolean) => void;
}

const AvatarTile = React.memo(function AvatarTile({
  avatarId,
  price,
  basePrice,
  isDefault,
  disabled,
  selected,
  selectionMode,
  onToggleSelect,
  onPriceChange,
  onCurrencyChange,
  onSetDefault,
  onToggleForSale,
}: AvatarTileProps) {
  const changed = !isSamePrice(price, basePrice);
  const notForSale = price?.price === -1 || price?.price === undefined;

  return (
    <div
      className={cn(
        "group relative rounded-2xl border bg-white/5 p-3 backdrop-blur transition",
        "border-cyan-500/20 hover:border-cyan-400/40 hover:bg-white/10",
        changed && "ring-2 ring-cyan-400/40",
        selected && "border-cyan-400 ring-2 ring-cyan-400/60"
      )}
    >
      {/* تحديد متعدد */}
      {selectionMode && (
        <button
          type="button"
          onClick={() => onToggleSelect?.(avatarId)}
          className={cn(
            "absolute start-2 top-2 z-10 inline-flex items-center gap-1 rounded-lg bg-black/40 px-2 py-1 text-xs",
            selected ? "text-cyan-300" : "text-white/90"
          )}
          title={selected ? "إلغاء تحديد" : "تحديد"}
        >
          {selected ? (
            <CheckSquare className="h-4 w-4" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          <span>{selected ? "محدّد" : "تحديد"}</span>
        </button>
      )}

      {/* صورة */}
      <div className="relative">
        <PlayerAvatar
          avatarId={avatarId}
          className={cn(
            "w-full aspect-square rounded-xl border",
            "border-cyan-900/30 bg-black/30"
          )}
        />
        {isDefault && (
          <div className="absolute end-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-xs text-amber-300">
            <Sparkles className="h-3.5 w-3.5" />
            الافتراضية
          </div>
        )}
        {!isDefault && !!onSetDefault && (
          <button
            type="button"
            onClick={() => onSetDefault?.(avatarId)}
            className="absolute start-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
            title="تعيين كافتراضية"
            aria-label="تعيين كافتراضية"
          >
            <Star className="h-5 w-5" />
          </button>
        )}
        {notForSale && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/60 text-xs text-white">
            غير معروض
          </div>
        )}
      </div>

      {/* إعدادات السعر */}
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-white/70">عرض في المتجر</Label>
          <input
            type="checkbox"
            checked={!notForSale}
            onChange={(e) => onToggleForSale(avatarId, e.target.checked)}
            disabled={disabled || isDefault}
            className="h-4 w-4 cursor-pointer accent-cyan-400"
            aria-label="عرض في المتجر"
          />
        </div>

        <div className="flex gap-2">
          <Input
            aria-label={`سعر ${avatarId}`}
            type="number"
            inputMode="numeric"
            className="text-center"
            value={notForSale ? "" : String(price?.price ?? "")}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") onPriceChange(avatarId, -1);
              else {
                const n = Number(v);
                if (!Number.isNaN(n)) onPriceChange(avatarId, n);
              }
            }}
            placeholder="السعر"
            disabled={disabled || isDefault || notForSale}
          />
          <Select
            value={(price?.currency as "coins" | "diamonds") || "coins"}
            onValueChange={(v: "coins" | "diamonds") =>
              onCurrencyChange(avatarId, v)
            }
            disabled={disabled || isDefault || notForSale}
          >
            <SelectTrigger className="w-28">
              <SelectValue placeholder="العملة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="coins">
                <div className="flex items-center gap-2">
                  <CircleDollarSign className="h-4 w-4" />
                  <span>كوينز</span>
                </div>
              </SelectItem>
              <SelectItem value="diamonds">
                <div className="flex items-center gap-2">
                  <Gem className="h-4 w-4" />
                  <span>ألماس</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {changed && (
          <div className="text-[11px] text-cyan-300">تعديل غير محفوظ</div>
        )}
      </div>
    </div>
  );
});
AvatarTile.displayName = "AvatarTile";

/* -------------------- صف اللقب (أعيد تصميمه) -------------------- */
interface RankRowProps {
  rank: Omit<SocialRank, "icon"> & { icon: string };
  onUpdate: (field: keyof SocialRank, value: any) => void;
  onRemove: () => void;
  disabled?: boolean;
}
const RankRow = React.memo(function RankRow({
  rank,
  onUpdate,
  onRemove,
  disabled,
}: RankRowProps) {
  const IconComp = rankIconMap[rank.icon] || Star;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-white/5 p-3">
      <Input
        type="number"
        className="w-28"
        value={String(rank.threshold)}
        onChange={(e) =>
          onUpdate("threshold", parseInt(e.target.value || "0", 10))
        }
        placeholder="النقاط"
        disabled={disabled}
      />
      <Input
        className="flex-1"
        value={rank.name}
        onChange={(e) => onUpdate("name", e.target.value)}
        placeholder="اسم اللقب"
        disabled={disabled}
      />
      <Select
        value={rank.icon}
        onValueChange={(v) => onUpdate("icon", v)}
        disabled={disabled}
      >
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
                <div className="flex items-center gap-2">
                  <I className="h-4 w-4" />
                  <span>{name}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <Button
        size="icon"
        variant="destructive"
        onClick={onRemove}
        disabled={disabled}
        title="حذف اللقب"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
});
RankRow.displayName = "RankRow";

/* -------------------- المكوّن الرئيسي بتصميم جديد -------------------- */
export default function AdminStoreClient() {
  const { toast } = useToast();
  const router = useRouter();
  const { userProfile, loading } = useAuth();

  // الحالة
  const [basePrices, setBasePrices] = useState<
    Record<string, Omit<AvatarPrice, "avatarId">>
  >({});
  const [prices, setPrices] = useState<
    Record<string, Omit<AvatarPrice, "avatarId">>
  >({});
  const [basePunishmentPrices, setBasePunishmentPrices] = useState<
    Record<string, Omit<AvatarPrice, "avatarId">>
  >({});
  const [punishmentPrices, setPunishmentPrices] = useState<
    Record<string, Omit<AvatarPrice, "avatarId">>
  >({});
  const [defaultAvatarId, setDefaultAvatarId] =
    useState<string>("Avatar00.png");

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // الألقاب
  const [ranks, setRanks] = useState<SocialRank[]>([]);
  const [isSavingRanks, setIsSavingRanks] = useState(false);
  const [selectedRankForPermissions, setSelectedRankForPermissions] =
    useState<SocialRank | null>(null);
  const [isUpdatingPermission, setIsUpdatingPermission] = useState(false);

  // المتصدرون
  const [topCoinsUsers, setTopCoinsUsers] = useState<UserProfile[]>([]);
  const [topPointsUsers, setTopPointsUsers] = useState<UserProfile[]>([]);

  // واجهة
  const [activeTab, setActiveTab] = useState<"avatars" | "ranks">("avatars");
  const [storeTab, setStoreTab] = useState<"regular" | "punishment">(
    "regular"
  );
  const [query, setQuery] = useState("");
  const dQuery = useDeferredValue(query);
  const [showOnlyChanged, setShowOnlyChanged] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(
    null
  );

  // تحميل تدريجي (دفعات)
  const BATCH = 60;
  const [renderCount, setRenderCount] = useState(BATCH);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!loading && !userProfile?.isAdmin) {
      router.push("/");
    }
  }, [userProfile, loading, router]);

  // جلب البيانات
  const fetchPageData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [
        pricesResult,
        punishmentPricesResult,
        ranksResult,
        defaultAvatarResult,
        topCoinsResult,
        topPointsResult,
      ] = await Promise.all([
        getAvatarPrices(),
        getPunishmentAvatarPrices(),
        getRanks(),
        getDefaultAvatar(),
        getTopUsers("coins", 5),
        getTopUsers("leaderboardPoints", 5),
      ]);

      if (pricesResult.success && pricesResult.prices) {
        const priceMap = pricesResult.prices.reduce(
          (
            acc: Record<string, Omit<AvatarPrice, "avatarId">>,
            item: AvatarPrice
          ) => {
            acc[item.avatarId] = {
              price: item.price,
              currency: (item.currency as any) || "coins",
            };
            return acc;
          },
          {}
        );
        setBasePrices(priceMap);
        setPrices(priceMap);
      } else if (!pricesResult.success) {
        toast({
          title: "خطأ",
          description: pricesResult.error,
          variant: "destructive",
        });
      }

      if (punishmentPricesResult.success && punishmentPricesResult.prices) {
        const priceMap = punishmentPricesResult.prices.reduce(
          (
            acc: Record<string, Omit<AvatarPrice, "avatarId">>,
            item: AvatarPrice
          ) => {
            acc[item.avatarId] = {
              price: item.price,
              currency: (item.currency as any) || "coins",
            };
            return acc;
          },
          {}
        );
        setBasePunishmentPrices(priceMap);
        setPunishmentPrices(priceMap);
      } else if (!punishmentPricesResult.success) {
        toast({
          title: "خطأ",
          description: punishmentPricesResult.error,
          variant: "destructive",
        });
      }

      if (defaultAvatarResult.success && defaultAvatarResult.avatarId) {
        setDefaultAvatarId(defaultAvatarResult.avatarId);
      }

      if (Array.isArray(ranksResult)) {
        const sorted = ranksResult.sort((a, b) => a.threshold - b.threshold);
        setRanks(sorted);
        setSelectedRankForPermissions(sorted[0] ?? null);
      }

      setTopCoinsUsers(topCoinsResult || []);
      setTopPointsUsers(topPointsResult || []);
    } catch (err: any) {
      toast({
        title: "خطأ غير متوقع",
        description: err?.message || "فشل جلب البيانات",
        variant: "destructive",
      });
    } finally {
      setIsLoadingData(false);
    }
  }, [toast]);

  useEffect(() => {
    if (userProfile?.isAdmin) fetchPageData();
  }, [userProfile?.isAdmin, fetchPageData]);

  // كشف التعديلات
  const dirtyRegular = useMemo(
    () => AVATAR_IDS.some((id) => !isSamePrice(prices[id], basePrices[id])),
    [prices, basePrices]
  );
  const dirtyPunish = useMemo(
    () =>
      PUNISHMENT_AVATAR_IDS.some(
        (id) => !isSamePrice(punishmentPrices[id], basePunishmentPrices[id])
      ),
    [punishmentPrices, basePunishmentPrices]
  );
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

  // الحفظ
  const handleSavePrices = useCallback(
    async (tab: "regular" | "punishment") => {
      setIsSaving(true);
      const current = tab === "regular" ? prices : punishmentPrices;
      const allIds = tab === "regular" ? AVATAR_IDS : PUNISHMENT_AVATAR_IDS;
      const payload: AvatarPrice[] = allIds.map((id) => ({
        avatarId: id,
        price: current[id]?.price ?? -1,
        currency: (current[id]?.currency as any) ?? "coins",
      }));
      const action =
        tab === "regular" ? setAvatarPrices : setPunishmentAvatarPrices;
      const res = await action(payload);
      if (res.success) {
        toast({
          title: "تم الحفظ",
          description: `تم حفظ أسعار ${
            tab === "regular" ? "المتجر" : "متجر العقوبات"
          }.`,
        });
        if (tab === "regular") setBasePrices({ ...prices });
        else setBasePunishmentPrices({ ...punishmentPrices });
      } else {
        toast({
          title: "فشل الحفظ",
          description: res.error,
          variant: "destructive",
        });
      }
      setIsSaving(false);
    },
    [prices, punishmentPrices, toast]
  );

  const handleSaveRanks = useCallback(async () => {
    setIsSavingRanks(true);
    const sorted = [...ranks].sort((a, b) => a.threshold - b.threshold);
    const dup = new Set<number>();
    let hasDup = false;
    sorted.forEach((r) => {
      if (dup.has(r.threshold)) hasDup = true;
      dup.add(r.threshold);
    });
    if (hasDup) {
      toast({
        title: "تحذير",
        description: "هناك عتبات مكررة للألقاب. تأكد من تفرّدها.",
        variant: "destructive",
      });
      setIsSavingRanks(false);
      return;
    }

    const res = await setSocialRanks(sorted);
    if (res.success) {
      toast({ title: "تم الحفظ", description: "تم حفظ الألقاب بنجاح." });
      setRanks(sorted);
    } else {
      toast({
        title: "فشل الحفظ",
        description: res.error,
        variant: "destructive",
      });
    }
    setIsSavingRanks(false);
  }, [ranks, toast]);

  // Ctrl/Cmd + S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s";
      if (isSave) {
        e.preventDefault();
        if (activeTab === "avatars") handleSavePrices(storeTab);
        else if (activeTab === "ranks") handleSaveRanks();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTab, storeTab, handleSavePrices, handleSaveRanks]);

  // فلترة + تغيّر الاستعلام يعيد الضخ الدفعي
  const allIds = storeTab === "regular" ? AVATAR_IDS : PUNISHMENT_AVATAR_IDS;
  const currentPrices =
    storeTab === "regular" ? prices : punishmentPrices;
  const currentBase =
    storeTab === "regular" ? basePrices : basePunishmentPrices;

  const visibleAvatarIds = useMemo(() => {
    const filtered = allIds.filter((id) =>
      id.toLowerCase().includes(dQuery.toLowerCase())
    );
    if (!showOnlyChanged) return filtered;
    return filtered.filter((id) => !isSamePrice(currentPrices[id], currentBase[id]));
  }, [allIds, dQuery, showOnlyChanged, currentPrices, currentBase]);

  // تحميل تدريجي
  useEffect(() => {
    setRenderCount(BATCH);
  }, [storeTab, dQuery, showOnlyChanged]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        const [e] = entries;
        if (e.isIntersecting) {
          setRenderCount((c) => Math.min(c + BATCH, visibleAvatarIds.length));
        }
      },
      { rootMargin: "600px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [visibleAvatarIds.length]);

  const renderedIds = visibleAvatarIds.slice(0, renderCount);

  // تعامل مع السعر/العملة/الإفتراضي/العرض
  const handlePriceChange = useCallback(
    (id: string, value: number) => {
      if (storeTab === "regular") {
        setPrices((p) => ({
          ...p,
          [id]: { ...(p[id] || { price: -1, currency: "coins" }), price: value },
        }));
      } else {
        setPunishmentPrices((p) => ({
          ...p,
          [id]: { ...(p[id] || { price: -1, currency: "coins" }), price: value },
        }));
      }
    },
    [storeTab]
  );

  const handleCurrencyChange = useCallback(
    (id: string, value: "coins" | "diamonds") => {
      if (storeTab === "regular") {
        setPrices((p) => ({
          ...p,
          [id]: { ...(p[id] || { price: -1, currency: "coins" }), currency: value },
        }));
      } else {
        setPunishmentPrices((p) => ({
          ...p,
          [id]: { ...(p[id] || { price: -1, currency: "coins" }), currency: value },
        }));
      }
    },
    [storeTab]
  );

  const handleToggleForSale = useCallback(
    (id: string, forSale: boolean) => {
      const target = storeTab === "regular" ? setPrices : setPunishmentPrices;
      target((p) => ({
        ...p,
        [id]: {
          ...(p[id] || { price: -1, currency: "coins" }),
          price: forSale ? (p[id]?.price && p[id]?.price !== -1 ? p[id]!.price : 0) : -1,
        },
      }));
    },
    [storeTab]
  );

  const handleSetDefault = async (id: string) => {
    const res = await setDefaultAvatar(id);
    if (res.success) {
      setDefaultAvatarId(id);
      setPrices((p) => ({ ...p, [id]: { price: 0, currency: "coins" } }));
      toast({
        title: "تم التعيين",
        description: `${id} أصبحت الشخصية الافتراضية (مجانية).`,
      });
    } else {
      toast({ title: "خطأ", description: res.error, variant: "destructive" });
    }
  };

  // اختيار متعدد
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  useEffect(() => {
    if (!selectionMode) setSelectedIds(new Set());
  }, [selectionMode]);

  // عمليات جماعية
  const targets = selectedIds.size ? Array.from(selectedIds) : visibleAvatarIds;
  const bulkApply = (payload: {
    price?: number;
    currency?: "coins" | "diamonds";
    forSale?: boolean;
  }) => {
    const applyIds = targets;
    const setFn = storeTab === "regular" ? setPrices : setPunishmentPrices;
    setFn((prev) => {
      const next = { ...prev };
      applyIds.forEach((id) => {
        const current = next[id] || { price: -1, currency: "coins" as const };
        next[id] = {
          price:
            payload.forSale != null
              ? payload.forSale
                ? current.price === -1
                  ? 0
                  : current.price
                : -1
              : payload.price ?? current.price,
          currency: payload.currency ?? current.currency,
        };
      });
      return next;
    });
  };

  // تصدير/استيراد
  const downloadRef = useRef<HTMLAnchorElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExport = () => {
    const data = {
      regular: prices,
      punishment: punishmentPrices,
      defaultAvatarId,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    if (!downloadRef.current) return;
    downloadRef.current.href = url;
    downloadRef.current.download = `store-config-${Date.now()}.json`;
    downloadRef.current.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

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
        toast({
          title: "فشل الاستيراد",
          description: err?.message || "صيغة الملف غير صحيحة.",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // إعادة كل شيء كما كان (حسب التبويب)
  const handleReset = () => {
    if (storeTab === "regular") setPrices({ ...basePrices });
    else setPunishmentPrices({ ...basePunishmentPrices });
    toast({ title: "تم الإرجاع", description: "أُلغيَت التغييرات غير المحفوظة." });
  };

  // رتب/أذونات
  const handleRankChange = useCallback(
    (index: number, field: keyof SocialRank, value: string | number) => {
      setRanks((prev) => {
        const copy = [...prev];
        if (copy[index]) (copy[index] as any)[field] = value;
        return copy;
      });
    },
    []
  );

  const handleRemoveRank = useCallback((index: number) => {
    setPendingRemoveIndex(index);
  }, []);

  const confirmRemoveRank = () => {
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
    if (!users.length) return <p className="text-center text-white/60">لا يوجد بيانات.</p>;
    return (
      <div className="space-y-2">
        {users.map((u, i) => (
          <div key={u.uid} className="flex items-center justify-between rounded-xl border border-cyan-500/20 bg-white/5 p-2">
            <div className="flex items-center gap-2">
              <span className="w-6 text-center font-bold">{i + 1}.</span>
              <PlayerAvatar avatarId={u.avatarId} className="h-8 w-8" />
              <span className="font-semibold">{u.name}</span>
            </div>
            <span className="font-bold text-cyan-300">
              {u[field]} {field === "coins" ? "كوينز" : "نقطة"}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <main
      dir="rtl"
      className={cn(
        "min-h-screen text-foreground",
        "bg-[radial-gradient(40%_30%_at_70%_0%,rgba(34,211,238,0.18),transparent_60%),radial-gradient(20%_40%_at_10%_0%,rgba(59,130,246,0.15),transparent_60%),linear-gradient(to_bottom_right,rgba(2,6,23,0.92),rgba(6,19,31,0.92))]"
      )}
    >
      {/* روابط خفية للتصدير/الاستيراد */}
      <a ref={downloadRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImport}
      />

      {/* شريط علوي ثابت */}
      <div className="sticky inset-x-0 top-0 z-30 border-b border-cyan-500/20 bg-black/60 backdrop-blur">
        <div className="container mx-auto flex flex-wrap items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/admin")}
            title="العودة"
          >
            <ArrowLeft />
          </Button>
          <h1 className="me-auto inline-flex items-center gap-2 text-lg font-bold text-cyan-200">
            <Settings className="h-5 w-5" />
            إدارة المتجر والألقاب
          </h1>

          {/* بحث سريع */}
          <div className="relative">
            <Search className="pointer-events-none absolute end-2 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن صورة/رقم"
              className="w-[220px] pe-8"
            />
          </div>

          {/* أوامر عامة */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setSelectionMode((s) => !s)}
              title="وضع التحديد المتعدد"
            >
              {selectionMode ? "إيقاف التحديد" : "تفعيل التحديد"}
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="me-2 h-4 w-4" /> تصدير
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="me-2 h-4 w-4" /> استيراد
            </Button>
            <Button
              variant="secondary"
              onClick={handleReset}
              disabled={isLoadingData || !hasDirty}
              title="إرجاع التغييرات غير المحفوظة"
            >
              <RotateCcw className="me-2 h-4 w-4" />
              إرجاع
            </Button>
            {activeTab === "avatars" ? (
              <Button onClick={() => handleSavePrices(storeTab)} disabled={isSaving || isLoadingData || !hasDirty}>
                {isSaving ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="me-2 h-4 w-4" />
                )}
                {isSaving ? "جاري الحفظ..." : "حفظ المتجر"}
              </Button>
            ) : (
              <Button onClick={handleSaveRanks} disabled={isSavingRanks}>
                {isSavingRanks ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="me-2 h-4 w-4" />
                )}
                {isSavingRanks ? "جاري الحفظ..." : "حفظ الألقاب"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="container relative mx-auto grid gap-6 px-4 py-6 lg:grid-cols-[1fr_280px]">
        {/* المحتوى الرئيسي */}
        <section className="space-y-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2 bg-white/5">
              <TabsTrigger value="avatars">إدارة المتجر</TabsTrigger>
              <TabsTrigger value="ranks">الألقاب والصلاحيات</TabsTrigger>
            </TabsList>

            {/* المتجر */}
            <TabsContent value="avatars" className="pt-4">
              <Card className="border-cyan-500/20 bg-white/5">
                <CardHeader className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <CardTitle>عناصر المتجر</CardTitle>
                    <CardDescription>
                      تحكّم بالعرض والأسعار والعملات — الشخصية الافتراضية مجانية دائمًا.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={selectionMode ? "default" : "outline"}
                      onClick={() => setSelectionMode((s) => !s)}
                    >
                      {selectionMode ? "إيقاف التحديد" : "تفعيل التحديد"}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent>
                  {isLoadingData ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                      {Array.from({ length: 24 }).map((_, i) => (
                        <Skeleton key={i} className="aspect-square w-full rounded-xl" />
                      ))}
                    </div>
                  ) : (
                    <ScrollArea className="h-[68vh] rounded-xl border border-cyan-500/20 bg-black/20 p-3">
                      <div
                        className={cn(
                          "grid gap-3",
                          "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
                        )}
                      >
                        {renderedIds.map((id) => (
                          <AvatarTile
                            key={id}
                            avatarId={id}
                            price={currentPrices[id]}
                            basePrice={currentBase[id]}
                            isDefault={storeTab === "regular" && id === defaultAvatarId}
                            disabled={isLoadingData}
                            selectionMode={selectionMode}
                            selected={selectedIds.has(id)}
                            onToggleSelect={toggleSelect}
                            onPriceChange={handlePriceChange}
                            onCurrencyChange={handleCurrencyChange}
                            onSetDefault={storeTab === "regular" ? handleSetDefault : undefined}
                            onToggleForSale={handleToggleForSale}
                          />
                        ))}
                      </div>
                      {/* Sentinel للتحميل التدريجي */}
                      <div ref={sentinelRef} className="h-6 w-full" />
                    </ScrollArea>
                  )}
                </CardContent>

                <CardFooter className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-white/70">
                    {storeTab === "regular" ? (
                      <>
                        الافتراضية:{" "}
                        <span className="font-medium text-cyan-300">
                          {defaultAvatarId}
                        </span>
                      </>
                    ) : (
                      <>
                        الظاهرة:{" "}
                        <span className="font-medium text-cyan-300">
                          {visibleAvatarIds.length}
                        </span>
                      </>
                    )}
                    {" · "}
                    المعروضة الآن:{" "}
                    <span className="font-medium text-cyan-300">
                      {renderedIds.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={handleReset}
                      disabled={isLoadingData || !hasDirty}
                    >
                      <RotateCcw className="me-2 h-4 w-4" />
                      إرجاع التعديلات
                    </Button>
                    <Button
                      onClick={() => handleSavePrices(storeTab)}
                      disabled={isSaving || isLoadingData || !hasDirty}
                    >
                      {isSaving ? (
                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="me-2 h-4 w-4" />
                      )}
                      {isSaving ? "جاري الحفظ..." : "حفظ التغييرات"}
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </TabsContent>

            {/* الألقاب */}
            <TabsContent value="ranks" className="pt-4">
              <div className="grid gap-6 lg:grid-cols-3">
                <Card className="border-cyan-500/20 bg-white/5 lg:col-span-2">
                  <CardHeader>
                    <CardTitle>إدارة الألقاب</CardTitle>
                    <CardDescription>
                      حدّد العتبات والأسماء والأيقونات. استخدم Ctrl/Cmd+S للحفظ السريع.
                    </CardDescription>
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
                        ranks.map((rank, index) => (
                          <RankRow
                            key={`${rank.name}-${index}`}
                            rank={rank as any}
                            onUpdate={(field, value) =>
                              handleRankChange(index, field, value)
                            }
                            onRemove={() => handleRemoveRank(index)}
                            disabled={isSavingRanks}
                          />
                        ))
                      )}
                      <Button variant="outline" className="w-full" onClick={handleAddRank}>
                        <PlusCircle className="me-2 h-4 w-4" /> إضافة لقب جديد
                      </Button>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button onClick={handleSaveRanks} disabled={isSavingRanks}>
                      {isSavingRanks ? (
                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="me-2 h-4 w-4" />
                      )}
                      {isSavingRanks ? "جاري الحفظ..." : "حفظ تغييرات الألقاب"}
                    </Button>
                  </CardFooter>
                </Card>

                <Card className="border-cyan-500/20 bg-white/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" /> صلاحيات الألقاب
                    </CardTitle>
                    <CardDescription>اختر لقبًا ثم فعّل/عطّل الصلاحيات.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="mb-2 inline-block">اختر اللقب</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {ranks.map((r) => (
                          <Button
                            key={r.name}
                            variant={
                              selectedRankForPermissions?.name === r.name
                                ? "default"
                                : "outline"
                            }
                            className="justify-start"
                            onClick={() => setSelectedRankForPermissions(r)}
                          >
                            {r.name}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label className="mb-2 inline-block">قائمة الصلاحيات</Label>
                      <ScrollArea className="h-[45vh] rounded-xl border border-cyan-500/20 bg-black/20 p-3">
                        <div className="space-y-3">
                          {selectedRankForPermissions ? (
                            ALL_PERMISSIONS.map((perm) => {
                              const has =
                                selectedRankForPermissions.permissions?.includes(
                                  perm.id as any
                                );
                              return (
                                <div
                                  key={perm.id}
                                  className="flex items-center justify-between rounded-xl border border-cyan-500/20 bg-white/5 p-2"
                                >
                                  <div>
                                    <p className="font-semibold">{perm.name}</p>
                                    <p className="text-xs text-white/60">
                                      {perm.description}
                                    </p>
                                  </div>
                                  <Button
                                    size="icon"
                                    variant={has ? "secondary" : "default"}
                                    onClick={() => handlePermissionToggle(perm.id)}
                                    disabled={isUpdatingPermission}
                                  >
                                    {isUpdatingPermission ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : has ? (
                                      <Unlock className="h-4 w-4" />
                                    ) : (
                                      <Lock className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-center text-white/60">
                              اختر لقبًا لتعديل صلاحياته.
                            </p>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </section>

        {/* سايدبار: معلومات وفلاتر */}
        <aside className="space-y-6">
          <Card className="border-cyan-500/20 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">إحصاءات سريعة</CardTitle>
              <CardDescription>نظرة عامة</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-cyan-500/20 bg-black/30 p-3 text-center">
                <div className="text-xs text-white/60">الشخصيات</div>
                <div className="text-2xl font-bold text-cyan-300">
                  {AVATAR_IDS.length}
                </div>
              </div>
              <div className="rounded-xl border border-cyan-500/20 bg-black/30 p-3 text-center">
                <div className="text-xs text-white/60">العقوبات</div>
                <div className="text-2xl font-bold text-cyan-300">
                  {PUNISHMENT_AVATAR_IDS.length}
                </div>
              </div>
              <div className="rounded-xl border border-cyan-500/20 bg-black/30 p-3 text-center">
                <div className="text-xs text-white/60">الألقاب</div>
                <div className="text-2xl font-bold text-cyan-300">
                  {ranks.length}
                </div>
              </div>
              <div className="rounded-xl border border-cyan-500/20 bg-black/30 p-3 text-center">
                <div className="text-xs text-white/60">الحالة</div>
                <div
                  className={cn(
                    "text-2xl font-bold",
                    hasDirty ? "text-amber-300" : "text-emerald-300"
                  )}
                >
                  {hasDirty ? "غير محفوظ" : "محفوظ"}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-cyan-500/20 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">فلاتر المتجر</CardTitle>
              <CardDescription>تحكم بسرعة في المعروض</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-black/30 p-2">
                <Button
                  variant={storeTab === "regular" ? "default" : "outline"}
                  onClick={() => setStoreTab("regular")}
                  className="flex-1"
                >
                  المتجر
                </Button>
                <Button
                  variant={storeTab === "punishment" ? "default" : "outline"}
                  onClick={() => setStoreTab("punishment")}
                  className="flex-1"
                >
                  العقوبات
                </Button>
              </div>

              <Button
                variant={showOnlyChanged ? "default" : "outline"}
                onClick={() => setShowOnlyChanged((s) => !s)}
                className="w-full"
              >
                <Filter className="me-2 h-4 w-4" />
                فقط المعدّلة
              </Button>

              <div className="space-y-2">
                <Label className="text-xs text-white/70">عمليات جماعية</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => bulkApply({ currency: "coins" })}
                  >
                    كوينز
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => bulkApply({ currency: "diamonds" })}
                  >
                    ألماس
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => bulkApply({ price: 0, forSale: true })}
                  >
                    تصفير الأسعار
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => bulkApply({ forSale: false })}
                  >
                    إخفاء من المتجر
                  </Button>
                </div>
                <div className="text-[11px] text-white/60">
                  التطبيق على{" "}
                  <span className="font-semibold text-cyan-300">
                    {selectedIds.size ? `${selectedIds.size} محددة` : "العناصر الظاهرة"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
          
           <Card className="border-cyan-500/20 bg-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" /> أقوى اللاعبين
              </CardTitle>
              <CardDescription>أعلى نقاط الصدارة</CardDescription>
            </CardHeader>
            <CardContent>{renderTopUsers(topPointsUsers, "leaderboardPoints")}</CardContent>
          </Card>

          <Card className="border-cyan-500/20 bg-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleDollarSign className="h-5 w-5" /> أغنى اللاعبين
              </CardTitle>
              <CardDescription>أعلى الكوينز</CardDescription>
            </CardHeader>
            <CardContent>{renderTopUsers(topCoinsUsers, "coins")}</CardContent>
          </Card>
        </aside>
      </div>

      {/* حوار حذف لقب */}
      <AlertDialog
        open={pendingRemoveIndex !== null}
        onOpenChange={(open) => !open && setPendingRemoveIndex(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف اللقب؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف هذا اللقب نهائيًا. لا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveRank}
              className="bg-destructive hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
