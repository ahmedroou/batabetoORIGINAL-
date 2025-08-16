"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { Game, Player } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { submitVote, processDay } from "@/lib/actions/behind-the-mask";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  CheckCircle,
  Gavel,
  Skull,
  Ban,
  User,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";

interface VotingPhaseProps {
  game: Game;
  self: Player;
}

export function VotingPhase({ game, self }: VotingPhaseProps) {
  const { toast } = useToast();

  const isHost = game.hostId === self.id;
  const canVote = self.status === "alive";
  const hasVoted = !!game.mafiaState?.votes?.[self.id];

  const alivePlayers = useMemo(
    () => game.players.filter((p) => p.status === "alive"),
    [game.players]
  );

  const votes = game.mafiaState?.votes || {};

  // عدّ الأصوات لكل هدف (بما فيها التخطي null)
  const { voteCounts, skipCount } = useMemo(() => {
    const counts: Record<string, number> = {};
    let skips = 0;
    Object.entries(votes).forEach(([voterId, targetId]) => {
      // احتسب فقط أصوات الأحياء (لو مات المصوّت خلال اليوم لا يُحسب)
      const voterAlive = alivePlayers.some((p) => p.id === voterId && p.status === "alive");
      if (!voterAlive) return;

      if (targetId === null) {
        skips += 1;
      } else if (targetId) {
        counts[targetId] = (counts[targetId] || 0) + 1;
      }
    });
    return { voteCounts: counts, skipCount: skips };
  }, [votes, alivePlayers]);

  // التقدّم: يُعتبر من صوّت بمن فيهم من اختار "تخطي"
  const { submitted, totalEligible, allDone } = useMemo(() => {
    const eligible = alivePlayers.length;
    const submittedCount = alivePlayers.reduce((acc, p) => {
      return acc + (votes.hasOwnProperty(p.id) ? 1 : 0);
    }, 0);
    return {
      submitted: submittedCount,
      totalEligible: eligible,
      allDone: submittedCount === eligible && eligible > 0,
    };
  }, [alivePlayers, votes]);

  // اختيار
  const [selectedTargetId, setSelectedTargetId] = useState<string | "skip" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVoteSelection = (targetId: string | "skip") => {
    if (hasVoted || isSubmitting || !canVote) return;
    setSelectedTargetId(targetId);
  };

  const handleSubmit = async () => {
    if (hasVoted || !canVote) return;
    if (selectedTargetId === null) {
      toast({ title: "اختر هدفًا أولًا", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await submitVote(
        game.id,
        self.id,
        selectedTargetId === "skip" ? null : (selectedTargetId as string)
      );
      toast({ title: "تم تسجيل صوتك." });
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error?.message || "فشل إرسال التصويت.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // مؤقّت متزامن مع السيرفر
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const end = game.mafiaState?.timerEndsAt?.toMillis();
    return end ? Math.max(0, Math.round((end - Date.now()) / 1000)) : 0;
  });

  const didProcessRef = useRef(false);

  const handleProcessDay = useCallback(async () => {
    if (!isHost || didProcessRef.current) return;
    didProcessRef.current = true;
    try {
      await processDay(game.id, self.id);
    } catch (e) {
      // إبقاء الـ ref مفعّلاً كي لا ندخل حلقة استدعاءات
      console.error("Failed to process day:", e);
    }
  }, [game.id, self.id, isHost]);

  useEffect(() => {
    if (!game.mafiaState?.timerEndsAt) return;
    const endTime = game.mafiaState.timerEndsAt.toMillis();

    const tick = () => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) handleProcessDay();
    };

    const t = setInterval(tick, 1000);
    tick();
    return () => clearInterval(t);
  }, [game.mafiaState?.timerEndsAt, handleProcessDay]);

  // السماح للمضيف بالانتقال مبكرًا لو اكتمل التصويت
  useEffect(() => {
    if (allDone) handleProcessDay();
  }, [allDone, handleProcessDay]);

  const mm = Math.floor(timeLeft / 60);
  const ss = (timeLeft % 60).toString().padStart(2, "0");
  const timeProgress = useMemo(() => {
    const dayDuration = game.mafiaState?.settings?.dayTime || 180;
    return Math.min(100, Math.max(0, (timeLeft / dayDuration) * 100));
  }, [timeLeft, game.mafiaState?.settings?.dayTime]);

  const targetablePlayers = alivePlayers; // تُركت كما هي — يمكن تقييدها إن رغبت

  const headerDescription = (
    <>
      اختر من تعتقد أنه من الأشرار لإعدامه.
      {" "}
      تبقى{" "}
      <span className="font-bold inline-flex items-center gap-1">
        <Clock className="w-4 h-4" />
        {mm}:{ss}
      </span>
      {" "}ث.
    </>
  );

  return (
    <Card className="w-full max-w-4xl bg-red-50/90 backdrop-blur-sm border-red-200">
      <CardHeader className="text-center">
        <Gavel className="w-16 h-16 mx-auto text-red-700" />
        <CardTitle className="text-4xl font-bold text-gray-800">
          مرحلة التصويت
        </CardTitle>
        <CardDescription className="text-lg">{headerDescription}</CardDescription>

        <div className="mt-4 space-y-1">
          <Progress
            value={timeProgress}
            className={cn(
              "h-1 w-full bg-red-100",
              timeLeft < 10 && "[&>*]:bg-red-500 [&>*]:animate-pulse"
            )}
          />
          <div className="text-sm text-gray-700">
            التقدّم:{" "}
            <span className="font-semibold">
              {submitted}/{totalEligible}
            </span>{" "}
            ({Math.round((submitted / Math.max(1, totalEligible)) * 100)}%)
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-6">
        <AnimatePresence mode="wait">
          {!canVote ? (
            <motion.div
              key="dead"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="text-center p-8"
            >
              <Skull className="w-20 h-20 text-gray-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold">لا يمكنك التصويت</h2>
              <p className="text-muted-foreground">لقد تم القضاء عليك.</p>
            </motion.div>
          ) : hasVoted ? (
            <motion.div
              key="voted"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="text-center p-8"
            >
              <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold">تم تسجيل صوتك!</h2>
              <p className="text-muted-foreground animate-pulse">
                في انتظار بقية اللاعبين...
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="choose"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {targetablePlayers.map((player) => (
                  <motion.button
                    key={player.id}
                    type="button"
                    onClick={() => handleVoteSelection(player.id)}
                    className={cn(
                      "p-3 rounded-lg border-2 bg-white/80 cursor-pointer transition-all duration-200 text-center space-y-2",
                      selectedTargetId === player.id
                        ? "border-primary scale-105 shadow-lg shadow-primary/20"
                        : "border-gray-300 hover:border-primary/50"
                    )}
                    whileHover={{ y: -5 }}
                    aria-pressed={selectedTargetId === player.id}
                    aria-label={`التصويت لـ ${player.name}`}
                  >
                    <PlayerAvatar
                      avatarId={player.avatarId}
                      className="w-24 h-24 mx-auto"
                    />
                    <p className="font-bold text-lg">{player.name}</p>
                    <div className="text-xs inline-flex items-center gap-1 text-gray-600">
                      <User className="w-3 h-3" />
                      {voteCounts[player.id] || 0}
                    </div>
                  </motion.button>
                ))}

                {/* بطاقة التخطي */}
                <motion.button
                  type="button"
                  onClick={() => handleVoteSelection("skip")}
                  className={cn(
                    "p-3 rounded-lg border-2 bg-white/80 cursor-pointer transition-all duration-200 text-center space-y-2",
                    selectedTargetId === "skip"
                      ? "border-primary scale-105 shadow-lg shadow-primary/20"
                      : "border-gray-300 hover:border-primary/50"
                  )}
                  whileHover={{ y: -5 }}
                  aria-pressed={selectedTargetId === "skip"}
                  aria-label="تخطي التصويت"
                >
                  <div className="w-24 h-24 mx-auto rounded-full border flex items-center justify-center">
                    <Ban className="w-10 h-10 text-gray-700" />
                  </div>
                  <p className="font-bold text-lg">تخطي</p>
                  <div className="text-xs inline-flex items-center gap-1 text-gray-600">
                    <User className="w-3 h-3" />
                    {skipCount || 0}
                  </div>
                </motion.button>
              </div>

              <div className="flex justify-center">
                <Button
                  onClick={handleSubmit}
                  disabled={!selectedTargetId || isSubmitting}
                  size="lg"
                  className="w-full max-w-xs"
                >
                  {isSubmitting ? (
                    <Loader2 className="animate-spin" />
                  ) : selectedTargetId === "skip" ? (
                    "تأكيد التخطي"
                  ) : (
                    `تأكيد التصويت على ${
                      targetablePlayers.find((p) => p.id === selectedTargetId)
                        ?.name || ""
                    }`
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
