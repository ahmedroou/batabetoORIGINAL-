'use client';

import React, { useState, useMemo } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { submitGuess } from '@/lib/actions/trap-answer';
import { Loader2, CheckCircle2, EyeOff } from 'lucide-react';
import { CountdownTimer } from '@/components/game/CountdownTimer';
import { cn } from '@/lib/utils';

const hasOwn = (obj: unknown, key: string) =>
  !!obj && Object.prototype.hasOwnProperty.call(obj as Record<string, unknown>, key);

const idFromText = (s: string) =>
  'ans-' +
  (typeof window === 'undefined'
    ? Buffer.from(s).toString('base64').replace(/=+$/g, '')
    : btoa(unescape(encodeURIComponent(s))).replace(/=+$/g, ''));

export function GuessingPhase({ game, self }: { game: Game; self: Player }) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [chosenGuess, setChosenGuess] = useState<string | null>(null);

    const hasGuessed = useMemo(() => hasOwn(game.trapAnswerState?.playerGuesses || {}, self.id), [game.trapAnswerState?.playerGuesses, self.id]);
    const shuffledAnswers = useMemo(() => game.trapAnswerState?.shuffledAnswers || [], [game.trapAnswerState?.shuffledAnswers]);
    const pendingPlayers = useMemo(() => {
        const guesses = game.trapAnswerState?.playerGuesses || {};
        return (game.players || []).filter(p => p.status !== 'left' && !hasOwn(guesses, p.id));
    }, [game.players, game.trapAnswerState?.playerGuesses]);
    const awayPlayerIds = useMemo(() => game.trapAnswerState?.awayPlayerIds || [], [game.trapAnswerState?.awayPlayerIds]);

    const handleGuessSubmit = async () => {
        if (game.trapAnswerState?.playerGuesses?.[self.id]) return;
        if (!chosenGuess) {
            toast({ title: 'الرجاء اختيار إجابة', variant: 'destructive' });
            return;
        }
        setLoading(true);
        try {
            await submitGuess(game.id, self.id, chosenGuess);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'تعذّر تسجيل التخمين';
            toast({ title: 'خطأ', description: message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-lg relative">
            {game.trapAnswerState?.roundEndTime && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                    <CountdownTimer
                        gameId={game.id}
                        gameType="trap-answer"
                        expiryTimestamp={game.trapAnswerState.roundEndTime.toMillis()}
                        selfId={self.id}
                        isHost={game.hostId === self.id}
                    />
                </div>
            )}
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
                        <RadioGroup
                            value={chosenGuess ?? ''}
                            onValueChange={(val) => setChosenGuess(val || null)}
                            className="grid grid-cols-1 gap-3"
                        >
                            {shuffledAnswers.map((ans) => {
                                const id = idFromText(ans);
                                return (
                                    <Label
                                        key={id}
                                        htmlFor={id}
                                        className={cn(
                                            'flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors',
                                            chosenGuess === ans
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
                        <Button onClick={handleGuessSubmit} disabled={loading || !chosenGuess} className="w-full">
                            <CheckCircle2 className="mr-2" /> {loading ? 'جاري التأكيد...' : 'تأكيد التخمين'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

    