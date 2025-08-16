
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import { PlayerAvatar } from '../../PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Copy, Check, UserX, Settings, Loader2, Save, ArrowRight, Shield, Clock3, Users2, Wand2, Filter } from 'lucide-react';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { leaveGame, kickPlayerFromLobby } from '@/lib/actions/room';
import { startTrapAnswerGame, updateGameSettings } from '@/lib/actions/trap-answer';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { getTrapAnswerCategories } from '@/lib/actions/admin/settings';

interface LobbyPhaseProps {
  game: Game;
  self: Player;
}

// Helpers
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const fmtMin = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export function TrapAnswerLobby({ game, self }: LobbyPhaseProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { getSocialRankForUser } = useAuth();
  const isHost = game.hostId === self.id;

  const [busyLeavingOrKicking, setBusyLeavingOrKicking] = useState(false);
  const [busyStarting, setBusyStarting] = useState(false);
  const [busySaving, setBusySaving] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [filterText, setFilterText] = useState('');

  const initialSettings = game.trapAnswerState?.settings || { rounds: 10, answerTime: 60, categories: [] };
  const [lobbySettings, setLobbySettings] = useState(initialSettings);

  const [roundsInput, setRoundsInput] = useState<string>(String(initialSettings.rounds ?? 10));
  const [answerInput, setAnswerInput] = useState<string>(String(initialSettings.answerTime ?? 60));

  const [allCategories, setAllCategories] = useState<string[]>([]);

  useEffect(() => {
    const next = game.trapAnswerState?.settings;
    if (next) {
      setLobbySettings(next);
      setRoundsInput(String(next.rounds ?? ''));
      setAnswerInput(String(next.answerTime ?? ''));
    }
  }, [game.trapAnswerState?.settings]);

  useEffect(() => {
    let cancelled = false;
    if (isHost) {
      getTrapAnswerCategories().then(res => {
        if (!cancelled && res?.success && Array.isArray(res.categories)) setAllCategories(res.categories);
      });
    }
    return () => { cancelled = true; };
  }, [isHost]);

  const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);

  const currentRounds = useMemo(() => {
    const n = parseInt(roundsInput, 10);
    return Number.isFinite(n) ? n : lobbySettings.rounds || 10;
  }, [roundsInput, lobbySettings.rounds]);

  const currentAnswerTime = useMemo(() => {
    const n = parseInt(answerInput, 10);
    return Number.isFinite(n) ? n : lobbySettings.answerTime || 60;
  }, [answerInput, lobbySettings.answerTime]);

  const estimatedSeconds = useMemo(() => {
    const perRound = clamp(currentAnswerTime, 10, 600) + clamp(currentAnswerTime, 10, 600) + 8;
    return (currentRounds || 10) * perRound;
  }, [currentAnswerTime, currentRounds]);

  const copyGameIdOrLink = useCallback(async () => {
    try {
      setIsCopying(true);
      const share = (typeof window !== 'undefined' && window?.location?.origin)
        ? `${window.location.origin}/join/${game.id}`
        : game.id;
      await navigator.clipboard.writeText(share);
      toast({ title: 'تم النسخ!', description: 'تم نسخ رابط الدعوة إلى الحافظة.' });
    } catch {
      try {
        await navigator.clipboard.writeText(game.id);
        toast({ title: 'تم النسخ!', description: 'تم نسخ رقم الغرفة.' });
      } catch {}
    } finally {
      setTimeout(() => setIsCopying(false), 1400);
    }
  }, [game.id, toast]);

  const handleLeaveGame = async () => {
    setBusyLeavingOrKicking(true);
    const result = await leaveGame(game.id, self.id);
    if (result.success) {
      try { sessionStorage.removeItem(`player-id-${game.id}`); } catch {}
      router.push('/');
      toast({ title: 'لقد غادرت الغرفة.' });
    } else {
      toast({ title: 'خطأ', description: result.error, variant: "destructive" });
    }
    setBusyLeavingOrKicking(false);
  };

  const handleKickPlayer = async () => {
    if (!playerToKick || !isHost) return;
    setBusyLeavingOrKicking(true);
    const result = await kickPlayerFromLobby(game.id, self.id, playerToKick.id);
    if (result.error) {
      toast({ title: "خطأ في الطرد", description: result.error, variant: "destructive" });
    } else {
      toast({ title: "نجاح", description: `تم طرد اللاعب ${playerToKick.name}.` });
    }
    setPlayerToKick(null);
    setBusyLeavingOrKicking(false);
  };

  const handleStartGame = async () => {
    if (!isHost) return;
    setBusyStarting(true);
    try {
      await startTrapAnswerGame(game.id, self.id);
    } catch (e: any) {
      toast({ title: 'خطأ', description: e?.message || 'تعذر بدء اللعبة', variant: 'destructive' });
    } finally {
      setBusyStarting(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!isHost) return;
    setBusySaving(true);
    try {
      const rStr = (roundsInput ?? '').trim();
      const aStr = (answerInput ?? '').trim();
      if (rStr === '' || aStr === '') {
        toast({ title: 'حقول ناقصة', description: 'املأ عدد الجولات ووقت الإجابة قبل الحفظ.', variant: 'destructive' });
        setBusySaving(false);
        return;
      }
      const rParsed = parseInt(rStr, 10);
      const aParsed = parseInt(aStr, 10);
      if (!Number.isFinite(rParsed) || !Number.isFinite(aParsed)) {
        toast({ title: 'قيم غير صالحة', description: 'يرجى إدخال أرقام صحيحة.', variant: 'destructive' });
        setBusySaving(false);
        return;
      }
      const safeRounds = clamp(rParsed, 1, 50);
      const safeAnswer = clamp(aParsed, 10, 600);
      const safeCats = Array.isArray(lobbySettings.categories) ? lobbySettings.categories.filter(Boolean) : [];

      await updateGameSettings(game.id, self.id, { rounds: safeRounds, answerTime: safeAnswer, categories: safeCats });

      setLobbySettings(prev => ({ ...prev, rounds: safeRounds, answerTime: safeAnswer }));
      setRoundsInput(String(safeRounds));
      setAnswerInput(String(safeAnswer));

      toast({ title: "تم حفظ الإعدادات" });
      setIsSettingsOpen(false);
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message || 'تعذر حفظ الإعدادات', variant: "destructive" });
    } finally {
      setBusySaving(false);
    }
  };

  const applyPreset = (rounds: number, answerTime: number) => {
    if (!isHost) return;
    setLobbySettings(prev => ({ ...prev, rounds, answerTime }));
    setRoundsInput(String(rounds));
    setAnswerInput(String(answerTime));
  };

  const toggleAllCategories = (on: boolean) => {
    if (!isHost) return;
    setLobbySettings(prev => ({ ...prev, categories: on ? [...allCategories] : [] }));
  };

  const toggleRandomCategories = (count: number) => {
    if (!isHost) return;
    const shuffled = [...allCategories].sort(() => Math.random() - 0.5).slice(0, Math.max(0, Math.min(count, allCategories.length)));
    setLobbySettings(prev => ({ ...prev, categories: shuffled }));
  };

  const canStart = isHost && activePlayers.length >= 2;
  
  const startLabel = !isHost
    ? 'في انتظار صاحب الغرفة لبدء اللعبة...'
    : activePlayers.length < 2
      ? `تحتاج ${2 - activePlayers.length} لاعبين على الأقل`
      : 'ابدأ اللعبة';

  return (
    <>
      <Card className="w-full max-w-2xl animate-pop-in shadow-lg border-2">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl">لوبي الجواب المفخخ</CardTitle>
          <CardDescription className="flex flex-col items-center gap-1">
            <span className="text-sm">ادعُ أصدقاءك. اللعبة تحتاج لاعبين اثنين على الأقل.</span>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Users2 className="w-4 h-4"/> لاعبين: {activePlayers.length}</span>
              <span className="inline-flex items-center gap-1"><Clock3 className="w-4 h-4"/> مدة تقديرية: ~{fmtMin(estimatedSeconds)}</span>
              <span className="inline-flex items-center gap-1"><Shield className="w-4 h-4"/> المضيف: {isHost ? 'أنت' : 'شخص آخر'}</span>
            </div>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex gap-2">
            <Input value={game.id} readOnly className="text-center tracking-widest font-mono text-lg h-12 flex-grow" />
            <TooltipProvider>
              <Tooltip open={isCopying}>
                <TooltipTrigger asChild>
                  <Button onClick={copyGameIdOrLink} size="lg" variant="secondary" className="px-4" aria-label="نسخ رابط الدعوة">
                    {isCopying ? <Check /> : <Copy />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>انسخ رابط الدعوة</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className='font-bold text-base'>إعدادات اللعبة</Label>
              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground hidden sm:block">
                  جولات: <b>{currentRounds}</b> • وقت الإجابة: <b>{currentAnswerTime}s</b> • أقسام: <b>{lobbySettings.categories?.length || 0}</b>
                </div>
                {isHost && (
                  <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(v => !v)} aria-expanded={isSettingsOpen} aria-controls="settings-panel">
                    <Settings className={cn("w-5 h-5", isSettingsOpen && "animate-spin")} />
                  </Button>
                )}
              </div>
            </div>

            <AnimatePresence initial={false}>
              {isSettingsOpen && (
                <motion.div
                  key="settings"
                  id="settings-panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'tween', duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 border rounded-lg space-y-4 mt-1 bg-muted/50">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Button type="button" variant="outline" className="w-full" disabled={!isHost} onClick={() => applyPreset(6, 45)}>
                        <Wand2 className="w-4 h-4 ml-1"/> سريع
                      </Button>
                      <Button type="button" variant="outline" className="w-full" disabled={!isHost} onClick={() => applyPreset(10, 60)}>
                        افتراضي
                      </Button>
                      <Button type="button" variant="outline" className="w-full" disabled={!isHost} onClick={() => applyPreset(10, 25)}>
                        القالب المميز
                      </Button>
                      <Button type="button" variant="outline" className="w-full" disabled={!isHost} onClick={() => applyPreset(20, 60)}>
                        ماراثون
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label htmlFor="rounds-setting">عدد الجولات</Label>
                        <Input
                          id="rounds-setting"
                          type="number"
                          value={roundsInput}
                          disabled={!isHost}
                          min={1}
                          max={50}
                          onChange={e => setRoundsInput(e.target.value)}
                          className={cn(roundsInput === '' && 'ring-1 ring-destructive/40 focus-visible:ring-destructive')}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="answering-time">وقت الإجابة (ث)</Label>
                        <Input
                          id="answering-time"
                          type="number"
                          value={answerInput}
                          disabled={!isHost}
                          min={10}
                          max={600}
                          onChange={e => setAnswerInput(e.target.value)}
                          className={cn(answerInput === '' && 'ring-1 ring-destructive/40 focus-visible:ring-destructive')}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="inline-flex items-center gap-1"><Filter className="w-4 h-4"/> الأقسام المختارة</Label>
                        <div className="flex items-center gap-2 text-xs">
                          <Button type="button" variant="ghost" size="sm" disabled={!isHost || allCategories.length===0} onClick={() => toggleAllCategories(true)}>تحديد الكل</Button>
                          <Button type="button" variant="ghost" size="sm" disabled={!isHost || (lobbySettings.categories?.length||0)===0} onClick={() => toggleAllCategories(false)}>إلغاء الكل</Button>
                          <Button type="button" variant="ghost" size="sm" disabled={!isHost || allCategories.length===0} onClick={() => toggleRandomCategories(5)}>عشوائي 5</Button>
                          <Button type="button" variant="ghost" size="sm" disabled={!isHost || allCategories.length===0} onClick={() => toggleRandomCategories(10)}>عشوائي 10</Button>
                        </div>
                      </div>

                      <Input
                        placeholder="ابحث عن قسم..."
                        value={filterText}
                        onChange={e => setFilterText(e.target.value)}
                        disabled={!isHost || allCategories.length===0}
                      />

                      <div className="flex flex-wrap gap-3 p-3 border rounded-md bg-background max-h-60 overflow-auto">
                        {allCategories.filter(c => (filterText? c.toLowerCase().includes(filterText.toLowerCase()) : true)).length === 0 && (
                          <p className="text-sm text-muted-foreground">لا توجد أقسام مطابقة.</p>
                        )}
                        {allCategories.filter(c => (filterText? c.toLowerCase().includes(filterText.toLowerCase()) : true)).map(cat => {
                          const checked = lobbySettings.categories.includes(cat);
                          return (
                            <label key={cat} htmlFor={`cat-${cat}`} className={cn("flex items-center gap-2 cursor-pointer select-none border rounded-full px-3 py-1 text-sm",
                              checked ? 'bg-primary/10 border-primary' : 'bg-muted/50')}
                            >
                              <input
                                id={`cat-${cat}`}
                                type="checkbox"
                                className="w-4 h-4"
                                disabled={!isHost}
                                checked={checked}
                                onChange={e => {
                                  const newCats = e.target.checked
                                    ? [...lobbySettings.categories, cat]
                                    : lobbySettings.categories.filter(c => c !== cat);
                                  setLobbySettings({ ...lobbySettings, categories: newCats });
                                }}
                              />
                              <span>{cat}</span>
                            </label>
                          );
                        })}
                      </div>

                      <div className="text-xs text-muted-foreground">المحدد: {lobbySettings.categories?.length || 0} من {allCategories.length}</div>

                      <Button onClick={handleSaveSettings} disabled={busySaving} className="w-full">
                        {busySaving ? <Loader2 className="animate-spin" /> : <Save />} حفظ الإعدادات
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-2">
            <Label>اللاعبون ({activePlayers.length})</Label>
            <div className="rounded-md border p-4 space-y-3 bg-muted/50 min-h-[120px]">
              {activePlayers.length === 0 && (
                <p className="text-sm text-muted-foreground">لا يوجد لاعبون حتى الآن.</p>
              )}
              {activePlayers.map(p => {
                const rank = getSocialRankForUser(p.leaderboardPoints);
                const RankIcon = rank?.icon as React.ElementType | undefined;
                const isHostRow = p.id === game.hostId;
                return (
                  <div key={p.id} className="font-medium flex items-center justify-between gap-3 animate-fade-in">
                    <div className="flex items-center gap-3">
                      <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full shadow-md" temporaryTitle={p.temporaryTitle} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-lg">{p.name}</p>
                          {isHostRow && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary text-primary">المضيف</span>}
                        </div>
                        <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                          {rank && RankIcon ? <RankIcon className="w-3 h-3" /> : null}
                          {rank?.name || 'بدون رتبة'}
                        </div>
                      </div>
                    </div>
                    {isHost && p.id !== self.id && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setPlayerToKick(p)} aria-label={`طرد ${p.name}`}>
                              <UserX className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>طرد اللاعب</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex-col gap-2">
          {isHost ? (
            <Button onClick={handleStartGame} disabled={!canStart || busyStarting} className="w-full" size="lg">
              {busyStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              {busyStarting ? "..." : startLabel}
            </Button>
          ) : (
            <p className="text-center text-muted-foreground p-4 bg-muted/50 rounded-md">{startLabel}</p>
          )}

          <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={busyLeavingOrKicking || busyStarting}>
            {busyLeavingOrKicking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
            {busyLeavingOrKicking ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
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
            <AlertDialogAction onClick={handleKickPlayer} disabled={busyLeavingOrKicking} className={buttonVariants({ variant: "destructive" })}>
              {busyLeavingOrKicking ? "جاري الطرد..." : "نعم، قم بالطرد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
