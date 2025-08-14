"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Timestamp } from "firebase/firestore";
import { format, formatDistanceToNow, isToday } from "date-fns";
import { ar } from "date-fns/locale";

// UI
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge"; // shadcn badge (make sure it exists in your project)
import { Checkbox } from "@/components/ui/checkbox"; // shadcn checkbox (make sure it exists in your project)

// Icons
import { Check, Loader2, HandCoins, MessageCircleQuestion, ThumbsUp, ThumbsDown, RefreshCw, Download, Search, Filter, Trash2 } from "lucide-react";

// App
import { useToast } from "@/hooks/use-toast";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { GAME_TYPE_NAMES } from "@/data/icons";
import type { Complaint } from "@/types";
import { getComplaints, resolveComplaint } from "@/lib/actions/complaints";

// ---------- Helpers ----------
const toDate = (val: any): Date => {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (typeof val?.toDate === "function") return val.toDate();
  if (val instanceof Timestamp) return val.toDate();
  return new Date(val);
};

const statusColor: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  resolved: "bg-sky-100 text-sky-800 border-sky-200",
  rejected: "bg-rose-100 text-rose-800 border-rose-200",
};

const typeColor: Record<string, string> = {
  missing_currency: "bg-purple-100 text-purple-800 border-purple-200",
  bug_report: "bg-blue-100 text-blue-800 border-blue-200",
};

// ---------- Component ----------
export default function ComplaintsTab() {
  const { toast } = useToast();

  // Raw data
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Action/Mutation busy flag (id | 'bulk')
  const [busy, setBusy] = useState<string | null>(null);

  // Edits
  const [modifiedCoins, setModifiedCoins] = useState<Record<string, string>>({});
  const [modifiedPoints, setModifiedPoints] = useState<Record<string, string>>({});

  // Filters / Search / Sort
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "resolved" | "rejected">("pending");
  const [typeFilter, setTypeFilter] = useState<"all" | "missing_currency" | "bug_report">("all");
  const [sortDir, setSortDir] = useState<"newest" | "oldest">("newest");

  // Selection (for bulk approve/reject in missing_currency)
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  // Bulk overrides
  const [bulkCoins, setBulkCoins] = useState<string>("");
  const [bulkPoints, setBulkPoints] = useState<string>("");

  const fetchComplaints = useCallback(async () => {
    setIsLoading(true);
    const result = await getComplaints();
    if (result.success && result.complaints) {
      setComplaints(result.complaints);
    } else {
      toast({ title: "خطأ", description: "فشل جلب الشكاوى.", variant: "destructive" });
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  // ---------- Derived ----------
  const normalized = useMemo(() =>
    complaints.map((c) => ({ ...c, _createdAt: toDate(c.createdAt) })),
  [complaints]);

  const filtered = useMemo(() => {
    let list = [...normalized];

    if (statusFilter !== "all") list = list.filter((c) => c.status === statusFilter);
    if (typeFilter !== "all") list = list.filter((c) => c.type === typeFilter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) =>
        c.userName?.toLowerCase().includes(q) ||
        String(c.details?.reason || "").toLowerCase().includes(q) ||
        String(c.details?.description || "").toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      const da = a._createdAt.getTime();
      const db = b._createdAt.getTime();
      return sortDir === "newest" ? db - da : da - db;
    });

    return list;
  }, [normalized, search, statusFilter, typeFilter, sortDir]);

  const missingCurrency = useMemo(() => filtered.filter((c) => c.type === "missing_currency"), [filtered]);
  const bugReports = useMemo(() => filtered.filter((c) => c.type === "bug_report"), [filtered]);

  // Stats
  const stats = useMemo(() => {
    const total = complaints.length;
    const pending = complaints.filter((c) => c.status === "pending").length;
    const resolved = complaints.filter((c) => c.status === "resolved" || c.status === "approved").length;
    const rejected = complaints.filter((c) => c.status === "rejected").length;
    const today = complaints.filter((c) => isToday(toDate(c.createdAt))).length;
    return { total, pending, resolved, rejected, today };
  }, [complaints]);

  // ---------- Actions ----------
  const handleResolveSingle = async (
    complaint: Complaint,
    resolution: "approved" | "rejected" | "resolved"
  ) => {
    setBusy(complaint.id);

    let finalCoins = complaint.details?.coins || 0;
    let finalPoints = complaint.details?.points || 0;

    if (resolution === "approved") {
      const coinsStr = modifiedCoins[complaint.id];
      const pointsStr = modifiedPoints[complaint.id];
      if (coinsStr !== undefined && coinsStr !== "" && !isNaN(parseInt(coinsStr))) finalCoins = parseInt(coinsStr);
      if (pointsStr !== undefined && pointsStr !== "" && !isNaN(parseInt(pointsStr))) finalPoints = parseInt(pointsStr);
    } else {
      finalCoins = 0;
      finalPoints = 0;
    }

    const result = await resolveComplaint(complaint, resolution, finalCoins, finalPoints);
    if (result.success) {
      toast({ title: "تم التنفيذ" });
      fetchComplaints();
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }

    setBusy(null);
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    setBusy("bulk");

    try {
      for (const id of selectedIds) {
        const complaint = missingCurrency.find((c) => c.id === id);
        if (!complaint) continue;
        let coins = complaint.details?.coins || 0;
        let points = complaint.details?.points || 0;
        if (bulkCoins.trim() !== "" && !isNaN(parseInt(bulkCoins))) coins = parseInt(bulkCoins);
        else if (modifiedCoins[id] && !isNaN(parseInt(modifiedCoins[id]))) coins = parseInt(modifiedCoins[id]);
        if (bulkPoints.trim() !== "" && !isNaN(parseInt(bulkPoints))) points = parseInt(bulkPoints);
        else if (modifiedPoints[id] && !isNaN(parseInt(modifiedPoints[id]))) points = parseInt(modifiedPoints[id]);
        // eslint-disable-next-line no-await-in-loop
        await resolveComplaint(complaint, "approved", coins, points);
      }
      toast({ title: "تم تعويض الشكاوى المحددة" });
      setSelected({});
      setBulkCoins("");
      setBulkPoints("");
      fetchComplaints();
    } catch (e: any) {
      toast({ title: "تعذّر التعويض الجماعي", description: e?.message || "حدث خطأ غير متوقع", variant: "destructive" });
    }

    setBusy(null);
  };

  const handleBulkReject = async () => {
    if (selectedIds.length === 0) return;
    setBusy("bulk");

    try {
      for (const id of selectedIds) {
        const complaint = missingCurrency.find((c) => c.id === id);
        if (!complaint) continue;
        // eslint-disable-next-line no-await-in-loop
        await resolveComplaint(complaint, "rejected", 0, 0);
      }
      toast({ title: "تم رفض الشكاوى المحددة" });
      setSelected({});
      fetchComplaints();
    } catch (e: any) {
      toast({ title: "تعذّر الرفض الجماعي", description: e?.message || "حدث خطأ غير متوقع", variant: "destructive" });
    }

    setBusy(null);
  };

  const toggleSelect = (id: string, v: boolean | string) => {
    setSelected((prev) => ({ ...prev, [id]: !!v }));
  };

  const exportCSV = () => {
    const headers = [
      "id",
      "userName",
      "type",
      "status",
      "game",
      "coins",
      "points",
      "reason",
      "description",
      "createdAt",
    ];

    const rows = filtered.map((c) => [
      c.id,
      c.userName ?? "",
      c.type,
      c.status,
      c.details?.game ?? "",
      String(c.details?.coins ?? 0),
      String(c.details?.points ?? 0),
      (c.details?.reason ?? "").toString().replaceAll("\n", " "),
      (c.details?.description ?? "").toString().replaceAll("\n", " "),
      format(toDate(c.createdAt), "yyyy-MM-dd HH:mm"),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((x) => `"${String(x).replaceAll("\"", "''")}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `complaints_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------- UI Pieces ----------
  const Toolbar = (
    <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 w-full">
        <div className="relative col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="ابحث بالاسم أو الوصف أو السبب..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger>
            <SelectValue placeholder="حالة الشكوى" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="pending">قيد المراجعة</SelectItem>
            <SelectItem value="approved">مقبولة</SelectItem>
            <SelectItem value="resolved">معلّمة كمقروء</SelectItem>
            <SelectItem value="rejected">مرفوضة</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
          <SelectTrigger>
            <SelectValue placeholder="نوع الشكوى" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            <SelectItem value="missing_currency">تعويض عملات</SelectItem>
            <SelectItem value="bug_report">الإبلاغ عن خطأ</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortDir} onValueChange={(v: any) => setSortDir(v)}>
          <SelectTrigger>
            <SelectValue placeholder="الترتيب" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">الأحدث أولاً</SelectItem>
            <SelectItem value="oldest">الأقدم أولاً</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={fetchComplaints} disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}تحديث
        </Button>
        <Button variant="secondary" onClick={exportCSV}>
          <Download className="mr-2 h-4 w-4" />تصدير CSV
        </Button>
      </div>
    </div>
  );

  const Stats = (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Card className="shadow-sm">
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground">إجمالي</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground">قيد المراجعة</p>
          <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground">مكتملة/موافق عليها</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.resolved}</p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground">مرفوضة</p>
          <p className="text-2xl font-bold text-rose-600">{stats.rejected}</p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground">واردة اليوم</p>
          <p className="text-2xl font-bold text-sky-600">{stats.today}</p>
        </CardContent>
      </Card>
    </div>
  );

  const BulkBar = selectedIds.length > 0 && (
    <Card className="border-dashed">
      <CardContent className="py-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="text-sm">تم تحديد <span className="font-bold">{selectedIds.length}</span> شكوى لتعويض العملات</div>
        <div className="flex gap-2 items-center">
          <Input
            placeholder="كوينز (اختياري)"
            value={bulkCoins}
            onChange={(e) => setBulkCoins(e.target.value)}
            className="w-36"
          />
          <Input
            placeholder="نقاط (اختياري)"
            value={bulkPoints}
            onChange={(e) => setBulkPoints(e.target.value)}
            className="w-36"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleBulkApprove} disabled={busy === "bulk"} className="bg-emerald-600 hover:bg-emerald-700">
            {busy === "bulk" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsUp className="mr-2 h-4 w-4" />}موافقة جماعية
          </Button>
          <Button onClick={handleBulkReject} variant="destructive" disabled={busy === "bulk"}>
            {busy === "bulk" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsDown className="mr-2 h-4 w-4" />}رفض جماعي
          </Button>
          <Button variant="ghost" onClick={() => setSelected({})}><Trash2 className="mr-2 h-4 w-4" />مسح التحديد</Button>
        </div>
      </CardContent>
    </Card>
  );

  // Complaint item row (missing currency)
  const MissingItem = ({ c }: { c: Complaint & { _createdAt: Date } }) => {
    const coinsVal = modifiedCoins[c.id] ?? String(c.details?.coins ?? 0);
    const pointsVal = modifiedPoints[c.id] ?? String(c.details?.points ?? 0);

    const setQuick = (coins?: number, points?: number) => {
      if (typeof coins === "number") setModifiedCoins((p) => ({ ...p, [c.id]: String(coins) }));
      if (typeof points === "number") setModifiedPoints((p) => ({ ...p, [c.id]: String(points) }));
    };

    return (
      <AccordionItem value={c.id} className="rounded-md border bg-card">
        <AccordionTrigger className="px-3">
          <div className="flex items-center gap-3">
            <Checkbox checked={!!selected[c.id]} onCheckedChange={(v) => toggleSelect(c.id, v)} />
            <PlayerAvatar avatarId={c.userAvatar} className="w-8 h-8" />
            <div className="text-right">
              <div className="font-bold leading-tight">{c.userName}</div>
              <div className="text-[11px] text-muted-foreground" title={format(c._createdAt, "d MMM, h:mm a", { locale: ar })}>
                {formatDistanceToNow(c._createdAt, { addSuffix: true, locale: ar })}
              </div>
            </div>
            <div className="flex items-center gap-2 mr-auto">
              <Badge className={`border ${statusColor[c.status] || "bg-muted"}`}>{c.status === "pending" ? "قيد المراجعة" : c.status === "approved" ? "مقبولة" : c.status === "rejected" ? "مرفوضة" : "مقروء"}</Badge>
              <Badge className={`border ${typeColor[c.type] || "bg-muted"}`}>تعويض عملات</Badge>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-3 space-y-3 bg-muted/40 rounded-b-md">
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <div><span className="font-semibold">اللعبة:</span> {GAME_TYPE_NAMES[c.details?.game as keyof typeof GAME_TYPE_NAMES] || c.details?.game || "—"}</div>
            <div><span className="font-semibold">السبب:</span> {c.details?.reason || "—"}</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-center">
            <div>
              <Label className="text-xs">كوينز</Label>
              <Input type="number" value={coinsVal} onChange={(e) => setModifiedCoins((p) => ({ ...p, [c.id]: e.target.value }))} />
              <div className="flex gap-1 mt-1">
                {[25, 50, 100].map((n) => (
                  <Button key={n} size="xs" variant="secondary" onClick={() => setQuick(n, undefined)} className="h-6 text-[11px]">
                    +{n}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">نقاط</Label>
              <Input type="number" value={pointsVal} onChange={(e) => setModifiedPoints((p) => ({ ...p, [c.id]: e.target.value }))} />
              <div className="flex gap-1 mt-1">
                {[10, 25, 50].map((n) => (
                  <Button key={n} size="xs" variant="secondary" onClick={() => setQuick(undefined, n)} className="h-6 text-[11px]">
                    +{n}
                  </Button>
                ))}
              </div>
            </div>
            <div className="col-span-2 flex gap-2 items-end justify-end">
              <Button
                className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700"
                onClick={() => handleResolveSingle(c, "approved")}
                disabled={busy === c.id}
              >
                {busy === c.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsUp className="mr-2 h-4 w-4" />} موافقة وتعويض
              </Button>
              <Button
                className="flex-1 md:flex-none"
                variant="destructive"
                onClick={() => handleResolveSingle(c, "rejected")}
                disabled={busy === c.id}
              >
                {busy === c.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsDown className="mr-2 h-4 w-4" />} رفض
              </Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  const BugItem = ({ c }: { c: Complaint & { _createdAt: Date } }) => (
    <AccordionItem value={c.id} className="rounded-md border bg-card">
      <AccordionTrigger className="px-3">
        <div className="flex items-center gap-3 w-full">
          <PlayerAvatar avatarId={c.userAvatar} className="w-8 h-8" />
          <div className="text-right">
            <div className="font-bold leading-tight">{c.userName}</div>
            <div className="text-[11px] text-muted-foreground" title={format(c._createdAt, "d MMM, h:mm a", { locale: ar })}>
              {formatDistanceToNow(c._createdAt, { addSuffix: true, locale: ar })}
            </div>
          </div>
          <div className="flex items-center gap-2 mr-auto">
            <Badge className={`border ${statusColor[c.status] || "bg-muted"}`}>{c.status === "pending" ? "قيد المراجعة" : c.status === "approved" ? "مقبولة" : c.status === "rejected" ? "مرفوضة" : "مقروء"}</Badge>
            <Badge className={`border ${typeColor[c.type] || "bg-muted"}`}>تقرير خطأ</Badge>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="p-3 space-y-3 bg-muted/40 rounded-b-md">
        <div className="grid sm:grid-cols-2 gap-2 text-sm">
          <div><span className="font-semibold">اللعبة:</span> {GAME_TYPE_NAMES[c.details?.game as keyof typeof GAME_TYPE_NAMES] || c.details?.game || "—"}</div>
          <div className="sm:col-span-2"><span className="font-semibold">الوصف:</span> {c.details?.description || "—"}</div>
        </div>
        <Button className="w-full" variant="secondary" onClick={() => handleResolveSingle(c, "resolved")} disabled={busy === c.id}>
          {busy === c.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} وضع علامة كمقروء
        </Button>
      </AccordionContent>
    </AccordionItem>
  );

  const EmptyState = ({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) => (
    <div className="h-96 w-full flex flex-col items-center justify-center text-center gap-2 bg-muted/30 rounded-md border">
      <div className="p-3 rounded-full bg-background shadow-sm">{icon}</div>
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2 text-center">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">إدارة الشكاوى</h1>
        <p className="text-muted-foreground">لوحة تحكّم سريعة لمعالجة التعويضات وتقارير الأخطاء — تصميم مُحسّن بواسطة GPT‑5.</p>
      </div>

      {/* Toolbar */}
      <Card className="border-2 border-muted/60 bg-gradient-to-b from-background to-muted/30">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>أدوات الفرز والتصفية والبحث</span>
          </div>
          {Toolbar}
        </CardContent>
      </Card>

      {/* Stats */}
      {Stats}

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Missing currency */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HandCoins /> شكاوى النقاط والكوينز</CardTitle>
            <CardDescription>مراجعة طلبات التعويض عن العملات المفقودة.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedIds.length > 0 && BulkBar}
            {isLoading ? (
              <div className="flex items-center justify-center h-96"><Loader2 className="animate-spin" /></div>
            ) : missingCurrency.length === 0 ? (
              <EmptyState icon={<HandCoins className="text-muted-foreground" />} title="لا توجد شكاوى مطابقة" subtitle="جرّب تغيير عوامل التصفية أو البحث." />
            ) : (
              <ScrollArea className="h-96 pr-2">
                <Accordion type="single" collapsible className="w-full space-y-2">
                  {missingCurrency.map((c) => (
                    <MissingItem key={c.id} c={c as any} />
                  ))}
                </Accordion>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Bug reports */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MessageCircleQuestion /> تقارير المشاكل والأخطاء</CardTitle>
            <CardDescription>مراجعة تقارير اللاعبين عن الأخطاء في الألعاب.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-96"><Loader2 className="animate-spin" /></div>
            ) : bugReports.length === 0 ? (
              <EmptyState icon={<MessageCircleQuestion className="text-muted-foreground" />} title="لا توجد تقارير مطابقة" subtitle="غيّر التصفية أو ابحث باسم اللاعب." />
            ) : (
              <ScrollArea className="h-96 pr-2">
                <Accordion type="single" collapsible className="w-full space-y-2">
                  {bugReports.map((c) => (
                    <BugItem key={c.id} c={c as any} />
                  ))}
                </Accordion>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
