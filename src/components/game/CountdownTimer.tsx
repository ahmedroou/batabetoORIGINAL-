"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TimerIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  handleTimeout as handleEducatedMerchantTimeout,
} from "@/lib/actions/educated-merchant";
import { handleTimeout as handlePrisonTimeout } from "@/lib/actions/prison";
import { handleTimeout as handleTrapAnswerTimeout } from "@/lib/actions/trap-answer";
import type { Game } from "@/types";

interface CountdownTimerProps {
  gameId: string;
  gameType: Game["gameType"];
  expiryTimestamp: number; // ms
  selfId: string;
  isHost: boolean;
  /** Optional className to style/position the wrapper */
  className?: string;
  /** Seconds considered as low time (adds pulse + ARIA assertive) */
  lowTimeThreshold?: number; // default 5
  /** Controls size of the timer chip */
  size?: "sm" | "md" | "lg"; // default md
  /** Called right after we successfully trigger the server timeout action */
  onExpire?: () => void;
}

/**
 * Production-ready countdown timer with:
 * - Drift-free ticking (separate precise setTimeout for expiry, lightweight interval for display)
 * - Idempotent, de-bounced server action call per expiry
 * - Instant expiry handling even if the component mounts after deadline
 * - ARIA + a11y improvements and visual progress ring
 * - Customizable size and low-time threshold
 */
export function CountdownTimer({
  gameId,
  gameType,
  expiryTimestamp,
  selfId,
  isHost,
  className,
  lowTimeThreshold = 5,
  size = "md",
  onExpire,
}: CountdownTimerProps) {
  // Compute initial seconds remaining at mount (clamped >= 0)
  const initialSeconds = useMemo(() => {
    if (!expiryTimestamp) return 0;
    return Math.max(0, Math.ceil((expiryTimestamp - Date.now()) / 1000));
  }, [expiryTimestamp]);

  const [secondsLeft, setSecondsLeft] = useState<number>(initialSeconds);

  // Track if we've already fired the timeout action for this expiryTimestamp
  const firedForKeyRef = useRef<string>("");
  const firingRef = useRef<boolean>(false);
  const vibratedRef = useRef<boolean>(false);

  // Stable unique key per deadline to reset internal guards when the timestamp changes
  const deadlineKey = String(expiryTimestamp);

  // Keep a frozen total duration to drive the progress ring consistently for this round
  const totalSecondsRef = useRef<number>(initialSeconds || 1);
  useEffect(() => {
    totalSecondsRef.current = initialSeconds || 1;
  }, [initialSeconds, deadlineKey]);

  // Map game type to server action and whether host gating is required
  const action = useMemo(() => {
    const actions: Partial<Record<Game["gameType"], (gid: string, sid: string) => Promise<void> | void>> = {
      "trap-answer": handleTrapAnswerTimeout,
      "educated-merchant": handleEducatedMerchantTimeout,
      prison: handlePrisonTimeout,
    };
    return actions[gameType];
  }, [gameType]);

  const requiresHost = gameType === "educated-merchant" || gameType === "prison";

  // Kick off expiry immediately if we're already past the deadline on mount/update
  useEffect(() => {
    if (!expiryTimestamp) return;
    if (Date.now() >= expiryTimestamp) {
      void triggerServerTimeout();
      setSecondsLeft(0);
    } else {
      // Reset counters when deadline changes
      setSecondsLeft(Math.max(0, Math.ceil((expiryTimestamp - Date.now()) / 1000)));
      firedForKeyRef.current = "";
      firingRef.current = false;
      vibratedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineKey]);

  // Lightweight ticking for UI (every 250ms), rounded for display
  useEffect(() => {
    if (!expiryTimestamp) return;

    const tick = () => {
      const msLeft = Math.max(0, expiryTimestamp - Date.now());
      const sec = Math.ceil(msLeft / 1000);
      setSecondsLeft(sec);

      // Light haptic feedback once when entering low-time
      if (sec > 0 && sec <= lowTimeThreshold && !vibratedRef.current) {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          // Fire and forget; some browsers ignore
          try {
            // @ts-ignore - vibrate is not in all TS lib targets
            navigator.vibrate?.(60);
          } catch {}
        }
        vibratedRef.current = true;
      }
    };

    const interval = setInterval(tick, 250);
    tick(); // initialize immediately for snappy UI
    return () => clearInterval(interval);
  }, [expiryTimestamp, lowTimeThreshold]);

  // Separate precise one-shot to trigger the server action exactly at deadline
  useEffect(() => {
    if (!expiryTimestamp) return;
    const msUntil = Math.max(0, expiryTimestamp - Date.now());
    const timeout = setTimeout(() => void triggerServerTimeout(), msUntil);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineKey]);

  async function triggerServerTimeout() {
    if (!action) return; // Unknown game type
    if (requiresHost && !isHost) return; // Respect host gating

    // Ensure we only fire once per unique deadline
    if (firedForKeyRef.current === deadlineKey || firingRef.current) return;
    firingRef.current = true;

    try {
      await action(gameId, selfId);
      firedForKeyRef.current = deadlineKey;
      onExpire?.();
    } catch (err) {
      // Swallow to avoid React error boundaries; you can add logging here
      // console.error("CountdownTimer timeout action failed", err);
    } finally {
      firingRef.current = false;
    }
  }

  if (!expiryTimestamp || secondsLeft <= 0) return null;

  const isLowTime = secondsLeft <= lowTimeThreshold;
  const total = Math.max(1, totalSecondsRef.current);
  const pctRemaining = Math.min(1, Math.max(0, secondsLeft / total));

  // Size presets
  const sizeMap = {
    sm: { ring: 28, stroke: 4, icon: "h-4 w-4", text: "text-sm" },
    md: { ring: 36, stroke: 4, icon: "h-5 w-5", text: "text-base" },
    lg: { ring: 44, stroke: 5, icon: "h-6 w-6", text: "text-lg" },
  } as const;
  const S = sizeMap[size];
  const r = (S.ring - S.stroke) / 2;
  const C = 2 * Math.PI * r;
  const dash = C * pctRemaining;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-2 shadow-sm transition-all",
        isLowTime ? "bg-red-500 text-white animate-pulse" : "bg-muted",
        className
      )}
      role="timer"
      aria-live={isLowTime ? "assertive" : "polite"}
      aria-label={`Countdown: ${secondsLeft} seconds remaining`}
      data-testid="countdown-timer"
    >
      <div className="relative" style={{ width: S.ring, height: S.ring }} aria-hidden>
        <svg width={S.ring} height={S.ring} className="block">
          <circle
            cx={S.ring / 2}
            cy={S.ring / 2}
            r={r}
            strokeWidth={S.stroke}
            className={cn(isLowTime ? "opacity-30" : "opacity-40")}
            stroke="currentColor"
            fill="none"
            style={{ strokeDasharray: C, strokeDashoffset: 0 }}
          />
          <circle
            cx={S.ring / 2}
            cy={S.ring / 2}
            r={r}
            strokeWidth={S.stroke}
            stroke="currentColor"
            fill="none"
            strokeLinecap="round"
            style={{ strokeDasharray: `${dash} ${C - dash}`, transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <TimerIcon className={cn(S.icon)} />
        </div>
      </div>

      <div className={cn("font-mono font-bold tabular-nums", S.text)}>
        {String(secondsLeft).padStart(2, "0")}
      </div>

      {/* Visually hidden live region for screen readers to announce when low time engages */}
      <span className="sr-only" aria-live="assertive">
        {isLowTime ? "Hurry, only a few seconds left" : ""}
      </span>
    </div>
  );
}
