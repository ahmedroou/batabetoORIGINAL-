'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Game, Player, EmojiReaction, EmojiReactionType } from '@/types';
import { useToast } from '@/hooks/use-toast';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle
} from '@/components/ui/card';
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
  updateGameSettings as updateTrapAnswerSettings
} from '@/lib/actions/trap-answer';
import { kickPlayerFromLobby, leaveGame } from '@/lib/actions/room';
import {
  Award, CheckCircle2, Loader2, Send, ArrowRight, Copy, Check, TimerIcon, LogOut,
  Laugh, MessageCircleOff, Handshake, Drama, VenetianMask, UserRound, Trophy, EyeOff,
  AlertTriangle, UserX, Save, Settings
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { CountdownTimer } from '@/components/game/CountdownTimer';
import { DEFAULT_TRAP_ANSWER_CATEGORIES } from '@/data/social-ranks';

/* ---------------------------- Types & Utilities --------------------------- */

type TrapAnswerSettings = {
  categories: string[];
  rounds: number;
  answerTime: number;
};

const SectionTimer = ({
  endsAt,
  onExpire
}: {
  endsAt?: { toMillis: () => number } | null;
  onExpire: () => void;
}) => {
  if (!endsAt) return null;
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
      <CountdownTimer expiryTimestamp={endsAt.toMillis()} onExpire={onExpire} />
    </div>
  );
};

const EmojiDisplay = ({ reaction }: { reaction: EmojiReaction | null }) => {
  if (!reaction) return null;

  const EMOJI_MAP: Record<EmojiReactionType, JSX.Element> = {
    laugh: <Laugh className="w-16 h-16 text-yellow-400" />,
    mock: <MessageCircleOff className="w-16 h-16 text-red-500" />,
    apologize: <Handshake className="w-16 h-16 text-blue-400" />,
    shame: <Drama className="w-16 h-16 text-purple-400" />
  };

  return (
    <motion.div
      key={(reaction.timestamp as any)?.toMillis?.() ?? `${reaction.emoji}-${Math.random()}`}
      initial={{ scale: 0.5, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.5, opacity: 0, y: 20 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="absolute -top-8 -right-8 z-10 bg-background/80 backdrop-blur-sm rounded-full p-2 shadow-lg"
      aria-hidden
    >
      {EMOJI_MAP[reaction.emoji]}
    </motion.div>
  );
};

/* --------------------------------- Main ---------------------------------- */

export function TrapAnswerGame({ game, self }: { game: Game; self: Player }) {
  const router = useRouter();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [trapAnswer, setTrapAnswer] = useState('');
  const [chosenGuess, setChosenGuess] = useState<string | null>(null);
  const [visibleReactions, setVisibleReactions] = useState<Record<string, EmojiReaction | null>>({});

  const isHost = game.hostId === self.id;

  const activePlayers = useMemo(
    () => (game?.players?.filter((p) => p.status !== 'left') ?? []),
    [game?.players]
  );

  const uniqueDisplayAnswers = useMemo(
    () => game.trapAnswerState?.shuffledAnswers ?? [],
    [game.trapAnswerState?.shuffledAnswers]
  );

  const onTimeout = useCallback(() => {
    if (isHost) {
      handleTimeout(game.id, self.id);
    }
  }, [game.id, self.id, isHost]);

  useEffect(() => {
    if (game.gameState === 'guessing') {
      setChosenGuess(null);
    }
  }, [game.gameState, game.round]);

  useEffect(() => {
    if (game.gameState === 'answer-submission') {
      setTrapAnswer('');
    }
  }, [game.gameState, game.round]);

  useEffect(() => {
    const reactions = game.trapAnswerState?.reactions || {};
    const now = Date.now();
    const newVisible: Record<string, EmojiReaction | null> = {};

    Object.entries(reactions).forEach(([playerId, reaction]) => {
      if (reaction && (now - (reaction.timestamp as any)?.toMillis?.() < 4000)) {
        newVisible[playerId] = reaction;
      } else {
        newVisible[playerId] = null;
      }
    });

    setVisibleReactions(newVisible);
  }, [game.trapAnswerState?.reactions]);

  /* --------------------------------- Actions -------------------------------- */

  const handleCategorySelect = useCallback(
    async (category: string) => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      try {
        await selectCategoryAndGetQuestion(game.id, self.id, category);
      } catch (error: any) {
        toast({ title: 'خطأ', description: error?.message ?? 'حدث خطأ غير متوقع', variant: 'destructive' });
      } finally {
        setIsSubmitting(false);
      }
    },
    [game.id, self.id, isSubmitting, toast]
  );

  const handleSubmitAnswer = useCallback(async () => {
    if (game.trapAnswerState?.playerAnswers?.hasOwnProperty(self.id)) return;

    const value = trapAnswer.trim();
    if (!value) {
      toast({ title: 'الرجاء كتابة إجابة', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitTrapAnswer(game.id, self.id, value);
      if ((result as any)?.error) {
        toast({ title: 'خطأ', description: (result as any).error, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'خطأ فادح', description: error?.message ?? 'حدث خطأ غير متوقع', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }, [game.id, self.id, trapAnswer, toast, game.trapAnswerState?.playerAnswers]);

  const handleGuessSubmit = useCallback(async () => {
    if (game.trapAnswerState?.playerGuesses?.[self.id]) return;

    if (!chosenGuess) {
      toast({ title: 'الرجاء اختيار إجابة', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      await submitGuess(game.id, self.id, chosenGuess);
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message ?? 'حدث خطأ غير متوقع', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }, [game.id, self.id, chosenGuess, toast, game.trapAnswerState?.playerGuesses]);

  const handleNextRound = async () => {
    setIsSubmitting(true);
    try {
      await nextTrapAnswerRound(game.id, self.id);
    } catch (error: any) {
      toast({ title: 'خطأ', description: error?.message ?? 'حدث خطأ غير متوقع', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendReaction = (emoji: EmojiReactionType) => {
    sendReaction(game.id, self.id, emoji);
  };

  /* ------------------------------ Sub-Renderers ------------------------------ */

  const renderCategorySelection = () => {
    const turnOrder = game.trapAnswerState?.turnOrder || [];
    const currentTurnIndex = game.trapAnswerState?.currentTurnIndex || 0;
    const playerWhoseTurnItIs = game.players.find((p) => p.id === turnOrder[currentTurnIndex]);
    const isMyTurn = self.id === playerWhoseTurnItIs?.id;
    const categories = game.trapAnswerState?.fiveRandomCategories || [];

    return (
      <Card className="w-full max-w-lg animate-pop-in relative">
        <SectionTimer endsAt={game.trapAnswerState?.timerEndsAt} onExpire={onTimeout} />
        <CardHeader className="text-center pt-20">
          <CardTitle>الجولة {game.round || 1}</CardTitle>
          <CardDescription>
            حان دور <strong>{isMyTurn ? 'أنت' : playerWhoseTurnItIs?.name}</strong> لاختيار قسم.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <p className="text-muted-foreground text-center">
              {isMyTurn ? 'اختر أحد الأقسام التالية لطرح سؤال منه.' : `الأقسام المتاحة لـ ${playerWhoseTurnItIs?.name}:`}
            </p>
            <div className="grid grid-cols-2 gap-3 w-full">
              {categories.map((cat) => (
                <Button
                  key={cat}
                  onClick={() => handleCategorySelect(cat)}
                  disabled={isSubmitting || !isMyTurn}
                  size="lg"
                  variant="outline"
                  className="text-base justify-center h-14"
                >
                  {isSubmitting && isMyTurn ? <Loader2 className="animate-spin" /> : cat}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderAnswerSubmission = () => {
    const hasSubmitted = game.trapAnswerState?.playerAnswers?.hasOwnProperty(self.id);
    const answeredPlayers = game.trapAnswerState?.playerAnswers ? Object.keys(game.trapAnswerState.playerAnswers) : [];
    const awayPlayerIds = game.trapAnswerState?.awayPlayerIds || [];
    const pendingPlayers = activePlayers.filter((p) => !answeredPlayers.includes(p.id));

    return (
      <Card className="w-full max-w-lg animate-pop-in relative">
        <SectionTimer endsAt={game.trapAnswerState?.timerEndsAt} onExpire={onTimeout} />
        <CardHeader className="text-center pt-20">
          <CardTitle>السؤال</CardTitle>
          <CardDescription className="text-2xl font-bold pt-2">
            {game.trapAnswerState?.currentQuestion?.question}
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
                placeholder="اكتب إجابتك هنا..."
                value={trapAnswer}
                onChange={(e) => setTrapAnswer(e.target.value)}
                rows={4}
              />
              <Button onClick={handleSubmitAnswer} disabled={isSubmitting || !trapAnswer.trim()} className="w-full">
                <Send className="mr-2" /> {isSubmitting ? 'جاري الإرسال...' : 'إرسال الجواب'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderGuessing = () => {
    const hasGuessed = !!game.trapAnswerState?.playerGuesses?.[self.id];
    const answeredPlayers = game.trapAnswerState?.playerGuesses ? Object.keys(game.trapAnswerState.playerGuesses) : [];
    const awayPlayerIds = game.trapAnswerState?.awayPlayerIds || [];
    const pendingPlayers = activePlayers.filter((p) => !answeredPlayers.includes(p.id));

    return (
      <Card className="w-full max-w-lg animate-pop-in relative">
        <SectionTimer endsAt={game.trapAnswerState?.timerEndsAt} onExpire={onTimeout} />
        <CardHeader className="text-center pt-20">
          <CardTitle>أين هو الجواب الصحيح؟</CardTitle>
          <CardDescription className="text-2xl font-bold pt-2">
            {game.trapAnswerState?.currentQuestion?.question}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasGuessed ? (
            <div className="text-center p-4 rounded-lg bg-green-100 text-green-800 space-y-4" aria-live="polite">
              <p className="font-semibold">تم تسجيل تخمينك! في انتظار بقية اللاعبين...</p>
