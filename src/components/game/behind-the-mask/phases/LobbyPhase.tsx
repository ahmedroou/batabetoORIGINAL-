"use client";

import { useState, useMemo, useEffect } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import { PlayerAvatar } from '../../PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Copy, Check, UserX, Settings, Loader2, Save, ArrowRight, VenetianMask } from 'lucide-react';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { leaveGame, kickPlayerFromLobby } from '@/lib/actions/room';
import { startGame, updateMafiaSettings } from '@/lib/actions/behind-the-mask';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { getRoleDistribution, ROLES } from '@/data/mafia-roles';

interface LobbyPhaseProps {
  game: Game;
  self: Player;
}

const DEFAULT_SETTINGS = { nightTime: 25, dayTime: 180 } as const;
const LIMITS = {
  nightTime: { min: 10, max: 300 },
  dayTime: { min: 60, max: 900 },
} as const;

function clampNum(v: number, min: number, max: number) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function LobbyPhase({ game, self }: LobbyPhaseProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { getSocialRankForUser } = useAuth();
  const isHost = game.hostId === self.id;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [lobbySettings, setLobbySettings] = useState(
    game.mafiaState?.settings || { ...DEFAULT_SETTINGS }
  );

  // Stay in sync with server updates
  useEffect(() => {
    setLobbySettings(game.mafiaState?.settings || { ...DEFAULT_SETTINGS });
  }, [game.mafiaState?.settings]);

  const activePlayers = useMemo(
    () => game?.players.filter((p) => p.status !== 'left') || [],
    [game?.players]
  );

  const rolePreview = useMemo(() => {
    const roles = getRoleDistribution(activePlayers.length);
    const counts: Record<string, number> = {};
    roles.forEach((r) => (counts[r] = (counts[r] || 0) + 1));
    return Object.entries(counts)
      .sort((a, b) => (ROLES[b[0] as keyof typeof ROLES].team > ROLES[a[0] as keyof typeof ROLES].team ? 1 : -1))
      .map(([role, count]) => ({ key: role, count, info: ROLES[role as keyof typeof ROLES] }));
  }, [activePlayers.length]);

  const handleLeaveGame = async () => {
    setIsSubmitting(true);
    const result = await leaveGame(game.id, self.id);
    if (result.success) {
      try { sessionStorage.removeItem(`player-${game.id}`); } catch {}
      router.push('/');
      toast({ title: 'لقد غادرت الغرفة.' });
    } else {
      toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const handleKickPlayer = async () => {
    if (!playerToKick || !isHost) return;
    setIsSubmitting(true);
    const result = await kickPlayerFromLobby(game.id, self.id, playerToKick.id);
    if (result?.error) {
      toast({ title: 'خطأ في الطرد', description: result.error, variant: 'destructive' });
    } else {
      toast({ title: 'تم الطرد', description: `تم طرد اللاعب ${playerToKick.name}.` });
    }
    setPlayerToKick(null);
    setIsSubmitting(false);
  };

  const handleStartGame = async () => {
    if (!isHost) return;
    if (activePlayers.length < 4) {
      toast({ title: 'عدد اللاعبين غير كافٍ', description: 'اللعبة تحتاج 4 لاعبين على الأقل.' });
      return;
    }
    setIsSubmitting(true);
    try {
      await startGame(game.id, self.id);
      toast({ title: 'تم بدء اللعبة' });
    } catch (e: any) {
      toast({ title: 'خطأ', description: e?.message || 'تعذر بدء اللعبة', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveLobbySettings = async () => {
    if (!isHost) return;
    const next = {
      nightTime: clampNum(lobbySettings.nightTime ?? DEFAULT_SETTINGS.nightTime, LIMITS.nightTime.min, LIMITS.nightTime.max),
      dayTime: clampNum(lobbySettings.dayTime ?? DEFAULT_SETTINGS.dayTime, LIMITS.dayTime.min, LIMITS.dayTime.max),
    };
    setLobbySettings(next);
    setIsSubmitting(true);
    try {
      await updateMafiaSettings(game.id, self.id, next as any);
      toast({ title: 'تم حفظ الإعدادات' });
    } catch (e: any) {
      toast({ title: 'خطأ', description: e?.message || 'تعذر حفظ الإعدادات', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
      setIsSettingsOpen(false);
    }
  };

  const onCopy = async () => {
    try {
      setIsCopying(true);
      await navigator.clipboard.writeText(game.id);
    } catch {
      // no-op
    } finally {
      setTimeout(() => setIsCopying(false), 1200);
    }
  };

  return (
    <>
      <Card className="w-full max-w-md animate-bounce-in">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">لوبي خلف القناع</CardTitle>
          <CardDescription>ادعُ أصدقاءك. يمكن للمضيف ضبط إعدادات اللعبة قبل البدء.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Room Id */}
          <div className="flex gap-2">
            <Input value={game.id} readOnly className="text-center tracking-widest font-mono text-lg h-12 flex-grow" />
            <TooltipProvider>
              <Tooltip open={isCopying}>
                <TooltipTrigger asChild>
                  <Button onClick={onCopy} size="lg" variant="secondary" className="px-4">
                    {isCopying ? <Check /> : <Copy />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>تم النسخ!</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Settings */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className='font-bold text-base'>إعدادات اللعبة</Label>
              {isHost && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSettingsOpen((v) => !v)}
                  aria-expanded={isSettingsOpen}
                  aria-controls="lobby-settings"
                >
                  <Settings className={cn('w-5 h-5', isSettingsOpen && 'animate-spin')} />
                </Button>
              )}
            </div>

            <AnimatePresence initial={false}>
              {isSettingsOpen && (
                <motion.div
                  id="lobby-settings"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="p-4 border rounded-lg space-y-4 mt-1 bg-muted/50 overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="night-time">وقت الليل (ث)</Label>
                      <Input
                        id="night-time"
                        type="number"
                        inputMode="numeric"
                        min={LIMITS.nightTime.min}
                        max={LIMITS.nightTime.max}
                        value={lobbySettings.nightTime ?? ''}
                        disabled={!isHost}
                        onChange={(e) =>
                          setLobbySettings((s) => ({
                            ...s,
                            nightTime: clampNum(parseInt(e.target.value, 10), LIMITS.nightTime.min, LIMITS.nightTime.max),
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="day-time">وقت النهار (ث)</Label>
                      <Input
                        id="day-time"
                        type="number"
                        inputMode="numeric"
                        min={LIMITS.dayTime.min}
                        max={LIMITS.dayTime.max}
                        value={lobbySettings.dayTime ?? ''}
                        disabled={!isHost}
                        onChange={(e) =>
                          setLobbySettings((s) => ({
                            ...s,
                            dayTime: clampNum(parseInt(e.target.value, 10), LIMITS.dayTime.min, LIMITS.dayTime.max),
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* Role preview based on player count */}
                  <div className="rounded-md border bg-background/40">
                    <div className="px-3 py-2 text-sm font-semibold flex items-center gap-2"><VenetianMask className="w-4 h-4"/> توزيع الأدوار المتوقع ({activePlayers.length} لاعب)</div>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {rolePreview.map(({ key, count, info }) => (
                        <div key={key} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                          <div className="text-sm font-medium">{info.name}</div>
                          <div className={cn('text-xs font-bold px-2 py-0.5 rounded', info.team === 'mafia' ? 'bg-red-500/20' : 'bg-emerald-500/20')}>
                            ×{count}
                          </div>
                        </div>
                      ))}
                      {rolePreview.length === 0 && (
                        <p className="text-sm text-muted-foreground">أضِف لاعبين لرؤية توزيع الأدوار.</p>
                      )}
                    </div>
                  </div>

                  <Button onClick={handleSaveLobbySettings} disabled={isSubmitting || !isHost} className="w-full">
                    {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} حفظ الإعدادات
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Players */}
          <div className="space-y-2">
            <Label>اللاعبون ({activePlayers.length})</Label>
            <div className="rounded-md border p-4 space-y-3 bg-muted/50 min-h-[120px]">
              {activePlayers.map((p) => {
                const rank = getSocialRankForUser(p.leaderboardPoints);
                const RankIcon = rank?.icon;
                return (
                  <div key={p.id} className="font-medium flex items-center justify-between gap-3 animate-fade-in">
                    <div className="flex items-center gap-3">
                      <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full shadow-md" temporaryTitle={p.temporaryTitle} />
                      <div>
                        <p className="font-bold text-lg">{p.name}</p>
                        {rank && RankIcon && (
                          <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                            <RankIcon className="w-3 h-3 text-amber-500" />
                            {rank.name}
                          </p>
                        )}
                      </div>
                    </div>
                    {isHost && p.id !== self?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setPlayerToKick(p)}
                        aria-label={`طرد ${p.name}`}
                      >
                        <UserX className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {activePlayers.length === 0 && (
                <p className="text-sm text-muted-foreground">لا يوجد لاعبون بعد.</p>
              )}
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex-col gap-2">
          {isHost ? (
            <Button
              onClick={handleStartGame}
              disabled={isSubmitting || activePlayers.length < 4}
              className="w-full"
              size="lg"
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              {isSubmitting ? '...' : activePlayers.length < 4 ? `تحتاج ${4 - activePlayers.length} لاعبين على الأقل` : 'ابدأ اللعبة'}
            </Button>
          ) : (
            <p className="text-center text-muted-foreground p-4 bg-muted/50 rounded-md animate-pulse">في انتظار صاحب الغرفة لبدء اللعبة...</p>
          )}

          <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting}>
            <LogOut className="mr-2 h-4 w-4" /> {isSubmitting ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
          </Button>
        </CardFooter>
      </Card>

      {/* Kick confirm */}
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
            <AlertDialogAction onClick={handleKickPlayer} disabled={isSubmitting} className={buttonVariants({ variant: 'destructive' })}>
              {isSubmitting ? 'جاري الطرد...' : 'نعم، قم بالطرد'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
