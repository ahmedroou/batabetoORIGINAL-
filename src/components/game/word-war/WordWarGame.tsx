
"use client";

import type { Game, Player, WordWarCard } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import * as wordWarActions from '@/lib/actions/word-war';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { Brain, CheckCircle, Swords, Users, Crown, Loader2, Send, Lightbulb, SkipForward, Clock, Hand, UserCheck, Eye, X, Shuffle } from 'lucide-react';
import { CountdownTimer } from '@/components/game/CountdownTimer';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { PlayerAvatar } from '../PlayerAvatar';
import * as roomActions from '@/lib/actions/room';
import { useRouter } from 'next/navigation';
import { Lobby } from './Lobby';


interface WordWarGameProps {
    game: Game;
    self: Player;
}

const getCardColorStyles = (card: WordWarCard, isGuide: boolean, gameState: Game['gameState']) => {
    const showTrueColor = isGuide || card.revealed || gameState === 'final_results';
    const color = showTrueColor ? card.color : 'default';

    switch (color) {
        case 'red': return 'bg-red-500 border-red-700 text-white';
        case 'blue': return 'bg-blue-500 border-blue-700 text-white';
        case 'neutral': return 'bg-yellow-200 border-yellow-400 text-yellow-900';
        case 'assassin': return 'bg-gray-800 border-gray-900 text-white';
        default: return 'bg-gray-200 border-gray-400 hover:bg-gray-300 text-gray-800';
    }
};

const ScoreCounter = ({ label, count, colorClass, icon: Icon }: { label: string; count: number; colorClass: string, icon: React.ElementType }) => (
    <div className={cn("flex flex-col items-center justify-center p-2 rounded-lg text-white text-center w-24", colorClass)}>
        <Icon className="w-6 h-6" />
        <span className="text-2xl font-bold font-mono">{count}</span>
        <span className="text-xs font-semibold">{label}</span>
    </div>
);

function renderHeader(game: Game, self: Player) {
    const wwState = game.wordWarState!;
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
    
    let turnText: string;
    switch(game.gameState) {
        case 'preparation':
            turnText = "فترة التجهيز";
            break;
        case 'guide_turn':
            turnText = `دور المرشد (${wwState.turn === 'red' ? 'الأحمر' : 'الأزرق'})`;
            break;
        case 'guesser_turn':
            turnText = `دور المخمنين (${wwState.turn === 'red' ? 'الأحمر' : 'الأزرق'})`;
            break;
        default:
            turnText = "حرب الكلمات";
    }

    const turnColor = wwState.turn === 'red' ? 'text-red-500' : 'text-blue-500';
    
    return (
        <div className="flex justify-center items-center w-full relative">
             <div className="text-center">
                <h1 className="text-4xl font-bold flex items-center gap-2 justify-center"><Swords /> حرب الكلمات</h1>
                <h2 className={cn("text-2xl font-semibold", turnColor)}>{turnText}</h2>
            </div>
        </div>
    );
};
    

export function WordWarGame({ game, self }: WordWarGameProps) {
    const { toast } = useToast();
    const [hintWord, setHintWord] = useState('');
    const [hintNumber, setHintNumber] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    useEffect(() => {
        if (game.gameState === 'lobby' || game.gameState === 'final_results') {
            setIsSubmitting(false); // Reset submitting state on game end/reset
        }
    }, [game.gameState]);
    
    const wwState = game.wordWarState;

    if (game.gameState === 'lobby') {
        return <Lobby game={game} self={self} />;
    }

    if (!wwState) {
        return <div>خطأ: حالة اللعبة غير موجودة.</div>;
    }

    const isMyTurn = wwState.turn === self.team;
    const isGuide = wwState.guides[self.team as 'red' | 'blue'] === self.id;
    const isGuesserTurn = (isMyTurn && !isGuide && game.gameState === 'guesser_turn');
    const isGuideTurn = (isMyTurn && isGuide && game.gameState === 'guide_turn');
    
    const renderActionPanel = () => {

        if (game.gameState === 'final_results') return (
             <Button onClick={() => window.location.href = '/'} className="w-full max-w-lg mx-auto">العب مرة أخرى</Button>
        );
        
        if (game.gameState === 'guesser_turn' && wwState.currentHint) {
            return (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                >
                    <Card className="w-full max-w-3xl mx-auto bg-gray-800 text-white border-primary/50 shadow-lg">
                        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-center gap-4 text-center">
                            <Lightbulb className="w-10 h-10 text-yellow-400 shrink-0" />
                            <div className="flex-grow">
                                <p className="text-lg font-semibold">التلميح هو:</p>
                                <p className="text-4xl font-bold text-primary tracking-widest">{wwState.currentHint?.word}</p>
                            </div>
                            <div className="w-24 h-24 rounded-full bg-gray-700 flex flex-col items-center justify-center border-4 border-primary/70">
                                <p className="text-5xl font-bold font-mono text-yellow-300">{wwState.currentHint?.count}</p>
                                <p className="text-xs font-semibold">كلمات</p>
                            </div>
                            {isGuesserTurn && (
                                <div className="text-center md:text-right">
                                    <p className="font-semibold">تخمينات متبقية: <span className="text-xl text-yellow-300">{wwState.guessesLeft}</span></p>
                                    <Button onClick={() => wordWarActions.endTurn(game.id, self.id)} disabled={isSubmitting} variant="secondary" size="sm" className="mt-2">
                                        <SkipForward className="ml-2"/> إنهاء الدور
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            );
        }

        if (isGuideTurn) {
            return (
                <Card className="w-full max-w-lg mx-auto">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Lightbulb /> دورك كمرشد</CardTitle>
                        <CardDescription>أعطِ فريقك تلميحًا من كلمة واحدة (8 أحرف، بدون مسافات) وعدد البطاقات المتعلقة بها.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <form onSubmit={async (e) => {
                                e.preventDefault();
                                const trimmedHint = hintWord.trim();
                                if (!trimmedHint || hintNumber < 1) {
                                    toast({ title: 'تلميح غير صالح', description: 'الرجاء إدخال كلمة وعدد صحيح أكبر من صفر.', variant: 'destructive' });
                                    return;
                                }
                                setIsSubmitting(true);
                                try {
                                    await wordWarActions.submitHint(game.id, self.id, trimmedHint, hintNumber);
                                    setHintWord('');
                                    setHintNumber(1);
                                } catch (error: any) {
                                    toast({ title: "خطأ", description: error.message, variant: "destructive" });
                                } finally {
                                    setIsSubmitting(false);
                                }
                            }} className="flex gap-2">
                            <Input
                                placeholder="اكتب التلميح هنا..."
                                value={hintWord}
                                onChange={(e) => {
                                    const value = e.target.value.replace(/\s/g, '');
                                    if(value.length <= 8) setHintWord(value);
                                }}
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
        
        return (
             <Card className="w-full max-w-lg mx-auto animate-pulse">
                <CardHeader className="text-center">
                    <CardTitle>الرجاء الانتظار...</CardTitle>
                    <CardDescription>
                        {game.gameState === 'guide_turn' ? `في انتظار مرشد الفريق ${wwState.turn === 'red' ? 'الأحمر' : 'الأزرق'} ليعطي تلميحًا.`
                        : game.gameState === 'preparation' ? 'فترة التجهيز... استعدوا!'
                        : `في انتظار فريق ${wwState.turn === 'red' ? 'الأحمر' : 'الأزرق'} لتخمين الكلمات.`}
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    };

    const renderGameBoard = () => {
        const teamRedPlayers = useMemo(() => game.players.filter(p => p.team === 'red'), [game.players]);
        const teamBluePlayers = useMemo(() => game.players.filter(p => p.team === 'blue'), [game.players]);

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

        const onTimeout = useCallback(() => {
            if(isMyTurn || game.gameState === 'preparation') {
                wordWarActions.handleTimeout(game.id, self.id);
            }
        }, [isMyTurn, game.id, self.id, game.gameState]);


        return (
            <div className="w-full h-screen flex flex-col p-4 bg-gray-50">
                 {(wwState.timerEndsAt && game.gameState !== 'final_results') && (
                    <div className="absolute top-4 right-4 z-10">
                        <CountdownTimer 
                            expiryTimestamp={wwState.timerEndsAt.toMillis()}
                            onExpire={onTimeout}
                        />
                    </div>
                )}
                
                <header className="w-full p-2 mb-2">
                    <div className="flex justify-between items-start max-w-7xl mx-auto gap-2">
                        <div className="flex flex-col items-center gap-2">
                            <ScoreCounter label="متبق" count={cardsLeft.red} colorClass="bg-red-600" icon={Users} />
                            <div className="flex flex-wrap justify-center gap-1 w-24">
                            {teamRedPlayers.map(p => (
                                    <div key={p.id} className="flex flex-col items-center text-center">
                                         <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8 rounded-full" />
                                    </div>
                            ))}
                            </div>
                        </div>
                        <div className="flex-grow">{renderHeader(game, self)}</div>
                        <div className="flex flex-col items-center gap-2">
                            <ScoreCounter label="متبق" count={cardsLeft.blue} colorClass="bg-blue-600" icon={Users} />
                              <div className="flex flex-wrap justify-center gap-1 w-24">
                            {teamBluePlayers.map(p => (
                                    <div key={p.id} className="flex flex-col items-center text-center">
                                         <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8 rounded-full" />
                                    </div>
                            ))}
                            </div>
                        </div>
                    </div>
                </header>

                <main className="w-full flex-grow grid grid-cols-8 gap-2 p-2 max-w-7xl mx-auto">
                    {wwState.cards.map((card, index) => {
                        const isMySuspicion = (wwState.suspicions?.[self.id] || []).includes(index);
                        const canPlayerClick = isGuesserTurn && !card.revealed;
                        
                        const suspicionsForThisCard = Object.entries(wwState.suspicions || {})
                            .filter(([_, cardIndexes]) => cardIndexes.includes(index))
                            .map(([playerId]) => game.players.find(p => p.id === playerId))
                            .filter(Boolean) as Player[];

                        return (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.02 }}
                                className="relative group/card"
                            >
                                 <div
                                    className={cn(
                                        'relative w-full h-full rounded-md flex items-center justify-center p-2 text-center font-bold text-lg shadow-md transition-all duration-300 transform overflow-hidden',
                                        getCardColorStyles(card, isGuide, game.gameState),
                                        canPlayerClick && "cursor-pointer"
                                    )}
                                >
                                    <AnimatePresence mode="wait">
                                        <motion.span
                                            key={`word-${index}`}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.3 }}
                                        >
                                            {card.text}
                                        </motion.span>
                                    </AnimatePresence>
                                    
                                    {card.revealed && (
                                         <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                            <CheckCircle className="w-12 h-12 text-white" />
                                        </div>
                                    )}
                                    
                                    {canPlayerClick && (
                                         <div className='absolute inset-0 bg-black/50 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center gap-2'>
                                            <Button variant="secondary" size="icon" onClick={() => wordWarActions.revealCard(game.id, self.id, index)}><Hand/></Button>
                                         </div>
                                    )}
                                     {canPlayerClick && (
                                         isMySuspicion ? (
                                            <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={(e) => { e.stopPropagation(); wordWarActions.toggleSuspicion(game.id, self.id, index); }}><X className="w-4 h-4"/></Button>
                                        ) : (
                                            <Button variant="outline" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover/card:opacity-100" onClick={(e) => { e.stopPropagation(); wordWarActions.toggleSuspicion(game.id, self.id, index); }}>?</Button>
                                        )
                                     )}
                                </div>
                                {suspicionsForThisCard.length > 0 && !card.revealed && (
                                     <div className="absolute -bottom-2 -right-2 flex space-x-reverse -space-x-2">
                                         {suspicionsForThisCard.map(p => (
                                             <PlayerAvatar key={p.id} avatarId={p.avatarId} className="w-6 h-6 border-2 border-white rounded-full"/>
                                         ))}
                                     </div>
                                )}
                            </motion.div>
                        );
                    })}
                </main>

                <footer className="w-full p-2">
                    {renderActionPanel()}
                </footer>
            </div>
        );
    }
    
    return renderGameBoard();
}
