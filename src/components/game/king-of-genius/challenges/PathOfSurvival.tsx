'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from "framer-motion";
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer, BrainCircuit, ShieldAlert, X } from 'lucide-react';
import { updateChallengeProgress, submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

const MEMORIZE_DURATION_SECONDS = 3;
const PLAY_TIME_SECONDS = 15;
const MAX_WRONG_ATTEMPTS = 2; // Allows 2 mistakes, 3rd is failure

type Phase = 'loading' | 'memorize' | 'play' | 'ended';
type PathTile = { x: number; y: number };

export function PathOfSurvival({ game, player, self, challenge }: { 
    game: Game, 
    player: Player, 
    self: Player, 
    challenge: GeniusChallenge
}) {
    const { toast } = useToast();
    const puzzle = game.challengeState?.puzzle;
    const path: PathTile[] = puzzle?.path || [];
    const gridSize: number = puzzle?.gridSize || 0;

    const [phase, setPhase] = useState<Phase>('loading');
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [isWrongMove, setIsWrongMove] = useState<PathTile | null>(null);
    const [timeLeft, setTimeLeft] = useState(PLAY_TIME_SECONDS);
    const [playerClickedTiles, setPlayerClickedTiles] = useState<PathTile[]>([]);
    const [memorizeCountdown, setMemorizeCountdown] = useState(MEMORIZE_DURATION_SECONDS);
    
    const myProgress = game.challengeState?.playerProgress?.[self.id];
    const currentStep = myProgress?.currentStep || 0;
    const wrongAttempts = myProgress?.wrongAttempts || 0;

    const handleFailure = useCallback(async (isMisstep: boolean) => {
        if (phase === 'ended' || hasSubmitted) return; 
        setPhase('ended');
        setHasSubmitted(true);
        const timeTaken = PLAY_TIME_SECONDS - timeLeft;
        await submitChallengeResult(game.id, self.id, { isCorrect: false, time: timeTaken });
        toast({
            title: isMisstep ? "خطوة خاطئة!" : "انتهى الوقت!",
            description: "حظًا أفضل في المرة القادمة.",
            variant: "destructive",
        });
    }, [phase, hasSubmitted, timeLeft, game.id, self.id, toast]);

    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
            setPhase('ended');
        } else if (path.length > 0 && gridSize > 0) {
            setPhase('memorize');
        }
    }, [game.challengeState?.results, self.id, path, gridSize]);

    // Memorization phase timer
    useEffect(() => {
        if (phase === 'memorize') {
            const timer = setInterval(() => {
                setMemorizeCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        setPhase('play');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [phase]);

    // Initialize player state for 'play' phase
    useEffect(() => {
        if (phase === 'play' && path.length > 0 && currentStep === 0) {
            setPlayerClickedTiles([path[0]]);
            updateChallengeProgress(game.id, self.id, { currentStep: 1, wrongAttempts: 0 });
        }
    }, [phase, path, currentStep, game.id, self.id]);

    // Play phase timer
    useEffect(() => {
        if (phase !== 'play' || hasSubmitted || !game.challengeState?.challengeEndsAt) return;
        const endTime = game.challengeState.challengeEndsAt.toMillis();

        const updateTimer = () => {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);
            if (remaining <= 0 && !hasSubmitted) {
                handleFailure(false);
            }
        };

        const timerInterval = setInterval(updateTimer, 1000);
        updateTimer();
        
        return () => clearInterval(timerInterval);
    }, [phase, hasSubmitted, game.challengeState?.challengeEndsAt, handleFailure]);

    const handleTileClick = async (x: number, y: number) => {
        if (phase !== 'play' || !path || hasSubmitted || path.length === 0) return;

        const expectedTile = path[currentStep];
        if (!expectedTile) { 
            await handleFailure(true); 
            return;
        }

        if (expectedTile.x === x && expectedTile.y === y) {
            // Correct move
            setIsWrongMove(null);
            const newPlayerClickedTiles = [...playerClickedTiles, expectedTile];
            setPlayerClickedTiles(newPlayerClickedTiles);

            const isVictory = currentStep === path.length - 1;
            if (isVictory) {
                setPhase('ended');
                setHasSubmitted(true);
                const timeTaken = PLAY_TIME_SECONDS - timeLeft;
                await submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken });
                toast({
                    title: "نجاة!",
                    description: "لقد عبرت المسار بنجاح.",
                    className: "bg-green-100 border-green-500 text-green-700",
                });
            } else {
                await updateChallengeProgress(game.id, self.id, { currentStep: currentStep + 1, wrongAttempts: wrongAttempts }); 
            }
        } else {
            // Incorrect move
            setIsWrongMove({ x, y });
            setTimeout(() => setIsWrongMove(null), 500); // Visual feedback for wrong move

            const newWrongAttempts = wrongAttempts + 1;
            if (newWrongAttempts > MAX_WRONG_ATTEMPTS) {
                await updateChallengeProgress(game.id, self.id, { currentStep: currentStep, wrongAttempts: newWrongAttempts });
                await handleFailure(true);
            } else {
                await updateChallengeProgress(game.id, self.id, { currentStep: currentStep, wrongAttempts: newWrongAttempts });
                toast({
                    title: "محاولة خاطئة!",
                    description: `تبقى لديك ${MAX_WRONG_ATTEMPTS - newWrongAttempts + 1} محاولة.`,
                    variant: "destructive",
                    duration: 2000,
                });
            }
        }
    };

    const isPathTile = (x: number, y: number) => path?.some(p => p && p.x === x && p.y === y);
    const isStartTile = (x: number, y: number) => path?.[0]?.x === x && path[0]?.y === y;
    const isEndTile = (x: number, y: number) => path?.[path.length - 1]?.x === x && path[path.length - 1]?.y === y;
    const isPlayerClickedTile = (x: number, y: number) => playerClickedTiles.some(p => p && p.x === x && p.y === y);

    if (hasSubmitted) {
        return (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
                <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
                    <CardHeader><CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle></CardHeader>
                    <CardContent>
                        <Check className="w-20 h-20 text-green-500 mx-auto mb-4 animate-bounce" />
                        <p className="text-xl">تم إرسال نتيجتك. في انتظار بقية اللاعبين...</p>
                    </CardContent>
                </Card>
            </motion.div>
        );
    }

    if (phase === 'loading' || !puzzle || !path || gridSize === 0 || path.length === 0) {
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
                <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
                    <CardHeader><CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle></CardHeader>
                    <CardContent>
                        <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                        <p className="mt-4 text-muted-foreground">جاري توليد المسار...</p>
                    </CardContent>
                </Card>
            </motion.div>
        );
    }

    return (
        <Card className="w-full max-w-xl bg-gray-900 text-white border-gray-700 p-4">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2">
                    {phase === 'memorize' ? <BrainCircuit /> : <ShieldAlert />}
                    {challenge.name}
                </CardTitle>
                <CardDescription>
                    {phase === 'memorize' ? `احفظ المسار! ${memorizeCountdown}` : `اعبر المسار من الذاكرة!`}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
                <div className="w-full bg-gray-800 p-2 rounded-lg">
                    <Progress
                        value={phase === 'memorize' ? (memorizeCountdown / MEMORIZE_DURATION_SECONDS) * 100 : (timeLeft / PLAY_TIME_SECONDS) * 100}
                        className={cn("w-full h-2 bg-gray-700", phase === 'memorize' ? "[&>*]:bg-blue-500" : "[&>*]:bg-red-500")}
                    />
                </div>

                {phase === 'play' && (
                    <div className="w-full flex justify-center items-center gap-4">
                       <div className="flex items-center gap-2 text-lg font-bold">
                          <Timer className="h-6 w-6 text-red-400"/>
                          <span>{timeLeft}</span>
                       </div>
                        <div className="flex items-center gap-2" title="محاولات خاطئة">
                            {Array.from({ length: MAX_WRONG_ATTEMPTS + 1 }).map((_, idx) => (
                                <X key={idx} className={cn("h-6 w-6 transition-colors", idx < wrongAttempts ? "text-red-500" : "text-gray-600")} />
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid gap-1 md:gap-1.5" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
                    {Array.from({ length: gridSize * gridSize }).map((_, i) => {
                        const x = i % gridSize;
                        const y = Math.floor(i / gridSize);
                        
                        const tileClasses = cn(
                            "w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-md transition-all duration-200 text-xs font-bold",
                            phase === 'play' && "cursor-pointer hover:bg-gray-700/50",
                            "bg-gray-800 border-2 border-gray-700",
                            phase === 'memorize' && isPathTile(x, y) && "bg-green-500/80 border-green-400 animate-pulse",
                            isPlayerClickedTile(x, y) && "bg-green-600 border-green-500",
                            isWrongMove?.x === x && isWrongMove.y === y && "!bg-red-500 !border-red-400 animate-pulse", 
                            phase === 'ended' && isPathTile(x, y) && !isPlayerClickedTile(x,y) && "bg-yellow-500/50 border-yellow-400"
                        );

                        return (
                            <div key={`${x}-${y}`} className={tileClasses} onClick={() => handleTileClick(x, y)}>
                                {isStartTile(x, y) && <span className={cn("text-lg", phase === 'memorize' || isPlayerClickedTile(x,y) ? "text-white" : "text-green-400")}>&#x25CF;</span>}
                                {isEndTile(x, y) && <span className={cn("text-lg", phase === 'memorize' || isPlayerClickedTile(x,y) ? "text-white" : "text-red-400")}>&#x25A0;</span>}
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
