'use client';

import React, { useMemo } from 'react';
import type { Game, Player, EmojiReaction, EmojiReactionType } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { motion } from 'framer-motion';
import { nextTrapAnswerRound, sendReaction } from '@/lib/actions/trap-answer';
import {
    Award,
    Loader2,
    Laugh,
    MessageCircleOff,
    Handshake,
    Drama,
    EyeOff,
    TimerIcon
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { CountdownTimer } from '@/components/game/CountdownTimer';

const isDefined = <T,>(v: T | undefined | null): v is T => v !== undefined && v !== null;

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

export function RoundResultsPhase({ game, self, isHost }: { game: Game; self: Player; isHost: boolean }) {
    const { toast } = useToast();
    const [loading, setLoading] = React.useState(false);
    const [visibleReactions, setVisibleReactions] = React.useState<Record<string, EmojiReaction | null>>({});

    const playersSortedByTotalScore = useMemo(
        () => [...(game.players ?? [])].sort((a, b) => (game.playerScores?.[b.id] ?? 0) - (game.playerScores?.[a.id] ?? 0)),
        [game.players, game.playerScores]
    );

    React.useEffect(() => {
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

    const handleNextRound = async () => {
        setLoading(true);
        try {
            await nextTrapAnswerRound(game.id, self.id);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'تعذّر بدء الجولة التالية';
            toast({ title: 'خطأ', description: message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleSendReaction = (emoji: EmojiReactionType) => {
        sendReaction(game.id, self.id, emoji);
    };

    const results = game.trapAnswerState?.lastRoundResults;
    if (!results) {
        return (
            <Card className="w-full max-w-lg">
                <CardContent className="flex items-center gap-2 py-8">
                    <Loader2 className="animate-spin" />
                    <span>جاري تحميل النتائج...</span>
                </CardContent>
            </Card>
        );
    }

    const getPlayer = (playerId: string) => game.players.find((p) => p.id === playerId);
    const timedOutPlayers = (results.timedOutGuesserIds ?? []).map(getPlayer).filter(isDefined);
    const awayPlayerIds = results.awayPlayerIdsDuringRound ?? [];

    return (
        <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
                <Card>
                    <CardHeader className="text-center pt-6">
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
                <ScrollArea className="h-[calc(100vh-28rem)] pr-4">
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
                    <Button onClick={handleNextRound} disabled={loading} className="w-full">
                        {loading
                            ? 'جاري التحميل...'
                            : (game.round ?? 0) >= (game.trapAnswerState?.settings?.rounds ?? 10)
                                ? 'عرض النتائج النهائية'
                                : 'الجولة التالية'}
                    </Button>
                )}
                {!isHost && (
                    <div className="text-center p-2 bg-muted rounded-md text-sm text-muted-foreground animate-pulse">
                        في انتظار المضيف...
                    </div>
                )}
            </div>
        </div>
    );
}

    