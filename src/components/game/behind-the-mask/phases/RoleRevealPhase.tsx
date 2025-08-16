"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Game, Player } from "@/types";
import { AnimatePresence, motion } from "framer-motion";
import { ROLES } from "@/data/mafia-roles";
import { Button } from "@/components/ui/button";
import { transitionToNight } from "@/lib/actions/behind-the-mask";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface RoleRevealPhaseProps {
  game: Game;
  self: Player;
}

const FALLBACK_SECONDS = 15; // احتياطي لو لم يصل timerEndsAt من السيرفر

export function RoleRevealPhase({ game, self }: RoleRevealPhaseProps) {
  const { toast } = useToast();

  const [isFlipped, setIsFlipped] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(FALLBACK_SECONDS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const isHost = game.hostId === self.id;
  const roleDetails = self.role ? ROLES[self.role] : null;

  // مؤقّت متزامن مع السيرفر (اعتمد على mafiaState.timerEndsAt)
  const serverEndMs =
    game.mafiaState?.timerEndsAt?.toMillis() ??
    Date.now() + FALLBACK_SECONDS * 1000;

  // مانع للتشغيل المتكرر
  const didAdvanceRef = useRef(false);

  const secondsRemaining = useCallback(() => {
    const diff = Math.max(0, Math.round((serverEndMs - Date.now()) / 1000));
    return diff;
  }, [serverEndMs]);

  useEffect(() => {
    setTimeLeft(secondsRemaining());
    const t = setInterval(() => setTimeLeft(secondsRemaining()), 1000);
    return () => clearInterval(t);
  }, [secondsRemaining]);

  const handleStartNight = useCallback(async () => {
    if (!isHost || didAdvanceRef.current) return;
    try {
      didAdvanceRef.current = true;
      setIsSubmitting(true);
      await transitionToNight(game.id, self.id);
      // عند النجاح سيتبدّل الـ phase وتتفكك هذه الواجهة.
    } catch (error: any) {
      didAdvanceRef.current = false;
      setIsSubmitting(false);
      toast({
        title: "تعذّر بدء الليل",
        description: error?.message || "حدث خطأ غير متوقّع.",
        variant: "destructive",
      });
    }
  }, [game.id, isHost, self.id, toast]);

  // بدء الليل تلقائيًا للمضيف عند انتهاء المؤقّت
  useEffect(() => {
    if (timeLeft === 0 && isHost) {
      handleStartNight();
    }
  }, [timeLeft, isHost, handleStartNight]);

  // دعم الكيبورد + إمكانية وصول
  const onKeyFlip = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsFlipped(true);
    }
  };

  if (!roleDetails) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 text-white">
        <p className="text-xl font-bold animate-pulse">جاري تحميل دورك...</p>
      </div>
    );
  }

  const mm = Math.floor(timeLeft / 60);
  const ss = (timeLeft % 60).toString().padStart(2, "0");
  const timerEnded = timeLeft <= 0;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white">
      <AnimatePresence mode="wait">
        {!isFlipped ? (
          <motion.div
            key="instruction"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="text-center"
          >
            <h1 className="text-4xl font-bold">اكشف عن هويتك السرّية</h1>
            <p className="text-lg text-muted-foreground mt-2">
              اضغط على البطاقة أو استخدم Enter/Space لمعرفة دورك
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="description"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="text-center max-w-xl"
          >
            <h1 className="text-4xl font-bold">{roleDetails.name}</h1>
            <p className="text-lg text-muted-foreground mt-2">
              {roleDetails.description}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* بطاقة الكشف */}
      <motion.div
        className="perspective-1000 my-8 outline-none"
        onClick={() => setIsFlipped(true)}
        onKeyDown={onKeyFlip}
        role="button"
        tabIndex={0}
        aria-pressed={isFlipped}
        aria-label="اكشف البطاقة"
      >
        <motion.div
          className="relative w-72 h-[450px] md:w-80 md:h-[500px] transform-style-3d cursor-pointer focus-visible:ring-2 ring-offset-2 ring-offset-gray-900 ring-primary rounded-xl"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* الخلف */}
          <div className="absolute w-full h-full backface-hidden bg-gradient-to-br from-gray-800 to-slate-900 rounded-xl border-2 border-primary shadow-lg flex items-center justify-center select-none">
            <h2 className="text-3xl font-bold text-primary">خلف القناع</h2>
          </div>

          {/* الوجه */}
          {!videoError ? (
            <video
              key={roleDetails.id}
              src={`/roles/${roleDetails.id}.mp4`}
              autoPlay={isFlipped}
              muted
              loop
              playsInline
              onError={() => setVideoError(true)}
              className="absolute w-full h-full backface-hidden rotate-y-180 object-cover rounded-xl border-2 border-yellow-400 shadow-2xl"
            >
              متصفحك لا يدعم عرض الفيديو.
            </video>
          ) : (
            <div className="absolute w-full h-full backface-hidden rotate-y-180 rounded-xl border-2 border-yellow-400 shadow-2xl bg-gradient-to-br from-amber-600/30 to-yellow-300/20 flex items-center justify-center">
              <div className="text-center p-6">
                <p className="text-3xl font-extrabold mb-2">{roleDetails.name}</p>
                <p className="text-sm text-yellow-100/80">
                  تعذّر تحميل الفيديو — عرض بديل.
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* مؤقّت + تحكّم المضيف */}
      <div className="text-center">
        <p
          className={cn(
            "text-2xl font-mono",
            timerEnded && "text-emerald-400 animate-pulse"
          )}
          aria-live="polite"
        >
          {timerEnded ? "اكتملت الاستعدادات!" : `الوقت المتبقي: ${mm}:${ss}`}
        </p>

        {isHost ? (
          <Button
            onClick={handleStartNight}
            disabled={isSubmitting || !timerEnded}
            className="mt-4"
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : "بدء الليل"}
          </Button>
        ) : (
          timerEnded && (
            <p className="mt-4 text-lg animate-pulse">
              في انتظار المضيف لبدء الليل...
            </p>
          )
        )}
      </div>
    </div>
  );
}
