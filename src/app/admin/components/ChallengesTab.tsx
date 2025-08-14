
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Timestamp } from "firebase/firestore";
import { format, formatDistanceToNowStrict, addHours, isBefore } from "date-fns";
import { ar } from "date-fns/locale";

// UI
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Icons
import { PlusCircle, Loader2, Trash2, Edit, Award, Search, Filter, ArrowUpDown, Sparkles, Shield, Gem, CircleDollarSign, CalendarClock, Copy, Download, CheckCircle2 } from "lucide-react";

// Types & actions
import type { Game, ChallengePrize, Challenge, EntryFee } from "@/types";
import { GAME_TYPE_NAMES } from "@/types";
import { createChallenge, updateChallenge, deleteChallenge, getAllChallengesForAdmin, finalizeChallenge } from "@/lib/actions/challenges";

// -------------------------------
// Utilities
// -------------------------------
const isTimestamp = (v: any): v is Timestamp => v?.toDate && typeof v.toDate === "function";
const toDate = (v: Date | string | Timestamp | null | undefined) => (v ? (isTimestamp(v) ? v.toDate() : new Date(v)) : new Date());

const numberOnly = (raw: string) => raw.replace(/[^0-9]/g, "");

const currencyIcon = (t: ChallengePrize["type"]) => {
  switch (t) {
    case "coins":
      return <CircleDollarSign className="w-4 h-4 text-yellow-400" />;
    case "diamonds":
      return <Gem className="w-4 h-4 text-sky-400" />;
    case "honorPoints":
      return <Shield className="w-4 h-4 text-emerald-400" />;
    default:
      return null;
  }
};

// -------------------------------
// PrizeInput (Improved Version)
// -------------------------------
const PrizeInput = ({ prize, onUpdate, onRemove }: { prize: ChallengePrize; onUpdate: (p: ChallengePrize) => void; onRemove: () => void }) => {
  return (
    <div className="flex gap-2 items-center bg-muted/70 p-2 rounded-lg border border-border/50">
      <Select value={prize.type} onValueChange={(v) => onUpdate({ ...prize, type: v as any })}>
        <SelectTrigger className="w-[140px] bg-background">
          <SelectValue placeholder="نوع الجائزة" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="coins">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="w-4 h-4 text-yellow-500" />
              كوينز
            </div>
          </SelectItem>
          <SelectItem value="diamonds">
            <div className="flex items-center gap-2">
              <Gem className="w-4 h-4 text-sky-500" />
              ألماس
            </div>
          </SelectItem>
          <SelectItem value="honorPoints">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-500" />
              نقاط شرف
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      <div className="relative flex-1">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none opacity-80">
            {currencyIcon(prize.type)}
        </div>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={String(prize.value)}
          onChange={(e) => onUpdate({ ...prize, value: Number(numberOnly(e.target.value)) || 0 })}
          placeholder="القيمة"
          aria-label="قيمة الجائزة"
          className="pl-9 bg-background"
        />
      </div>

      <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={onRemove} aria-label="حذف الجائزة">
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
};


// -------------------------------
// ChallengeForm
// -------------------------------
const ChallengeForm = ({
  initialData,
  onSubmit,
  isSubmitting,
}: {
  initialData: Partial<Omit<Challenge, "id" | "createdAt" | "participantIds" | "endsAt">> & { durationInHours?: number | string };
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}) => {
  const [title, setTitle] = useState(initialData.title || "");
  const [durationHours, setDurationHours] = useState(String(initialData.durationInHours || "168"));
  const [targetPoints, setTargetPoints] = useState(String(initialData.targetPoints || "100"));
  const [specificGameType, setSpecificGameType] = useState<Game["gameType"] | "all">(initialData.specificGameType || "all");
  const [entryFee, setEntryFee] = useState<EntryFee>(initialData.entryFee || { type: "coins", value: 0 });
  const [firstPlacePrizes, setFirstPlacePrizes] = useState<ChallengePrize[]>(initialData.firstPlacePrize || [{ type: "coins", value: 5 }]);
  const [secondPlacePrizes, setSecondPlacePrizes] = useState<ChallengePrize[]>(initialData.secondPlacePrize || [{ type: "coins", value: 50 }]);
  const [thirdPlacePrizes, setThirdPlacePrizes] = useState<ChallengePrize[]>(initialData.thirdPlacePrize || [{ type: "coins", value: 25 }]);

  useEffect(() => {
    setTitle(initialData.title || "");
    setDurationHours(String(initialData.durationInHours || "168"));
    setTargetPoints(String(initialData.targetPoints || "100"));
    setSpecificGameType(initialData.specificGameType || "all");
    setEntryFee(initialData.entryFee || { type: "coins", value: 0 });
    setFirstPlacePrizes(initialData.firstPlacePrize || [{ type: "coins", value: 5 }]);
    setSecondPlacePrizes(initialData.secondPlacePrize || [{ type: "coins", value: 50 }]);
    setThirdPlacePrizes(initialData.thirdPlacePrize || [{ type: "coins", value: 25 }]);
  }, [initialData]);

  const endsAtPreview = useMemo(() => {
    const hrs = Number(numberOnly(String(durationHours))) || 0;
    return addHours(new Date(), hrs);
  }, [durationHours]);

  const totals = useMemo(() => {
    const agg: Record<string, number> = { coins: 0, diamonds: 0, honorPoints: 0 };
    [...firstPlacePrizes, ...secondPlacePrizes, ...thirdPlacePrizes].forEach((p) => {
      agg[p.type] = (agg[p.type] || 0) + (Number(p.value) || 0);
    });
    return agg;
  }, [firstPlacePrizes, secondPlacePrizes, thirdPlacePrizes]);

  const handlePrizeChange = (setter: React.Dispatch<React.SetStateAction<ChallengePrize[]>>, index: number, updatedPrize: ChallengePrize) => {
    setter((prev) => prev.map((p, i) => (i === index ? updatedPrize : p)));
  };

  const addPrize = (setter: React.Dispatch<React.SetStateAction<ChallengePrize[]>>) => setter((prev) => [...prev, { type: "coins", value: 0 }]);
  const removePrize = (setter: React.Dispatch<React.SetStateAction<ChallengePrize[]>>, index: number) => setter((prev) => prev.filter((_, i) => i !== index));

  const validate = () => {
    const t = title.trim();
    const dh = Number(numberOnly(String(durationHours)));
    const tp = Number(numberOnly(String(targetPoints)));
    if (t.length < 3) return { ok: false, msg: "العنوان قصير جدًا." };
    if (!dh || dh <= 0) return { ok: false, msg: "المدة بالساعات يجب أن تكون أكبر من 0." };
    if (!tp || tp <= 0) return { ok: false, msg: "نقاط الصدارة المستهدفة يجب أن تكون أكبر من 0." };
    if (firstPlacePrizes.filter((p) => p.value > 0).length === 0) return { ok: false, msg: "أضف جائزة واحدة على الأقل للمركز الأول." };
    return { ok: true };
  };

  const handleSubmit = () => {
    const v = validate();
    if (!v.ok) return alert(v.msg);
    onSubmit({
      title: title.trim(),
      durationInHours: Number(numberOnly(String(durationHours))),
      targetPoints: Number(numberOnly(String(targetPoints))),
      specificGameType,
      entryFee: entryFee.value > 0 ? { type: entryFee.type, value: Number(entryFee.value) } : null,
      firstPlacePrize: firstPlacePrizes.filter((p) => p.value > 0),
      secondPlacePrize: secondPlacePrizes.filter((p) => p.value > 0),
      thirdPlacePrize: thirdPlacePrizes.filter((p) => p.value > 0),
    });
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="challenge-title">عنوان البطولة</Label>
        <Input id="challenge-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: بطولة العيد الكبرى" />
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="target-points">نقاط الصدارة المستهدفة</Label>
          <Input
            id="target-points"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={targetPoints}
            onChange={(e) => setTargetPoints(numberOnly(e.target.value))}
            placeholder="100"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration-hours">مدة البطولة (بالساعات)</Label>
          <Input
            id="duration-hours"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={durationHours}
            onChange={(e) => setDurationHours(numberOnly(e.target.value))}
            placeholder="168"
          />
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <CalendarClock className="w-3.5 h-3.5" /> ينتهي تقريبًا: {format(endsAtPreview, "d MMM yyyy, h:mm a", { locale: ar })} — {formatDistanceToNowStrict(endsAtPreview, { locale: ar })}
          </p>
        </div>
      </div>

      {/* Game type */}
      <div className="space-y-2">
        <Label htmlFor="game-type">نوع البطولة</Label>
        <Select value={specificGameType} onValueChange={(v) => setSpecificGameType(v as any)}>
          <SelectTrigger id="game-type">
            <SelectValue placeholder="اختر نوع البطولة..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">شاملة (كل الألعاب)</SelectItem>
            {Object.entries(GAME_TYPE_NAMES).map(([type, name]) => (
              <SelectItem key={type} value={type}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Entry fee */}
      <div className="space-y-2 p-3 rounded-xl bg-gradient-to-br from-muted/60 via-muted/30 to-background border">
        <Label className="font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> رسوم الدخول (اختياري)
        </Label>
        <div className="flex gap-2 items-center">
          <Select value={entryFee.type} onValueChange={(v) => setEntryFee({ ...entryFee, type: v as any })}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="العملة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="coins">كوينز</SelectItem>
              <SelectItem value="leaderboardPoints">نقاط صدارة</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={String(entryFee.value)}
            onChange={(e) => setEntryFee({ ...entryFee, value: Number(numberOnly(e.target.value)) || 0 })}
            placeholder="القيمة (0 = مجاني)"
          />
        </div>
      </div>

      {/* Prizes */}
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-lg">جوائز المراكز</h4>
          <div className="text-xs text-muted-foreground flex items-center gap-3">
            <span className="flex items-center gap-1">{currencyIcon("coins")} <b>{totals.coins}</b></span>
            <span className="flex items-center gap-1">{currencyIcon("diamonds")} <b>{totals.diamonds}</b></span>
            <span className="flex items-center gap-1">{currencyIcon("honorPoints")} <b>{totals.honorPoints}</b></span>
          </div>
        </div>

        {[
          { title: "المركز الأول", prizes: firstPlacePrizes, setter: setFirstPlacePrizes },
          { title: "المركز الثاني", prizes: secondPlacePrizes, setter: setSecondPlacePrizes },
          { title: "المركز الثالث", prizes: thirdPlacePrizes, setter: setThirdPlacePrizes },
        ].map(({ title, prizes, setter }) => (
          <div key={title} className="space-y-2 p-3 border rounded-xl bg-muted/30">
            <Label className="font-semibold">{title}</Label>
            <div className="space-y-2">
              {prizes.map((prize, index) => (
                <PrizeInput key={index} prize={prize} onUpdate={(p) => handlePrizeChange(setter, index, p)} onRemove={() => removePrize(setter, index)} />
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => addPrize(setter)}>
              <PlusCircle className="w-4 h-4 ml-2" /> إضافة جائزة أخرى
            </Button>
          </div>
        ))}
      </div>

      <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
        {isSubmitting ? <Loader2 className="animate-spin" /> : <PlusCircle />}
        {initialData.title ? "حفظ التعديلات" : "إنشاء البطولة"}
      </Button>
    </div>
  );
};

// -------------------------------
// Main Tab
// -------------------------------
export default function ChallengesTab() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null);
  const [challengeToDelete, setChallengeToDelete] = useState<Challenge | null>(null);
  const [challengeToFinalize, setChallengeToFinalize] = useState<Challenge | null>(null);

  // UX: filters & sorting
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "ended" | "finalized">("all");
  const [sortKey, setSortKey] = useState<"endsAt" | "createdAt">("endsAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const fetchChallenges = useCallback(async () => {
    setIsFetching(true);
    try {
      const fetched = await getAllChallengesForAdmin();
      setChallenges(fetched);
    } catch (error: any) {
      toast({ title: "خطأ", description: `فشل جلب البطولات: ${error.message}`, variant: "destructive" });
    } finally {
      setIsFetching(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);

  // Derived list
  const filteredSorted = useMemo(() => {
    const now = new Date();
    const byQuery = (q: string, t: string) => t.toLowerCase().includes(q.toLowerCase());

    let list = challenges.filter((c) => byQuery(query, c.title || ""));

    list = list.filter((c) => {
      const ends = toDate(c.endsAt);
      const ended = isBefore(ends, now);
      const finalized = !!c.winners;
      if (statusFilter === "all") return true;
      if (statusFilter === "finalized") return finalized;
      if (statusFilter === "ended") return ended && !finalized;
      if (statusFilter === "active") return !ended && !finalized;
      return true;
    });

    list.sort((a, b) => {
      const av = +toDate(a[sortKey]);
      const bv = +toDate(b[sortKey]);
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return list;
  }, [challenges, query, statusFilter, sortKey, sortDir]);

  const stats = useMemo(() => {
    const now = new Date();
    let active = 0,
      ended = 0,
      finalized = 0;
    challenges.forEach((c) => {
      const isFinal = !!c.winners;
      const isEnd = isBefore(toDate(c.endsAt), now);
      if (isFinal) finalized++;
      else if (isEnd) ended++;
      else active++;
    });
    return { total: challenges.length, active, ended, finalized };
  }, [challenges]);

  // CRUD handlers
  const handleCreateChallenge = async (data: any) => {
    if (!data.title || !data.durationInHours || !data.targetPoints) {
      toast({ title: "الرجاء ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    const result = await createChallenge(data);
    if (result.success) {
      toast({ title: "تم إنشاء البطولة بنجاح!" });
      fetchChallenges();
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const handleUpdateChallenge = async (data: any) => {
    if (!editingChallenge) return;
    setIsSubmitting(true);
    const result = await updateChallenge(editingChallenge.id, data);
    if (result.success) {
      toast({ title: "تم تحديث البطولة بنجاح!" });
      setEditingChallenge(null);
      fetchChallenges();
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const handleDeleteChallenge = async () => {
    if (!challengeToDelete) return;
    setIsSubmitting(true);
    const result = await deleteChallenge(challengeToDelete.id);
    if (result.success) {
      toast({ title: "تم حذف البطولة بنجاح" });
      setChallenges((prev) => prev.filter((c) => c.id !== challengeToDelete.id));
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
    setChallengeToDelete(null);
  };

  const handleFinalize = async () => {
    if (!challengeToFinalize) return;
    setIsSubmitting(true);
    const result = await finalizeChallenge(challengeToFinalize.id);
    if (result.success) {
      toast({ title: "تم إنهاء البطولة بنجاح", description: `تم توزيع الجوائز على ${result.winnersCount} فائز.` });
      fetchChallenges();
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
    setChallengeToFinalize(null);
  };

  // Helpers
  const getDurationInHours = (challenge: Challenge) => {
    if (!challenge.createdAt || !challenge.endsAt) return 168;
    const createdAtMs = toDate(challenge.createdAt).getTime();
    const endsAtMs = toDate(challenge.endsAt).getTime();
    return Math.max(1, Math.round((endsAtMs - createdAtMs) / (1000 * 60 * 60)));
  };

  const duplicateChallenge = async (c: Challenge) => {
    const payload = {
      title: `${c.title} (نسخة)`,
      durationInHours: getDurationInHours(c),
      targetPoints: c.targetPoints,
      specificGameType: (c as any).specificGameType || "all",
      entryFee: (c as any).entryFee || null,
      firstPlacePrize: c.firstPlacePrize || [],
      secondPlacePrize: c.secondPlacePrize || [],
      thirdPlacePrize: c.thirdPlacePrize || [],
    };
    setIsSubmitting(true);
    const result = await createChallenge(payload);
    if (result.success) {
      toast({ title: "تم نسخ البطولة" });
      fetchChallenges();
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const exportCSV = () => {
    const headers = [
      "id",
      "title",
      "createdAt",
      "endsAt",
      "targetPoints",
      "status",
    ];
    const rows = challenges.map((c) => {
      const created = toDate(c.createdAt).toISOString();
      const ends = toDate(c.endsAt).toISOString();
      const ended = isBefore(toDate(c.endsAt), new Date());
      const status = c.winners ? "finalized" : ended ? "ended" : "active";
      return [c.id, c.title, created, ends, String(c.targetPoints ?? ""), status];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `challenges-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // List item UI helpers
  const ChallengeItem = ({ c }: { c: Challenge }) => {
    const endsAtDate = toDate(c.endsAt);
    const createdAtDate = toDate(c.createdAt);
    const isEnded = isBefore(endsAtDate, new Date());
    const isFinalized = !!c.winners;

    const totalDurationHrs = Math.max(1, Math.round((+endsAtDate - +createdAtDate) / (1000 * 60 * 60)));
    const elapsedHrs = Math.max(0, Math.round((+new Date() - +createdAtDate) / (1000 * 60 * 60)));
    const progress = Math.max(0, Math.min(100, Math.round((elapsedHrs / totalDurationHrs) * 100)));

    const statusColor = isFinalized ? "bg-emerald-600/20 text-emerald-300 border-emerald-700/30" : isEnded ? "bg-amber-600/20 text-amber-300 border-amber-700/30" : "bg-blue-600/20 text-blue-300 border-blue-700/30";

    return (
      <div className={cn("rounded-lg p-3 border flex items-center justify-between gap-3", isFinalized ? "bg-background" : isEnded ? "bg-muted/50" : "bg-muted")}>        
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-[11px] px-2 py-0.5 rounded-full border", statusColor)}>
              {isFinalized ? "موزّعة الجوائز" : isEnded ? "انتهت" : "نشِطة"}
            </span>
            <p className="font-bold text-sm sm:text-base">{c.title}</p>
          </div>
          <p className="text-[12px] text-muted-foreground">
            تنتهي: {format(endsAtDate, "d MMMM, h:mm a", { locale: ar })} — {formatDistanceToNowStrict(endsAtDate, { locale: ar })}
          </p>
          <div className="h-1.5 bg-background/60 rounded-full overflow-hidden">
            <div className="h-full bg-primary/70" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="flex items-center gap-1">
          {!isFinalized && (
            <Button size="icon" variant="ghost" onClick={() => setEditingChallenge(c)} aria-label="تعديل">
              <Edit className="w-4 h-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => duplicateChallenge(c)} aria-label="نسخ">
            <Copy className="w-4 h-4" />
          </Button>

          {isEnded && !isFinalized && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="default" className="gap-1" onClick={() => setChallengeToFinalize(c)}>
                  <Award className="w-4 h-4 ml-1" /> توزيع الجوائز
                </Button>
              </AlertDialogTrigger>
            </AlertDialog>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="text-destructive" aria-label="حذف">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            {/* The shared dialog below actually executes the deletion */}
             <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                    <AlertDialogDescription>
                    هل تريد حقًا حذف بطولة "{c.title}"؟ لا يمكن التراجع عن هذا الإجراء.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setChallengeToDelete(null)}>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { setChallengeToDelete(c); handleDeleteChallenge() }} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
                    {isSubmitting ? "جاري الحذف..." : "نعم، قم بالحذف"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Creator / Editor */}
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.06),transparent_60%)]" />
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{editingChallenge ? "تعديل البطولة" : "إنشاء بطولة جديدة"}</CardTitle>
                <CardDescription>
                  {editingChallenge ? "عدّل بيانات البطولة الحالية." : "قم بإعداد بطولة تجميع نقاط بواجهة متقدمة وجذابة."}
                </CardDescription>
              </div>
              {editingChallenge && (
                <Button variant="outline" size="sm" onClick={() => setEditingChallenge(null)} className="gap-1">
                  إلغاء التعديل
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ChallengeForm
              initialData={
                editingChallenge
                  ? { ...editingChallenge, durationInHours: getDurationInHours(editingChallenge) }
                  : ({ title: "", durationInHours: "168", targetPoints: "100", specificGameType: "all", firstPlacePrize: [{ type: "coins", value: 5 }], secondPlacePrize: [{ type: "coins", value: 50 }], thirdPlacePrize: [{ type: "coins", value: 25 }], entryFee: { type: "coins", value: 0 } } as any)
              }
              onSubmit={editingChallenge ? handleUpdateChallenge : handleCreateChallenge}
              isSubmitting={isSubmitting}
            />
          </CardContent>
          <CardFooter className="text-[11px] text-muted-foreground">
            نصيحة: اجعل الجوائز ذات معنى وتوازن بين العملات لمنع التضخم داخل اللعبة.
          </CardFooter>
        </Card>

        {/* List & Controls */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>البطولات الحالية</CardTitle>
                <CardDescription>إدارة، تصفية، فرز وتصدير البطولات بسهولة.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1">
                <Download className="w-4 h-4" /> تصدير CSV
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              {[{ k: "total", label: "إجمالي", color: "" }, { k: "active", label: "نشطة", color: "text-blue-500" }, { k: "ended", label: "انتهت", color: "text-amber-500" }, { k: "finalized", label: "موزّعة", color: "text-emerald-500" }].map((s) => (
                <div key={s.k} className="rounded-lg border p-3 bg-muted/40">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={cn("font-extrabold text-xl", s.color)}>{(stats as any)[s.k]}</p>
                </div>
              ))}
            </div>

            {/* Controls */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="relative">
                <Input placeholder="بحث بالعنوان..." value={query} onChange={(e) => setQuery(e.target.value)} className="pr-9" />
                <Search className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="active">نشطة</SelectItem>
                  <SelectItem value="ended">منتهية (لم تُوزّع)</SelectItem>
                  <SelectItem value="finalized">موزّعة الجوائز</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Select value={sortKey} onValueChange={(v: any) => setSortKey(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="endsAt">الفرز حسب تاريخ الانتهاء</SelectItem>
                    <SelectItem value="createdAt">الفرز حسب تاريخ الإنشاء</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} className="shrink-0">
                  <ArrowUpDown className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isFetching ? (
              <div className="text-center py-10">
                <Loader2 className="w-8 h-8 animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground mt-2">جاري تحميل البطولات...</p>
              </div>
            ) : filteredSorted.length === 0 ? (
              <div className="text-center py-10">
                <CheckCircle2 className="w-10 h-10 mx-auto opacity-50" />
                <p className="text-sm text-muted-foreground mt-2">لا توجد بطولات مطابقة لخيارات البحث والتصفية.</p>
              </div>
            ) : (
              <ScrollArea className="h-[60vh] pr-2">
                <div className="space-y-2">
                  {filteredSorted.map((c) => (
                    <ChallengeItem key={c.id} c={c} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Finalize Dialog */}
         {challengeToFinalize && <AlertDialog open={!!challengeToFinalize} onOpenChange={() => setChallengeToFinalize(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد توزيع الجوائز</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم الآن إنهاء البطولة وتوزيع الجوائز على الفائزين. هل أنت متأكد؟
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleFinalize} disabled={isSubmitting}>
                   {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "تنفيذ التوزيع"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>}
      </div>
    </div>
  );
}
