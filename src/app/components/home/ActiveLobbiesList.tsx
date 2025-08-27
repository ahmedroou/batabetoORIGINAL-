'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Star, Loader2, Clock, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Game } from '@/types';
import { collection, query, where, orderBy, Timestamp, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { GAME_ICONS, GAME_TYPE_NAMES } from '@/data/icons';

interface ActiveLobbiesListProps {
  onJoin: (id: string) => Promise<void>;
  onLobbiesUpdate: (lobbies: Game[]) => void;
}

export default function ActiveLobbiesList({ onJoin, onLobbiesUpdate }: ActiveLobbiesListProps) {
  const { toast } = useToast();
  const [activeLobbies, setActiveLobbies] = useState<Game[]>([]);
  const [isLoadingLobbies, setIsLoadingLobbies] = useState(true);
  const [joiningLobbyId, setJoiningLobbyId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'games'),
      where('gameState', '==', 'lobby'),
      where('expiresAt', '>', Timestamp.now()),
      orderBy('expiresAt', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const lobbies = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Game[];
        setActiveLobbies(lobbies);
        onLobbiesUpdate(lobbies); //
        setIsLoadingLobbies(false);
      },
      (error: any) => {
        console.error('Error fetching active lobbies:', error);
        toast({
          title: 'خطأ في الاتصال باللعبة',
          description:
            'حدث خطأ في جلب الغرف. قد تحتاج إلى إنشاء فهرس مركب في Firestore.\n' + (error?.message ?? ''),
          variant: 'destructive',
        });
        setIsLoadingLobbies(false);
      }
    );

    return () => unsubscribe();
  }, [toast, onLobbiesUpdate]);

  const handleJoinClick = async (lobbyId: string) => {
    setJoiningLobbyId(lobbyId);
    try {
      await onJoin(lobbyId);
      setTimeout(() => setJoiningLobbyId((id) => (id === lobbyId ? null : id)), 3000);
    } catch (e: any) {
      setJoiningLobbyId(null);
      toast({ title: 'تعذّر الانضمام', description: e?.message ?? 'حاول مجددًا.', variant: 'destructive' });
    }
  };

  const content = useMemo(() => {
    if (isLoadingLobbies) {
      return (
        <div className="space-y-3" aria-busy>
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      );
    }

    if (!activeLobbies.length) {
      return (
        <EmptyState />
      );
    }

    return (
      <AnimatePresence initial={false}>
        {activeLobbies.map((lobby) => (
          <LobbyRow
            key={lobby.id}
            lobby={lobby}
            joiningLobbyId={joiningLobbyId}
            onJoin={() => handleJoinClick(lobby.id)}
          />
        ))}
      </AnimatePresence>
    );
  }, [activeLobbies, isLoadingLobbies, joiningLobbyId, handleJoinClick]);

  return (
    <Card className="relative overflow-hidden" dir="rtl" lang="ar">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          الغرف النشطة
          <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            <Sparkles className="h-3 w-3" />
            {activeLobbies.length || 0}
          </span>
        </CardTitle>
        <CardDescription>انضم إلى أي غرفة متاحة أو أنشئ غرفتك الخاصة.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background to-transparent" />
          <ScrollArea className="h-[360px] pr-4" aria-live="polite">
            <div className="space-y-3">{content}</div>
          </ScrollArea>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-background to-transparent" />
        </div>
      </CardContent>
    </Card>
  );
}

function LobbyRow({
  lobby,
  joiningLobbyId,
  onJoin,
}: {
  lobby: Game;
  joiningLobbyId: string | null;
  onJoin: () => void;
}) {
  const [now, setNow] = useState<number>(() => Date.now());
  const [clientReady, setClientReady] = useState(false);
  useEffect(() => {
    setClientReady(true);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  
  const GameIcon = (GAME_ICONS as any)[lobby.gameType] || Star;
  const players = (lobby as any).players ?? [];
  const hostName = players?.[0]?.name ?? 'غير معروف';
  const maxPlayers = (lobby as any).maxPlayers ?? 8;
  const count = players?.length ?? 0;
  const isFull = count >= maxPlayers;
  const isJoining = joiningLobbyId === lobby.id;

  const expiresAt: Date | null = (lobby as any).expiresAt?.toDate?.() ?? null;
  const { label: timeLeftLabel, isUrgent, progressToExpire } = formatTimeLeft(expiresAt, now);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25 }}
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/40 hover:shadow-lg hover:shadow-primary/10"
    >
      <div aria-hidden className="absolute -inset-px rounded-2xl opacity-40">
        <div className="absolute inset-0 rounded-2xl bg-[conic-gradient(from_0deg_at_50%_50%,hsl(var(--primary)/.08),transparent,transparent,hsl(var(--secondary)/.08),transparent)] blur-sm transition-opacity duration-300 group-hover:opacity-70" />
      </div>

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-secondary/10 shadow-inner">
            <GameIcon className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold">
              {(lobby as any).isDuel
                ? `مبارزة: ${players.map((p: any) => p?.name ?? 'لاعب').join(' ضد ')}`
                : (GAME_TYPE_NAMES as any)[(lobby as any).gameType] || 'لعبة غير معروفة'}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                <b className="tabular-nums">{count}</b>/<span className="tabular-nums">{maxPlayers}</span>
              </span>
              {clientReady && expiresAt && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${isUrgent ? 'bg-destructive/10 text-destructive' : 'bg-muted/60'}`}>
                  <Clock className="h-3.5 w-3.5" />
                  {timeLeftLabel}
                </span>
              )}
              <span className="truncate">المضيف: {hostName}</span>
            </div>

            <div className="mt-2 h-1.5 w-full rounded-full bg-muted/70">
              <motion.div
                className={`h-full rounded-full ${isFull ? 'bg-destructive' : 'bg-primary'}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (count / maxPlayers) * 100)}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {clientReady && expiresAt && (
            <div className="relative hidden sm:block h-9 w-9">
              <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
                <circle cx="18" cy="18" r="16" fill="none" stroke="hsl(var(--muted-foreground)/.15)" strokeWidth="3" />
                <motion.circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="currentColor"
                  className={isUrgent ? 'text-destructive' : 'text-primary'}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: progressToExpire }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </svg>
              <div className="absolute inset-0 grid place-items-center text-[10px] text-muted-foreground">وقت</div>
            </div>
          )}

          <Button
            onClick={onJoin}
            size="sm"
            className="rounded-2xl"
            disabled={Boolean(joiningLobbyId) || isFull}
            aria-busy={isJoining}
            aria-label={isFull ? 'الغرفة ممتلئة' : isJoining ? 'جارِ الانضمام' : 'انضمام'}
          >
            {isJoining ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-4 w-4 animate-spin" /> جارِ الانضمام
              </span>
            ) : isFull ? (
              'ممتلئة'
            ) : (
              'انضمام'
            )}
          </Button>
        </div>
      </div>
    </motion.div>
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
      <p className="font-semibold">لا توجد غرف نشطة حاليًا</p>
      <p className="mt-1 text-sm text-muted-foreground">كن أول من ينشئ غرفة جديدة واستدعِ أصدقاءك! ✨</p>
    </div>
  );
}

function formatTimeLeft(expiresAt: Date | null, nowMs: number): { label: string; isUrgent: boolean; progressToExpire: number } {
  if (!expiresAt) return { label: '—', isUrgent: false, progressToExpire: 0 };
  const total = Math.max(0, expiresAt.getTime() - nowMs);
  const isUrgent = total <= 60_000;

  const mins = Math.floor(total / 60_000);
  const secs = Math.floor((total % 60_000) / 1000);

  let label = '';
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    label = `${hours}س ${remMins}د`;
  } else if (mins > 0) {
    label = `${mins}د ${secs.toString().padStart(2, '0')}ث`;
  } else {
    label = `${secs}ث`;
  }
  const ASSUMED_WINDOW_MS = 15 * 60_000;
  const timeToExpire = total;
  const progressToExpire = 1 - Math.min(1, timeToExpire / ASSUMED_WINDOW_MS);

  return { label, isUrgent, progressToExpire };
}
