
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { Clan, UserProfile, ClanWarInvitation, Game } from "@/types";
import {
  getClans,
  getClanWarInvites, // incoming (pending) for challenged clan
  respondToClanWarInvite,
  createClanWarInvite,
} from "@/lib/actions/clans";
import {
  Loader2,
  Swords,
  Calendar,
  Gamepad2,
  Check,
  X,
  Send,
  RefreshCw,
  ChevronDown,
  Shield,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { GAME_TYPE_NAMES } from "@/types";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ————————————————————————————————————————————
// Helpers
// ————————————————————————————————————————————
const fmt = new Intl.NumberFormat("ar-EG");

function toDateSafe(v: any): Date {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  if (typeof v?.toDate === "function") return v.toDate();
  if (typeof v === "number" || typeof v === "string") return new Date(v);
  return new Date();
}

function normalizeInvite(inv: ClanWarInvitation): ClanWarInvitation & { battleTime: Date } {
  return { ...inv, battleTime: toDateSafe(inv.battleTime) } as any;
}

// Try optional advanced APIs if the backend exposes them
async function tryGetOutgoingInvites(clanId: string): Promise<ClanWarInvitation[]> {
  try {
    const mod: any = await import("@/lib/actions/clans");
    const fns = ["getSentClanWarInvites", "getClanWarInvitesOutgoing", "getOutgoingClanWarInvites"];
    for (const fn of fns) {
      if (typeof mod[fn] === "function") {
        const data = await mod[fn](clanId);
        return Array.isArray(data) ? data : [];
      }
    }
  } catch {}
  return [];
}

async function tryCancelInvite(inviteId: string) {
  try {
    const mod: any = await import("@/lib/actions/clans");
    const fn = mod.cancelClanWarInvite || mod.retractClanWarInvite;
    if (typeof fn === "function") return await fn(inviteId);
  } catch {}
  return { success: false, error: "ميزة إلغاء الدعوة غير متاحة حالياً" };
}

async function tryGetUpcomingWars(clanId: string): Promise<ClanWarInvitation[]> {
  try {
    const mod: any = await import("@/lib/actions/clans");
    const fns = ["getUpcomingClanWars", "getClanWarsForClan", "getAcceptedClanWars"];
    for (const fn of fns) {
      if (typeof mod[fn] === "function") {
        const data = await mod[fn](clanId);
        return Array.isArray(data) ? data : [];
      }
    }
  } catch {}
  // Fallback: empty if backend doesn’t expose accepted wars in same query
  return [];
}

// ————————————————————————————————————————————
// Create War Dialog
// ————————————————————————————————————————————
const CreateWarDialog = ({
  userProfile,
  onWarCreated,
}: {
  userProfile: UserProfile;
  onWarCreated: () => void;
}) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allClans, setAllClans] = useState<Clan[]>([]);
  const [isLoadingClans, setIsLoadingClans] = useState(false);

  // Form state
  const [challengedClanId, setChallengedClanId] = useState("");
  const [gameType, setGameType] = useState<Game["gameType"] | "">("");
  const [battleTime, setBattleTime] = useState<string>(
    () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16)
  );

  const fetchClans = useCallback(async () => {
    setIsLoadingClans(true);
    const clansResult = await getClans();
    setAllClans(clansResult.clans.filter((c) => c.id !== userProfile.clan?.id));
    setIsLoadingClans(false);
  }, [userProfile.clan?.id]);

  useEffect(() => {
    if (isOpen) fetchClans();
  }, [isOpen, fetchClans]);

  const handleCreateWar = async () => {
    if (!userProfile.clan || !challengedClanId || !gameType || !battleTime) {
      toast({ title: "الرجاء ملء جميع الحقول", variant: "destructive" });
      return;
    }

    const when = new Date(battleTime);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 5 * 60 * 1000) {
      toast({
        title: "موعد غير صالح",
        description: "اختر وقتاً لاحقاً لا يقل عن 5 دقائق من الآن",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    const result = await createClanWarInvite({
      challengerClanId: userProfile.clan.id,
      challengedClanId,
      gameType: gameType as Game["gameType"],
      battleTime: when,
    });

    if (result.success) {
      toast({ title: "تم إرسال تحدي الحرب بنجاح!" });
      onWarCreated();
      setIsOpen(false);
      // reset
      setChallengedClanId("");
      setGameType("");
      setBattleTime(new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16));
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:opacity-90">
          <Swords className="ml-0" /> تحدي فريق آخر
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-purple-500/50 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>إعلان حرب جديدة</DialogTitle>
          <DialogDescription>تحدى فريقًا آخر في معركة ملحمية.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>اختر الفريق المنافس</Label>
            <Select onValueChange={setChallengedClanId} value={challengedClanId}>
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="اختر فريقًا..." />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 text-white border-purple-500/40 max-h-60">
                {isLoadingClans ? (
                  <SelectItem value="loading" disabled>
                    جاري التحميل...
                  </SelectItem>
                ) : allClans.length ? (
                  allClans.map((clan) => (
                    <SelectItem key={clan.id} value={clan.id}>
                      {clan.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>
                    لا توجد فرق متاحة
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>اختر اللعبة</Label>
            <Select onValueChange={(v) => setGameType(v as Game["gameType"])} value={gameType}>
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue placeholder="اختر لعبة للمعركة..." />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 text-white border-purple-500/40">
                {Object.entries(GAME_TYPE_NAMES).map(([type, name]) => (
                  <SelectItem key={type} value={type}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>اختر وقت المعركة</Label>
            <Input
              type="datetime-local"
              value={battleTime}
              onChange={(e) => setBattleTime(e.target.value)}
              className="bg-gray-800 border-gray-700"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            إلغاء
          </Button>
          <Button onClick={handleCreateWar} disabled={isSubmitting} className="gap-2">
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Send className="w-4 h-4" />} إرسال التحدي
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ————————————————————————————————————————————
// Invite Card (Incoming / Outgoing)
// ————————————————————————————————————————————
function InviteCard({
  invite,
  canRespond,
  onRespond,
  variant,
  onCancel,
}: {
  invite: ClanWarInvitation & { battleTime: Date };
  canRespond?: boolean;
  onRespond?: (status: "accepted" | "rejected") => void;
  variant: "incoming" | "outgoing";
  onCancel?: () => void;
}) {
  const opponent = variant === "incoming" ? invite.challengerClan : invite.challengedClan;
  return (
    <Card className={cn("bg-gray-900/70 border-gray-700", variant === "outgoing" && "border-cyan-700/40")}>      
      <CardContent className="p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <PlayerAvatar avatarId={opponent.emblem} className="w-12 h-12" />
            <div>
              <p className="font-bold">{opponent.name}</p>
              <p className="text-sm text-gray-400">
                {variant === "incoming" ? "يتحدى فريقك" : "دعوة أرسلتها"}
              </p>
            </div>
          </div>

          {variant === "incoming" ? (
            canRespond && (
              <div className="flex gap-2">
                <Button size="icon" className="bg-green-600 hover:bg-green-700" onClick={() => onRespond?.("accepted")}>
                  <Check />
                </Button>
                <Button size="icon" variant="destructive" onClick={() => onRespond?.("rejected")}>
                  <X />
                </Button>
              </div>
            )
          ) : (
            <div className="flex gap-2">
              <Badge className="bg-cyan-700/30">معلّقة</Badge>
              {onCancel && (
                <Button size="sm" variant="outline" onClick={onCancel}>
                  إلغاء
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="mt-2 pt-2 border-t border-gray-700 text-sm space-y-1">
          <p className="flex items-center gap-2">
            <Gamepad2 /> اللعبة:
            <span className="font-bold">{(GAME_TYPE_NAMES as any)[invite.gameType]}</span>
          </p>
          <p className="flex items-center gap-2">
            <Calendar /> الموعد:
            <span className="font-bold">{format(invite.battleTime, "d MMMM yyyy, h:mm a", { locale: ar })}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ————————————————————————————————————————————
// Upcoming/Accepted War Card
// ————————————————————————————————————————————
function UpcomingWarCard({ war }: { war: ClanWarInvitation & { battleTime: Date } }) {
  const A = war.challengerClan;
  const B = war.challengedClan;
  return (
    <Card className="bg-gray-900/70 border-green-500/40">
      <CardContent className="p-4">
        <div className="flex justify-center items-center gap-4 mb-2">
          <div className="flex flex-col items-center">
            <PlayerAvatar avatarId={A.emblem} className="w-12 h-12" />
            <p className="font-bold text-sm mt-1">{A.name}</p>
          </div>
          <Swords className="w-8 h-8 text-red-500" />
          <div className="flex flex-col items-center">
            <PlayerAvatar avatarId={B.emblem} className="w-12 h-12" />
            <p className="font-bold text-sm mt-1">{B.name}</p>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-700 text-sm space-y-1 text-center">
          <p className="flex items-center justify-center gap-2">
            <Gamepad2 /> {(GAME_TYPE_NAMES as any)[war.gameType]}
          </p>
          <p className="flex items-center justify-center gap-2">
            <Calendar /> {format(war.battleTime, "d MMMM yyyy, h:mm a", { locale: ar })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ————————————————————————————————————————————
// Main
// ————————————————————————————————————————————
export default function ClanWarsClient() {
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const [incomingInvites, setIncomingInvites] = useState<ClanWarInvitation[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<ClanWarInvitation[]>([]);
  const [upcomingWars, setUpcomingWars] = useState<ClanWarInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const clanId = userProfile?.clan?.id;
  const isLeader = userProfile?.clanRole === "leader";

  const fetchAll = useCallback(async () => {
    if (!clanId) return;
    setIsLoading(true);
    const [incoming, outgoing, upcoming] = await Promise.all([
      getClanWarInvites(clanId).catch(() => []),
      tryGetOutgoingInvites(clanId).catch(() => []),
      tryGetUpcomingWars(clanId).catch(() => []),
    ]);

    setIncomingInvites(incoming.map(normalizeInvite));
    setOutgoingInvites(outgoing.map(normalizeInvite));
    setUpcomingWars(upcoming.map(normalizeInvite));
    setIsLoading(false);
  }, [clanId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onRespond = async (inviteId: string, response: "accepted" | "rejected") => {
    if (!clanId) return;
    const res = await respondToClanWarInvite(inviteId, clanId, response);
    if (res.success) {
      toast({
        title: `تم ${response === "accepted" ? "قبول" : "رفض"} التحدي بنجاح`,
      });
      fetchAll();
    } else {
      toast({ title: "خطأ", description: res.error, variant: "destructive" });
    }
  };

  const onCancelOutgoing = async (inviteId: string) => {
    const res = await tryCancelInvite(inviteId);
    if (res.success) {
      toast({ title: "تم إلغاء الدعوة" });
      fetchAll();
    } else {
      toast({ title: "تعذّر الإلغاء", description: res.error, variant: "destructive" });
    }
  };

  const shimmerCards = (n = 3) => (
    <div className="space-y-3">
      {Array.from({ length: n }).map((_, i) => (
        <Card key={i} className="bg-gray-900/60 border-gray-800">
          <CardContent className="p-4 flex items-center gap-4">
            <Skeleton className="w-12 h-12 rounded-full bg-gray-800" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3 bg-gray-800" />
              <Skeleton className="h-4 w-1/2 bg-gray-800" />
            </div>
            <Skeleton className="h-8 w-24 bg-gray-800" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  if (!userProfile) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gray-900">
        <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gray-900 bg-gradient-to-tr from-black via-gray-900 to-purple-900/50 text-white font-sans">
      <main className="relative z-10 container mx-auto px-4 py-8">
        <header className="flex flex-col items-center gap-3 text-center mb-8">
          <div className="flex items-center gap-2 text-purple-300">
            <Shield className="w-5 h-5" />
            <span className="uppercase tracking-widest text-sm">CLAN WARS</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-purple-300 tracking-wider">
            حروب الفرق
          </h1>
          <p className="text-lg text-gray-400 -mt-1">
            تحدى الفرق الأخرى وأثبت من هو الأقوى.
          </p>
          <div className="flex items-center gap-3">
            {isLeader && (
              <CreateWarDialog userProfile={userProfile} onWarCreated={fetchAll} />
            )}
            <Button
              variant="outline"
              onClick={async () => {
                setIsRefreshing(true);
                await fetchAll();
                setIsRefreshing(false);
              }}
              className="gap-2 border-purple-500/40 text-purple-200 hover:text-white hover:bg-purple-500/10"
            >
              <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
              تحديث
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Incoming */}
          <Card className="bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm lg:col-span-1">
            <CardHeader>
              <CardTitle>دعوات الحروب المعلقة (واردة)</CardTitle>
              <CardDescription>دعوات أُرسلت إلى فريقك</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading
                ? shimmerCards(3)
                : incomingInvites.length > 0
                ? incomingInvites.map((raw) => {
                    const invite = normalizeInvite(raw);
                    return (
                      <InviteCard
                        key={invite.id}
                        invite={invite}
                        canRespond={isLeader}
                        onRespond={(st) => onRespond(invite.id, st)}
                        variant="incoming"
                      />
                    );
                  })
                : (
                  <p className="text-center text-gray-500">لا توجد دعوات معلقة.</p>
                )}
            </CardContent>
          </Card>

          {/* Outgoing */}
          <Card className="bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm lg:col-span-1">
            <CardHeader>
              <CardTitle>دعوات أرسلتها (صادرة)</CardTitle>
              <CardDescription>بانتظار ردّ الخصم</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading
                ? shimmerCards(2)
                : outgoingInvites.length > 0
                ? outgoingInvites.map((raw) => {
                    const invite = normalizeInvite(raw);
                    return (
                      <InviteCard
                        key={invite.id}
                        invite={invite}
                        variant="outgoing"
                        onCancel={isLeader ? () => onCancelOutgoing(invite.id) : undefined}
                      />
                    );
                  })
                : (
                  <p className="text-center text-gray-500">لا توجد دعوات صادرة.</p>
                )}
            </CardContent>
          </Card>

          {/* Upcoming/Accepted */}
          <Card className="bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm lg:col-span-1">
            <CardHeader>
              <CardTitle>المعارك القادمة</CardTitle>
              <CardDescription>المعارك المؤكّدة (مقبولة)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading
                ? shimmerCards(2)
                : upcomingWars.length > 0
                ? upcomingWars
                    .slice()
                    .sort((a, b) => toDateSafe(a.battleTime).getTime() - toDateSafe(b.battleTime).getTime())
                    .map((raw) => <UpcomingWarCard key={raw.id} war={normalizeInvite(raw)} />)
                : (
                  <p className="text-center text-gray-500">لا توجد معارك مؤكدة.</p>
                )}
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="mt-10 text-center text-xs text-gray-500">
          النقاط الحالية: <span className="tabular-nums font-semibold text-gray-300">{fmt.format(userProfile?.leaderboardPoints || 0)}</span>
        </div>
      </main>
    </div>
  );
}
