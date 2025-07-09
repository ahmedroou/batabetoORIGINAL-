
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Timer, Eye, Brain } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Progress } from '@/components/ui/progress';

const MEMORIZE_TIME_SECONDS = 5;
const PLAY_TIME_SECONDS = 15;
const TOTAL_TIME = MEMORIZE_TIME_SECONDS + PLAY_TIME_SECONDS;

type Phase = 'loading' | 'memorize' | 'play' | 'ended';

interface ImageObject {
  id: string;
  description: string;
}

export function VisualMemory({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const puzzle = game.challengeState?.puzzle;
    const images: ImageObject[] = puzzle?.images;
    const prompt: string = puzzle?.prompt;
    const correctImageIds: string[] = puzzle?.correctImageIds;

    const [phase, setPhase] = useState<Phase>('loading');
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [timeLeft, setTimeLeft] = useState(TOTAL_TIME);
    const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
    
    const shuffledImages = useState(() => images ? [...images].sort(() => Math.random() - 0.5) : [])[0];

    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
            setPhase('ended');
        } else if (images && prompt && correctImageIds) {
            setPhase('memorize');
        }
    }, [game.challengeState?.results, self.id, images, prompt, correctImageIds]);

    useEffect(() => {
        if (hasSubmitted || !game.challengeState?.challengeEndsAt) return;

        const endTime = game.challengeState.challengeEndsAt.toMillis();
        
        const updateTimer = () => {
            const remaining = Math.round((endTime - Date.now()) / 1000);
            
            if (remaining <= 0) {
                setTimeLeft(0);
                if (phase !== 'ended' && !hasSubmitted) {
                    setPhase('ended');
                    setHasSubmitted(true);
                    submitChallengeResult(game.id, self.id, { isCorrect: false, time: PLAY_TIME_SECONDS });
                    toast({ title: "انتهى الوقت!", variant: "destructive" });
                }
                clearInterval(timer);
            } else {
                setTimeLeft(remaining);
                if (phase === 'memorize' && remaining <= PLAY_TIME_SECONDS) {
                    setPhase('play');
                }
            }
        };

        const timer = setInterval(updateTimer, 500);
        updateTimer();

        return () => clearInterval(timer);
    }, [phase, hasSubmitted, game.id, self.id, game.challengeState?.challengeEndsAt, toast]);

    const handleTileClick = (imageId: string) => {
        if (phase !== 'play') return;
        setSelectedImageIds(prev =>
            prev.includes(imageId)
                ? prev.filter(id => id !== imageId)
                : [...prev, imageId]
        );
    };

    const handleSubmit = () => {
        if (phase !== 'play' || hasSubmitted) return;

        const playStartTime = game.challengeState!.challengeEndsAt!.toMillis() - PLAY_TIME_SECONDS * 1000;
        const timeTaken = (Date.now() - playStartTime) / 1000;
        
        const sortedSelected = [...selectedImageIds].sort();
        const sortedCorrect = [...correctImageIds].sort();
        
        const isCorrect = sortedSelected.length === sortedCorrect.length && sortedSelected.every((value, index) => value === sortedCorrect[index]);
        
        setPhase('ended');
        setHasSubmitted(true);
        submitChallengeResult(game.id, self.id, { isCorrect, time: timeTaken });
        
        if (isCorrect) {
            toast({
                title: "ذاكرة قوية!",
                description: "لقد وجدت كل الصور الصحيحة.",
                className: "bg-green-100 border-green-500 text-green-700",
            });
        } else {
            toast({
                title: "محاولة خاطئة!",
                description: "لم تكن إجابتك دقيقة.",
                variant: "destructive",
            });
        }
    };

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
    
    if (phase === 'loading' || !shuffledImages.length) {
         return (
            <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">جاري توليد الصور...</p>
                </CardContent>
            </Card>
        );
    }

    const timerValue = phase === 'memorize' ? ((timeLeft - PLAY_TIME_SECONDS) / MEMORIZE_TIME_SECONDS) * 100 : (timeLeft / PLAY_TIME_SECONDS) * 100;

    return (
        <Card className="w-full max-w-2xl bg-gray-900 text-white border-gray-700 p-4">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2">
                    {phase === 'memorize' ? <Brain /> : <Eye />}
                    {challenge.name}
                </CardTitle>
                <CardDescription className="text-gray-400">
                    {phase === 'memorize' ? `احفظ الصور! أمامك ${MEMORIZE_TIME_SECONDS} ثوانٍ.` : prompt}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
                <div className="w-full bg-gray-800 p-2 rounded-lg">
                    <Progress value={timerValue} className={cn("w-full h-2 bg-gray-700", phase === 'memorize' ? "[&>*]:bg-blue-500" : "[&>*]:bg-red-500")} />
                </div>

                <div className="grid grid-cols-3 gap-2 md:gap-4">
                    <AnimatePresence>
                    {shuffledImages.map((image) => (
                        <motion.div
                            key={image.id}
                            layout
                            className="aspect-square relative"
                            onClick={() => handleTileClick(image.id)}
                        >
                            <div className={cn(
                                "absolute w-full h-full rounded-lg transition-transform duration-500",
                                phase === 'memorize' ? "transform-style-3d" : "transform-style-3d rotate-y-180"
                            )}>
                                {/* Front of card */}
                                <div className="absolute w-full h-full backface-hidden">
                                    <Image
                                        src={`https://placehold.co/200x200.png`}
                                        data-ai-hint={image.description}
                                        alt={image.description}
                                        width={200}
                                        height={200}
                                        className="w-full h-full object-cover rounded-md"
                                        priority
                                    />
                                </div>
                                {/* Back of card */}
                                <div className={cn(
                                    "absolute w-full h-full backface-hidden rotate-y-180 bg-gray-700 rounded-md flex items-center justify-center cursor-pointer border-4",
                                    selectedImageIds.includes(image.id) ? "border-green-500" : "border-transparent"
                                )}>
                                    <Check className={cn("h-12 w-12 text-green-500 transition-opacity", selectedImageIds.includes(image.id) ? "opacity-100" : "opacity-0")} />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                    </AnimatePresence>
                </div>
            </CardContent>
            <CardFooter>
                {phase === 'play' && (
                    <Button onClick={handleSubmit} className="w-full" size="lg" disabled={hasSubmitted}>
                        تأكيد الإجابة
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}
