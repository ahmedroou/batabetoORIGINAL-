
'use client';

import { useState, useEffect, useRef } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer, BrainCircuit, ShieldAlert } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from "framer-motion";

const MEMORIZE_TIME_SECONDS = 3;
const PLAY_TIME_SECONDS = 15;

type Phase = 'loading' | 'memorize' | 'play' | 'ended';
type PathTile = { x: number; y: number };

export function PathOfSurvival({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const puzzle = game.challengeState?.puzzle;
    const path: PathTile[] = puzzle?.path;
    const gridSize: number = puzzle?.gridSize;

    const [phase, setPhase] = useState<Phase>('loading');
    const [currentStep, setCurrentStep] = useState(0);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [isWrongMove, setIsWrongMove] = useState<PathTile | null>(null);
    const [timeLeft, setTimeLeft] = useState(PLAY_TIME_SECONDS);
    
    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
            setPhase('ended');
        } else if (path && gridSize) {
            setPhase('memorize');
        }
    }, [game.challengeState?.results, self.id, path, gridSize]);

    useEffect(() => {
        if (phase === 'memorize') {
            const timer = setTimeout(() => {
                setPhase('play');
            }, MEMORIZE_TIME_SECONDS * 1000);
            return () => clearTimeout(timer);
        }
        
        if (phase === 'play') {
            timerIntervalRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerIntervalRef.current!);
                        handleFailure(false); // false because it's a time out, not a wrong move
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        
        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
            }
        };
    }, [phase]);

    const handleFailure = (isMisstep: boolean) => {
        if (phase === 'ended' || hasSubmitted) return;
        
        setPhase('ended');
        setHasSubmitted(true);
        const timeTaken = PLAY_TIME_SECONDS - timeLeft;
        submitChallengeResult(game.id, self.id, { isCorrect: false, time: timeTaken });
        toast({
            title: isMisstep ? "خطوة خاطئة!" : "انتهى الوقت!",
            description: "حظًا أفضل في المرة القادمة.",
            variant: "destructive",
        });
    };

    const handleTileClick = (x: number, y: number) => {
        if (phase !== 'play' || !path) return;

        const expectedTile = path[currentStep];
        if (expectedTile.x === x && expectedTile.y === y) {
            if (currentStep === path.length - 1) {
                // VICTORY
                if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
                setPhase('ended');
                setHasSubmitted(true);
                const timeTaken = PLAY_TIME_SECONDS - timeLeft;
                submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken });
                toast({
                    title: "نجاة!",
                    description: "لقد عبرت المسار بنجاح.",
                    className: "bg-green-100 border-green-500 text-green-700",
                });
            } else {
                setCurrentStep(prev => prev + 1);
            }
        } else {
            // FAILURE
            setIsWrongMove({ x, y });
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            handleFailure(true);
        }
    };

    const isPathTile = (x: number, y: number) => {
        return path?.some(p => p.x === x && p.y === y);
    };
    
    const isStartTile = (x: number, y: number) => path && path[0].x === x && path[0].y === y;
    const isEndTile = (x: number, y: number) => path && path[path.length - 1].x === x && path[path.length - 1].y === y;
    const isCompletedTile = (x: number, y: number) => {
        if (phase !== 'play' || !path) return false;
        for (let i = 0; i < currentStep; i++) {
            if (path[i].x === x && path[i].y === y) return true;
        }
        return false;
    }

    if (hasSubmitted) {
        return (
             <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Check className="w-20 h-20 text-green-500 mx-auto mb-4" />
                    <p className="text-xl">تم إرسال نتيجتك. في انتظار بقية اللاعبين...</p>
                </CardContent>
            </Card>
        );
    }

    if (phase === 'loading' || !path || !gridSize) {
        return (
            <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">جاري توليد المسار...</p>
                </CardContent>
            </Card>
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
                    {phase === 'memorize' ? `احفظ المسار! لديك ${MEMORIZE_TIME_SECONDS} ثوانٍ.` : 'اعبر المسار من الذاكرة!'}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
                <div className="w-full bg-gray-800 p-2 rounded-lg">
                    <div className="relative h-4 w-full bg-gray-700 rounded-full overflow-hidden">
                        <motion.div
                            className="absolute top-0 left-0 h-full bg-red-500"
                            initial={{ width: "100%" }}
                            animate={{ width: phase === 'play' ? `${(timeLeft / PLAY_TIME_SECONDS) * 100}%` : "100%" }}
                            transition={{ duration: 1, ease: "linear" }}
                        />
                    </div>
                </div>

                <div 
                    className="grid gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
                >
                    {Array.from({ length: gridSize * gridSize }).map((_, i) => {
                        const x = i % gridSize;
                        const y = Math.floor(i / gridSize);
                        
                        const tileClasses = cn(
                            "w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-md transition-all duration-200",
                            phase === 'play' && "cursor-pointer hover:bg-gray-600",
                            phase !== 'memorize' && "bg-gray-800 border-2 border-gray-700",
                            phase === 'memorize' && isPathTile(x,y) && "bg-green-500 animate-pulse",
                            phase === 'memorize' && !isPathTile(x,y) && "bg-gray-800",
                            phase === 'play' && isCompletedTile(x,y) && "bg-blue-800",
                            phase === 'ended' && isPathTile(x,y) && "bg-green-800", // Show path on end
                            phase === 'ended' && isWrongMove?.x === x && isWrongMove.y === y && "bg-red-500 animate-ping"
                        );

                        return (
                            <div key={`${x}-${y}`} className={tileClasses} onClick={() => handleTileClick(x, y)}>
                                {isStartTile(x,y) && <span className="text-xs font-bold">ابدأ</span>}
                                {isEndTile(x,y) && <span className="text-xs font-bold">انهِ</span>}
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
