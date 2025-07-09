
'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Eye, Brain } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';


const MEMORIZE_TIME_SECONDS = 3;
const PLAY_TIME_SECONDS = 15;

type Phase = 'loading' | 'memorize' | 'play' | 'ended';

interface VisualMemoryPuzzle {
  grid: { id: string; fruitType: string }[];
  imageUrls: Record<string, string>;
  prompt: string;
  correctFruitTypes: string[];
}

export function VisualMemory({ game, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const puzzle: VisualMemoryPuzzle | undefined = game.challengeState?.puzzle;

    const [phase, setPhase] = useState<Phase>('loading');
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(MEMORIZE_TIME_SECONDS);
    const [selectedTileIds, setSelectedTileIds] = useState<string[]>([]);
    
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const handleFailure = async (reason: 'timeout' | 'wrong_submission') => {
        if (hasSubmitted) return;
        setPhase('ended');
        setHasSubmitted(true);
        const timeTaken = PLAY_TIME_SECONDS - (phase === 'play' ? timeLeft : 0);
        await submitChallengeResult(game.id, self.id, { isCorrect: false, time: timeTaken });
        toast({
            title: reason === 'timeout' ? "انتهى الوقت!" : "إجابة خاطئة!",
            description: "حظًا أفضل في المرة القادمة.",
            variant: "destructive",
        });
    };
    
    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
            setPhase('ended');
        } else if (puzzle) {
            setPhase('memorize');
        }
    }, [game.challengeState?.results, self.id, puzzle]);


    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (phase === 'memorize') {
            setTimeLeft(MEMORIZE_TIME_SECONDS);
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        setPhase('play');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else if (phase === 'play') {
            setTimeLeft(PLAY_TIME_SECONDS);
             timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        handleFailure('timeout');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => { if(timerRef.current) clearInterval(timerRef.current) };
    }, [phase]);


    const handleTileClick = (tileId: string) => {
        if (phase !== 'play') return;
        setSelectedTileIds(prev =>
            prev.includes(tileId) ? prev.filter(id => id !== tileId) : [...prev, tileId]
        );
    };

    const handleSubmit = async () => {
        if (phase !== 'play' || hasSubmitted || !puzzle) return;

        const timeTaken = PLAY_TIME_SECONDS - timeLeft;

        const correctTileIds = new Set(
            puzzle.grid.filter(tile => puzzle.correctFruitTypes.includes(tile.fruitType)).map(tile => tile.id)
        );
        const selectedTileIdsSet = new Set(selectedTileIds);

        const isCorrect = correctTileIds.size === selectedTileIdsSet.size &&
                          [...correctTileIds].every(id => selectedTileIdsSet.has(id));

        if (isCorrect) {
             setHasSubmitted(true);
             setPhase('ended');
             await submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken });
             toast({ title: "إجابة صحيحة!", description: "ذاكرتك قوية!", className: "bg-green-100 border-green-500 text-green-700" });
        } else {
            await handleFailure('wrong_submission');
        }
    };


    if (phase === 'loading' || !puzzle) {
        return (
            <Card className="w-full max-w-md text-center bg-white/90 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">جاري تحضير الصور...</p>
                </CardContent>
            </Card>
        );
    }
    
    if (hasSubmitted) {
        return (
            <Card className="w-full max-w-md text-center bg-white/90 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Check className="w-20 h-20 text-green-500 mx-auto mb-4 animate-bounce" />
                    <p className="text-xl">تم إرسال نتيجتك. في انتظار بقية اللاعبين...</p>
                </CardContent>
            </Card>
        );
    }
    
    const timerValue = phase === 'memorize'
        ? (timeLeft / MEMORIZE_TIME_SECONDS) * 100
        : (timeLeft / PLAY_TIME_SECONDS) * 100;

    return (
        <Card className="w-full max-w-2xl bg-slate-100 p-4">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2">
                    {phase === 'memorize' ? <Brain /> : <Eye />}
                    {challenge.name}
                </CardTitle>
                <CardDescription className="text-gray-500 font-bold text-lg mt-2">
                    {phase === 'memorize' ? "احفظ أماكن الصور!" : puzzle.prompt}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
                <div className="w-full bg-slate-200 p-1 rounded-full">
                    <Progress
                        value={timerValue}
                        className={cn(
                        "w-full h-2 transition-all duration-1000 ease-linear",
                        phase === 'memorize' ? "[&>*]:bg-blue-500" : "[&>*]:bg-red-500"
                        )}
                    />
                </div>
                <div className="grid grid-cols-5 gap-2 md:gap-3 p-2 bg-slate-200 rounded-lg">
                    <AnimatePresence>
                        {puzzle.grid.map((tile, index) => (
                            <motion.div
                                key={tile.id}
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.02 }}
                                className="aspect-square relative"
                                onClick={() => handleTileClick(tile.id)}
                            >
                                <div 
                                    className={cn("w-full h-full transition-transform duration-500", phase !== 'memorize' && "transform-style-3d", phase === 'play' && "cursor-pointer", selectedTileIds.includes(tile.id) && "rotate-y-180")}
                                >
                                    {/* Face */}
                                    <div className="absolute w-full h-full backface-hidden rounded-md overflow-hidden shadow-md">
                                        <Image
                                            src={puzzle.imageUrls[tile.fruitType]}
                                            alt={tile.fruitType}
                                            width={100}
                                            height={100}
                                            className="w-full h-full object-cover"
                                            priority
                                        />
                                    </div>
                                    {/* Back */}
                                    <div className={cn("absolute w-full h-full backface-hidden rotate-y-180 flex items-center justify-center bg-slate-800 rounded-md border-2", selectedTileIds.includes(tile.id) ? "border-green-500" : "border-slate-600" )}>
                                         <Check className={cn("h-8 w-8 text-green-400 transition-opacity", selectedTileIds.includes(tile.id) ? "opacity-100" : "opacity-0")} />
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </CardContent>
            {phase === 'play' && (
                <CardFooter>
                    <Button onClick={handleSubmit} className="w-full" size="lg" disabled={hasSubmitted}>
                        تأكيد الإجابة
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}