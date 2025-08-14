
"use client";

/**
 * SocietyTab.gpt5.tsx
 * -------------------------------------------------------------
 * لوحة إدارة المجتمع (نسخة مُحسّنة بإخراج بصري حديث وتجربة استخدام أقوى)
 *
 * ✨ أبرز التحسينات:
 * - تصميم أنظف مع بطاقات/شبكات و RTL افتراضي + حركات خفيفة.
 * - بحث فوري بمهلة (debounce) + ترقيم صفحات محلي + مؤشرات حالة واضحة.
 * - اختيار جماعي متقدّم: تحديد الكل/إلغاء/عكس التحديد + عدّ مباشر.
 * - مربعات حوار موحّدة مع ملخّص قبل التأكيد للأفعال الحسّاسة (مكافأة/عقوبة/تعديل).
 * - محرّر شامل لبيانات المستخدم مع حماية تحويل الأنواع، وإدخال أرقام آمن.
 * - بريد جماعي مع عدّاد أحرف وتحقق مبكّر وحدّ للكوينز + معاينة سريعة.
 * - لوحة إعلانات مع حفظ/استرجاع + معاينة فورية.
 * - أدوات صيانة مع حوارات تأكيد واضحة وملاحظات حول التكلفة.
 * - تحسينات DX/UX: دوال مساعدة، توحيد Toasts، مكوّنات فرعية مقسّمة، قراءة أسهل.
 *
 * يعتمد على أفعال السيرفر الموحّدة من ملف الباك-إند الذي أعددناه (lib/actions/admin).
 * -------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile, Game } from "@/types";

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { Users, Search, Loader2, Award, Coins, MinusCircle, Shield, Star, Crown, Edit, Diamond as DiamondIcon, MailPlus, Megaphone, Save, TowerControl, DatabaseZap, RefreshCw, X, Download, ArrowLeftRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// Server Actions
import {
  adminUpdateUser,
  recalculateGameKings,
  adminSendMail,
  setAnnouncement,
  getAnnouncement,
  backfillPunishmentStatus,
  giveReward as adminGiveReward,
  applyPunishment as adminApplyPunishment,
  adminSearchUsers,
  backfillUserPermissions,
} from "@/lib/actions/admin";
import { GAME_TYPE_NAMES } from "@/types";
import { cn } from "@/lib/utils";

// أنواع
type ActionType = "reward" | "punish" | "edit";

type PageState = {
  page: number;
  pageSize: number;
};

// أدوات مساعدة
const toInt = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const numberInput = (v: string) => (v === "" || v === "-" ? v : String(Math.max(0, toInt(v))));

const formatNum = (n: number | undefined) => (n ?? 0).toLocaleString();

export default function SocietyTab() {
  const { userProfile: adminProfile } = useAuth();
  const { toast } = useToast();

  // بحث + نتائج
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchedUsers, setSearchedUsers] = useState<UserProfile[]>([]);

  // ترقيم صفحات محلي لنتائج البحث
  const [pager, setPager] = useState<PageState>({ page: 1, pageSize: 20 });
  const totalPages = Math.max(1, Math.ceil(searchedUsers.length / pager.pageSize));
  const pagedUsers = useMemo(() => {
    const start = (pager.page - 1) * pager.pageSize;
    return searchedUsers.slice(start, start + pager.pageSize);
  }, [searchedUsers, pager]);

  // تحديد المستخدم/الإجراء
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [actionType, setActionType] = useState<ActionType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // بيانات التحرير/الإجراءات
  const [editData, setEditData] = useState<Partial<UserProfile> & { reason?: string }>({});

  // بريد جماعي
  const [isMailDialogOpen, setIsMailDialogOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [mailCoins, setMailCoins] = useState("");
  const [isSendingMail, setIsSendingMail] = useState(false);

  // إعلان
  const [announcementText, setAnnouncementText] = useState("");
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
  const [announcementLoading, setAnnouncementLoading] = useState(true);

  // أدوات صيانة
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [showBackfillDialog, setShowBackfillDialog] = useState(false);
  const [isBackfillingPermissions, setIsBackfillingPermissions] = useState(false);
  const [showPermissionsBackfillDialog, setShowPermissionsBackfillDialog] = useState(false);

  // مهلة البحث (في واجهة المتصفح يفضل number وليس NodeJS.Timeout)
  const debounceTimeout = useRef<number | null>(null);

  /* -------------------------------- إعلان -------------------------------- */
  useEffect(() => {
    const fetchAnnouncement = async () => {
      try {
        const res = await getAnnouncement();
        if (res?.success && res.text) setAnnouncementText(res.text);
      } finally {
        setAnnouncementLoading(false);
      }
    };
    fetchAnnouncement();
  }, []);

  /* -------------------------------- البحث -------------------------------- */
  const handleSearch = useCallback(async (term: string) => {
    setSearchTerm(term);
    setPager((p) => ({ ...p, page: 1 }));
    if (term.trim().length < 2) {
      setSearchedUsers([]);
      return;
    }
    setIsSearching(true);
    try {
      const users = await adminSearchUsers(term.trim());
      setSearchedUsers(users || []);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    if (debounceTimeout.current) window.clearTimeout(debounceTimeout.current);
    debounceTimeout.current = window.setTimeout(() => handleSearch(term), 350);
  };

  useEffect(() => () => {
    if (debounceTimeout.current) window.clearTimeout(debounceTimeout.current);
  }, []);

  /* ------------------------------ الإجراءات ------------------------------ */
  const openActionDialog = (user: UserProfile, type: ActionType) => {
    setSelectedUser(user);
    setActionType(type);
    if (type === "edit") {
      setEditData({
        name: user.name,
        leaderboardPoints: user.leaderboardPoints || 0,
        coins: user.coins || 0,
        diamonds: user.diamonds || 0,
        honorPoints: user.honorPoints || 0,
        loyaltyPoints: user.loyaltyPoints || 0,
        rebellionPoints: user.rebellionPoints || 0,
        winCounts: user.winCounts || {},
      });
    } else {
      setEditData({ leaderboardPoints: 0, coins: 0, reason: "" });
    }
  };

  const closeDialog = () => {
    setSelectedUser(null);
    setActionType(null);
    setEditData({});
  };

  const handleRecalculateKings = async () => {
    setIsRecalculating(true);
    const result = await recalculateGameKings();
    if (result?.success) {
      toast({ title: "نجاح!", description: `تم تحديث ملوك الألعاب بنجاح. (${result.updatedCount} ملوك).` });
    } else {
      toast({ title: "خطأ", description: result?.error || "تعذر إعادة الحساب.", variant: "destructive" });
    }
    setIsRecalculating(false);
  };

  const handleBackfill = async () => {
    setIsBackfilling(true);
    const result = await backfillPunishmentStatus();
    if (result?.success) {
      toast({ title: "نجاح!", description: `تم فحص وتحديث ${result.count} لاعب بنجاح.` });
    } else {
      toast({ title: "خطأ", description: result?.error || "تعذر التحديث.", variant: "destructive" });
    }
    setIsBackfilling(false);
    setShowBackfillDialog(false);
  };

  const handlePermissionsBackfill = async () => {
    setIsBackfillingPermissions(true);
    const result = await backfillUserPermissions();
    if (result?.success) {
      toast({ title: "نجاح!", description: `تم تحديث صلاحيات ${result.count} لاعب بنجاح.` });
    } else {
      toast({ title: "خطأ", description: result?.error || "تعذر التحديث.", variant: "destructive" });
    }
    setIsBackfillingPermissions(false);
    setShowPermissionsBackfillDialog(false);
  };

  const handleEditDataChange = (field: keyof (UserProfile & { reason?: string }), value: string | number | object) => {
    // حصر الأرقام على قيم صحيحة غير سالبة
    if (
      field === "leaderboardPoints" ||
      field === "coins" ||
      field === "diamonds" ||
      field === "honorPoints" ||
      field === "loyaltyPoints" ||
      field === "rebellionPoints"
    ) {
      setEditData((prev) => ({ ...prev, [field]: toInt(value as any) }));
      return;
    }
    setEditData((prev) => ({ ...prev, [field]: value as any }));
  };

  const handleActionSubmit = async () => {
    if (!selectedUser || !actionType) return;
    setIsSubmitting(true);

    if (actionType === "edit") {
      const updatePayload: Partial<UserProfile> = {};
      for (const key in editData) {
        if (key === "winCounts" || key === "name") {
          (updatePayload as any)[key] = (editData as any)[key];
        } else if (["leaderboardPoints", "coins", "diamonds", "honorPoints", "loyaltyPoints", "rebellionPoints"].includes(key)) {
          (updatePayload as any)[key] = toInt((editData as any)[key]);
        }
      }
      const result = await adminUpdateUser(selectedUser.uid, updatePayload);
      if (result?.success) {
        toast({ title: "تم التحديث", description: "تم حفظ التغييرات الشاملة بنجاح." });
        handleSearch(searchTerm);
        closeDialog();
      } else {
        toast({ title: "فشل التحديث", description: result?.error || "تعذر حفظ التغييرات.", variant: "destructive" });
      }
    } else {
      // مكافأة/عقوبة
      const reason = (editData as any).reason || "";
      if (!reason.trim()) {
        toast({ title: "السبب مطلوب", description: "الرجاء كتابة سبب واضح يظهر للاعب.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
      const actionPoints = toInt(editData.leaderboardPoints);
      const actionCoins = toInt(editData.coins);

      if (actionPoints < 0 || actionCoins < 0) {
        toast({ title: "قيم غير صالحة", description: "لا يمكن استخدام قيم سالبة.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
      if (actionPoints === 0 && actionCoins === 0) {
        toast({ title: "لا توجد قيمة", description: "حدد نقاطًا أو كوينز قبل المتابعة.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }

      const action = actionType === "reward" ? adminGiveReward : adminApplyPunishment;
      const result = await action(selectedUser.uid, { points: actionPoints, coins: actionCoins }, reason);
      if (result?.success) {
        toast({ title: "تم", description: `تم تنفيذ الإجراء وإشعار ${selectedUser.name}.` });
        handleSearch(searchTerm);
        closeDialog();
      } else {
        toast({ title: "فشل الإجراء", description: result?.error || "تعذر إكمال العملية.", variant: "destructive" });
      }
    }
    setIsSubmitting(false);
  };

  /* ------------------------------ تحديد جماعي ----------------------------- */
  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) => {
      const s = new Set(prev);
      if (s.has(userId)) s.delete(userId); else s.add(userId);
      return s;
    });
  };

  const handleSelectAllPage = () => {
    setSelectedUserIds((prev) => {
      const s = new Set(prev);
      pagedUsers.forEach((u) => s.add(u.uid));
      return s;
    });
  };

  const handleDeselectAll = () => setSelectedUserIds(new Set());
  const handleInvertSelection = () => {
    setSelectedUserIds((prev) => {
      const s = new Set(prev);
      pagedUsers.forEach((u) => {
        if (s.has(u.uid)) s.delete(u.uid); else s.add(u.uid);
      });
      return s;
    });
  };

  /* -------------------------------- البريد -------------------------------- */
  const handleOpenMailDialog = () => {
    if (selectedUserIds.size === 0) {
      toast({ title: "لم يتم تحديد مستخدم", description: "حدد مستخدمًا واحدًا على الأقل.", variant: "destructive" });
      return;
    }
    setIsMailDialogOpen(true);
    setMailSubject("");
    setMailBody("");
    setMailCoins("");
  };

  const handleSendMail = async () => {
    if (!adminProfile || selectedUserIds.size === 0 || !mailSubject.trim() || !mailBody.trim()) {
      toast({ title: "حقول ناقصة", description: "املأ الموضوع والنص والمستلمين.", variant: "destructive" });
      return;
    }
    const coinsToSend = toInt(mailCoins);
    if (coinsToSend < 0) {
      toast({ title: "قيمة كوينز غير صالحة", description: "لا يمكن إرسال عدد سالب.", variant: "destructive" });
      return;
    }
    setIsSendingMail(true);
    const result = await adminSendMail(Array.from(selectedUserIds), mailSubject.trim(), mailBody.trim(), coinsToSend);
    if (result?.success) {
      toast({ title: "تم الإرسال", description: `تم إرسال الرسالة إلى ${selectedUserIds.size} مستخدم.` });
      setIsMailDialogOpen(false);
      setSelectedUserIds(new Set());
    } else {
      toast({ title: "فشل الإرسال", description: result?.error || "تعذر الإرسال.", variant: "destructive" });
    }
    setIsSendingMail(false);
  };

  /* ------------------------------- واجهات UI ------------------------------ */
  const renderUserRow = (user: UserProfile) => (
    <motion.div
      key={user.uid}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "flex justify-between items-center p-2 rounded-xl border",
        selectedUserIds.has(user.uid) ? "bg-primary/5 border-primary/30" : "bg-muted/40 border-transparent"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Checkbox checked={selectedUserIds.has(user.uid)} onCheckedChange={() => toggleUserSelection(user.uid)} />
        <PlayerAvatar avatarId={user.avatarId || "Avatar00.png"} className="w-10 h-10" />
        <div className="min-w-0">
          <p className="font-bold truncate" title={user.name}>{user.name}</p>
          <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Star className="w-3 h-3" />{formatNum(user.leaderboardPoints)}</span>
            <span className="text-gray-400">|</span>
            <span className="flex items-center gap-1"><Coins className="w-3 h-3" />{formatNum(user.coins)}</span>
            <span className="text-gray-400">|</span>
            <span className="flex items-center gap-1"><Shield className="w-3 h-3" />{formatNum(user.honorPoints)} شرف</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => openActionDialog(user, "edit")}>
          <Edit className="ml-2 w-4 h-4" /> تعديل
        </Button>
        <Button size="sm" variant="outline" onClick={() => openActionDialog(user, "reward")} className="text-green-600 border-green-600 hover:bg-green-100 hover:text-green-700">
          <Award className="ml-2 w-4 h-4" /> مكافأة
        </Button>
        <Button size="sm" variant="destructive" onClick={() => openActionDialog(user, "punish")}>
          <MinusCircle className="ml-2 w-4 h-4" /> عقوبة
        </Button>
      </div>
    </motion.div>
  );

  const renderEditDialog = () => (
    <DialogContent className="sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>تعديل شامل لبيانات: {selectedUser?.name}</DialogTitle>
        <DialogDescription>قم بتعديل قيم اللاعب مباشرة. سيؤثر هذا على رصيده ورتبته وسجلاته.</DialogDescription>
      </DialogHeader>
      <ScrollArea className="h-[60vh] p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* General Stats */}
          <div className="space-y-4 p-4 border rounded-xl bg-muted/20">
            <h4 className="font-bold">البيانات الأساسية</h4>
            <div className="space-y-2">
              <Label htmlFor="name">الاسم</Label>
              <Input id="name" value={editData.name || ""} onChange={(e) => handleEditDataChange("name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="leaderboardPoints">نقاط الصدارة</Label>
              <Input id="leaderboardPoints" inputMode="numeric" value={String(editData.leaderboardPoints ?? "")} onChange={(e) => handleEditDataChange("leaderboardPoints", numberInput(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coins">الكوينز</Label>
              <Input id="coins" inputMode="numeric" value={String(editData.coins ?? "")} onChange={(e) => handleEditDataChange("coins", numberInput(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="diamonds">الألماس</Label>
              <Input id="diamonds" inputMode="numeric" value={String(editData.diamonds ?? "")} onChange={(e) => handleEditDataChange("diamonds", numberInput(e.target.value))} />
            </div>
          </div>

          {/* Social Points */}
          <div className="space-y-4 p-4 border rounded-xl bg-muted/20">
            <h4 className="font-bold">النقاط الاجتماعية</h4>
            <div className="space-y-2">
              <Label htmlFor="honorPoints">نقاط الشرف</Label>
              <Input id="honorPoints" inputMode="numeric" value={String(editData.honorPoints ?? "")} onChange={(e) => handleEditDataChange("honorPoints", numberInput(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loyaltyPoints">نقاط الولاء</Label>
              <Input id="loyaltyPoints" inputMode="numeric" value={String(editData.loyaltyPoints ?? "")} onChange={(e) => handleEditDataChange("loyaltyPoints", numberInput(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rebellionPoints">نقاط التمرد</Label>
              <Input id="rebellionPoints" inputMode="numeric" value={String(editData.rebellionPoints ?? "")} onChange={(e) => handleEditDataChange("rebellionPoints", numberInput(e.target.value))} />
            </div>
          </div>

          {/* Win Counts */}
          <div className="space-y-4 p-4 border rounded-xl bg-muted/20">
            <h4 className="font-bold">سجلات الفوز</h4>
            {Object.keys(GAME_TYPE_NAMES).map((gameType) => (
              <div className="space-y-2" key={gameType}>
                <Label htmlFor={`wins-${gameType}`}>{(GAME_TYPE_NAMES as any)[gameType as Game["gameType"]]}</Label>
                <Input
                  id={`wins-${gameType}`}
                  inputMode="numeric"
                  value={String(((editData.winCounts as any)?.[gameType] ?? 0))}
                  onChange={(e) => {
                    const v = Math.max(0, toInt(e.target.value));
                    const newWinCounts = { ...(editData.winCounts || {} as any), [gameType]: v } as any;
                    handleEditDataChange("winCounts" as any, newWinCounts);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">إلغاء</Button>
        </DialogClose>
        <Button onClick={handleActionSubmit} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : "حفظ التغييرات الشاملة"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );

  const renderRewardPunishDialog = () => (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {actionType === "reward" ? "منح مكافأة إلى: " : "تطبيق عقوبة على: "}
          <span className="text-primary"> {selectedUser?.name}</span>
        </DialogTitle>
        <DialogDescription>
          {actionType === "reward" ? "سيتم إضافة النقاط والكوينز إلى رصيد اللاعب." : "سيتم خصم النقاط والكوينز من رصيد اللاعب."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="points">{actionType === "reward" ? "مكافأة نقاط" : "عقوبة نقاط"}</Label>
            <Input id="points" inputMode="numeric" value={String(editData.leaderboardPoints ?? "")} onChange={(e) => handleEditDataChange("leaderboardPoints", numberInput(e.target.value))} placeholder="0" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coins">{actionType === "reward" ? "مكافأة كوينز" : "عقوبة كوينز"}</Label>
            <Input id="coins" inputMode="numeric" value={String(editData.coins ?? "")} onChange={(e) => handleEditDataChange("coins", numberInput(e.target.value))} placeholder="0" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reason">السبب (سيظهر للاعب)</Label>
          <Input id="reason" value={String(editData.reason ?? "")} onChange={(e) => handleEditDataChange("reason" as any, e.target.value)} placeholder="اكتب سببًا واضحًا..." />
          <p className="text-[11px] text-muted-foreground">ينصح بذكر سبب موجز ومباشر. مثال: "سلوك ممتاز في تحدي اليوم".</p>
        </div>
        {/* ملخص قبل التأكيد */}
        <div className="rounded-lg border p-3 text-sm bg-muted/30">
          <div className="font-semibold mb-1">ملخص العملية</div>
          <div>اللاعب: <b>{selectedUser?.name}</b></div>
          <div>النقاط: <b>{toInt(editData.leaderboardPoints)}</b> | الكوينز: <b>{toInt(editData.coins)}</b></div>
          <div>السبب: <b>{(editData as any).reason || "—"}</b></div>
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">إلغاء</Button>
        </DialogClose>
        <Button onClick={handleActionSubmit} disabled={isSubmitting} variant={actionType === "punish" ? "destructive" : "default"}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : "تأكيد الإجراء"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );

  /* --------------------------------- JSX --------------------------------- */
  return (
    <div dir="rtl" className="space-y-6">
      {/* لوحة الإعلانات */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Megaphone /> لوحة الإعلانات</CardTitle>
          <CardDescription>اكتب رسالة ستظهر في أعلى الصفحة الرئيسية لجميع اللاعبين.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {announcementLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted/50" />
          ) : (
            <>
              <Textarea value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} placeholder="اكتب إعلانك هنا..." rows={4} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>عدد الأحرف: {announcementText.length}</span>
                <span>تلميح: استخدم لغة موجزة وواضحة.</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={async () => {
                  if (!announcementText.trim()) {
                    toast({ title: "لا يوجد محتوى", description: "اكتب إعلانًا قبل الحفظ.", variant: "destructive" });
                    return;
                  }
                  setIsSavingAnnouncement(true);
                  const result = await setAnnouncement(announcementText.trim());
                  if (result?.success) toast({ title: "تم حفظ الإعلان" });
                  else toast({ title: "خطأ", description: result?.error || "تعذر الحفظ.", variant: "destructive" });
                  setIsSavingAnnouncement(false);
                }} disabled={isSavingAnnouncement}>
                  <Save className="mr-2 h-4 w-4" /> {isSavingAnnouncement ? "جاري الحفظ..." : "حفظ الإعلان"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* إدارة المجتمع والمستخدمين */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users /> إدارة المجتمع والمستخدمين</CardTitle>
          <CardDescription>ابحث عن لاعب لتطبيق عقوبة، منحه مكافأة، تعديل بياناته، أو إرسال رسائل جماعية.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-grow">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="ابحث بالاسم أو البريد الإلكتروني..." onChange={handleSearchChange} className="pr-10" />
            </div>
            <Button onClick={handleOpenMailDialog} disabled={selectedUserIds.size === 0}>
              <MailPlus className="ml-2" /> إرسال رسالة ({selectedUserIds.size})
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
            <Badge variant="secondary">النتائج: {searchedUsers.length}</Badge>
            <span>صفحة: {pager.page}/{totalPages}</span>
            <Separator orientation="vertical" className="h-4" />
            <Button onClick={handleSelectAllPage} variant="outline" size="sm" disabled={pagedUsers.length === 0}>
              تحديد هذا الصفحة
            </Button>
            <Button onClick={handleInvertSelection} variant="outline" size="sm" disabled={pagedUsers.length === 0}>
              <ArrowLeftRight className="ml-1 h-3 w-3" /> عكس التحديد (الصفحة)
            </Button>
            <Button onClick={handleDeselectAll} variant="outline" size="sm" disabled={selectedUserIds.size === 0}>
              إلغاء تحديد الكل
            </Button>
          </div>

          <ScrollArea className="h-96 pr-2">
            <div className="space-y-2">
              {isSearching ? (
                <div className="text-center p-6"><Loader2 className="animate-spin inline-block" /></div>
              ) : (
                pagedUsers.length > 0 ? pagedUsers.map(renderUserRow) : (
                  <div className="text-center text-sm text-muted-foreground py-10">لا نتائج مطابقة حتى الآن.</div>
                )
              )}
            </div>
          </ScrollArea>

          {/* ترقيم الصفحات */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">المحددون: {selectedUserIds.size}</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPager((p) => ({ ...p, page: Math.max(1, p.page - 1) }))} disabled={pager.page <= 1}>السابق</Button>
              <div className="text-xs">{pager.page} / {totalPages}</div>
              <Button variant="outline" size="sm" onClick={() => setPager((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))} disabled={pager.page >= totalPages}>التالي</Button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-between">
          <Button onClick={handleRecalculateKings} disabled={isRecalculating}>
            <Crown className="ml-2" /> {isRecalculating ? "جاري الحساب..." : "إعادة حساب ملوك الألعاب"}
          </Button>
          <Button variant="destructive" disabled>
            <TowerControl className="ml-2" /> قريبًا: بدء حرب الطبقات
          </Button>
        </CardFooter>
      </Card>

      {/* أدوات الصيانة */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DatabaseZap /> أدوات الصيانة</CardTitle>
          <CardDescription>عمليات تُنفذ مرة واحدة أو عند الحاجة لإصلاح البيانات.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 border rounded-xl">
            <Button variant="outline" onClick={() => setShowBackfillDialog(true)} disabled={isBackfilling}>
              <RefreshCw className="ml-2" /> {isBackfilling ? "جاري التحديث..." : "تحديث حالات العقوبة لجميع اللاعبين"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">استخدم هذا الخيار إذا كان اللاعبون المعاقبون لا يظهرون في غرفة العقاب. سيقوم هذا الإجراء بالمرور على كل اللاعبين وتحديث حالتهم.</p>
          </div>
          <div className="p-3 border rounded-xl">
            <Button variant="outline" onClick={() => setShowPermissionsBackfillDialog(true)} disabled={isBackfillingPermissions}>
              <RefreshCw className="ml-2" /> {isBackfillingPermissions ? "جاري التحديث..." : "تحديث صلاحيات كل اللاعبين"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">استخدم هذا الخيار لمرة واحدة لتحديث صلاحيات كل اللاعبين بناءً على رتبتهم الحالية. مهم بعد أي تغيير في نظام الرتب أو عند إضافة لاعبين جدد بشكل يدوي.</p>
          </div>
        </CardContent>
      </Card>

      {/* حوارات */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && closeDialog()}>
        {actionType === "edit" ? renderEditDialog() : renderRewardPunishDialog()}
      </Dialog>

      <Dialog open={isMailDialogOpen} onOpenChange={(open) => !open && setIsMailDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إرسال رسالة إلى: {selectedUserIds.size} مستخدم</DialogTitle>
            <DialogDescription>ستظهر هذه الرسالة في صندوق البريد الخاص باللاعبين المحددين.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="mail-subject" className="text-right">الموضوع</Label>
              <Input id="mail-subject" value={mailSubject} onChange={(e) => setMailSubject(e.target.value.slice(0, 80))} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="mail-body" className="text-right">الرسالة</Label>
              <Textarea id="mail-body" value={mailBody} onChange={(e) => setMailBody(e.target.value)} className="col-span-3" rows={5} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="mail-coins" className="text-right">إرفاق كوينز</Label>
              <Input id="mail-coins" inputMode="numeric" value={mailCoins} onChange={(e) => setMailCoins(numberInput(e.target.value))} className="col-span-3" placeholder="0" />
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center justify-between">
              <span>أقصى طول للموضوع: 80 حرفًا. عدد الأحرف: {mailSubject.length}</span>
              <span>المستلمون: {selectedUserIds.size}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsMailDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSendMail} disabled={isSendingMail}>{isSendingMail ? <Loader2 className="animate-spin" /> : "إرسال"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showBackfillDialog} onOpenChange={setShowBackfillDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد عملية الصيانة</AlertDialogTitle>
            <AlertDialogDescription>سيقوم هذا الإجراء بالمرور على جميع المستخدمين في قاعدة البيانات للتحقق من عقوباتهم وتحديث حالتهم. قد تستهلك هذه العملية عددًا كبيرًا من عمليات القراءة. هل أنت متأكد من المتابعة؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleBackfill} disabled={isBackfilling}>{isBackfilling ? <Loader2 className="animate-spin" /> : "نعم، قم بالتحديث"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showPermissionsBackfillDialog} onOpenChange={setShowPermissionsBackfillDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد تحديث الصلاحيات</AlertDialogTitle>
            <AlertDialogDescription>سيقوم هذا الإجراء بالمرور على جميع المستخدمين وتحديث قائمة صلاحياتهم بناءً على رتبتهم الحالية. هذه العملية ضرورية لمرة واحدة أو بعد تغييرات كبيرة على نظام الرتب. هل أنت متأكد؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handlePermissionsBackfill} disabled={isBackfillingPermissions}>{isBackfillingPermissions ? <Loader2 className="animate-spin" /> : "نعم، قم بتحديث الصلاحيات"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
