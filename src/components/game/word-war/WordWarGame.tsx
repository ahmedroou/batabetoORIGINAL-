
"use client";

import type { Game, Player, WordWarCard } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import * as wordWarActions from '@/lib/actions/word-war';
import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { Brain, CheckCircle, Swords, Users, Crown, Loader2, Send, Lightbulb, SkipForward, Clock } from 'lucide-react';
import { CountdownTimer } from '@/components/game/CountdownTimer';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';


interface WordWarGameProps {
    game: Game;
    self: Player;
}

const getCardColorStyles = (card: WordWarCard, isGuide: boolean, gameState: Game['gameState']) => {
    const revealed = card.revealed || gameState === 'final_results';
    const color = isGuide || revealed ? card.color : 'default';

    switch (color) {
        case 'red': return 'bg-red-300 border-red-500 text-red-900';
        case 'blue': return 'bg-blue-300 border-blue-500 text-blue-900';
        case 'neutral': return 'bg-yellow-200 border-yellow-400 text-yellow-900';
        case 'assassin': return 'bg-gray-800 border-gray-900 text-white';
        default: return 'bg-gray-200 border-gray-400 hover:bg-gray-300 text-gray-800';
    }
};

const ScoreCounter = ({ label, count, colorClass, icon: Icon }: { label: string; count: number; colorClass: string, icon: React.ElementType }) => (
    <div className={cn("flex flex-col items-center justify-center p-3 rounded-lg text-white text-center", colorClass)}>
        <Icon className="w-8 h-8" />
        <span className="text-3xl font-bold font-mono">{count}</span>
        <span className="text-sm font-semibold">{label}</span>
    </div>
);


export function WordWarGame({ game, self }: WordWarGameProps) {
    const { toast } = useToast();
    const wwState = game.wordWarState;
    if (!wwState) return <div>خطأ: حالة اللعبة غير موجودة.</div>;

    const [hintWord, setHintWord] = useState('');
    const [hintNumber, setHintNumber] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isMyTurn = wwState.turn === self.team;
    const isGuide = wwState.guides[self.team as 'red' | 'blue'] === self.id;
    const isGuesserTurn = (isMyTurn && !isGuide && game.gameState === 'guesser_turn');
    const isGuideTurn = (isMyTurn && isGuide && game.gameState === 'guide_turn');
    const isHost = game.hostId === self.id;

    const score = useMemo(() => {
        return wwState.cards.reduce((acc, card) => {
            if (card.revealed) {
                acc[card.color] = (acc[card.color] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);
    }, [wwState.cards]);

    const cardsLeft = useMemo(() => {
        const redTotal = wwState.cards.filter(c => c.color === 'red').length;
        const blueTotal = wwState.cards.filter(c => c.color === 'blue').length;
        return {
            red: redTotal - (score.red || 0),
            blue: blueTotal - (score.blue || 0)
        }
    }, [score, wwState.cards]);


    const handleHintSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!hintWord.trim() || hintNumber < 1) {
            toast({ title: 'تلميح غير صالح', description: 'الرجاء إدخال كلمة وعدد صحيح أكبر من صفر.', variant: 'destructive' });
            return;
        }
        setIsSubmitting(true);
        try {
            await wordWarActions.submitHint(game.id, self.id, hintWord, hintNumber);
            setHintWord('');
            setHintNumber(1);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCardReveal = async (cardIndex: number) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await wordWarActions.revealCard(game.id, self.id, cardIndex);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleEndTurn = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await wordWarActions.endTurn(game.id, self.id);
        } catch (error: any) {
             toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleStartFirstTurn = async () => {
        if (isSubmitting || !isHost) return;
        setIsSubmitting(true);
        try {
            await wordWarActions.startFirstTurn(game.id, self.id);
        } catch (error: any) {
             toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    const onTimeout = useCallback(() => {
        if(isMyTurn || game.gameState === 'preparation') {
            wordWarActions.handleTimeout(game.id, self.id);
        }
    }, [isMyTurn, game.id, self.id, game.gameState]);
    
    if(game.gameState === 'preparation') {
        return (
             <div className="w-full h-screen flex flex-col items-center p-4 bg-gray-50">
                 {wwState.timerEndsAt && (
                     <div className="absolute top-4 right-4 z-10">
                        <CountdownTimer 
                            expiryTimestamp={wwState.timerEndsAt.toMillis()}
                            onExpire={onTimeout}
                        />
                    </div>
                 )}
                 <header className="text-center p-4 mb-4">
                      <h1 className="text-4xl font-bold flex items-center gap-2 justify-center"><Clock className="text-primary"/> فترة التجهيز</h1>
                      <p className="text-muted-foreground mt-2">لديك دقيقة واحدة لقراءة الكلمات والتخطيط قبل بدء الجولة الأولى.</p>
                 </header>
                 <main className="w-full flex-grow grid grid-cols-8 gap-2 p-2">
                    {wwState.cards.map((card, index) => (
                        <div
                            key={index}
                            className={cn(
                                'w-full h-full rounded-md flex items-center justify-center p-2 text-center font-bold text-lg shadow-md',
                                getCardColorStyles(card, false, game.gameState) // Show default colors for all
                            )}
                        >
                           {card.text}
                        </div>
                    ))}
                 </main>
                  <footer className="w-full p-4">
                       {isHost ? (
                           <Button onClick={handleStartFirstTurn} disabled={isSubmitting} className="w-full max-w-lg mx-auto">
                               {isSubmitting ? <Loader2 className="animate-spin" /> : "ابدأ الدور الأول"}
                           </Button>
                       ) : (
                           <p className="text-center text-muted-foreground animate-pulse">في انتظار المضيف لبدء اللعبة...</p>
                       )}
                  </footer>
             </div>
        );
    }

    const renderHeader = () => {
         if (game.gameState === 'final_results' && game.gameResult) {
            const winnerColor = game.gameResult.winner === 'red' ? 'text-red-500' : 'text-blue-500';
            return (
                <div className="text-center">
                    <Crown className="w-16 h-16 mx-auto text-yellow-400" />
                    <h1 className={cn("text-4xl font-bold", winnerColor)}>الفريق {game.gameResult.winner === 'red' ? 'الأحمر' : 'الأزرق'} يفوز!</h1>
                    <p className="text-muted-foreground">{game.gameResult.message}</p>
                </div>
            );
        }
        
        const turnColor = wwState.turn === 'red' ? 'text-red-500' : 'text-blue-500';
        let turnText = `دور الفريق ${wwState.turn === 'red' ? 'الأحمر' : 'الأزرق'}`;
        if(game.gameState === 'guide_turn') turnText += ' (المرشد)';
        else if (game.gameState === 'guesser_turn') turnText += ' (التخمين)';
        
        return (
            <div className="flex justify-between items-center w-full">
                <ScoreCounter label="الفريق الأحمر" count={cardsLeft.red} colorClass="bg-red-500" icon={Users} />
                <div className="text-center">
                    <h1 className="text-4xl font-bold flex items-center gap-2 justify-center"><Swords /> حرب الكلمات</h1>
                    <h2 className={cn("text-2xl font-semibold", turnColor)}>{turnText}</h2>
                </div>
                <ScoreCounter label="الفريق الأزرق" count={cardsLeft.blue} colorClass="bg-blue-500" icon={Users} />
            </div>
        );
    };

    const renderActionPanel = () => {
        if (game.gameState === 'final_results') return null;

        if (isGuideTurn) {
            return (
                <Card className="w-full max-w-lg mx-auto">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Lightbulb /> دورك كمرشد</CardTitle>
                        <CardDescription>أعطِ فريقك تلميحًا من كلمة واحدة وعدد البطاقات المتعلقة بها.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleHintSubmit} className="flex gap-2">
                            <Input
                                placeholder="اكتب التلميح هنا..."
                                value={hintWord}
                                onChange={(e) => setHintWord(e.target.value)}
                                maxLength={8}
                                className="text-lg h-12"
                            />
                            <Input
                                type="number"
                                value={hintNumber}
                                onChange={(e) => setHintNumber(parseInt(e.target.value, 10))}
                                min={1}
                                max={9}
                                className="w-24 text-lg h-12 text-center"
                            />
                            <Button type="submit" size="lg" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="animate-spin" /> : <Send />}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            );
        }

        if (isGuesserTurn) {
            return (
                 <Alert className="w-full max-w-lg mx-auto bg-primary/10 border-primary/50 text-center">
                    <Lightbulb className="h-4 w-4" />
                    <AlertTitle className="text-lg">دورك في التخمين!</AlertTitle>
                    <AlertDescription className="text-base">
                        التلميح هو: <strong className="text-primary text-xl mx-2">{wwState.currentHint?.word}</strong> 
                        لـ <strong className="text-primary text-xl mx-2">{wwState.currentHint?.count}</strong> كلمات.
                        تبقى لك <strong className="text-primary text-xl mx-2">{wwState.guessesLeft}</strong> تخمينات.
                    </AlertDescription>
                    <div className="mt-4">
                        <Button onClick={handleEndTurn} disabled={isSubmitting} variant="outline" className="w-full">
                           <SkipForward className="ml-2"/> إنهاء الدور
                       </Button>
                    </div>
                </Alert>
            );
        }

        // Waiting message for other players
        return (
             <Card className="w-full max-w-lg mx-auto animate-pulse">
                <CardHeader className="text-center">
                    <CardTitle>الرجاء الانتظار...</CardTitle>
                    <CardDescription>
                        {game.gameState === 'guide_turn' ? `في انتظار مرشد الفريق ${wwState.turn === 'red' ? 'الأحمر' : 'الأزرق'} ليعطي تلميحًا.`
                        : `في انتظار فريق ${wwState.turn === 'red' ? 'الأحمر' : 'الأزرق'} لتخمين الكلمات.`}
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    };

    return (
        <div className="w-full h-screen flex flex-col items-center p-4 bg-gray-50">
             {wwState.timerEndsAt && game.gameState !== 'final_results' && (
                <div className="absolute top-4 right-4 z-10">
                    <CountdownTimer 
                        expiryTimestamp={wwState.timerEndsAt.toMillis()}
                        onExpire={onTimeout}
                    />
                </div>
            )}
            <header className="w-full p-4 mb-4">
                {renderHeader()}
            </header>

            <main className="w-full flex-grow grid grid-cols-8 gap-2 p-2">
                {wwState.cards.map((card, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.02 }}
                    >
                        <button
                            onClick={() => handleCardReveal(index)}
                            disabled={!isGuesserTurn || card.revealed}
                            className={cn(
                                'w-full h-full rounded-md flex items-center justify-center p-2 text-center font-bold text-lg shadow-md transition-all duration-300 transform',
                                getCardColorStyles(card, isGuide, game.gameState),
                                isGuesserTurn && !card.revealed && 'hover:scale-105 hover:shadow-lg',
                                card.revealed && 'scale-95 opacity-70'
                            )}
                        >
                            <AnimatePresence mode="wait">
                                <motion.span
                                    key={card.revealed ? `revealed-${index}` : `hidden-${index}`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    {(game.gameState === 'final_results' && !card.revealed) ? '' : card.text}
                                </motion.span>
                            </AnimatePresence>
                        </button>
                    </motion.div>
                ))}
            </main>

            <footer className="w-full p-4">
                {renderActionPanel()}
            </footer>
        </div>
    );
}
