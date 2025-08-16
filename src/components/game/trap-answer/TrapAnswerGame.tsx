'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Game, Player, EmojiReaction, EmojiReactionType } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import {
  startTrapAnswerGame,
  selectCategoryAndGetQuestion,
  handleTimeout,
  submitTrapAnswer,
  submitGuess,
  nextTrapAnswerRound,
  sendReaction,
  updateGameSettings as updateTrapAnswerSettings,
} from '@/lib/actions/trap-answer';
import { kickPlayerFromLobby, leaveGame } from '@/lib/actions/room';
import {
  Award,
  CheckCircle2,
  Loader2,
  Send,
  Trophy,
  ArrowRight,
  Copy,
  Check,
  TimerIcon,
  LogOut,
  Laugh,
  MessageCircleOff,
  Handshake,
  Drama,
  UserX,
  VenetianMask,
  UserRound,
  Settings,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CountdownTimer } from '@/components/game/CountdownTimer';
import { DEFAULT_TRAP_ANSWER_CATEGORIES } from '@/data/social-ranks';

/**
 * ملاحظات الإصلاح والتحسين:
 * - نقل جميع Hooks (useMemo, useState, useEffect) إلى المستوى الأعلى للكمبوننت — لا يوجد useMemo داخل دوال render*.
 * - منع sort() المتحوِّل على game.players باستعمال نسخ جديدة دائمًا.
 * - حراسة آمنة ضد undefined في أغلب أماكن trapAnswerState.
 * - تحسين إدارة التحميل عبر حالة "loading" مجزّأة لكل أكشن بدل isSubmitting عام.
 * - إخفاء الإيموجيز بعد انتهاء المدة حتى بدون تغيّر من Firestore عبر setTimeout محلي.
 * - مزامنة إعدادات اللوبي محليًا إذا تغيّرت من الخادم.
 * - مفاتيح (keys) ثابتة لـ EmojiDisplay — بدون Math.random.
 * - توحيد التعامل مع الأخطاء بـ unknown.
 * - إضافة aria-live لمناطق حالة الانتظار لتحسين الوصول.
 * - الإبقاء على منطق دمج الخيارات المتشابهة (عدم تطبيق تحسين "IDs فريدة" عمدًا بناءً على طلبك).
 */

// أدوات مساعدة صغيرة
const has = (obj: unknown, key: string) => !!obj && Object.prototype.hasOwnProperty.call(obj as Record<string, unknown>, key);
const isDefined = <T,>(v: T | undefined | null): v is T => v !== undefined && v !== null;

// خريطة الإيموجيز خارج الكمبوننت لتجنّب إعادة الإنشاء
const EMOJI_MAP: Record<EmojiReactionType, React.ReactNode> = {
  laugh: <Laugh className="w-16 h-16 text-yellow-400" />,
  mock: <MessageCircleOff className="w-16 h-16 text-red-500" />,
  apologize: <Handshake className="w-16 h-16 text-blue-400" />,
  shame: <Drama className="w-16 h-16 text-purple-400" />,
};

const EMOJI_DISPLAY_DURATION_MS = 4000;

const EmojiDisplay = ({ reaction }: { reaction: EmojiReaction | null }) => {
  if (!reaction) return null;
  const ms = (reaction.timestamp as any)?.toMillis?.() ?? 0;
  const key = `${reaction.emoji}-${ms}`; // مفتاح ثابت
  return (
    <motion.div
      key={key}
      initial={{ scale: 0.5, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.5, opacity: 0, y: 20 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="absolute -top-8 -right-8 z-10 bg-background/80 backdrop-blur-sm rounded-full p-2 shadow-lg"
    >
      {EMOJI_MAP[reaction.emoji]}
    </motion.div>
  );
};

interface TrapAnswerGameProps {
  game: Game;
  self: Player;
}

export function TrapAnswerGame({ game, self }: TrapAnswerGameProps) {
  const router = useRouter();
  const { toast } = useToast();

  // تحميلات مجزّأة بحسب الحدث
  const [loading, setLoading] = useState<{
    select?: boolean;
    answer?: boolean;
    guess?: boolean;
    next?: boolean;
    save?: boolean;
    start?: boolean;
    kick?: boolean;
    leave?: boolean;
  }>({});

  const [trapAnswer, setTrapAnswer] = useState('');
  const [chosenGuess, setChosenGuess] = useState<string | null>(null); // نحافظ على منطق الدمج بالنص
  const [visibleReactions, setVisibleReactions] = useState<Record<string, EmojiReaction | null>>({});

  const isHost = game.hostId === self.id;

  const activePlayers = useMemo(
    () => (game?.players?.filter((p) => p.status !== 'left') ?? []),
    [game?.players]
  );

  const shuffledAnswers = useMemo(
    () => game.trapAnswerState?.shuffledAnswers ?? [],
    [game.trapAnswerState?.shuffledAnswers]
  );

  // ترتيب اللاعبين حسب مجموع النقاط — يُستخدم في نتائج الجولة
  const playersSortedByTotalScore = useMemo(
    () => [...(game.players ?? [])].sort((a, b) => (game.playerScores?.[b.id] ?? 0) - (game.playerScores?.[a.id] ?? 0)),
    [game.players, game.playerScores]
  );

  // إعادة تهيئة اختيار التخمين عند الانتقال إلى طور التخمين
  useEffect(() => {
    if (game.gameState === 'guessing') setChosenGuess(null);
  }, [game.gameState, game.round]);

  // تنظيف حقل الإجابة عند الدخول لطور الإجابات
  useEffect(() => {
    if (game.gameState === 'answer-submission') setTrapAnswer('');
  }, [game.gameState, game.round]);

  // عرض وإخفاء الإيموجيات مؤقتًا محليًا حتى بدون تغيّر من الخادم
  useEffect(() => {
    const reactions = game.trapAnswerState?.reactions ?? {};
    const now = Date.now();
    const next: Record<string, EmojiReaction | null> = {};
    const timers: number[] = [];

    for (const [playerId, reaction] of Object.entries(reactions)) {
      const ts = (reaction as any)?.timestamp;
      const ms = ts?.toMillis?.() ?? 0;
      const age = now - ms;
      if (age < EMOJI_DISPLAY_DURATION_MS) {
        next[playerId] = reaction as EmojiReaction;
        const remaining = EMOJI_DISPLAY_DURATION_MS - age;
        timers.push(window.setTimeout(() => {
          setVisibleReactions((prev) => ({ ...prev, [playerId]: null }));
        }, remaining));
      } else {
        next[playerId] = null;
      }
    }

    setVisibleReactions(next);
    return () => timers.forEach(clearTimeout);
  }, [game.trapAnswerState?.reactions]);

  // ====== حدث اختيار القسم ======
  const handleCategorySelect = useCallback(
    async (category: string) => {
      if (loading.select) return;
      setLoading((l) => ({ ...l, select: true }));
      try {
        await selectCategoryAndGetQuestion(game.id, self.id, category);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'تعذّر اختيار القسم';
        toast({ title: 'خطأ', description: message, variant: 'destructive' });
      } finally {
        setLoading((l) => ({ ...l, select: false }));
      }
    },
    [game.id, self.id, toast, loading.select]
  );

  // ====== إرسال الإجابة ======
  const handleSubmitAnswer = useCallback(async () => {
    const hasSubmitted = has(game.trapAnswerState?.playerAnswers, self.id);
    if (hasSubmitted) return;
    if (!trapAnswer.trim()) {
      toast({ title: 'الرجاء إدخال إجابة', variant: 'destructive' });
      return;
    }

    setLoading((l) => ({ ...l, answer: true }));
    try {
      const result = await submitTrapAnswer(game.id, self.id, trapAnswer.trim());
      if ((result as any)?.error) {
        toast({ title: 'خطأ', description: (result as any).error, variant: 'destructive' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذّر إرسال الإجابة';
      toast({ title: 'خطأ فادح', description: message, variant: 'destructive' });
    } finally {
      setLoading((l) => ({ ...l, answer: false }));
    }
  }, [game.id, self.id, trapAnswer, toast, game.trapAnswerState?.playerAnswers]);

  // ====== إرسال التخمين ======
  const handleGuessSubmit = useCallback(async () => {
    const alreadyGuessed = !!game.trapAnswerState?.playerGuesses?.[self.id];
    if (alreadyGuessed) return;

    if (!chosenGuess) {
      toast({ title: 'الرجاء اختيار إجابة', variant: 'destructive' });
      return;
    }

    setLoading((l) => ({ ...l, guess: true }));
    try {
      await submitGuess(game.id, self.id, chosenGuess); // نحافظ على الدمج بالنص
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذّر تسجيل التخمين';
      toast({ title: 'خطأ', description: message, variant: 'destructive' });
    } finally {
      setLoading((l) => ({ ...l, guess: false }));
    }
  }, [game.id, self.id, chosenGuess, toast, game.trapAnswerState?.playerGuesses]);

  // ====== بدء الجولة التالية ======
  const handleNextRound = useCallback(async () => {
    setLoading((l) => ({ ...l, next: true }));
    try {
      await nextTrapAnswerRound(game.id, self.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذّر بدء الجولة التالية';
      toast({ title: 'خطأ', description: message, variant: 'destructive' });
    } finally {
      setLoading((l) => ({ ...l, next: false }));
    }
  }, [game.id, self.id, toast]);

  const handleSendReaction = useCallback(
    (emoji: EmojiReactionType) => {
      void sendReaction(game.id, self.id, emoji);
    },
    [game.id, self.id]
  );

  // مكوّن مساعد لعرض المؤقّت أعلى البطاقة عند وجود timerEndsAt
  const WithTimer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Card className="w-full max-w-lg animate-pop-in relative">
      {game.trapAnswerState?.timerEndsAt && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <CountdownTimer
            gameId={game.id}
            gameType="trap-answer"
            expiryTimestamp={game.trapAnswerState.timerEndsAt.toMillis()}
            selfId={self.id}
            isHost={isHost}
          />
        </div>
      )}
      {children}
    </Card>
  );

  // ====== Renders ======
  const renderCategorySelection = () => {
    const turnOrder = game.trapAnswerState?.turnOrder ?? [];
    const currentTurnIndex = game.trapAnswerState?.currentTurnIndex ?? 0;
    const currentId = turnOrder[currentTurnIndex];
    const playerTurn = game.players.find((p) => p.id === currentId);
    const isMyTurn = self.id === playerTurn?.id;
    const categories = game.trapAnswerState?.fiveRandomCategories ?? [];

    return (
      <WithTimer>
        <CardHeader className="text-center pt-20">
          <CardTitle>الجولة {game.round ?? 1}</CardTitle>
          <CardDescription>
            حان دور <strong>{isMyTurn ? 'أنت' : playerTurn?.name ?? '—'}</strong> لاختيار قسم.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <p className="text-muted-foreground text-center">
              {isMyTurn ? 'اختر أحد الأقسام التالية لطرح سؤال منه.' : `الأقسام المتاحة لـ ${playerTurn?.name ?? '—'}:`}
            </p>
            {categories.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 w-full">
                {categories.map((cat) => (
                  <Button
                    key={cat}
                    onClick={() => handleCategorySelect(cat)}
                    disabled={!!loading.select || !isMyTurn}
                    size="lg"
                    variant="outline"
                    className="text-base justify-center h-14"
                  >
                    {loading.select && isMyTurn ? <Loader2 className="animate-spin" /> : cat}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="w-full p-4 text-center rounded-md bg-muted" aria-live="polite">
                لا توجد أقسام متاحة حاليًا. يرجى انتظار إعادة التوليد.
              </div>
            )}
          </div>
        </CardContent>
      </WithTimer>
    );
  };

  const renderAnswerSubmission = () => {
    const hasSubmitted = has(game.trapAnswerState?.playerAnswers, self.id);
    const answeredPlayers = Object.keys(game.trapAnswerState?.playerAnswers ?? {});
    const awayPlayerIds = game.trapAnswerState?.awayPlayerIds ?? [];
    const pendingPlayers = activePlayers.filter((p) => !answeredPlayers.includes(p.id));

    return (
      <WithTimer>
        <CardHeader className="text-center pt-20">
          <CardTitle>السؤال</CardTitle>
          <CardDescription className="text-2xl font-bold pt-2">
            {game.trapAnswerState?.currentQuestion?.question ?? '—'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasSubmitted ? (
            <div className="text-center p-4 rounded-lg bg-green-100 text-green-800 space-y-4" aria-live="polite">
              <p className="font-semibold">تم إرسال إجابتك! في انتظار بقية اللاعبين...</p>
              <div className="space-y-2">
                {pendingPlayers.map((p) => {
                  const isAway = awayPlayerIds.includes(p.id);
                  return (
                    <div key={p.id} className="flex items-center justify-center gap-2 text-sm text-yellow-800">
                      <PlayerAvatar avatarId={p.avatarId} className="w-6 h-6" temporaryTitle={p.temporaryTitle} />
                      <span>في انتظار {p.name}...</span>
                      {isAway ? <EyeOff className="w-4 h-4 text-red-500" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Textarea
                placeholder={"اكتب إجابتك هنا..."}
                value={trapAnswer}
                onChange={(e) => setTrapAnswer(e.target.value)}
                rows={4}
              />
              <Button onClick={handleSubmitAnswer} disabled={!!loading.answer || !trapAnswer.trim()} className="w-full">
                <Send className="mr-2" /> {loading.answer ? 'جاري الإرسال...' : 'إرسال الجواب'}
              </Button>
            </div>
          )}
        </CardContent>
      </WithTimer>
    );
  };

  const renderGuessing = () => {
    const hasGuessed = !!game.trapAnswerState?.playerGuesses?.[self.id];
    const answeredPlayers = Object.keys(game.trapAnswerState?.playerGuesses ?? {});
    const awayPlayerIds = game.trapAnswerState?.awayPlayerIds ?? [];
    const pendingPlayers = activePlayers.filter((p) => !answeredPlayers.includes(p.id));

    return (
      <WithTimer>
        <CardHeader className="text-center pt-20">
          <CardTitle>أين هو الجواب الصحيح؟</CardTitle>
          <CardDescription className="text-2xl font-bold pt-2">
            {game.trapAnswerState?.currentQuestion?.question ?? '—'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasGuessed ? (
            <div className="text-center p-4 rounded-lg bg-green-100 text-green-800 space-y-4" aria-live="polite">
              <p className="font-semibold">تم تسجيل تخمينك! في انتظار بقية اللاعبين...</p>
              <div className="space-y-2">
                {pendingPlayers.map((p) => {
                  const isAway = awayPlayerIds.includes(p.id);
                  return (
                    <div key={p.id} className="flex items-center justify-center gap-2 text-sm text-yellow-800">
                      <PlayerAvatar avatarId={p.avatarId} className="w-6 h-6" temporaryTitle={p.temporaryTitle} />
                      <span>في انتظار {p.name}...</span>
                      {isAway ? <EyeOff className="w-4 h-4 text-red-500" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <RadioGroup value={chosenGuess ?? ''} onValueChange={setChosenGuess as any} className="grid grid-cols-1 gap-3">
                {shuffledAnswers.map((ans, i) => (
                  <Label
                    key={`${ans}-${i}`}
                    htmlFor={`ans-${i}`}
                    className={cn(
                      'flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all',
                      chosenGuess === ans ? 'border-primary bg-primary/10' : 'border-muted bg-muted/50 hover:border-primary/50'
                    )}
                  >
                    <RadioGroupItem value={ans} id={`ans-${i}`} />
                    <span className="text-base font-semibold">{ans}</span>
                  </Label>
                ))}
              </RadioGroup>
              <Button onClick={handleGuessSubmit} disabled={!!loading.guess || !chosenGuess} className="w-full">
                <CheckCircle2 className="mr-2" /> {loading.guess ? 'جاري التأكيد...' : 'تأكيد التخمين'}
              </Button>
            </div>
          )}
        </CardContent>
      </WithTimer>
    );
  };

  const renderRoundResults = () => {
    const results = game.trapAnswerState?.lastRoundResults;
    if (!results)
      return (
        <Card className="w-full max-w-lg">
          <CardContent className="flex items-center gap-2 py-8">
            <Loader2 className="animate-spin" />
            <span>جاري تحميل النتائج...</span>
          </CardContent>
        </Card>
      );

    const getPlayer = (playerId: string) => game.players.find((p) => p.id === playerId);
    const timedOutPlayers = (results.timedOutGuesserIds ?? []).map(getPlayer).filter(isDefined);
    const awayPlayerIds = results.awayPlayerIdsDuringRound ?? [];

    return (
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="text-center">
              <Award className="w-16 h-16 mx-auto text-yellow-500" />
              <CardTitle>نتائج الجولة {game.round ?? 1}</CardTitle>
              <CardDescription className="text-base pt-2">
                السؤال كان: <strong className="text-foreground">{game.trapAnswerState?.currentQuestion?.question ?? '—'}</strong>
              </CardDescription>
            </CardHeader>
          </Card>

          {timedOutPlayers.length > 0 && (
            <Card className="border-yellow-500 bg-yellow-100/80 dark:bg-yellow-900/30 dark:text-yellow-200">
              <CardHeader>
                <CardTitle className="text-yellow-800 dark:text-yellow-200 text-base flex items-center gap-2">
                  <TimerIcon /> لاعبون لم يجيبوا في الوقت
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                {timedOutPlayers.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <PlayerAvatar avatarId={p.avatarId} className="w-6 h-6" />
                    <span className="font-semibold text-sm">{p.name}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <ScrollArea className="h-[50vh] pr-4">
            <div className="space-y-3">
              {results.answers.map((ans, idx) => (
                <motion.div
                  key={`${ans.text}-${idx}`}
                  className={cn('p-4 border-2 rounded-lg', ans.isCorrect ? 'bg-green-100 border-green-500' : 'bg-card border-border')}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: idx * 0.06 } }}
                >
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-lg font-bold">{ans.text}</p>
                    {ans.isCorrect ? (
                      <div className="px-2 py-1 text-xs font-bold text-green-800 bg-green-200 rounded-full">الجواب الصحيح</div>
                    ) : (
                      <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span>جواب:</span>
                        {ans.authorIds && ans.authorIds.length > 0 ? (
                          ans.authorIds.map((authorId) => {
                            const author = getPlayer(authorId);
                            return author ? (
                              <div key={authorId} className="flex items-center gap-1.5">
                                <PlayerAvatar avatarId={author.avatarId} className="w-5 h-5" temporaryTitle={author.temporaryTitle} />
                                <span className="font-bold">{author.name}</span>
                              </div>
                            ) : null;
                          })
                        ) : (
                          <span className="font-bold">(تلقائي)</span>
                        )}
                      </div>
                    )}
                  </div>
                  {ans.guesserIds?.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t mt-2">
                      <span className="text-xs font-bold self-center">صوّت لها:</span>
                      {ans.guesserIds.map((id) => {
                        const guesser = getPlayer(id);
                        return guesser ? (
                          <div key={id} className="flex items-center gap-1.5 text-xs bg-muted px-2 py-1 rounded-full">
                            <PlayerAvatar avatarId={guesser.avatarId} className="w-4 h-4" temporaryTitle={guesser.temporaryTitle} />
                            <span>{guesser.name}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>نقاط الجولة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {playersSortedByTotalScore.map((p) => {
                const roundScore = (game.trapAnswerState?.lastRoundResults?.scores as any)?.[p.id];
                const wasAway = awayPlayerIds.includes(p.id);
                return (
                  <div key={p.id} className="flex flex-col p-2 rounded-md bg-muted">
                    <div className="flex justify-between items-center">
                      <div className="relative flex items-center gap-2">
                        <AnimatePresence>
                          <EmojiDisplay reaction={visibleReactions[p.id] ?? null} />
                        </AnimatePresence>
                        <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" temporaryTitle={p.temporaryTitle} />
                        <div className="flex-grow">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold block">{p.name}</span>
                            {wasAway && <EyeOff className="w-4 h-4 text-red-500" />}
                          </div>
                          {roundScore && roundScore.points !== 0 && (
                            <div className="flex flex-wrap gap-x-2">
                              {roundScore.breakdown.map((item: { reason: string; points: number }, i: number) => (
                                <span key={i} className={cn('text-xs', item.points > 0 ? 'text-green-600' : 'text-red-600')}>
                                  ({item.points > 0 ? `+${item.points}` : item.points} {item.reason})
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-lg text-primary">{game.playerScores?.[p.id] ?? 0}</span>
                        {roundScore?.points > 0 && <span className="text-xs font-bold text-green-500">+{roundScore.points}</span>}
                      </div>
                    </div>
                    <div className="flex justify-center gap-2 mt-2 pt-2 border-t border-background w-full">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSendReaction('laugh')}>
                        <Laugh className="h-4 w-4 text-yellow-500" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSendReaction('mock')}>
                        <MessageCircleOff className="h-4 w-4 text-red-500" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSendReaction('apologize')}>
                        <Handshake className="h-4 w-4 text-blue-500" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSendReaction('shame')}>
                        <Drama className="h-4 w-4 text-purple-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          {isHost && (
            <Button onClick={handleNextRound} disabled={!!loading.next} className="w-full">
              {loading.next
                ? 'جاري التحميل...'
                : (game.round ?? 0) >= (game.trapAnswerState?.settings?.rounds ?? 10)
                ? 'عرض النتائج النهائية'
                : 'الجولة التالية'}
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderFinalResults = () => {
    const sortedPlayers = [...(game.players ?? [])]
      .map((p) => ({ ...p, score: game.playerScores?.[p.id] ?? 0 }))
      .sort((a, b) => b.score - a.score);

    let rank = 0;
    let lastScore = Infinity;

    const rankedPlayers = sortedPlayers.map((p, index) => {
      if (p.score !== lastScore) {
        rank = index + 1;
      }
      lastScore = p.score;
      return { ...p, rank } as Player & { score: number; rank: number };
    });

    const winner = rankedPlayers[0];
    const { cunningDeceiver, deceivedFool, afkStats } = game.trapAnswerState?.finalAwards ?? {};

    const afkPlayers = Object.entries(afkStats ?? {})
      .map(([playerId, count]) => {
        const pl = game.players.find((pp) => pp.id === playerId);
        return pl ? { player: pl, afkCount: count as number } : null;
      })
      .filter(isDefined)
      .sort((a, b) => b.afkCount - a.afkCount)
      .slice(0, 3);

    return (
      <Card className="w-full max-w-2xl animate-pop-in">
        <CardHeader className="text-center">
          <Trophy className="w-24 h-24 mx-auto text-yellow-400" />
          <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
          {winner && <CardDescription className="text-2xl font-bold">الفائز هو {winner.name}!</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
            {/* Cunning Deceiver Card */}
            <div className="p-3 rounded-lg bg-red-100 border border-red-300">
              <h3 className="font-bold text-red-800 flex items-center justify-center gap-2">
                <VenetianMask /> المخادع المكار
              </h3>
              {cunningDeceiver ? (
                <>
                  <PlayerAvatar avatarId={cunningDeceiver.avatarId} className="w-16 h-16 mx-auto my-2" />
                  <p className="font-bold text-lg">{cunningDeceiver.name}</p>
                  <p className="text-sm text-muted-foreground">أوقع لاعبين في فخه {cunningDeceiver.count} مرة</p>
                </>
              ) : (
                <div className="py-8">
                  <p className="text-muted-foreground">لا يوجد فائز بهذا اللقب</p>
                </div>
              )}
            </div>
            {/* Deceived Fool Card */}
            <div className="p-3 rounded-lg bg-blue-100 border border-blue-300">
              <h3 className="font-bold text-blue-800 flex items-center justify-center gap-2">
                <UserRound /> الأكثر انخداعًا
              </h3>
              {deceivedFool ? (
                <>
                  <PlayerAvatar avatarId={deceivedFool.avatarId} className="w-16 h-16 mx-auto my-2" />
                  <p className="font-bold text-lg">{deceivedFool.name}</p>
                  <p className="text-sm text-muted-foreground">وقع في الفخ {deceivedFool.count} مرات</p>
                </>
              ) : (
                <div className="py-8">
                  <p className="text-muted-foreground">لا يوجد فائز بهذا اللقب</p>
                </div>
              )}
            </div>
          </div>

          {afkPlayers.length > 0 && (
            <div className="p-3 rounded-lg bg-yellow-100 border border-yellow-300 mt-4">
              <h3 className="font-bold text-yellow-800 flex items-center justify-center gap-2">
                <AlertTriangle /> أعلى انقطاعات/AFK
              </h3>
              <div className="space-y-1 mt-2">
                {afkPlayers.map(({ player, afkCount }) => (
                  <div key={player.id} className="flex justify-between items-center text-sm p-1 bg-yellow-50 rounded-md">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar avatarId={player.avatarId!} className="w-6 h-6" />
                      <span>{player.name}</span>
                    </div>
                    <span className="font-bold">{afkCount} مرات</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 pt-4">
            <h3 className="font-bold text-center">الترتيب النهائي</h3>
            {rankedPlayers.length === 0 && (
              <div className="p-3 text-center rounded-md bg-muted">لا يوجد لاعبون لعرض النتائج.</div>
            )}
            {rankedPlayers.map((p) => (
              <div key={p.id} className="flex justify-between items-center p-3 bg-muted rounded-lg text-lg">
                <div className="flex items-center gap-2 font-bold">
                  <span>{p.rank}.</span>
                  <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8" temporaryTitle={p.temporaryTitle} />
                  <span>{p.name}</span>
                </div>
                <span className="font-bold text-primary">{p.score} نقطة</span>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={() => router.push('/')} className="w-full">
            العب مرة أخرى
          </Button>
        </CardFooter>
      </Card>
    );
  };

  if (game.gameState === 'lobby') {
    return <TrapAnswerLobby game={game} self={self} />;
  }

  switch (game.gameState) {
    case 'category-selection':
      return renderCategorySelection();
    case 'answer-submission':
      return renderAnswerSubmission();
    case 'guessing':
      return renderGuessing();
    case 'round-results':
      return renderRoundResults();
    case 'final_results':
      return renderFinalResults();
    default:
      return (
        <Card>
          <CardHeader>
            <CardTitle>لعبة الجواب المفخخ</CardTitle>
          </CardHeader>
          <CardContent>
            <p>حالة غير معروفة: {String(game.gameState)}</p>
            <Loader2 className="animate-spin" />
          </CardContent>
        </Card>
      );
  }
}

// ============================ Lobby ============================

function TrapAnswerLobby({ game, self }: { game: Game; self: Player }) {
  const { toast } = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState<{ start?: boolean; leave?: boolean; kick?: boolean; save?: boolean }>({});
  const [isCopying, setIsCopying] = useState(false);
  const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
  const [copyTimeoutId, setCopyTimeoutId] = useState<number | null>(null);

  const isHost = game.hostId === self.id;
  const activePlayers = useMemo(
    () => (game?.players?.filter((p) => p.status !== 'left') ?? []),
    [game?.players]
  );

  type TrapSettings = { categories: string[]; rounds: number | string; answerTime: number | string };
  const defaultSettings = useMemo<TrapSettings>(() => ({ categories: [], rounds: 10, answerTime: 60 }), []);
  const [settings, setSettings] = useState<TrapSettings>(game.trapAnswerState?.settings ?? defaultSettings);

  // مزامنة الإعدادات إذا تغيّرت من الخادم
  useEffect(() => {
    if (game.trapAnswerState?.settings) {
      setSettings(game.trapAnswerState.settings as TrapSettings);
    }
  }, [game.trapAnswerState?.settings]);

  const handleSettingsChange = (newSettings: Partial<TrapSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const handleCopyId = () => {
    setIsCopying(true);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(game.id).catch(() => undefined);
    }
    const id = window.setTimeout(() => setIsCopying(false), 1200);
    setCopyTimeoutId(id);
  };

  useEffect(() => () => { if (copyTimeoutId) clearTimeout(copyTimeoutId); }, [copyTimeoutId]);

  const handleStartGame = async () => {
    if (!isHost) return;

    if (!settings.categories?.length) {
      toast({ title: 'الرجاء اختيار قسم واحد على الأقل', variant: 'destructive' });
      return;
    }

    setLoading((l) => ({ ...l, start: true }));
    try {
      await startTrapAnswerGame(game.id, self.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذّر بدء اللعبة';
      toast({ title: 'خطأ', description: message, variant: 'destructive' });
    } finally {
      setLoading((l) => ({ ...l, start: false }));
    }
  };

  const handleLeaveGame = async () => {
    setLoading((l) => ({ ...l, leave: true }));
    const result = await leaveGame(game.id, self.id);
    if ((result as any)?.success) {
      try {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(`player-id-${game.id}`);
        }
      } catch {}
      router.push('/');
      toast({ title: 'لقد غادرت الغرفة.' });
    } else {
      toast({ title: 'خطأ', description: (result as any)?.error ?? 'تعذّر المغادرة', variant: 'destructive' });
    }
    setLoading((l) => ({ ...l, leave: false }));
  };

  const handleKickPlayer = async () => {
    if (!playerToKick || !isHost) return;
    setLoading((l) => ({ ...l, kick: true }));
    const result = await kickPlayerFromLobby(game.id, self.id, playerToKick.id);
    if ((result as any)?.error) {
      toast({ title: 'خطأ في الطرد', description: (result as any).error, variant: 'destructive' });
    } else {
      toast({ title: 'نجاح', description: `تم طرد اللاعب ${playerToKick.name}.` });
    }
    setPlayerToKick(null);
    setLoading((l) => ({ ...l, kick: false }));
  };

  const handleSaveSettings = async () => {
    if (!isHost) return;

    const rounds = Number(settings.rounds) || 1;
    const answerTime = Number(settings.answerTime) || 30;

    if (rounds < 1) {
      toast({ title: 'عدد الجولات يجب أن يكون 1 على الأقل', variant: 'destructive' });
      return;
    }
    if (answerTime < 10) {
      toast({ title: 'الحد الأدنى لوقت الإجابة 10 ثوانٍ', variant: 'destructive' });
      return;
    }
    if (!settings.categories?.length) {
      toast({ title: 'اختر قسمًا واحدًا على الأقل', variant: 'destructive' });
      return;
    }

    setLoading((l) => ({ ...l, save: true }));
    try {
      await updateTrapAnswerSettings(game.id, self.id, { ...settings, rounds, answerTime });
      toast({ title: 'تم حفظ الإعدادات بنجاح' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذّر الحفظ';
      toast({ title: 'خطأ في حفظ الإعدادات', description: message, variant: 'destructive' });
    } finally {
      setLoading((l) => ({ ...l, save: false }));
    }
  };

  return (
    <>
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-xl md:text-2xl">غرفة لعبة: الجواب المفخخ</CardTitle>
          <CardDescription>ادعُ أصدقاءك للانضمام باستخدام معرف الغرفة</CardDescription>
          <div
            className="flex items-center justify-center gap-2 mt-2 p-2 bg-muted rounded-md cursor-pointer hover:bg-muted/80"
            onClick={handleCopyId}
          >
            <span className="font-mono text-lg tracking-widest">{game.id}</span>
            <TooltipProvider>
              <Tooltip open={isCopying}>
                <TooltipTrigger asChild>
                  <button>{isCopying ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}</button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>تم النسخ!</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardHeader>

        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-bold text-center">اللاعبون ({activePlayers.length})</h3>
            <div className="space-y-2 p-2 border rounded-lg min-h-[200px]">
              {activePlayers.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 bg-background rounded-md">
                  <div className="flex items-center gap-3">
                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" temporaryTitle={p.temporaryTitle} />
                    <span className="font-bold">{p.name}</span>
                    {p.id === game.hostId && <span className="text-xs font-bold text-amber-500">(المضيف)</span>}
                  </div>
                  {isHost && p.id !== self.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setPlayerToKick(p)}
                    >
                      <UserX className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              {activePlayers.length === 0 && (
                <div className="p-3 text-center text-sm text-muted-foreground">لا يوجد لاعبون بعد.</div>
              )}
            </div>
          </div>

          {isHost ? (
            <div className="space-y-3">
              <h3 className="font-bold text-center flex items-center justify-center gap-2">
                <Settings /> إعدادات اللعبة
              </h3>
              <div className="space-y-4 p-3 border rounded-lg">
                <div className="space-y-2">
                  <Label>الأقسام</Label>
                  <ScrollArea className="h-40 border rounded-md p-2">
                    {DEFAULT_TRAP_ANSWER_CATEGORIES.map((cat) => (
                      <div key={cat} className="flex items-center space-x-2 space-x-reverse mb-1">
                        <Checkbox
                          id={`cat-${cat}`}
                          checked={settings.categories?.includes(cat) ?? false}
                          onCheckedChange={(checked) => {
                            const list = new Set(settings.categories ?? []);
                            if (checked) list.add(cat);
                            else list.delete(cat);
                            handleSettingsChange({ categories: Array.from(list) });
                          }}
                        />
                        <label
                          htmlFor={`cat-${cat}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {cat}
                        </label>
                      </div>
                    ))}
                  </ScrollArea>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rounds">عدد الجولات</Label>
                  <Input
                    id="rounds"
                    type="number"
                    value={settings.rounds}
                    onChange={(e) => handleSettingsChange({ rounds: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="answer-time">وقت الإجابة والتخمين (ثواني)</Label>
                  <Input
                    id="answer-time"
                    type="number"
                    value={settings.answerTime}
                    onChange={(e) => handleSettingsChange({ answerTime: e.target.value })}
                  />
                </div>
                <Button onClick={handleSaveSettings} disabled={!!loading.save} className="w-full">
                  {loading.save ? (
                    <>
                      <Loader2 className="mr-2 animate-spin" /> جاري الحفظ...
                    </>
                  ) : (
                    'حفظ الإعدادات'
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground p-8 flex flex-col items-center justify-center bg-muted/50 rounded-lg" aria-live="polite">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>في انتظار المضيف لبدء اللعبة...</p>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-2">
          {isHost && (
            <Button onClick={handleStartGame} disabled={!!loading.start || activePlayers.length < 2} className="w-full">
              <ArrowRight className="mr-2 h-4 w-4" />
              {loading.start ? '...' : activePlayers.length < 2 ? 'تحتاج لاعبين على الأقل' : 'ابدأ اللعبة'}
            </Button>
          )}
          <Button onClick={handleLeaveGame} variant="destructive" className="w-full" disabled={!!loading.leave}>
            <LogOut className="ml-2 h-4 w-4" /> {loading.leave ? 'جاري المغادرة...' : 'مغادرة'}
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
              onClick={handleKickPlayer}
              disabled={!!loading.kick}
              className={buttonVariants({ variant: 'destructive' })}
            >
              {loading.kick ? 'جاري الطرد...' : 'نعم، قم بالطرد'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
