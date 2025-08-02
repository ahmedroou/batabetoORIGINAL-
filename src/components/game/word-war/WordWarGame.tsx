"use client";

import type { Game, Player, WordWarCard } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import * as wordWarActions from '@/lib/actions/word-war';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { Brain, CheckCircle, Swords, Users, Crown, Loader2, Send, Lightbulb, SkipForward, Clock, Hand, UserCheck, Eye, X, Shuffle, LogOut, Copy, Check, UserX, HelpCircle, UserCog, UserRoundCheck, ThumbsDown } from 'lucide-react';
import { PlayerAvatar } from '../PlayerAvatar';
import * as roomActions from '@/lib/actions/room';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CountdownTimer } from '@/components/game/CountdownTimer';


interface WordWarGameProps {
    game: Game;
    self: Player;
}

const getCardColorStyles = (card: WordWarCard, isGuide: boolean, gameState: Game['gameState'], isSuspected: boolean) => {
    const showTrueColor = isGuide || card.revealed || gameState === 'final_results';
    const color = showTrueColor ? card.color : 'default';

    let baseStyles = '';
    switch (color) {
        case 'red': baseStyles = 'bg-red-500 border-red-700 text-white'; break;
        case 'blue': baseStyles = 'bg-blue-500 border-blue-700 text-white'; break;
        case 'neutral': baseStyles = 'bg-yellow-200 border-yellow-400 text-yellow-900'; break;
        case 'assassin': baseStyles = 'bg-gray-800 border-gray-900 text-white'; break;
        default: baseStyles = 'bg-gray-200 border-gray-400 hover:bg-gray-300 text-gray-800'; break;
    }
    
    // Always apply suspicion border on top of the base color if the player is a guide
    if (isSuspected) {
        return cn(baseStyles, 'border-yellow-400 border-4 ring-2 ring-yellow-300');
    }
    
    return baseStyles;
};

const ScoreCounter = ({ label, count, colorClass, icon: Icon }: { label: string; count: number; colorClass: string, icon: React.ElementType }) => (
    <div className={cn("flex flex-col items-center justify-center p-2 rounded-lg text-white text-center w-24", colorClass)}>
        <Icon className="w-6 h-6" />
        <span className="text-2xl font-bold font-mono">{count}</span>
        <span className="text-xs font-semibold">{label}</span>
    </div>
);


export function WordWarGame({ game, self }: WordWarGameProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [hintWord, setHintWord] = useState('');
    const [hintNumber, setHintNumber] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const wwState = game.wordWarState;

    const isMyTurn = useMemo(() => wwState?.turn === self.team, [wwState?.turn, self.team]);
    const isGuide = useMemo(() => wwState?.guides[self.team as 'red' | 'blue'] === self.id, [wwState?.guides, self.team, self.id]);
    const isGuesserTurn = useMemo(() => (isMyTurn && !isGuide && game.gameState === 'guesser_turn'), [isMyTurn, isGuide, game.gameState]);
    const isGuideTurn = useMemo(() => (isMyTurn && isGuide && game.gameState === 'guide_turn'), [isMyTurn, isGuide, game.gameState]);

    const teamRedPlayers = useMemo(() => game.players.filter(p => p.team === 'red' && p.status !== 'left'), [game.players]);
    const teamBluePlayers = useMemo(() => game.players.filter(p => p.team === 'blue' && p.status !== 'left'), [game.players]);
    const unassigned = useMemo(() => game.players.filter(p => !p.team && p.status !== 'left'), [game.players]);
    
    const score = useMemo(() => {
        return wwState?.cards.reduce((acc, card) => {
            if (card.revealed) {
                acc[card.color] = (acc[card.color] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>) || {};
    }, [wwState?.cards]);

    const cardsLeft = useMemo(() => {
        if (!wwState) return { red: 0, blue: 0 };
        const redTotal = wwState.cards.filter(c => c.color === 'red').length;
        const blueTotal = wwState.cards.filter(c => c.color === 'blue').length;
        return {
            red: redTotal - (score.red || 0),
            blue: blueTotal - (score.blue || 0)
        }
    }, [score, wwState]);

    const isHost = game.hostId === self.id;

    const onTimeout = useCallback(() => {
        if((game.gameState === 'preparation' || game.gameState === 'guide_turn' || game.gameState === 'guesser_turn') && isHost) {
            wordWarActions.handleTimeout(game.id, self.id);
        }
    }, [game.id, self.id, game.gameState, isHost]);


    useEffect(() => {
        if (game.gameState === 'lobby' || game.gameState === 'final_results') {
            setIsSubmitting(false); // Reset submitting state on game end/reset
        }
    }, [game.gameState]);
    
    if (!wwState) {
        return <div>خطأ: حالة اللعبة غير موجودة.</div>;
    }

    const renderHeader = () => {
        if (game.gameState === 'final_results') return null; // We will render a different component for results
        
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

    const renderActionPanel = () => {
        if (game.gameState === 'final_results') return null; // Handled by results component
        
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
            const handleSubmitHint = async (e: React.FormEvent) => {
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
            };

            return (
                <Card className="w-full max-w-lg mx-auto">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Lightbulb /> دورك كمرشد</CardTitle>
                        <CardDescription>أعطِ فريقك تلميحًا من كلمة واحدة (8 أحرف، بدون مسافات) وعدد البطاقات المتعلقة بها.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <form onSubmit={handleSubmitHint} className="flex gap-2">
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

    const renderLobby = () => {
        const [isCopying, setIsCopying] = useState(false);
        const [playerToKick, setPlayerToKick] = useState<Player | null>(null);

        const handleCopyId = () => {
            setIsCopying(true);
            navigator.clipboard.writeText(game.id);
            setTimeout(() => setIsCopying(false), 2000);
        }

        const handleLeaveGame = async () => {
            setIsSubmitting(true);
            const result = await roomActions.leaveGame(game.id, self.id);
            if (result.success) {
              sessionStorage.removeItem(`player-${game.id}`);
              router.push('/');
              toast({ title: "لقد غادرت الغرفة." })
            } else {
              toast({ title: "خطأ", description: result.error, variant: "destructive" });
            }
            setIsSubmitting(false);
        };

        const handleSelectTeam = async (team: 'red' | 'blue') => {
            setIsSubmitting(true);
            try {
                await wordWarActions.selectTeam(game.id, self.id, team);
            } catch(error: any) {
                toast({ title: "خطأ", description: error.message, variant: "destructive" });
            } finally {
                setIsSubmitting(false);
            }
        }
        
        const handleRandomizeTeams = async () => {
            setIsSubmitting(true);
            try {
                await wordWarActions.randomizeTeams(game.id, self.id);
            } catch (error: any) {
                toast({ title: "خطأ", description: error.message, variant: "destructive" });
            } finally {
                setIsSubmitting(false);
            }
        };
        
        const handleStartGame = async () => {
            setIsSubmitting(true);
            try {
                await wordWarActions.startGame(game.id, self.id);
            } catch (error: any) {
                 toast({ title: "خطأ", description: error.message, variant: "destructive" });
                 setIsSubmitting(false);
            }
        }

        const handleKickPlayer = async () => {
            if (!playerToKick || !isHost) return;
            setIsSubmitting(true);
            const result = await roomActions.kickPlayerFromLobby(game.id, self.id, playerToKick.id);
            if (result.error) {
                toast({ title: "خطأ في الطرد", description: result.error, variant: "destructive" });
            } else {
                toast({ title: "نجاح", description: `تم طرد اللاعب ${playerToKick.name}.` });
            }
            setPlayerToKick(null);
            setIsSubmitting(false);
        };
        
        const getStartButtonState = () => {
            const activePlayers = game.players.filter(p => p.status !== 'left');
            if (activePlayers.length < 4) return { disabled: true, text: "تحتاج إلى 4 لاعبين على الأقل" };
            if (unassigned.length > 0) return { disabled: true, text: `في انتظار ${unassigned.length} لاعبين` };
            if (teamRedPlayers.length !== teamBluePlayers.length) return { disabled: true, text: "الفرق غير متوازنة" };
            return { disabled: false, text: "بدء اللعبة" };
        }
        const startButtonState = getStartButtonState();

        return (
            <>
                <Card className="w-full max-w-4xl animate-bounce-in">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl">لوبي حرب الكلمات</CardTitle>
                        <div className="flex gap-2 w-full max-w-sm mx-auto pt-2">
                            <Input value={game.id} readOnly className="text-center tracking-widest font-mono text-lg h-12 flex-grow" />
                            <TooltipProvider>
                                <Tooltip open={isCopying}><TooltipTrigger asChild>
                                    <Button onClick={handleCopyId} size="lg" variant="secondary" className="px-4">
                                        {isCopying ? <Check /> : <Copy />}
                                    </Button>
                                </TooltipTrigger><TooltipContent><p>تم النسخ!</p></TooltipContent></Tooltip>
                            </TooltipProvider>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(['red', 'blue'] as const).map(teamId => (
                                <div key={teamId} className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/50">
                                    <h3 className={cn("text-2xl font-bold text-center", teamId === 'red' ? 'text-red-600' : 'text-blue-600')}>
                                        الفريق {teamId === 'red' ? 'الأحمر' : 'الأزرق'} ({teamId === 'red' ? teamRedPlayers.length : teamBluePlayers.length})
                                    </h3>
                                    <div className="space-y-2 min-h-[120px]">
                                        {(teamId === 'red' ? teamRedPlayers : teamBluePlayers).map(p => (
                                            <div key={p.id} className="flex items-center justify-between gap-2 p-1.5 bg-background rounded-md">
                                                <div className="flex items-center gap-2">
                                                    <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8" />
                                                    <span className="font-semibold">{p.name}</span>
                                                </div>
                                                {isHost && self.id !== p.id && (
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setPlayerToKick(p)}>
                                                        <UserX />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <Button onClick={() => handleSelectTeam(teamId)} disabled={isSubmitting || (teamId === 'red' ? teamRedPlayers : teamBluePlayers).some(p => p.id === self.id)}>انضم</Button>
                                </div>
                            ))}
                        </div>

                        {unassigned.length > 0 && (
                            <div className="text-center p-2 border rounded-md">
                                <h4 className="font-bold text-muted-foreground">لاعبون في الانتظار</h4>
                                <div className="flex justify-center flex-wrap gap-2 mt-2">
                                    {unassigned.map(p => (
                                        <div key={p.id} className="flex items-center justify-between gap-2 p-1.5 bg-muted rounded-md w-48">
                                            <div className="flex items-center gap-2">
                                                <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                                                <span className="font-semibold">{p.name}</span>
                                            </div>
                                            {isHost && self.id !== p.id && (
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setPlayerToKick(p)}>
                                                    <UserX />
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                     <CardFooter className="flex-col gap-2">
                        {isHost && (
                            <div className="flex gap-2 w-full">
                                <Button onClick={handleStartGame} disabled={startButtonState.disabled || isSubmitting} className="flex-grow">
                                    {isSubmitting ? <Loader2 className="animate-spin" /> : startButtonState.text}
                                </Button>
                                <Button onClick={handleRandomizeTeams} disabled={isSubmitting} variant="outline">
                                    <Shuffle /> توزيع عشوائي
                                </Button>
                            </div>
                        )}
                        <Button onClick={handleLeaveGame} variant="ghost" className="w-full text-destructive" disabled={isSubmitting}>
                            <LogOut /> مغادرة الغرفة
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
                            <AlertDialogAction onClick={handleKickPlayer} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
                            {isSubmitting ? "جاري الطرد..." : "نعم، قم بطرده"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </>
        );
    };

    if (game.gameState === 'lobby') {
        return renderLobby();
    }
    
     if (game.gameState === 'final_results') {
        const result = game.gameResult;
        if (!result) return <p>جاري تحميل النتائج النهائية...</p>;
        
        const winnerColor = result.winner === 'red' ? 'text-red-500' : 'text-blue-500';
        const loserColor = result.winner === 'red' ? 'text-blue-500' : 'text-red-500';
        const winnerTeamPlayers = result.winner === 'red' ? teamRedPlayers : teamBluePlayers;
        const loserTeamPlayers = result.winner === 'red' ? teamBluePlayers : teamRedPlayers;

        return (
             <Card className="w-full max-w-2xl animate-bounce-in bg-background">
                <CardHeader className="text-center">
                    <Crown className="w-24 h-24 mx-auto text-yellow-400" />
                    <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                    <CardDescription className="text-lg">{result.message}</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="p-4 rounded-lg border-2 border-yellow-400 bg-yellow-50">
                        <h3 className={cn("text-2xl font-bold text-center mb-2", winnerColor)}>🏆 الفريق الفائز</h3>
                        <div className="space-y-2">
                        {winnerTeamPlayers.map(p => (
                            <div key={p.id} className="flex items-center gap-2 p-2 bg-white rounded-md">
                                <UserRoundCheck className="w-5 h-5 text-green-500"/>
                                <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                                <span className="font-semibold">{p.name}</span>
                            </div>
                        ))}
                        </div>
                     </div>
                     <div className="p-4 rounded-lg border-2 border-gray-400 bg-gray-100">
                        <h3 className={cn("text-2xl font-bold text-center mb-2", loserColor)}>💔 الفريق الخاسر</h3>
                        <div className="space-y-2">
                        {loserTeamPlayers.map(p => (
                            <div key={p.id} className="flex items-center gap-2 p-2 bg-white rounded-md">
                                <ThumbsDown className="w-5 h-5 text-gray-500"/>
                                <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                                <span className="font-semibold">{p.name}</span>
                            </div>
                        ))}
                        </div>
                     </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={() => window.location.href = '/'} className="w-full">العب مرة أخرى</Button>
                </CardFooter>
            </Card>
        )
    }

    const renderGameBoard = () => {
        const turnGlowClass = isMyTurn ? 
            (wwState.turn === 'red' ? 'shadow-[0_0_25px_8px_rgba(239,68,68,0.3)]' : 'shadow-[0_0_25px_8px_rgba(59,130,246,0.3)]') 
            : '';
            
        return (
            <div className={cn("w-full h-screen flex flex-col p-4 bg-gray-50 transition-shadow duration-500", turnGlowClass)}>
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
                        <div className="flex-grow">{renderHeader()}</div>
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

                <main className="w-full flex-grow grid grid-cols-5 md:grid-cols-8 gap-2 p-2 max-w-7xl mx-auto">
                    {wwState.cards.map((card, index) => {
                        const canPlayerClick = isGuesserTurn && !card.revealed;
                        const allSuspicions = wwState.suspicions?.[self.team as 'red' | 'blue'] || [];
                        const isSuspectedByMyTeam = allSuspicions.includes(index);
                        const allPlayersSuspicions = Object.entries(wwState.suspicions || {}).flatMap(([team, indices]) => team === self.team ? indices.map(i => ({index: i, team: team})) : []);
                        
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
                                        'relative w-full h-20 md:h-24 rounded-md flex items-center justify-center p-2 text-center font-bold text-base md:text-lg shadow-md transition-all duration-300 transform overflow-hidden',
                                        getCardColorStyles(card, isGuide, game.gameState, isSuspectedByMyTeam),
                                        canPlayerClick && "cursor-pointer"
                                    )}
                                    onClick={() => canPlayerClick && wordWarActions.revealCard(game.id, self.id, index)}
                                >
                                     <span className={cn(card.revealed && "opacity-20")}>
                                        {card.text}
                                     </span>
                                    
                                     {card.revealed && (
                                         <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                            <CheckCircle className="w-8 h-8 md:w-12 md:h-12 text-white" />
                                        </div>
                                    )}
                                </div>
                                {isGuesserTurn && !card.revealed && (
                                     <div className='absolute top-1 right-1 opacity-0 group-hover/card:opacity-100 transition-opacity'>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className='h-7 w-7 bg-black/30 text-white hover:bg-black/50'
                                            onClick={(e) => {
                                                e.stopPropagation(); // Prevent card click
                                                wordWarActions.toggleSuspicion(game.id, self.id, index)
                                            }}
                                        >
                                            <Hand className={cn("h-5 w-5", isSuspectedByMyTeam && "text-yellow-400")} />
                                        </Button>
                                     </div>
                                )}
                                <div className="absolute bottom-0 left-1 flex items-center gap-0.5">
                                    {game.players.map(p => {
                                        if (p.team === self.team && (wwState.suspicions?.[p.id] || []).includes(index)) {
                                            return (
                                                <TooltipProvider key={p.id}>
                                                    <Tooltip>
                                                        <TooltipTrigger>
                                                            <PlayerAvatar avatarId={p.avatarId} className="w-4 h-4 rounded-full border border-white" />
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>{p.name} يشك في هذه الكلمة</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )
                                        }
                                        return null;
                                    })}
                                </div>
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
