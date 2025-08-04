
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Game, Player, PlayerGuess, GuessStatus } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { DrawingCanvas } from '../DrawingCanvas';
import { CountdownTimer } from '@/components/game/CountdownTimer';
import * as drawAndGuessActions from '@/app/actions';
import { Send, Check, X, CircleHelp, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface GuessingPhaseProps {
    game: Game;
    self: Player;
}

const getGuessColor = (status: GuessStatus) => {
    switch (status) {
        case 'correct': return 'bg-green-100 border-green-400 text-green-800';
        case 'close': return 'bg-yellow-100 border-yellow-400 text-yellow-800';
        default: return 'bg-muted'; // incorrect is the default
    }
};

export function GuessingPhase({ game, self }: GuessingPhaseProps) {
    const { toast } = useToast();
    const dgs = game.drawAndGuessState;
    const isMyTurn = dgs?.currentDrawerId === self.id;
    const isHost = game.hostId === self.id;
    const drawer = game.players.find(p => p.id === dgs?.currentDrawerId);
    
    const [guess, setGuess] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const guesses = dgs?.guesses || [];
    const myGuessesCount = guesses.filter(g => g.playerId === self.id).length;
    const canGuess = !isMyTurn && myGuessesCount < 5;
    
    const scrollAreaRef = useRef<HTMLDivElement>(null);

     const onExpire = useCallback(() => {
        if (isHost) {
            drawAndGuessActions.handleDrawAndGuessTimeout(game.id, self.id);
        }
    }, [isHost, game.id, self.id]);

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [guesses]);

    const handleGuessSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!guess.trim() || !canGuess || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await drawAndGuessActions.submitGuess(game.id, self.id, guess);
            setGuess('');
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleSetStatus = async (guesserId: string, guessText: string, status: GuessStatus) => {
        if (!isMyTurn || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await drawAndGuessActions.setGuessStatus(game.id, self.id, guesserId, guessText, status);
        } catch (error: any) {
             toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4">
            <div className="w-full text-center p-2 mb-2 bg-background/80 rounded-xl backdrop-blur-sm relative">
                <h2 className="text-2xl font-bold">دور {drawer?.name} للرسم</h2>
                <p className="text-muted-foreground">الفئة: {dgs?.prompt?.category}</p>
                 {dgs?.timerEndsAt && (
                    <div className="absolute top-1/2 -translate-y-1/2 right-4 z-10">
                        <CountdownTimer expiryTimestamp={dgs.timerEndsAt.toMillis()} onExpire={onExpire} />
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full h-full max-h-[75vh]">
                <div className="md:col-span-2 w-full h-full min-h-[400px]">
                    <DrawingCanvas 
                        initialDrawing={dgs?.drawing || undefined}
                        onDraw={() => {}} 
                        isDrawingDisabled={true} 
                    />
                </div>

                <Card className="flex flex-col h-full">
                    <CardHeader>
                        <CardTitle>لوحة التخمينات</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-grow overflow-hidden">
                        <ScrollArea className="h-full" ref={scrollAreaRef}>
                            <div className="space-y-2 pr-4">
                                <AnimatePresence>
                                {guesses.map((g, index) => (
                                    <motion.div
                                        key={`${g.playerId}-${g.guess}-${index}`}
                                        className={cn("p-2 rounded-lg border text-sm", getGuessColor(g.status))}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                    >
                                        <div className='flex items-center justify-between'>
                                            <div>
                                                 <span className="font-bold">{isMyTurn ? g.playerName : 'تخمينك'}: </span>
                                                 <span>{g.guess}</span>
                                            </div>
                                             {isMyTurn && g.status === 'incorrect' && (
                                                <div className="flex gap-1">
                                                    <Button size="icon" className="h-7 w-7 bg-green-500 hover:bg-green-600" onClick={() => handleSetStatus(g.playerId, g.guess, 'correct')}><Check/></Button>
                                                    <Button size="icon" className="h-7 w-7 bg-yellow-500 hover:bg-yellow-600" onClick={() => handleSetStatus(g.playerId, g.guess, 'close')}><CircleHelp/></Button>
                                                    <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => handleSetStatus(g.playerId, g.guess, 'incorrect')}><X/></Button>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                                </AnimatePresence>
                            </div>
                        </ScrollArea>
                    </CardContent>
                    {!isMyTurn && (
                        <CardFooter className="pt-4">
                            <form onSubmit={handleGuessSubmit} className="w-full space-y-2">
                                <div className="flex gap-2">
                                <Input 
                                    placeholder={canGuess ? 'اكتب تخمينك هنا...' : 'لقد استنفدت محاولاتك'} 
                                    value={guess}
                                    onChange={(e) => setGuess(e.target.value)}
                                    disabled={!canGuess || isSubmitting}
                                />
                                <Button type="submit" disabled={!canGuess || !guess.trim() || isSubmitting}>
                                    {isSubmitting ? <Loader2 className="animate-spin" /> : <Send />}
                                </Button>
                                </div>
                                <p className="text-xs text-center text-muted-foreground">
                                    المحاولات المتبقية: {5 - myGuessesCount}
                                </p>
                            </form>
                        </CardFooter>
                    )}
                </Card>
            </div>
        </div>
    );
}
