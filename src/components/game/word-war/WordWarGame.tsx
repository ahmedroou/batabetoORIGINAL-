'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { Game, Player, WordWarCard } from '@/types';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import * as wordWarActions from "@/lib/actions/word-war";
import * as roomActions from '@/lib/actions/room';
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  Swords, Users, Crown, Loader2, Send, Lightbulb, SkipForward, Eye, Shuffle,
  LogOut, Copy, Check, UserX, HelpCircle, Settings, Save, CheckCircle2,
  Timer, ShieldQuestion,
} from "lucide-react";
import { PlayerAvatar } from "../PlayerAvatar";
import { useRouter } from "next/navigation";
import { Label } from '@/components/ui/label';
import {
  Tooltip, TooltipProvider, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Word War — React UI (Optimistic & Race-safe)
 * - Base + Overlay state for suspicions (no local state wiping server snapshots).
 * - Pending reveals with mutationId (first-writer-wins; still shows peers' updates immediately).
 * - All async calls awaited; precise error handling and rollback per-mutation.
 * - Small cleanups, helpers, and comments.
 */

// -------- Helpers --------
const asAny = (fn: any) => fn as any;

const k = {
  maxHintLen: 8,
};

// Safer expiry detection across different shapes
const getTimerExpiryMs = (game: Game): number | null => {
  const ww: any = game.wordWarState || {};
  if (ww.timer) {
    const t = ww.timer;
    if (t.endsAtApprox?.toMillis) return t.endsAtApprox.toMillis();
    if (typeof t.endsAtApprox === 'string') return new Date(t.endsAtApprox).getTime();
    if (t.startedAt?.toMillis && typeof t.durationSec === "number") {
      return t.startedAt.toMillis() + t.durationSec * 1000;
    }
  }
  if (ww.timerEndsAt?.toMillis) return ww.timerEndsAt.toMillis();
  return null;
};

// UI color selection
const getCardColorStyles = (
  card: WordWarCard,
  revealRealColor: boolean,
  gameState: Game["gameState"],
  isSuspected: boolean
) => {
  const showTrueColor = revealRealColor || card.revealed || gameState === "board_reveal";
  const color = showTrueColor ? card.color : "default";

  let base = "";
  switch (color) {
    case "red":
      base = "bg-rose-500/90 border-rose-700 text-white";
      break;
    case "blue":
      base = "bg-indigo-500/90 border-indigo-700 text-white";
      break;
    case "neutral":
      base = "bg-zinc-200 border-zinc-400 text-zinc-900";
      break;
    case "assassin":
      base = "bg-zinc-900 border-zinc-950 text-white";
      break;
    default:
      base = "bg-white border-zinc-300 hover:bg-zinc-50 text-zinc-800";
  }

  if (isSuspected) base = cn(base, "ring-2 ring-amber-300 border-amber-400");
  return base;
};

// Small components
const ScoreCounter = ({
  label, count, colorClass, icon: Icon,
}: { label: string; count: number; colorClass: string; icon: React.ElementType }) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center p-2 rounded-xl text-white text-center w-24 shadow-sm",
      colorClass
    )}
    aria-label={`${label}: ${count}`}
  >
    <Icon className="w-5 h-5 opacity-90" />
    <span className="text-2xl leading-none font-extrabold font-mono">{count}</span>
    <span className="text-[10px] font-semibold tracking-wide">{label}</span>
  </div>
);

function CountdownTimer({ expiryTimestamp, onExpire }: { expiryTimestamp: number; onExpire: () => void }) {
  const [timeLeft, setTimeLeft] = useState(() => Math.round(Math.max(0, expiryTimestamp - Date.now()) / 1000));

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const update = () => {
      const remaining = Math.round(Math.max(0, expiryTimestamp - Date.now()) / 1000);
      setTimeLeft(remaining);
      if (remaining <= 0) {
        onExpire();
        if (id) clearInterval(id);
      }
    };
    update();
    id = setInterval(update, 1000);
    return () => { if (id) clearInterval(id); };
  }, [expiryTimestamp, onExpire]);

  return <span>{timeLeft}</span>;
}

const HintHistoryPanel = ({
  hints, team,
}: { hints: { word: string; count: number; team: 'red' | 'blue' }[]; team: 'red' | 'blue'; }) => {
  const teamHints = hints.filter((h) => h.team === team).slice(-3);
  const color = team === 'red' ? 'text-rose-400' : 'text-indigo-400';
  return (
    <div className="w-full space-y-1">
      <h4 className={cn("text-xs font-bold text-center", color)}>آخر التلميحات</h4>
      {teamHints.length === 0 ? (
        <p className="text-center text-xs text-zinc-500">لا يوجد</p>
      ) : (
        teamHints.map((h, i) => (
          <div key={i} className="flex justify-between items-center text-xs bg-zinc-100 rounded p-1">
            <span className="font-mono font-bold text-zinc-800">{h.word}</span>
            <span className="font-mono font-bold text-zinc-500">{h.count}</span>
          </div>
        ))
      )}
    </div>
  );
};

// -------- Mutation helpers (optimistic infra) --------
type SuspMap = Record<string, string[]>; // card -> playerIds

type SuspOp = { by: string; op: 'add' | 'remove'; id: string };
type PendingSusp = Record<string, SuspOp[]>; // card -> pending ops

type PendingReveal = { id: string; at: number };
type PendingReveals = Record<string, PendingReveal>; // card -> reveal info

const genMutationId = (playerId: string) =>
  `${playerId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

const applySuspOverlay = (base: SuspMap, pending: PendingSusp): SuspMap => {
  const clone: Record<string, Set<string>> = {};
  for (const [card, ids] of Object.entries(base || {})) clone[card] = new Set(ids);
  for (const [card, ops] of Object.entries(pending || {})) {
    if (!clone[card]) clone[card] = new Set();
    for (const m of ops) {
      if (m.op === 'add') clone[card].add(m.by);
      else clone[card].delete(m.by);
    }
  }
  return Object.fromEntries(Object.entries(clone).map(([c, s]) => [c, [...s]]));
};

// -------- Main component --------
export default function WordWarGame({ game, self }: { game: Game; self: Player }) {
  const { toast } = useToast();
  const router = useRouter();

  const ww = game.wordWarState as any;
  const isHost = game.hostId === self.id;
  const expectedTurnId = ww?.turnId as number | undefined;

  // UI state
  const [hintWord, setHintWord] = useState("");
  const [hintNumber, setHintNumber] = useState(1);
  const [isCopying, setIsCopying] = useState(false);
  const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
  const [turnTime, setTurnTime] = useState<string>(String(ww?.settings?.turnTime || 60));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Optimistic layers ---
  // Base suspicions from server (never mutated directly by UI)
  const [baseSuspicions, setBaseSuspicions] = useState<SuspMap>(ww?.suspicions || {});
  // Pending local ops keyed by card
  const [pendingSusp, setPendingSusp] = useState<PendingSusp>({});
  // Pending reveals (busy per-card), keep mutationId for precise rollback
  const [pendingReveals, setPendingReveals] = useState<PendingReveals>({});

  const timerExpiryMs = getTimerExpiryMs(game);

  // Derived booleans
  const teamRedPlayers = useMemo(
    () => game.players.filter((p) => p.team === "red" && p.status !== "left"),
    [game.players]
  );
  const teamBluePlayers = useMemo(
    () => game.players.filter((p) => p.team === "blue" && p.status !== "left"),
    [game.players]
  );
  const unassigned = useMemo(
    () => game.players.filter((p) => !p.team && p.status !== "left"),
    [game.players]
  );

  const cards: WordWarCard[] = useMemo(() => {
    if (ww?.cardsMap && Array.isArray(ww.cardsOrder)) {
      return (ww.cardsOrder as string[]).map((key: string) => ww.cardsMap[key]).filter(Boolean) as WordWarCard[];
    }
    return ww?.cards ?? [];
  }, [ww]);

  const score = useMemo(() => {
    return cards.reduce((acc, card) => {
      if (card.revealed) acc[card.color] = (acc[card.color] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [cards]);

  const cardsLeft = useMemo(() => {
    const redTotal = cards.filter((c) => c.color === "red").length;
    const blueTotal = cards.filter((c) => c.color === "blue").length;
    return { red: redTotal - (score.red || 0), blue: blueTotal - (score.blue || 0) };
  }, [cards, score]);

  const isMyTurn = ww?.turn === self.team;
  const isGuide = ww?.guides?.[self.team as "red" | "blue"] === self.id;
  const isGuesserTurn = isMyTurn && !isGuide && game.gameState === "guesser_turn";
  const isGuideTurn = isMyTurn && isGuide && game.gameState === "guide_turn";
  const isSpectator = !self.team;

  // Effective suspicions = base from server + local overlay
  const effectiveSuspicions: SuspMap = useMemo(
    () => applySuspOverlay(baseSuspicions, pendingSusp),
    [baseSuspicions, pendingSusp]
  );

  // Re-sync base from server; rebase pending (remove ops already realized in base)
  useEffect(() => {
    const srv = ww?.suspicions || {};
    setBaseSuspicions(srv);

    setPendingSusp((old) => {
      const next: PendingSusp = { ...old };
      for (const [card, ops] of Object.entries(next)) {
        const inBase = new Set<string>(srv[card] || []);
        const remaining = ops.filter((m) => {
          const isInBase = inBase.has(m.by);
          // If op added and it's now in base => realized; if removed and it's now not in base => realized
          return !((m.op === 'add' && isInBase) || (m.op === 'remove' && !isInBase));
        });
        if (remaining.length) next[card] = remaining;
        else delete next[card];
      }
      return next;
    });
  }, [ww?.suspicions, ww?.turnId]);

  // Whenever a card becomes revealed on the server, clear any pending reveal for it
  useEffect(() => {
    if (!cards?.length) return;
    const revealedTexts = new Set(cards.filter((c) => c.revealed).map((c) => c.text));
    setPendingReveals((prev) => {
      const copy = { ...prev };
      let changed = false;
      for (const key of Object.keys(copy)) {
        if (revealedTexts.has(key)) { delete copy[key]; changed = true; }
      }
      return changed ? copy : prev;
    });
  }, [cards]);

  // Timeout
  const onTimeout = useCallback(() => {
    asAny(wordWarActions).handleTimeout(game.id, self.id, {
      expectedTurnId,
      clientSentAtMs: Date.now(),
    });
  }, [game.id, self.id, expectedTurnId]);

  // Reset submission flag when returning to lobby or final state
  useEffect(() => {
    if (game.gameState === "lobby" || game.gameState === "final_results") setIsSubmitting(false);
  }, [game.gameState]);

  // -------- Actions (with mutationId / awaited / precise rollback) --------
  const apiCtx = (extra?: Record<string, any>) => ({
    expectedTurnId,
    clientSentAtMs: Date.now(),
    ...(extra || {}),
  });

  const revealCard = useCallback(
    async (cardText: string) => {
      if (!isGuesserTurn) return;
      // If already revealed on server or locally pending, ignore
      const card = cards.find((c) => c.text === cardText);
      if (!card || card.revealed || pendingReveals[cardText]) return;

      const mutationId = genMutationId(self.id);
      setPendingReveals((p) => ({ ...p, [cardText]: { id: mutationId, at: Date.now() } }));

      try {
        await asAny(wordWarActions).revealCard(game.id, self.id, cardText, apiCtx({ mutationId }));
      } catch (e: any) {
        // Rollback only this card's pending flag
        setPendingReveals((p) => {
          const copy = { ...p };
          if (copy[cardText]?.id === mutationId) delete copy[cardText];
          return copy;
        });
        const msg = e?.message || String(e);
        const known = /ALREADY_REVEALED|TURN_MISMATCH|OUT_OF_GUESSES|NOT_YOUR_TURN/i.test(msg);
        toast({
          title: known ? "لم يتم الكشف" : "تعذّر كشف البطاقة",
          description: msg,
          variant: "destructive",
        });
      }
    },
    [isGuesserTurn, cards, pendingReveals, game.id, self.id]
  );

  const endTurn = useCallback(async () => {
    try {
      setIsSubmitting(true);
      await asAny(wordWarActions).endTurn(game.id, self.id, apiCtx());
    } catch (e: any) {
      toast({ title: "تعذّر إنهاء الدور", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }, [game.id, self.id]);

  // Explicit setSuspicion(add/remove) with optimistic overlay + mutationId
  const setSuspicion = useCallback(
    async (cardText: string, desired: boolean) => {
      const op: 'add' | 'remove' = desired ? 'add' : 'remove';
      const mutationId = genMutationId(self.id);

      // Add to pending overlay
      setPendingSusp((p) => ({
        ...p,
        [cardText]: [...(p[cardText] || []), { by: self.id, op, id: mutationId }],
      }));

      const api = asAny(wordWarActions);
      try {
        if (typeof api.setSuspicion === 'function') {
          await api.setSuspicion(game.id, self.id, cardText, op, apiCtx({ mutationId }));
        } else {
          // Fallback compatibility (temporary): only toggle if desired != current effective
          const currently = !!(effectiveSuspicions[cardText] || []).includes(self.id);
          if (currently !== desired) {
            await api.toggleSuspicion(game.id, self.id, cardText, apiCtx());
          }
        }
      } catch (e: any) {
        // Rollback only this pending op
        setPendingSusp((p) => {
          const arr = (p[cardText] || []).filter((m) => m.id !== mutationId);
          const next = { ...p, [cardText]: arr };
          if (!arr.length) delete next[cardText];
          return next;
        });
        toast({ title: "تعذّر وضع علامة الشك", description: e?.message || String(e), variant: "destructive" });
      }
    },
    [game.id, self.id, effectiveSuspicions]
  );

  const hintHistory = ww?.hintHistory || [];

  // -------- Render helpers --------
  const renderHeader = () => {
    if (game.gameState === "final_results" || game.gameState === "board_reveal") return null;

    let turnText = "حرب الكلمات";
    if (game.gameState === "preparation") turnText = "فترة التجهيز";
    if (game.gameState === "guide_turn") turnText = `دور المرشد (${ww?.turn === "red" ? "الأحمر" : "الأزرق"})`;
    if (game.gameState === "guesser_turn") turnText = `دور المخمّنين (${ww?.turn === "red" ? "الأحمر" : "الأزرق"})`;

    const turnColor = ww?.turn === "red" ? "text-rose-600" : "text-indigo-600";

    return (
      <div className="flex justify-center items-center w-full relative">
        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold flex items-center gap-2 justify-center text-zinc-900">
            <Swords /> حرب الكلمات
          </h1>
          <h2 className={cn("text-lg md:text-xl font-semibold", turnColor)}>{turnText}</h2>
        </div>
      </div>
    );
  };

  const renderActionPanel = () => {
    if (game.gameState === "final_results" || game.gameState === "board_reveal") return null;

    if (game.gameState === "guesser_turn" && ww?.currentHint) {
      return (
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
          <Card className="w-full max-w-3xl mx-auto bg-white/70 backdrop-blur border-indigo-200 shadow-md">
            <CardContent className="p-4 flex flex-col md:flex-row items-center justify-center gap-4 text-center">
              <Lightbulb className="w-9 h-9 text-amber-500 shrink-0" />
              <div className="flex-grow">
                <p className="text-sm font-semibold text-zinc-700">التلميح هو:</p>
                <p className="text-3xl font-extrabold text-indigo-700 tracking-widest">{ww.currentHint?.word}</p>
              </div>
              <div className="w-20 h-20 rounded-full bg-zinc-100 flex flex-col items-center justify-center border-4 border-indigo-200">
                <p className="text-3xl font-extrabold font-mono text-indigo-700">{ww.currentHint?.count}</p>
                <p className="text-[10px] font-semibold text-zinc-500">كلمات</p>
              </div>
              {isGuesserTurn && (
                <div className="text-center md:text-right">
                  <p className="font-semibold text-zinc-700">
                    تخمينات متبقية: <span className="text-xl text-amber-600">{ww.guessesLeft}</span>
                  </p>
                  <Button onClick={endTurn} disabled={isSubmitting} variant="secondary" size="sm" className="mt-2">
                    <SkipForward className="ml-2" /> إنهاء الدور
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      );
    }

    if (isGuideTurn) {
      const handleSubmitHint = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = hintWord.trim();
        if (!trimmed || hintNumber < 1) {
          toast({
            title: "تلميح غير صالح",
            description: "الرجاء إدخال كلمة، وعدد أكبر من صفر.",
            variant: "destructive",
          });
          return;
        }
        try {
          setIsSubmitting(true);
          await asAny(wordWarActions).submitHint(game.id, self.id, trimmed, hintNumber, apiCtx());
          setHintWord("");
          setHintNumber(1);
        } catch (e: any) {
          toast({ title: "خطأ", description: e?.message || String(e), variant: "destructive" });
        } finally {
          setIsSubmitting(false);
        }
      };

      return (
        <Card className="w-full max-w-xl mx-auto bg-white/70 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-800">
              <Lightbulb /> دورك كمرشد
            </CardTitle>
            <CardDescription className="text-zinc-600">
              كلمة واحدة (حتى {k.maxHintLen} أحرف، بدون مسافات) + عدد البطاقات المرتبطة.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitHint} className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="اكتب التلميح هنا..."
                  value={hintWord}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\s/g, "");
                    if (v.length <= k.maxHintLen) setHintWord(v);
                  }}
                  maxLength={k.maxHintLen}
                  className="text-lg h-12 pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                  {hintWord.length}/{k.maxHintLen}
                </span>
              </div>
              <Input
                type="number"
                value={hintNumber}
                onChange={(e) => setHintNumber(Math.min(9, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                min={1}
                max={9}
                className="w-24 text-lg h-12 text-center"
              />
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" /> : <Send />}
              </Button>
            </form>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="w-full max-w-xl mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-zinc-800">الرجاء الانتظار...</CardTitle>
          <CardDescription className="text-zinc-600">
            {game.gameState === "guide_turn"
              ? `بانتظار مرشد الفريق ${ww?.turn === "red" ? "الأحمر" : "الأزرق"} ليعطي تلميحًا.`
              : game.gameState === "preparation"
              ? "فترة التجهيز... استعدوا!"
              : `بانتظار فريق ${ww?.turn === "red" ? "الأحمر" : "الأزرق"} لتخمين الكلمات.`}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  };

  const renderLobby = () => {
    const copyId = () => {
      setIsCopying(true);
      navigator.clipboard.writeText(game.id);
      setTimeout(() => setIsCopying(false), 1200);
    };

    const leave = async () => {
      try {
        setIsSubmitting(true);
        const result = await roomActions.leaveGame(game.id, self.id);
        if (result.success) {
          sessionStorage.removeItem(`player-id-${game.id}`);
          router.push("/");
          toast({ title: "لقد غادرت الغرفة." });
        } else {
          toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
      } finally {
        setIsSubmitting(false);
      }
    };

    const selectTeam = async (team: "red" | "blue") => {
      try {
        setIsSubmitting(true);
        await wordWarActions.selectTeam(game.id, self.id, team);
      } catch (e: any) {
        toast({ title: "خطأ", description: e?.message || String(e), variant: "destructive" });
      } finally {
        setIsSubmitting(false);
      }
    };

    const randomize = async () => {
      try {
        setIsSubmitting(true);
        await wordWarActions.randomizeTeams(game.id, self.id);
      } catch (e: any) {
        toast({ title: "خطأ", description: e?.message || String(e), variant: "destructive" });
      } finally {
        setIsSubmitting(false);
      }
    };

    const start = async () => {
      try {
        setIsSubmitting(true);
        await wordWarActions.startGame(game.id, self.id);
      } catch (e: any) {
        toast({ title: "خطأ", description: e?.message || String(e), variant: "destructive" });
        setIsSubmitting(false);
      }
    };

    const saveSettings = async () => {
      if (!isHost) return;
      try {
        setIsSubmitting(true);
        const time = parseInt(turnTime, 10);
        if (isNaN(time) || time < 10 || time > 300) {
          toast({ title: "قيمة غير صالحة", description: "وقت الدور يجب أن يكون بين 10 و 300 ثانية.", variant: "destructive"});
          return;
        }
        await wordWarActions.updateGameSettings(game.id, self.id, { turnTime: time });
        toast({ title: "تم حفظ الإعدادات" });
      } catch (e: any) {
        toast({ title: "خطأ", description: e?.message || String(e), variant: "destructive" });
      } finally {
        setIsSubmitting(false);
      }
    };

    const startBtnState = () => {
      if (isSubmitting) return { disabled: true, text: "جاري البدء..." } as const;
      if (teamRedPlayers.length < 2 || teamBluePlayers.length < 2)
        return { disabled: true, text: "كل فريق يحتاج لاعبين على الأقل" } as const;
      if (unassigned.length > 0)
        return { disabled: true, text: `في انتظار ${unassigned.length} لاعبين` } as const;
      return { disabled: false, text: "بدء اللعبة" } as const;
    };

    const sb = startBtnState();

    return (
      <>
        <Card className="w-full max-w-4xl mx-auto bg-white/70 backdrop-blur">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-zinc-900">لوبي حرب الكلمات</CardTitle>
            <div className="flex gap-2 w-full max-w-sm mx-auto pt-2">
              <Input value={game.id} readOnly className="text-center tracking-widest font-mono text-lg h-12 flex-grow" />
              <TooltipProvider>
                <Tooltip open={isCopying}>
                  <TooltipTrigger asChild>
                    <Button onClick={copyId} size="lg" variant="secondary" className="px-4">
                      {isCopying ? <Check /> : <Copy />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>تم النسخ!</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {["red", "blue"].map((teamId) => {
                const list = (teamId === "red" ? teamRedPlayers : teamBluePlayers) as Player[];
                const titleColor = teamId === "red" ? "text-rose-600" : "text-indigo-600";
                return (
                  <div key={teamId} className="flex flex-col gap-2 p-3 rounded-xl border bg-zinc-50">
                    <h3 className={cn("text-xl font-bold text-center", titleColor)}>
                      الفريق {teamId === "red" ? "الأحمر" : "الأزرق"} ({list.length})
                    </h3>
                    <div className="space-y-2 min-h-[120px]">
                      {list.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 p-1.5 bg-white rounded-md border">
                          <div className="flex items-center gap-2">
                            <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8" />
                            <span className="font-semibold text-zinc-800">{p.name}</span>
                          </div>
                          {isHost && self.id !== p.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setPlayerToKick(p)}
                              aria-label={`طرد ${p.name}`}
                            >
                              <UserX />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button onClick={() => selectTeam(teamId as "red" | "blue")} disabled={isSubmitting || list.some((p) => p.id === self.id)}>
                      انضم
                    </Button>
                  </div>
                );
              })}
            </div>

            {isHost && (
              <div className="p-4 border rounded-xl space-y-2 bg-zinc-50">
                <Label className="font-bold text-base flex items-center gap-2 text-zinc-800">
                  <Settings /> إعدادات اللعبة
                </Label>
                <div className="flex items-end gap-2">
                  <div className="flex-grow space-y-1">
                    <Label htmlFor="turn-time">وقت الدور (ث)</Label>
                    <Input
                      id="turn-time"
                      type="text"
                      pattern="[0-9]*"
                      value={turnTime}
                      onChange={(e) => setTurnTime(e.target.value.replace(/[^0-9]/g, ''))}
                    />
                  </div>
                  <Button onClick={saveSettings} disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} حفظ
                  </Button>
                </div>
              </div>
            )}

            {unassigned.length > 0 && (
              <div className="text-center p-2 border rounded-md bg-white">
                <h4 className="font-bold text-zinc-600">لاعبون في الانتظار</h4>
                <div className="flex justify-center flex-wrap gap-2 mt-2">
                  {unassigned.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 p-1.5 bg-zinc-50 rounded-md w-48 border">
                      <div className="flex items-center gap-2">
                        <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8" />
                        <span className="font-semibold text-zinc-800">{p.name}</span>
                      </div>
                      {isHost && self.id !== p.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setPlayerToKick(p)}
                          aria-label={`طرد ${p.name}`}
                        >
                          <UserX />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex-col gap-2">
            {isHost && (
              <div className="flex gap-2 w-full">
                <Button onClick={start} disabled={sb.disabled} className="flex-grow">
                  {isSubmitting ? <Loader2 className="animate-spin" /> : sb.text}
                </Button>
                <Button onClick={randomize} disabled={isSubmitting} variant="outline">
                  <Shuffle /> توزيع عشوائي
                </Button>
              </div>
            )}
            <Button onClick={leave} variant="ghost" className="w-full text-destructive" disabled={isSubmitting}>
              <LogOut /> مغادرة الغرفة
            </Button>
          </CardFooter>
        </Card>

        <AlertDialog open={!!playerToKick} onOpenChange={(open) => !open && setPlayerToKick(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
              <AlertDialogDescription>
                هل تريد حقًا طرد اللاعب "{playerToKick?.name}" من الغرفة؟ لن يتمكن من الانضمام مرة أخرى.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!playerToKick || !isHost) return;
                  try {
                    setIsSubmitting(true);
                    const result = await roomActions.kickPlayerFromLobby(game.id, self.id, playerToKick.id);
                    if (result.error) {
                      toast({ title: "خطأ في الطرد", description: result.error, variant: "destructive" });
                    } else {
                      toast({ title: "تم الطرد", description: `تم طرد اللاعب ${playerToKick.name}.` });
                    }
                  } finally {
                    setPlayerToKick(null);
                    setIsSubmitting(false);
                  }
                }}
                className="bg-destructive hover:bg-destructive/90"
              >
                {isSubmitting ? "جاري الطرد..." : "نعم، قم بالطرد"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  };

  const renderGameBoard = () => {
    if (!ww) return <div className="p-6 text-center">خطأ: حالة اللعبة غير موجودة.</div>;

    const turnGlow = isMyTurn
      ? ww.turn === "red"
        ? "shadow-[0_0_25px_8px_rgba(225,29,72,0.15)]"
        : "shadow-[0_0_25px_8px_rgba(79,70,229,0.15)]"
      : "";

    const revealRealColorForMe = isGuide;

    return (
      <div className={cn("relative w-full min-h-screen flex flex-col p-1 sm:p-2 md:p-4 bg-gradient-to-br from-white via-zinc-50 to-indigo-50 transition-shadow duration-500", turnGlow)} dir="rtl">
        {timerExpiryMs && game.gameState !== "final_results" && game.gameState !== "board_reveal" && (
          <div className="sticky top-2 self-end z-20 mr-2">
            <div className="flex items-center gap-2 bg-white/80 backdrop-blur px-2 py-1 rounded-full border shadow-sm">
              <Timer className="w-4 h-4 text-indigo-600" />
              <CountdownTimer expiryTimestamp={timerExpiryMs} onExpire={onTimeout} />
            </div>
          </div>
        )}

        <header className="w-full p-2 mb-2">
          <div className="flex justify-between items-start max-w-7xl mx-auto gap-2">
            <div className="flex flex-col items-center gap-2 w-28">
              <ScoreCounter label="متبق" count={cardsLeft.red} colorClass="bg-rose-600/90" icon={Users} />
              <div className="flex flex-wrap justify-center gap-1 w-24">
                {teamRedPlayers.map((p) => (
                  <div key={p.id} className="flex flex-col items-center text-center">
                    <PlayerAvatar avatarId={p.avatarId} className="w-7 h-7 rounded-full" />
                    {ww.guides?.red === p.id && <Eye className="w-4 h-4 text-indigo-600" />}
                  </div>
                ))}
              </div>
              <HintHistoryPanel hints={hintHistory} team="red" />
            </div>
            <div className="flex-grow flex flex-col items-center gap-2">
              {renderHeader()}
            </div>
            <div className="flex flex-col items-center gap-2 w-28">
              <ScoreCounter label="متبق" count={cardsLeft.blue} colorClass="bg-indigo-600/90" icon={Users} />
              <div className="flex flex-wrap justify-center gap-1 w-24">
                {teamBluePlayers.map((p) => (
                  <div key={p.id} className="flex flex-col items-center text-center">
                    <PlayerAvatar avatarId={p.avatarId} className="w-7 h-7 rounded-full" />
                    {ww.guides?.blue === p.id && <Eye className="w-4 h-4 text-indigo-600" />}
                  </div>
                ))}
              </div>
              <HintHistoryPanel hints={hintHistory} team="blue" />
            </div>
          </div>
        </header>

        <main className={cn("w-full flex-grow grid gap-1 sm:gap-1.5 p-1 md:p-2 max-w-7xl mx-auto", "grid-cols-5 sm:grid-cols-6 md:grid-cols-8")}>
          {cards.map((card, index) => {
            const susp = (effectiveSuspicions[card.text] || []) as string[];
            const isSuspectedAny = susp.length > 0;
            const isSuspectedByMe = susp.includes(self.id);
            const isBeingRevealed = !!pendingReveals[card.text];
            const showAsRevealed = card.revealed || isBeingRevealed;
            const canClick = isGuesserTurn && !card.revealed && !isSpectator;

            return (
              <motion.div key={card.text + index} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.015 }} className="relative group/card">
                <button
                  type="button"
                  disabled={!canClick || isBeingRevealed}
                  className={cn(
                    "relative w-full h-16 md:h-20 rounded-md flex items-center justify-center p-1 text-center font-bold text-xs sm:text-sm md:text-base border shadow-sm transition-all duration-200",
                    getCardColorStyles(card, revealRealColorForMe || showAsRevealed, game.gameState, isSuspectedAny),
                    canClick && "cursor-pointer active:scale-[0.98]",
                    isBeingRevealed && "opacity-70"
                  )}
                  onClick={() => revealCard(card.text)}
                  aria-label={`بطاقة: ${card.text}`}
                >
                  <span className={cn("text-base md:text-lg", showAsRevealed && "opacity-20")}>{card.text}</span>

                  {isSuspectedAny && !showAsRevealed && (
                    <span className="absolute -top-2 -left-2 rounded-full bg-amber-400 text-white text-[10px] px-1.5 py-0.5 font-bold shadow">
                      {susp.length}
                    </span>
                  )}

                  {showAsRevealed && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 md:w-10 md:h-10 text-white" />
                    </div>
                  )}
                </button>

                {isGuesserTurn && !showAsRevealed && (
                  <div className="absolute top-1 right-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 bg-black/25 text-white hover:bg-black/40"
                      onClick={(e) => {
                        e.stopPropagation();
                        const currently = (effectiveSuspicions[card.text] || []).includes(self.id);
                        setSuspicion(card.text, !currently);
                      }}
                      aria-label={isSuspectedByMe ? "إزالة علامة الشك" : "وضع علامة شك"}
                    >
                      <HelpCircle className={cn("h-5 w-5", isSuspectedByMe && "text-amber-300")}/>
                    </Button>
                  </div>
                )}

                <div className="absolute bottom-0 left-1 flex items-center -space-x-2">
                  {susp.map((pid) => {
                    const sp = game.players.find((p) => p.id === pid);
                    if (!sp) return null;
                    return (
                      <TooltipProvider key={pid}>
                        <Tooltip>
                          <TooltipTrigger>
                            <PlayerAvatar avatarId={sp.avatarId} className="w-5 h-5 rounded-full border border-white" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{sp.name} يشك في هذه الكلمة</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </main>

        <footer className="w-full p-2">{renderActionPanel()}</footer>
      </div>
    );
  };

  if (game.gameState === "lobby") return renderLobby();

  if (game.gameState === 'board_reveal') {
    return (
      <div className="w-full flex flex-col items-center justify-center p-4">
        <h2 className="text-2xl font-bold mb-4">انتهت اللعبة! كشف البطاقات</h2>
        <div className="w-full flex-grow grid gap-1 sm:gap-1.5 p-1 md:p-2 max-w-7xl mx-auto grid-cols-5 md:grid-cols-8">
          {cards.map((card, index) => (
            <motion.div key={card.text + index} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.025 }} className="relative group/card">
              <div className={cn(
                "relative w-full h-16 md:h-20 rounded-md flex items-center justify-center p-1 text-center font-bold text-xs sm:text-sm md:text-base border shadow-sm",
                getCardColorStyles(card, true, game.gameState, false)
              )}>
                <span className="text-base md:text-lg">{card.text}</span>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="mt-4 flex flex-col items-center gap-2">
          {timerExpiryMs && <p>الانتقال للنتائج النهائية خلال: <CountdownTimer expiryTimestamp={timerExpiryMs} onExpire={onTimeout} /></p>}
          {isHost && (
            <Button onClick={() => wordWarActions.proceedToFinalResults(game.id, self.id)} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : "عرض النتائج النهائية الآن"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (game.gameState === "final_results") {
    const result = game.gameResult;
    if (!result) return <p className="p-4 text-center">جاري تحميل النتائج النهائية...</p>;

    const winnerColor = result.winner === "red" ? "text-rose-600" : "text-indigo-600";
    const loserColor = result.winner === "red" ? "text-indigo-600" : "text-rose-600";
    const winnerTeamPlayers = result.winner === "red" ? teamRedPlayers : teamBluePlayers;
    const loserTeamPlayers = result.winner === "red" ? teamBluePlayers : teamRedPlayers;

    return (
      <Card className="w-full max-w-2xl mx-auto bg-white/80 backdrop-blur">
        <CardHeader className="text-center">
          <Crown className="w-24 h-24 mx-auto text-amber-400" />
          <CardTitle className="text-3xl md:text-4xl">انتهت اللعبة!</CardTitle>
          <CardDescription className="text-lg text-zinc-600">{result.message}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border-2 border-amber-400 bg-amber-50">
            <h3 className={cn("text-2xl font-bold text-center mb-2", winnerColor)}>🏆 الفريق الفائز</h3>
            <div className="space-y-2">
              {winnerTeamPlayers.map((p) => (
                <div key={p.id} className="flex items-center gap-2 p-2 bg-white rounded-md">
                  <Check className="w-5 h-5 text-green-500" />
                  <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8" />
                  <span className="font-semibold text-zinc-800">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 rounded-xl border-2 border-zinc-300 bg-zinc-100">
            <h3 className={cn("text-2xl font-bold text-center mb-2", loserColor)}>💔 الفريق الخاسر</h3>
            <div className="space-y-2">
              {loserTeamPlayers.map((p) => (
                <div key={p.id} className="flex items-center gap-2 p-2 bg-white rounded-md">
                  <ShieldQuestion className="w-5 h-5 text-zinc-500" />
                  <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8" />
                  <span className="font-semibold text-zinc-800">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={() => (window.location.href = "/")} className="w-full">
            العب مرة أخرى
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return renderGameBoard();
}
