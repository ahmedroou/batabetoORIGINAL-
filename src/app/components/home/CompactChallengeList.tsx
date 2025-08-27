'use client';

import * as React from 'react';
import type { Challenge } from '@/types';
import { Button } from '@/components/ui/button';
import { Swords, Users, Clock, Sparkles, Trophy, Loader2, CheckCircle2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNowStrict } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { Timestamp } from 'firebase/firestore';

/**
 * تصميم إبداعي وخفيف مع تحسينات وصول/حركة.
 * متوافق خلفيًا: نفس الـ prop مع خيار onJoin اختياري إن رغبت بتمريره من الأعلى.
 */
export function CompactChallengeList({
  challenges,
  onJoin,
}: {
  challenges: Challenge[];
  onJoin?: (challenge: Challenge) => Promise<void> | void;
}) {
  const { userProfile } = useAuth();
  const [joiningId, setJoiningId] = React.useState<string | null>(null);
  
  // فرز التحديات بحسب اقتراب الانتهاء
  const sorted = React.useMemo(() => {
    return [...(challenges || [])].sort((a, b) => {
      const ea = toDate((a as any).endsAt)?.getTime() ?? Number.POSITIVE_INFINITY;
      const eb = toDate((b as any).endsAt)?.getTime() ?? Number.POSITIVE_INFINITY;
      return ea - eb;
    });
  }, [challenges]);

  const handleJoin = async (ch: Challenge) => {
    if (!onJoin) return;
    setJoiningId(ch.id as any);
    try {
      await onJoin(ch);
    } finally {
      // إذا لم يجرِ تنقّل أو إلغاء تركيب العنصر
      setTimeout(() => setJoiningId((id) => (id === ch.id ? null : id)), 1800);
    }
  };

  if (!sorted.length) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-2" dir="rtl" lang="ar">
      <AnimatePresence initial={false}>
        {sorted.map((challenge, index) => (
          <ChallengeRow
            key={(challenge as any).id}
            challenge={challenge}
            index={index}
            userId={userProfile?.uid}
            joiningId={joiningId}
            onJoin={onJoin ? () => handleJoin(challenge) : undefined}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ————————————————————————————————————————
// عناصر فرعية
// ————————————————————————————————————————

function ChallengeRow({
  challenge,
  index,
  userId,
  joiningId,
  onJoin,
}: {
  challenge: Challenge;
  index: number;
  userId?: string;
  joiningId: string | null;
  onJoin?: () => void;
}) {
  const isParticipant = Boolean(userId && (challenge as any).participantIds?.includes(userId));
  const endsAt = toDate((challenge as any).endsAt);
  const startsAt = toDate((challenge as any).startsAt) || toDate((challenge as any).createdAt);
  const [now, setNow] = React.useState<number>(Date.now());
  const [clientReady, setClientReady] = React.useState(false);

  React.useEffect(() => {
    setClientReady(true);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ended = endsAt ? now >= endsAt.getTime() : false;

  const endsInLabel = endsAt
    ? formatDistanceToNowStrict(endsAt, { locale: ar, addSuffix: true })
    : '—';

  const { progressRatio, urgent } = computeTimeProgress(startsAt, endsAt, now);

  const hasPrize = Boolean((challenge as any).rewardTitle || (challenge as any).prize || (challenge as any).rewards);
  const participants = (challenge as any).participantCount ?? (challenge as any).participantIds?.length ?? 0;
  const maxParticipants = (challenge as any).maxParticipants ?? 0;
  const full = maxParticipants ? participants >= maxParticipants : false;
  const isJoining = joiningId === (challenge as any).id;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0, transition: { delay: index * 0.06 } }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/40 hover:shadow-lg hover:shadow-primary/10"
    >
      {/* هالة زخرفية */}
      <div aria-hidden className="absolute -inset-px rounded-2xl opacity-50">
        <div className="absolute inset-0 rounded-2xl bg-[conic-gradient(from_120deg_at_50%_50%,hsl(var(--primary)/.06),transparent,hsl(var(--secondary)/.06),transparent)] blur-[2px] transition-opacity duration-300 group-hover:opacity-80" />
      </div>

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-secondary/10 shadow-inner">
            <Swords className="h-5 w-5 text-primary" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-bold">{(challenge as any).title ?? 'تحدٍّ'}</p>
              {hasPrize && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                  <Trophy className="h-3.5 w-3.5" /> جوائز
                </span>
              )}
              {isParticipant && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> أنت مشارك
                </span>
              )}
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                <b className="tabular-nums">{participants}</b>
                {maxParticipants ? <span className="tabular-nums">/{maxParticipants}</span> : null}
              </span>

              {clientReady && endsAt && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${ended ? 'bg-destructive/10 text-destructive' : urgent ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-muted/60'}`}>
                  <Clock className="h-3.5 w-3.5" />
                  {ended ? 'انتهى' : `تنتهي ${endsInLabel}`}
                </span>
              )}
            </div>

            {/* تقدّم الزمن حتى الانتهاء */}
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted/70">
              <motion.div
                className={`h-full rounded-full ${ended ? 'bg-destructive' : urgent ? 'bg-amber-500' : 'bg-primary'}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(0, Math.min(100, progressRatio * 100))}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* مؤشّر دائري صغير لتقدم الوقت */}
          {clientReady && endsAt && (
            <TimeDonut progress={progressRatio} urgent={urgent || ended} />
          )}

          <Button
            size="sm"
            className="rounded-2xl"
            disabled={ended || isParticipant || !onJoin || joiningId !== null}
            onClick={onJoin}
            aria-busy={isJoining}
            aria-label={ended ? 'انتهى التحدي' : isParticipant ? 'أنت مشارك' : 'انضم إلى التحدي'}
          >
            {isJoining ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-4 w-4 animate-spin" /> جارِ الانضمام
              </span>
            ) : ended ? (
              'انتهى'
            ) : isParticipant ? (
              'أنت مشارك'
            ) : onJoin ? (
              'انضم'
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Sparkles className="h-4 w-4" /> قريبًا
              </span>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function TimeDonut({ progress, urgent }: { progress: number; urgent?: boolean }) {
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div className="relative hidden sm:block h-9 w-9" aria-hidden>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r="16" fill="none" stroke="hsl(var(--muted-foreground)/.15)" strokeWidth="3" />
        <motion.circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className={urgent ? 'text-destructive' : 'text-primary'}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: p }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[10px] text-muted-foreground">وقت</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border/70 bg-card/60 p-7 text-center">
      <div aria-hidden className="pointer-events-none absolute -inset-px rounded-2xl opacity-60">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--primary)/.12),transparent_70%)]" />
      </div>
      <div className="relative mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-secondary/10">
        <Sparkles className="h-5 w-5 text-primary" />
      </div>
      <p className="font-semibold">لا توجد تحديات نشطة الآن</p>
      <p className="mt-1 text-sm text-muted-foreground">تابع لاحقًا أو أطلق تحدّيًا جديدًا ✨</p>
    </div>
  );
}

// ————————————————————————————————————————
// أدوات مساعدة
// ————————————————————————————————————————

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
    }
  return null;
}

function computeTimeProgress(start: Date | null, end: Date | null, nowMs: number): { progressRatio: number; urgent: boolean } {
  if (!end) return { progressRatio: 0, urgent: false };
  const endMs = end.getTime();
  const startMs = start?.getTime() ?? endMs - 24 * 60 * 60 * 1000; // افتراضي: 24 ساعة نافذة
  const total = Math.max(1, endMs - startMs);
  const elapsed = Math.max(0, Math.min(total, nowMs - startMs));
  const ratio = elapsed / total;
  const remaining = endMs - nowMs;
  const urgent = remaining <= 60_000 * 10; // 10 دقائق أخيرة
  return { progressRatio: ratio, urgent };
}
