'use client';

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  memo,
} from 'react';
import type { Game, Player, EmojiReaction, EmojiReactionType } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import {
  selectCategoryAndGetQuestion,
  submitTrapAnswer,
  submitGuess,
  nextTrapAnswerRound,
  sendReaction,
  tickGame,
} from '@/lib/actions/trap-answer';
import {
  Award,
  CheckCircle2,
  Loader2,
  Send,
  Trophy,
  ArrowRight,
  TimerIcon,
  Laugh,
  MessageCircleOff,
  Handshake,
  Drama,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { CountdownTimer } from '@/components/game/CountdownTimer';
import { TrapAnswerLobby } from './lobby/Lobby';

/** ---------- helpers ---------- */
const has = (obj: unknown, key: string) =>
  !!obj && Object.prototype.hasOwnProperty.call(obj as Record<string, unknown>, key);
const isDefined = <T,>(v: T | undefined | null): v is T => v !== undefined && v !== null;
const idFromText = (s: string) =>
  'ans-' +
  (typeof window === 'undefined'
    ? Buffer.from(s).toString('base64').replace(/=+$/g, '')
    : btoa(unescape(encodeURIComponent(s))).replace(/=+$/g, ''));

function useStableArray<T>(arr: T[]) {
  const sig = useMemo(() => JSON.stringify(arr), [arr]);
  const ref = useRef(arr);
  const sigRef = useRef(sig);
  if (sigRef.current !== sig) {
    sigRef.current = arr;
    ref.current = arr;
  }
  return ref.current;
}

/** ---------- Emoji UI ---------- */
const EMOJI_DISPLAY_DURATION_MS = 4000;
const EMOJI_MAP: Record<EmojiReactionType, React.ReactNode> = {
  laugh: <Laugh className="w-16 h-16 text-yellow-400" />,
  mock: <MessageCircleOff className="w-16 h-16 text-red-500" />,
  apologize: <Handshake className="w-16 h-16 text-blue-400" />,
  shame: <Drama className="w-16 h-16 text-purple-400" />,
};

const EmojiDisplay = ({ reaction }: { reaction: EmojiReaction | null }) => {
  if (!reaction) return null;
  const ms = (reaction.timestamp as any)?.toMillis?.() ?? 0;
  const key = `${reaction.emoji}-${ms}`;
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

/** ---------- Stable input (NO focus loss) ---------- */
type StableAnswerInputProps = {
  gameId: string;
  disabled?: boolean;
  submitting?: boolean;
  onSubmit: (text: string) => void | Promise<void>;
};

const StableAnswerInput = memo(function StableAnswerInput({
  gameId,
  disabled,
  submitting,
  onSubmit,
}: StableAnswerInputProps) {
  const [value, setValue] = useState<string>('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const caretRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`trap-input-${gameId}`);
      if (saved) setValue(saved);
    } catch {}
  }, [gameId]);

  const rememberCaret = () => {
    const el = taRef.current;
    if (!el) return;
    try {
      caretRef.current = el.selectionStart ?? el.value.length;
    } catch {
      caretRef.current = el.value.length;
    }
  };

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {}
  }, []);

  const handleBlur = () => {
    const el = taRef.current;
    if (!el) return;
    setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body) {
        el.focus({ preventScroll: true });
        const pos = caretRef.current ?? el.value.length;
        try {
          el.setSelectionRange(pos, pos);
        } catch {}
      }
    }, 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    rememberCaret();
    try {
      sessionStorage.setItem(`trap-input-${gameId}`, e.target.value);
    } catch {}
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    rememberCaret();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && value.trim()) {
      e.preventDefault();
      void onSubmit(value.trim());
    }
  };

  const doSubmit = () => {
    if (!value.trim()) return;
    void onSubmit(value.trim());
  };

  return (
    <div className="space-y-4">
      <Textarea
        ref={taRef}
        placeholder="اكتب إجابتك هنا..."
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        rows={4}
        disabled={disabled || submitting}
      />
      <Button onClick={doSubmit} disabled={disabled || submitting || !value.trim()} className="w-full">
        <Send className="mr-2" /> {submitting ? 'جاري الإرسال...' : 'إرسال الجواب'}
      </Button>
    </div>
  );
});

/** ---------- Main ---------- */
interface TrapAnswerGameProps {
  game: Game;
  self: Player;
}

export function TrapAnswerGame({ game, self }: TrapAnswerGameProps) {
  const { toast } = useToast();

  const [loading, setLoading] = useState<{
    select?: boolean;
    answer?: boolean;
    guess?: boolean;
    next?: boolean;
  }>({});

  const [chosenGuess, setChosenGuess] = useState<string | null>(null);
  const [visibleReactions, setVisibleReactions] = useState<Record<string, EmojiReaction | null>>({});

  const isHost = game.hostId === self.id;

  const activePlayers = useMemo(
    () => (game?.players?.filter((p) => p.status !== 'left') ?? []),
    [game?.players]
  );

  const shuffledAnswers = useStableArray(game.trapAnswerState?.shuffledAnswers ?? []);
  const fiveCategories = useStableArray(game.trapAnswerState?.fiveRandomCategories ?? []);

  const playersSortedByTotalScore = useMemo(
    () =>
      [...(game.players ?? [])].sort(
        (a, b) => (game.playerScores?.[b.id] ?? 0) - (game.playerScores?.[a.id] ?? 0)
      ),
    [game.players, game.playerScores]
  );

  useEffect(() => {
    if (game.gameState === 'guessing') setChosenGuess(null);
  }, [game.gameState, game.round]);

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
        timers.push(
          window.setTimeout(() => {
            setVisibleReactions((prev) => ({ ...prev, [playerId]: null }));
          }, remaining)
        );
      } else {
        next[playerId] = null;
      }
    }

    setVisibleReactions(next);
    return () => timers.forEach(clearTimeout);
  }, [game.trapAnswerState?.reactions]);

  const WithTimer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Card className="w-full max-w-lg relative">
      {(game.trapAnswerState?.roundEndTime) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <CountdownTimer
            gameId={game.id}
            gameType="trap-answer"
            expiryTimestamp={game.trapAnswerState.roundEndTime.toMillis()}
            selfId={self.id}
            isHost={isHost}
          />
        </div>
      )}
      {children}
    </Card>
  );

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

  const handleSubmitAnswer = useCallback(
    async (text: string) => {
      if (has(game.trapAnswerState?.playerAnswers, self.id)) return;
      if (!text.trim()) {
        toast({ title: 'الرجاء إدخال إجابة', variant: 'destructive' });
        return;
      }
      setLoading((l) => ({ ...l, answer: true }));
      try {
        const result = await submitTrapAnswer(game.id, self.id, text.trim());
        if ((result as any)?.error) {
          toast({ title: 'خطأ', description: (result as any).error, variant: 'destructive' });
        } else {
          try { sessionStorage.removeItem(`trap-input-${game.id}`); } catch {}
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'تعذّر إرسال الإجابة';
        toast({ title: 'خطأ فادح', description: message, variant: 'destructive' });
      } finally {
        setLoading((l) => ({ ...l, answer: false }));
      }
    },
    [game.id, self.id, toast, game.trapAnswerState?.playerAnswers]
  );

  const handleGuessSubmit = useCallback(async () => {
    if (game.trapAnswerState?.playerGuesses?.[self.id]) return;
    if (!chosenGuess) {
      toast({ title: 'الرجاء اختيار إجابة', variant: 'destructive' });
      return;
    }
    setLoading((l) => ({ ...l, guess: true }));
    try {
      await submitGuess(game.id, self.id, chosenGuess);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذّر تسجيل التخمين';
      toast({ title: 'خطأ', description: message, variant: 'destructive' });
    } finally {
      setLoading((l) => ({ ...l, guess: false }));
    }
  }, [game.id, self.id, chosenGuess, toast]);

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

  const CategorySelection = memo(function CategorySelection({
    isMyTurn,
    currentPlayerName,
    categories,
    onPick,
    picking,
  }: {
    isMyTurn: boolean;
    currentPlayerName: string | undefined;
    categories: string[];
    onPick: (c: string) => void;
    picking: boolean | undefined;
  }) {
    return (
      <WithTimer>
        <CardHeader className="text-center pt-20">
          <CardTitle>الجولة {game.round ?? 1}</CardTitle>
          <CardDescription>
            حان دور <strong>{isMyTurn ? 'أنت' : currentPlayerName ?? '—'}</strong> لاختيار قسم.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <p className="text-muted-foreground text-center">
              {isMyTurn ? 'اختر أحد الأقسام التالية لطرح سؤال منه.' : `الأقسام المتاحة لـ ${currentPlayerName ?? '—'}:`}
            </p>
            {categories.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 w-full">
                {categories.map((cat) => (
                  <Button
                    key={cat}
                    onClick={() => onPick(cat)}
                    disabled={!!picking || !isMyTurn}
                    size="lg"
                    variant="outline"
                    className="text-base justify-center h-14"
                  >
                    {picking && isMyTurn ? <Loader2 className="animate-spin" /> : cat}
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
  });

  const AnswerSubmission = memo(function AnswerSubmission({
    question,
    hasSubmitted,
    pendingPlayers,
    awayPlayerIds,
  }: {
    question: string | undefined;
    hasSubmitted: boolean;
    pendingPlayers: Player[];
    awayPlayerIds: string[];
  }) {
    return (
      <WithTimer>
        <CardHeader className="text-center pt-20">
          <CardTitle>السؤال</CardTitle>
          <CardDescription className="text-2xl font-bold pt-2">
            {question ?? '—'}
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
            <StableAnswerInput
              gameId={game.id}
              submitting={!!loading.answer}
              onSubmit={handleSubmitAnswer}
            />
          )}
        </CardContent>
      </WithTimer>
    );
  });

  const Guessing = memo(function Guessing({
    question,
    hasGuessed,
    answers,
    chosen,
    setChosen,
    pendingPlayers,
    awayPlayerIds,
  }: {
    question: string | undefined;
    hasGuessed: boolean;
    answers: string[];
    chosen: string | null;
    setChosen: (v: string | null) => void;
    pendingPlayers: Player[];
    awayPlayerIds: string[];
  }) {
    return (
      <WithTimer>
        <CardHeader className="text-center pt-20">
          <CardTitle>أين هو الجواب الصحيح؟</CardTitle>
          <CardDescription className="text-2xl font-bold pt-2">
            {question ?? '—'}
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
              <RadioGroup
                value={chosen ?? ''}
                onValueChange={(val) => setChosen(val || null)}
                className="grid grid-cols-1 gap-3"
              >
                {answers.map((ans) => {
                  const id = idFromText(ans);
                  return (
                    <Label
                      key={id}
                      htmlFor={id}
                      className={cn(
                        'flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors',
                        chosen === ans
                          ? 'border-primary bg-primary/10'
                          : 'border-muted bg-muted/50 hover:border-primary/50'
                      )}
                    >
                      <RadioGroupItem value={ans} id={id} />
                      <span className="text-base font-semibold">{ans}</span>
                    </Label>
                  );
                })}
              </RadioGroup>
              <Button onClick={handleGuessSubmit} disabled={!!loading.guess || !chosen} className="w-full">
                <CheckCircle2 className="mr-2" /> {loading.guess ? 'جاري التأكيد...' : 'تأكيد التخمين'}
              </Button>
            </div>
          )}
        </CardContent>
      </WithTimer>
    );
  });

  const renderCategorySelection = () => {
    const turnOrder = game.trapAnswerState?.turnOrder ?? [];
    const currentTurnIndex = game.trapAnswerState?.currentTurnIndex ?? 0;
    const currentId = turnOrder[currentTurnIndex];
    const playerTurn = game.players.find((p) => p.id === currentId);
    const isMyTurn = self.id === playerTurn?.id;

    return (
      <CategorySelection
        isMyTurn={isMyTurn}
        currentPlayerName={playerTurn?.name}
        categories={fiveCategories}
        onPick={handleCategorySelect}
        picking={loading.select}
      />
    );
  };

  const renderAnswerSubmission = () => {
    const hasSubmitted = has(game.trapAnswerState?.playerAnswers, self.id);
    const answeredPlayers = Object.keys(game.trapAnswerState?.playerAnswers ?? {});
    const awayPlayerIds = game.trapAnswerState?.awayPlayerIds ?? [];
    const pendingPlayers = activePlayers.filter((p) => !answeredPlayers.includes(p.id));

    return (
      <AnswerSubmission
        question={game.trapAnswerState?.currentQuestion?.question}
        hasSubmitted={!!hasSubmitted}
        pendingPlayers={pendingPlayers}
        awayPlayerIds={awayPlayerIds}
      />
    );
  };

  const renderGuessing = () => {
    const hasGuessed = !!game.trapAnswerState?.playerGuesses?.[self.id];
    const answeredPlayers = Object.keys(game.trapAnswerState?.playerGuesses ?? {});
    const awayPlayerIds = game.trapAnswerState?.awayPlayerIds ?? [];
    const pendingPlayers = activePlayers.filter((p) => !answeredPlayers.includes(p.id));

    return (
      <Guessing
        question={game.trapAnswerState?.currentQuestion?.question}
        hasGuessed={hasGuessed}
        answers={shuffledAnswers}
        chosen={chosenGuess}
        setChosen={setChosenGuess}
        pendingPlayers={pendingPlayers}
        awayPlayerIds={awayPlayerIds}
      />
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
      <WithTimer>
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="text-center">
                <Award className="w-16 h-16 mx-auto text-yellow-500" />
                <CardTitle>نتائج الجولة {game.round ?? 1}</CardTitle>
                <CardDescription className="text-base pt-2">
                  السؤال كان:{' '}
                  <strong className="text-foreground">{game.trapAnswerState?.currentQuestion?.question ?? '—'}</strong>
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
                  <div
                    key={`${ans.text}-${idx}`}
                    className={cn(
                      'p-4 border-2 rounded-lg',
                      ans.isCorrect ? 'bg-green-100 border-green-500' : 'bg-card border-border'
                    )}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-lg font-bold">{ans.text}</p>
                      {ans.isCorrect ? (
                        <div className="px-2 py-1 text-xs font-bold text-green-800 bg-green-200 rounded-full">
                          الجواب الصحيح
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span>جواب:</span>
                          {ans.authorIds && ans.authorIds.length > 0 ? (
                            ans.authorIds.map((authorId) => {
                              const author = getPlayer(authorId);
                              return author ? (
                                <div key={authorId} className="flex items-center gap-1.5">
                                  <PlayerAvatar
                                    avatarId={author.avatarId}
                                    className="w-5 h-5"
                                    temporaryTitle={author.temporaryTitle}
                                  />
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
                              <PlayerAvatar
                                avatarId={guesser.avatarId}
                                className="w-4 h-4"
                                temporaryTitle={guesser.temporaryTitle}
                              />
                              <span>{guesser.name}</span>
                            </div>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
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
                                {roundScore.breakdown.map(
                                  (item: { reason: string; points: number }, i: number) => (
                                    <span
                                      key={i}
                                      className={cn(
                                        'text-xs',
                                        item.points > 0 ? 'text-green-600' : 'text-red-600'
                                      )}
                                    >
                                      ({item.points > 0 ? `+${item.points}` : item.points} {item.reason})
                                    </span>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-lg text-primary">{game.playerScores?.[p.id] ?? 0}</span>
                          {roundScore?.points > 0 && (
                            <span className="text-xs font-bold text-green-600">+{roundScore.points}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-center gap-2 mt-2 pt-2 border-t border-background w-full">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleSendReaction('laugh')}
                        >
                          <Laugh className="h-4 w-4 text-yellow-500" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSendReaction('mock')}>
                          <MessageCircleOff className="h-4 w-4 text-red-500" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleSendReaction('apologize')}
                        >
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
      </WithTimer>
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
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <Trophy className="w-24 h-24 mx-auto text-yellow-400" />
          <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
          {winner && <CardDescription className="text-2xl font-bold">الفائز هو {winner.name}!</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
            <div className="p-3 rounded-lg bg-red-100 border border-red-300">
              <h3 className="font-bold text-red-800 flex items-center justify-center gap-2">
                <Award /> المخادع المكار
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
            <div className="p-3 rounded-lg bg-blue-100 border border-blue-300">
              <h3 className="font-bold text-blue-800 flex items-center justify-center gap-2">
                <EyeOff /> الأكثر انخداعًا
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
                <AlertTriangle /> غشاشين محتملين
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
