"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
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

import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { cn } from "@/lib/utils";

import { updateUserAvatar, updateUserName, updateUserGender, payPunishmentTax } from "@/lib/actions/user";
import type { SocialRank } from "@/types";

import {
  ArrowLeft,
  Check,
  CircleDollarSign,
  Diamond,
  Gavel,
  Gamepad2,
  Handshake,
  Loader2,
  Mail,
  Save,
  Shield,
  ShoppingCart,
  ShieldCheck,
  Star,
  Users as UsersIcon,
  VenetianMask,
} from "lucide-react";

function toDate(input?: unknown): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;
  if (typeof input === "number") return new Date(input);
  if (typeof input === "string") return new Date(input);
  const anyVal = input as any;
  if (anyVal && typeof anyVal.toDate === "function") {
    try { return anyVal.toDate(); } catch { return null; }
  }
  return null;
}

export default function ProfilePage() {
  const { user, userProfile, loading, socialRanks, refreshUserProfile, getSocialRankForUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  const [newName, setNewName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  const [isPayingTax, setIsPayingTax] = useState(false);
  const [openTaxConfirm, setOpenTaxConfirm] = useState(false);

  const currentRank: SocialRank | null = useMemo(() => {
    if (!userProfile) return null;
    return getSocialRankForUser(userProfile.leaderboardPoints);
  }, [userProfile, getSocialRankForUser]);

  const activeDecree = useMemo(() => {
    const now = new Date();
    return userProfile?.decrees?.find((d) => {
      const u = toDate(d.until);
      return u ? u > now : false;
    });
  }, [userProfile?.decrees]);

  const currentPunishment = useMemo(() => {
    if (!userProfile) return null;
    const avUntil = toDate(userProfile.originalAvatarToRevert?.until);
    if (avUntil && avUntil > new Date()) {
      return { type: "avatar" as const, details: userProfile.originalAvatarToRevert };
    }
    const humUntil = toDate(userProfile.humiliation?.until);
    if (humUntil && humUntil > new Date()) {
      return { type: "humiliation" as const, details: userProfile.humiliation };
    }
    return null;
  }, [userProfile]);

  const rankProgress = useMemo(() => {
    const points = userProfile?.leaderboardPoints ?? 0;
    if (!socialRanks || socialRanks.length === 0) return null;
    const sorted = [...socialRanks].sort((a, b) => a.threshold - b.threshold);
    let currentIndex = -1;
    for (let i = 0; i < sorted.length; i++) {
      const next = sorted[i + 1];
      if (points >= sorted[i].threshold && (!next || points < next.threshold)) {
        currentIndex = i;
        break;
      }
    }
    const next = sorted[currentIndex + 1];
    if (!next) return { label: currentRank?.name ?? "", pct: 100, toNext: 0, nextName: null as string | null };
    const rangeStart = sorted[currentIndex]?.threshold ?? 0;
    const rangeEnd = next.threshold;
    const pct = Math.max(0, Math.min(100, ((points - rangeStart) / (rangeEnd - rangeStart)) * 100));
    const toNext = Math.max(0, rangeEnd - points);
    return { label: currentRank?.name ?? "", pct, toNext, nextName: next.name };
  }, [userProfile?.leaderboardPoints, socialRanks, currentRank?.name]);

  useEffect(() => {
    if (userProfile?.avatarId) setSelectedAvatarId(userProfile.avatarId);
    if (userProfile?.name) setNewName(userProfile.name);
  }, [userProfile?.avatarId, userProfile?.name]);

  useEffect(() => {
    if (!loading && !userProfile) {
      toast({ title: "غير مصرح لك", description: "يجب عليك تسجيل الدخول لعرض هذه الصفحة.", variant: "destructive" });
      router.push("/login");
    }
  }, [loading, userProfile, router, toast]);

  const validateName = (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 22) return "يجب أن يتراوح الاسم بين 2 و 22 حرفًا";
    const re = /^[A-Za-z\u0600-\u06FF0-9 _]+$/u;
    if (!re.test(trimmed)) return "اسم غير صالح: استخدم حروفًا وأرقامًا ومسافات فقط";
    return null;
  };

  const onSaveName = async () => {
    if (!user || !newName) return;
    if (userProfile?.hasChangedName) return;
    const err = validateName(newName);
    if (err) {
      toast({ title: "تنبيه", description: err, variant: "destructive" });
      return;
    }
    if (newName.trim() === (userProfile?.name ?? "")) return;
    try {
      setIsSavingName(true);
      const res = await updateUserName(user.uid, newName.trim());
      if (res.success) {
        toast({ title: "تم التحديث", description: "تم تحديث اسمك بنجاح" });
        await refreshUserProfile?.();
      } else {
        throw new Error(res.error);
      }
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message ?? "تعذر تحديث الاسم", variant: "destructive" });
    } finally {
      setIsSavingName(false);
    }
  };

  const onPickAvatar = async (avatarId: string) => {
    if (!userProfile || isSavingAvatar) return;
    const isUnlocked = (userProfile.unlockedAvatars || []).includes(avatarId);
    if (!isUnlocked) {
      toast({ title: "غير مملوكة", description: "يجب شراء هذه الشخصية أولاً", variant: "destructive" });
      return;
    }
    if (avatarId === userProfile.avatarId) return;

    try {
      setIsSavingAvatar(true);
      setSelectedAvatarId(avatarId);
      const res = await updateUserAvatar(userProfile.uid, avatarId);
      if (res.success) {
        toast({ title: "تم الحفظ", description: "تم تغيير شخصيتك" });
        await refreshUserProfile?.();
      } else {
        throw new Error(res.error);
      }
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message ?? "تعذر تغيير الشخصية", variant: "destructive" });
      setSelectedAvatarId(userProfile.avatarId ?? null);
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const onChangeGender = useCallback(async (gender: "male" | "female") => {
    if (!userProfile) return;
    try {
      const res = await updateUserGender(userProfile.uid, gender);
      if (res.success) {
        toast({ title: "تم التحديث", description: "تم تحديث النوع" });
        await refreshUserProfile?.();
      } else {
        throw new Error(res.error);
      }
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message ?? "تعذر تحديث النوع", variant: "destructive" });
    }
  }, [userProfile, refreshUserProfile, toast]);

  const canAffordTax = useMemo(() => {
    if (!currentPunishment?.details?.taxToLift || !userProfile) return false;
    return (userProfile.coins || 0) >= (currentPunishment.details.taxToLift || 0);
  }, [currentPunishment, userProfile]);

  const onPayTax = async () => {
    if (!user) return;
    try {
      setIsPayingTax(true);
      const res = await payPunishmentTax(user.uid);
      if (res.success) {
        toast({ title: "تمت إزالة العقوبة", description: res.message ?? "تم الدفع بنجاح" });
        await refreshUserProfile?.();
      } else {
        throw new Error(res.error);
      }
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message ?? "تعذر إتمام العملية", variant: "destructive" });
    } finally {
      setIsPayingTax(false);
      setOpenTaxConfirm(false);
    }
  };

  const rankHue = useMemo(() => {
    const base = currentRank?.threshold ?? 0;
    const hue = (base * 7) % 360;
    return `hsl(${hue} 70% 50%)`;
  }, [currentRank?.threshold]);

  const timeRemaining = (until?: any) => {
    const dt = toDate(until);
    if (!dt) return "";
    try { return formatDistanceToNow(dt, { addSuffix: true, locale: ar }); } catch { return ""; }
  };

  if (loading || !userProfile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40">
        <Card className="w-full max-w-lg p-6 animate-fade-in">
          <CardHeader>
            <div className="h-6 w-40 bg-muted rounded mb-2" />
            <div className="h-4 w-28 bg-muted rounded" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-24 w-24 rounded-full bg-muted mx-auto" />
            <div className="h-4 w-3/4 bg-muted rounded mx-auto" />
            <div className="h-4 w-2/4 bg-muted rounded mx-auto" />
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-gray-900 to-black py-8 px-4">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Card className="overflow-hidden border-purple-500/20 bg-gradient-to-br from-purple-900/30 via-gray-900 to-black">
            <div className="relative h-32 w-full bg-[radial-gradient(circle_at_30%_20%,_rgba(168,85,247,0.35),_transparent_40%),_radial-gradient(circle_at_70%_0%,_rgba(99,102,241,0.25),_transparent_40%)]" />
            <CardHeader className="pt-0">
              <div className="-mt-12 flex items-center gap-4">
                <div className="relative">
                  <div
                    className="rounded-full p-[2px]"
                    style={{ background: `conic-gradient(from 0deg, ${rankHue}, transparent 70%)` }}
                    aria-hidden
                  >
                    <PlayerAvatar avatarId={userProfile.avatarId} className="h-20 w-20 rounded-full border-4 border-black" />
                  </div>
                  {activeDecree && (
                    <Badge className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground shadow">مرسوم</Badge>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold tracking-wide">{userProfile.name}</h1>
                    <Badge variant="secondary" className="gap-1">
                      {currentRank?.icon ? <currentRank.icon className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                      <span>{activeDecree?.title ?? currentRank?.name ?? "—"}</span>
                    </Badge>
                  </div>
                  {rankProgress && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>التقدم نحو {rankProgress.nextName ?? rankProgress.label}</span>
                        <span>{Math.round(rankProgress.pct)}%</span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-800">
                        <div className="h-full rounded-full" style={{ width: `${rankProgress.pct}%`, background: rankHue }} />
                      </div>
                      {rankProgress.nextName && (
                        <div className="mt-1 text-xs text-muted-foreground">المتبقي: {rankProgress.toNext} نقطة للوصول إلى {rankProgress.nextName}</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/store">
                      <ShoppingCart className="ml-2 h-4 w-4" /> المتجر
                    </Link>
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="العودة" onClick={() => router.push("/")}> <ArrowLeft /> </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatPill icon={<CircleDollarSign className="h-4 w-4" />} label="كوينز" value={userProfile.coins ?? 0} />
          <StatPill icon={<Diamond className="h-4 w-4" />} label="ألماس" value={userProfile.diamonds ?? 0} />
          <StatPill icon={<ShieldCheck className="h-4 w-4" />} label="الشرف" value={userProfile.honorPoints ?? 0} />
          <StatPill icon={<Handshake className="h-4 w-4" />} label="الولاء" value={userProfile.loyaltyPoints ?? 0} />
          <StatPill icon={<Star className="h-4 w-4" />} label="التمرد" value={userProfile.rebellionPoints ?? 0} />
          <StatPill icon={<Gamepad2 className="h-4 w-4" />} label="مباريات" value={userProfile.gamesPlayed ?? 0} />
        </div>

        <Card className="border-purple-500/20 bg-black/30 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>التحكم الكامل</CardTitle>
            <CardDescription>خصص هويتك وادِر حسابك بسهولة.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="customize" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-gray-900/50">
                <TabsTrigger value="customize">التخصيص</TabsTrigger>
                <TabsTrigger value="security">الحساب</TabsTrigger>
                <TabsTrigger value="status">الحالة</TabsTrigger>
              </TabsList>

              <TabsContent value="customize" className="mt-6 space-y-6">
                <section>
                  <h3 className="mb-2 text-lg font-semibold">اختر شخصيتك</h3>
                  <ScrollArea className="h-64 w-full rounded-md border border-purple-500/20 bg-gray-900/30 p-4">
                    {userProfile.unlockedAvatars && userProfile.unlockedAvatars.length > 0 ? (
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                        {userProfile.unlockedAvatars.map((avatarId) => {
                          const isSelected = selectedAvatarId === avatarId;
                          return (
                            <button
                              type="button"
                              key={avatarId}
                              onClick={() => onPickAvatar(avatarId)}
                              className={cn(
                                "group relative overflow-hidden rounded-xl border p-1 transition-transform focus:outline-none focus:ring-2",
                                isSelected ? "border-primary ring-2 ring-primary" : "border-transparent hover:scale-[1.02]"
                              )}
                              aria-label={`اختر الشخصية ${avatarId}`}
                            >
                              <PlayerAvatar avatarId={avatarId} className="aspect-square w-full rounded-lg" />
                              {isSelected && (
                                <span className="absolute top-1 right-1 rounded-full bg-primary p-1 text-white shadow"><Check className="h-3 w-3" /></span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-sm text-muted-foreground">لا تملك أي شخصيات بعد — تفضل إلى المتجر.</div>
                    )}
                  </ScrollArea>
                  {isSavingAvatar && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ حفظ الشخصية…</div>
                  )}
                </section>

                <section className="space-y-2">
                  <h3 className="text-lg font-semibold">اسمك</h3>
                  <div className="flex items-center gap-2">
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      disabled={isSavingName || !!userProfile.hasChangedName}
                      maxLength={22}
                      aria-label="تعديل الاسم"
                      placeholder="اكتب اسمك هنا"
                    />
                    <Button onClick={onSaveName} disabled={isSavingName || !!userProfile.hasChangedName}>
                      {isSavingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="ml-2 h-4 w-4" /> حفظ</>}
                    </Button>
                  </div>
                  {userProfile.hasChangedName && (
                    <p className="text-xs text-muted-foreground">* لا يمكنك تغيير الاسم أكثر من مرة.</p>
                  )}
                </section>

                <section className="space-y-2">
                  <h3 className="text-lg font-semibold">النوع</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant={userProfile.gender === "male" ? "default" : "outline"}
                      onClick={() => onChangeGender("male")}
                      className="gap-2"
                    >
                      <VenetianMask className="h-4 w-4" /> ذكر
                    </Button>
                    <Button
                      type="button"
                      variant={userProfile.gender === "female" ? "default" : "outline"}
                      onClick={() => onChangeGender("female")}
                      className="gap-2"
                    >
                      <VenetianMask className="h-4 w-4" /> أنثى
                    </Button>
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="security" className="mt-6 space-y-4">
                <div className="flex items-center gap-3 text-lg">
                  <Mail className="h-5 w-5 text-primary" />
                  <span className="text-muted-foreground">{userProfile.email ?? "—"}</span>
                </div>
                {userProfile.clan && (
                  <div className="flex items-center gap-3 text-lg">
                    <UsersIcon className="h-5 w-5 text-primary" />
                    <span className="font-semibold">{userProfile.clan.name}</span>
                    <Button size="sm" variant="link" asChild><Link href="/society">الانتقال إلى المجتمع</Link></Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="status" className="mt-6 space-y-4">
                {currentPunishment ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
                    <div className="flex items-center gap-2 text-destructive">
                      <Gavel className="h-5 w-5" />
                      <h4 className="font-bold">أنت تحت تأثير عقوبة</h4>
                    </div>
                    <p className="mt-2 text-sm">
                      {currentPunishment.type === "avatar"
                        ? `تم تغيير شخصيتك بواسطة ${currentPunishment.details.byName ?? "—"}.`
                        : `تم إذلالك بواسطة ${currentPunishment.details.byName ?? "—"}.`}
                    </p>
                    {currentPunishment.details?.until && (
                      <p className="mt-1 text-xs text-muted-foreground">تنتهي {timeRemaining(currentPunishment.details.until)}</p>
                    )}
                    {!!currentPunishment.details?.taxToLift && (
                      <div className="mt-3">
                        <Button
                          variant="destructive"
                          className="w-full"
                          onClick={() => setOpenTaxConfirm(true)}
                          disabled={!canAffordTax || isPayingTax}
                        >
                          {isPayingTax ? (
                            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ الدفع…</span>
                          ) : (
                            `ادفع ضريبة ${currentPunishment.details.taxToLift} كوينز لإزالة العقوبة`
                          )}
                        </Button>
                        {!canAffordTax && (
                          <p className="mt-2 text-xs text-yellow-400">رصيدك لا يكفي — زر المتجر لشحن الكوينز.</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-600/30 bg-emerald-900/10 p-4">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <ShieldCheck className="h-5 w-5" />
                      <h4 className="font-bold">لا توجد عقوبات حالية</h4>
                    </div>
                    <p className="mt-1 text-sm text-emerald-100">استمر في الحفاظ على سمعتك داخل المجتمع.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="justify-between text-xs text-muted-foreground">
            <span>معرف المستخدم: <strong className="font-mono tracking-wider">{userProfile.uid.slice(0, 6)}…</strong></span>
            <span>آخر تحديث للملف: {(toDate(userProfile.updatedAt) ?? new Date()).toLocaleDateString("ar-SA")}</span>
          </CardFooter>
        </Card>
      </div>

      <AlertDialog open={openTaxConfirm} onOpenChange={setOpenTaxConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إزالة العقوبة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم خصم {currentPunishment?.details?.taxToLift ?? 0} كوينز من رصيدك لإزالة العقوبة فورًا. هل تريد المتابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPayingTax}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={onPayTax} disabled={!canAffordTax || isPayingTax}>
              {isPayingTax ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-purple-500/20 bg-gray-900/40 p-3 text-center shadow-sm">
      <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-gray-800/60">{icon}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
