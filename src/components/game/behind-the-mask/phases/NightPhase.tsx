"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Game, Player, PlayerRole, NightAction, PrivateChat } from "@/types";
import { Button } from "@/components/ui/button";
import { ROLES } from "@/data/mafia-roles";
import { PlayerAvatar } from "../../PlayerAvatar";
import { submitNightAction, processNight, sendPrivateMessage } from "@/lib/actions/behind-the-mask";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  CheckCircle,
  Bed,
  Shield,
  Search,
  Eye,
  Bomb,
  VenetianMask,
  Send,
  ArrowRight,
  ChevronDown,
  SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";

// -----------------------------------------------------------------------------
// Types & Constants
// -----------------------------------------------------------------------------
interface NightPhaseProps {
  game: Game;
  self: Player;
}

// Roles without an active night action
const PASSIVE_ROLES: Readonly<PlayerRole[]> = ["civilian", "soldier"] as const;

// Map action → Icon
const ACTION_ICONS: Record<NonNullable<NightAction["action"]>, React.ElementType> = {
  kill: Bed,
  heal: Shield,
  investigate: Search,
  spy: Eye,
  bomb: Bomb,
  shapeshift: VenetianMask,
};

// Limit shapeshifter disguises to non-evil facing roles for balance/UX
const DISGUISE_OPTIONS: Readonly<PlayerRole[]> = [
  "doctor",
  "detective",
  "soldier",
  "civilian",
] as const;

// Simple client-side rate-limit for private chat (ms)
const PRIVATE_CHAT_MIN_INTERVAL = 900;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const getActionForRole = (role: PlayerRole | undefined | null): NightAction["action"] | null => {
  switch (role) {
    case "killer":
      return "kill";
    case "doctor":
      return "heal";
    case "detective":
      return "investigate";
    case "spy":
      return "spy";
    case "bomber":
      return "bomb";
    case "shapeshifter":
      return "shapeshift";
    default:
      return null;
  }
};

const formatClock = (totalSeconds: number) => {
  const mm = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
};

// Detect if the user is already reading older messages to avoid forced scroll
const shouldAutoScroll = (viewport: HTMLDivElement | null): boolean => {
  if (!viewport) return false;
  const tolerance = 40; // px
  const atBottom = viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight) < tolerance;
  return atBottom;
};

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export function NightPhase({ game, self }: NightPhaseProps) {
  const { toast } = useToast();
  const prefersReducedMotion = useReducedMotion();

  const isHost = game.hostId === self.id;
  const isAlive = self.status === "alive";
  const phase = game.mafiaState?.phase;
  const nightDuration = game.mafiaState?.settings?.nightTime ?? 25; // fallback safety

  const myRoleDetails = self.role ? ROLES[self.role] : null;
  const myAction = myRoleDetails ? getActionForRole(myRoleDetails.id as PlayerRole) : null;
  const hasSubmittedAction = Boolean(game.mafiaState?.nightActions?.[self.id]);

  const currentNight = game.mafiaState?.night || 1;
  const lastUsedNight = game.mafiaState?.lastAbilityUse?.[self.id] || 0;
  const isOnCooldown = (myAction === "kill" || myAction === "investigate") && currentNight === lastUsedNight + 1;

  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedDisguise, setSelectedDisguise] = useState<PlayerRole | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingNight, setIsProcessingNight] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(nightDuration);

  // Private chat UI state
  const [chatMessage, setChatMessage] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const lastPrivateSendRef = useRef<number>(0);

  // Refs
  const chatViewportRef = useRef<HTMLDivElement>(null);
  const processedRef = useRef(false); // avoid duplicate host processing

  // Compute targetable players: doctor can self-target, others can't
  const targetablePlayers = useMemo(() => {
    return game.players.filter((p) => {
      if (p.status !== "alive") return false;
      if (myAction !== "heal" && p.id === self.id) return false;
      return true;
    });
  }, [game.players, myAction, self.id]);

  // Find my private chat (created by spy vs mafia info action)
  const myPrivateChat: { id: string; chat: PrivateChat } | null = useMemo(() => {
    const chats = game.mafiaState?.privateChats || {};
    const entry = Object.entries(chats).find(([, chat]) => chat.participants.includes(self.id));
    return entry ? { id: entry[0], chat: entry[1] } : null;
  }, [game.mafiaState?.privateChats, self.id]);

  // Progress: submitted + passive roles
  const { totalAlive, submittedCount, progressPct, everyoneDone } = useMemo(() => {
    const alive = game.players.filter((p) => p.status === "alive");
    const total = alive.length;
    const passiveCount = alive.filter((p) => p.role && PASSIVE_ROLES.includes(p.role)).length;
    const submitted = Object.keys(game.mafiaState?.nightActions || {}).length + passiveCount;
    const pct = total > 0 ? (submitted / total) * 100 : 0;
    return { totalAlive: total, submittedCount: submitted, progressPct: pct, everyoneDone: submitted === total };
  }, [game.players, game.mafiaState?.nightActions]);

  // Auto-advance if all done (host only)
  useEffect(() => {
    if (!isHost || processedRef.current) return;
    if (everyoneDone) void handleProcessNight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [everyoneDone, isHost]);

  // Countdown bound to server timer
  const handleProcessNight = useCallback(async () => {
    if (!isHost || processedRef.current) return;
    processedRef.current = true;
    setIsProcessingNight(true);
    try {
      await processNight(game.id, self.id);
    } catch (e: any) {
      // allow retry on failure
      processedRef.current = false;
      toast({ title: "خطأ", description: e?.message || "فشل إنهاء الليل.", variant: "destructive" });
    } finally {
      setIsProcessingNight(false);
    }
  }, [game.id, isHost, self.id, toast]);

  useEffect(() => {
    if (!game.mafiaState?.timerEndsAt) return;
    const end = game.mafiaState.timerEndsAt.toMillis();

    const tick = () => {
      const remaining = Math.max(0, Math.round((end - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) void handleProcessNight();
    };

    const id = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(id);
  }, [game.mafiaState?.timerEndsAt, handleProcessNight]);

  // Auto-scroll private chat if user is at the bottom
  useEffect(() => {
    const viewport = chatViewportRef.current;
    if (!viewport) return;
    if (shouldAutoScroll(viewport)) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
  }, [myPrivateChat?.chat.messages, prefersReducedMotion]);

  const timeIsUp = timeLeft <= 0;
  const canHostProceed = isHost && (everyoneDone || timeIsUp);
  const timeProgress = Math.max(0, Math.min(100, (timeLeft / (nightDuration || 1)) * 100));

  const ActionIcon = myAction ? ACTION_ICONS[myAction] : Bed;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleTargetSelection = (targetId: string) => {
    if (hasSubmittedAction || isSubmitting || !isAlive || timeIsUp) return;
    setSelectedTargetId((prev) => (prev === targetId ? null : targetId));
  };

  const handleSubmit = async (isSkip = false) => {
    if (hasSubmittedAction || !isAlive || !myAction) return;

    let finalAction: NightAction | null = null;

    if (isSkip) {
      // Only meaningful for kill/investigate or enforced cooldown
      if (!(myAction === "kill" || myAction === "investigate" || isOnCooldown)) {
        toast({ title: "لا يمكن التخطي لهذا الدور", variant: "destructive" });
        return;
      }
      finalAction = { actorId: self.id, action: myAction, targetId: "skip" } as NightAction;
    } else if (myAction === "shapeshift") {
      if (!selectedDisguise) {
        toast({ title: "اختر شخصية للتنكر", variant: "destructive" });
        return;
      }
      finalAction = { actorId: self.id, action: "shapeshift", targetId: self.id, disguiseRole: selectedDisguise } as NightAction;
    } else {
      if (!selectedTargetId) {
        toast({ title: "اختر هدفًا أولًا", variant: "destructive" });
        return;
      }
      if (myAction === "heal" && selectedTargetId === game.mafiaState?.lastHealedPlayerId) {
        toast({ title: "لا يمكنك حماية نفس اللاعب مرتين على التوالي.", variant: "destructive" });
        return;
      }
      finalAction = { actorId: self.id, action: myAction, targetId: selectedTargetId } as NightAction;
    }

    setIsSubmitting(true);
    try {
      const res = await submitNightAction(game.id, finalAction);
      if (res.success) {
        toast({ title: "تم تسجيل قرارك بنجاح." });
      } else {
        toast({ title: "خطأ", description: res.error, variant: "destructive" });
        setIsSubmitting(false); // allow retry
      }
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message || "فشل إرسال القرار.", variant: "destructive" });
      setIsSubmitting(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myPrivateChat || !isAlive) return;

    const now = Date.now();
    if (now - lastPrivateSendRef.current < PRIVATE_CHAT_MIN_INTERVAL) return;

    const text = chatMessage.trim();
    if (!text) return;

    setIsSendingMessage(true);
    try {
      await sendPrivateMessage(game.id, myPrivateChat.id, {
        senderId: self.id,
        senderName: self.name,
        message: text,
      });
      setChatMessage("");
      lastPrivateSendRef.current = now;
    } catch (error: any) {
      toast({ title: "فشل إرسال الرسالة", description: error?.message, variant: "destructive" });
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Defensive fallback if phase drifted
  if (phase !== "night") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white text-center">
        <p className="text-lg text-muted-foreground">بانتظار بداية الليل...</p>
      </div>
    );
  }

  // Passive roles or dead players – watcher screen
  if (!myRoleDetails || (self.role && PASSIVE_ROLES.includes(self.role)) || !isAlive) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white text-center relative overflow-hidden">
        <h1 className="text-4xl font-bold z-10">{!isAlive ? "أنت تراقب من بعيد" : "حل الظلام..."}</h1>
        <p className="text-xl text-muted-foreground mt-2 animate-pulse z-10">
          {!isAlive ? "لا يمكنك المشاركة الآن." : "أنت نائم... في انتظار مرور الليل."}
        </p>
        <p className="font-mono text-2xl mt-4 z-10" aria-live="polite">{formatClock(timeLeft)}</p>
        {canHostProceed && (
          <Button onClick={handleProcessNight} disabled={isProcessingNight} size="sm" className="absolute bottom-10 z-20">
            {isProcessingNight ? <Loader2 className="animate-spin" /> : <ArrowRight />} الانتقال للنهار
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white relative overflow-hidden">
      {/* Top Status Bar */}
      <div className="absolute top-4 z-10 w-full max-w-4xl px-4">
        <div className="flex justify-between items-center gap-4">
          <div className="w-1/3">
            <h3 className="font-bold text-xs text-center mb-1">التقدم</h3>
            <Progress value={progressPct} className="w-full h-2 bg-slate-700" />
            <span className="text-xs text-center block">
              {submittedCount}/{totalAlive}
            </span>
          </div>
          <p className="font-mono text-2xl" aria-live="polite">{formatClock(timeLeft)}</p>
          <div className="w-1/3 text-left">
            {isHost && (
              <Button onClick={handleProcessNight} disabled={!canHostProceed || isProcessingNight} size="sm">
                {isProcessingNight ? <Loader2 className="animate-spin" /> : <ArrowRight />} الانتقال للنهار
              </Button>
            )}
          </div>
        </div>
        <Progress
          value={Math.max(0, Math.min(100, timeProgress))}
          className={cn("w-full h-1 mt-2 bg-slate-700", timeLeft < 10 && "[&>*]:bg-red-500 [&>*]:animate-pulse")}
          aria-label="شريط الوقت"
        />
      </div>

      {/* Action Area */}
      <AnimatePresence mode="wait">
        {hasSubmittedAction ? (
          <motion.div
            key="submitted"
            initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
            className="text-center z-10"
          >
            <CheckCircle className="w-24 h-24 text-green-400 mx-auto mb-4" />
            <h1 className="text-3xl font-bold">تم تسجيل قرارك</h1>
            <p className="text-lg text-muted-foreground mt-2 animate-pulse">في انتظار بقية اللاعبين...</p>
          </motion.div>
        ) : (
          <motion.div
            key="action"
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
            className="w-full max-w-4xl z-10"
          >
            <div className="text-center mb-6">
              <ActionIcon className="w-16 h-16 text-primary mx-auto mb-2" />
              <h1 className="text-4xl font-bold">دورك الآن يا {myRoleDetails.name}</h1>
              <p className="text-lg text-muted-foreground mt-2">{myRoleDetails.description}</p>
            </div>

            {isOnCooldown ? (
              <div className="text-center bg-slate-800/70 p-6 rounded-lg">
                <h2 className="text-2xl font-bold text-yellow-400">قدرتك قيد الراحة الإجبارية</h2>
                <p className="text-muted-foreground mt-2">لقد استخدمت قدرتك في الليلة الماضية، يجب عليك تخطي هذه الليلة.</p>
                <Button onClick={() => handleSubmit(true)} size="lg" className="mt-4" disabled={isSubmitting}>
                  <SkipForward className="ml-2" /> تخطي هذه الليلة
                </Button>
              </div>
            ) : myAction === "shapeshift" ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {DISGUISE_OPTIONS.map((roleId) => {
                  const r = ROLES[roleId];
                  return (
                    <motion.button
                      type="button"
                      key={roleId}
                      onClick={() => setSelectedDisguise(roleId)}
                      className={cn(
                        "p-3 rounded-lg border-2 bg-slate-800/50 cursor-pointer transition-all duration-200 text-center space-y-2",
                        selectedDisguise === roleId ? "border-primary scale-105 shadow-lg shadow-primary/20" : "border-slate-700 hover:border-primary/50"
                      )}
                      whileHover={{ y: prefersReducedMotion ? 0 : -5 }}
                    >
                      <p className="font-bold text-lg">{r.name}</p>
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {targetablePlayers.map((player) => {
                  const isProtected = myAction === "heal" && player.id === game.mafiaState?.lastHealedPlayerId;
                  const isDisabled = isProtected || timeIsUp;
                  return (
                    <motion.button
                      type="button"
                      key={player.id}
                      onClick={() => !isDisabled && handleTargetSelection(player.id)}
                      className={cn(
                        "p-3 rounded-lg border-2 bg-slate-800/50 backdrop-blur-sm cursor-pointer transition-all duration-200 text-center space-y-2",
                        selectedTargetId === player.id ? "border-primary scale-105 shadow-lg shadow-primary/20" : "border-slate-700 hover:border-primary/50",
                        selectedTargetId && selectedTargetId !== player.id ? "opacity-50" : "opacity-100",
                        isDisabled && "opacity-30 cursor-not-allowed"
                      )}
                      whileHover={{ y: isDisabled || prefersReducedMotion ? 0 : -5 }}
                      aria-pressed={selectedTargetId === player.id}
                      aria-label={`اختيار ${player.name}`}
                    >
                      <PlayerAvatar avatarId={player.avatarId} className="w-24 h-24 mx-auto rounded-full border-4 border-transparent" temporaryTitle={player.temporaryTitle} />
                      <p className="font-bold text-lg">{player.name}</p>
                      {isProtected && <p className="text-xs text-red-400 font-bold">(لا يمكن حمايته)</p>}
                    </motion.button>
                  );
                })}
              </div>
            )}

            {!isOnCooldown && (
              <div className="mt-8 flex justify-center gap-4">
                <Button
                  onClick={() => handleSubmit(false)}
                  disabled={
                    isSubmitting ||
                    timeIsUp ||
                    (myAction !== "shapeshift" && !selectedTargetId) ||
                    (myAction === "shapeshift" && !selectedDisguise)
                  }
                  size="lg"
                  className="w-full max-w-xs"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : "تأكيد"}
                </Button>
                {(myAction === "kill" || myAction === "investigate") && (
                  <Button onClick={() => handleSubmit(true)} variant="outline" size="lg" disabled={isSubmitting || timeIsUp}>
                    تخطي
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Private Chat */}
      {myPrivateChat && isAlive && (
        <motion.div
          initial={{ y: prefersReducedMotion ? 0 : 50, opacity: prefersReducedMotion ? 1 : 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: prefersReducedMotion ? 0 : 0.3 }}
          className="absolute bottom-4 right-4 w-80 bg-background/90 text-foreground rounded-lg shadow-2xl border border-primary/50 z-20 overflow-hidden"
        >
          <button
            className="w-full p-3 border-b border-primary/30 flex justify-between items-center cursor-pointer"
            onClick={() => setIsChatMinimized((v) => !v)}
            aria-expanded={!isChatMinimized}
            aria-controls="secret-chat"
          >
            <h4 className="font-bold text-center">قناة سرية</h4>
            <motion.div animate={{ rotate: isChatMinimized ? 180 : 0 }}>
              <ChevronDown className="w-5 h-5" />
            </motion.div>
          </button>
          <AnimatePresence initial={false}>
            {!isChatMinimized && (
              <motion.div
                id="secret-chat"
                initial={{ height: 0, opacity: prefersReducedMotion ? 1 : 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: prefersReducedMotion ? 1 : 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
              >
                <ScrollArea className="h-64 p-3" viewportRef={chatViewportRef}>
                  <div className="space-y-3">
                    {myPrivateChat.chat.messages.map((msg, i) => (
                      <div key={`${msg.senderId}-${(msg.timestamp as any)?.seconds ?? i}`} className={cn("flex flex-col", msg.senderId === self.id ? "items-end" : "items-start")}> 
                        <div className={cn("p-2 rounded-lg max-w-[80%]", msg.senderId === self.id ? "bg-primary text-primary-foreground" : "bg-muted")}> 
                          <p className="text-sm">{msg.message}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {msg.senderName} — {formatDistanceToNow(msg.timestamp.toDate(), { addSuffix: true, locale: ar })}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <form onSubmit={handleSendMessage} className="p-2 border-t flex gap-2">
                  <Input
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="اكتب رسالتك..."
                    disabled={isSendingMessage}
                    aria-label="اكتب رسالة خاصة"
                  />
                  <Button type="submit" size="icon" disabled={isSendingMessage || !chatMessage.trim()} aria-label="إرسال">
                    {isSendingMessage ? <Loader2 className="animate-spin" /> : <Send />}
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
