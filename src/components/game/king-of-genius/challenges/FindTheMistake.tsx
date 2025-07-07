

'use client';

import { useState, useEffect } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2 } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';


export function FindTheMistake({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const puzzles = game.challengeState?.puzzles;

    const [currentStage, setCurrentStage] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [startTime] = useState(Date.now());
    const [selected, setSelected] = useState<number | null>(null);
    const [isCorrecting, setIsCorrecting] = useState(false);


    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
        }
    }, [game.challengeState?.results, self.id]);

    const handleSelect = async (index: number) => {
        if (isSubmitting || hasSubmitted || isCorrecting) return;
        
        if (!puzzles) return;

        const puzzle = puzzles[currentStage];
        setSelected(index);

        const isCorrect = index === puzzle.mistakeIndex;

        if (isCorrect) {
            setIsCorrecting(true);
            toast({
                title: "صحيح!",
                description: `رائع! لننتقل للمرحلة التالية.`,
            });
            
            setTimeout(() => {
                const nextStage = currentStage + 1;
                if (nextStage >= puzzles.length) {
                    setIsSubmitting(true);
                    const timeTaken = (Date.now() - startTime) / 1000;
                    submitChallengeResult(game.id, self.id, { isCorrect: true, time: timeTaken }).then(() => {
                        setHasSubmitted(true);
                    });
                } else {
                    setCurrentStage(nextStage);
                    setSelected(null);
                    setIsCorrecting(false);
                }
            }, 1000);

        } else {
            toast({
                title: "خطأ!",
                description: "هذا ليس الخطأ في النمط. حاول مرة أخرى.",
                variant: "destructive",
            });
        }
    };
    
    if (hasSubmitted) {
        return (
             <Card className="w-full max-w-2xl text-center bg-white/80 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Check className="w-20 h-20 text-green-500 mx-auto mb-4" />
                    <p className="text-xl">أنهيت التحدي بنجاح! في انتظار بقية اللاعبين...</p>
                </CardContent>
            </Card>
        )
    }

     if (!puzzles) {
        return (
             <Card className="w-full max-w-2xl bg-white/80 backdrop-blur-sm border-gray-200 text-center">
                 <CardHeader>
                     <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                 </CardHeader>
                 <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">جاري تحضير الألغاز...</p>
                 </CardContent>
            </Card>
        )
    }

    const puzzle = puzzles[currentStage];

    return (
        <Card className="w-full max-w-2xl bg-white/80 backdrop-blur-sm border-gray-200">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>{challenge.description}</CardDescription>
                 <div className="pt-4 space-y-2">
                    <div className="flex justify-between text-sm font-medium px-1">
                        <span>التقدم</span>
                        <span>المرحلة {currentStage + 1} / {puzzles.length}</span>
                    </div>
                    <Progress value={((currentStage + 1) / puzzles.length) * 100} className="h-3" />
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <p className="text-center text-lg text-muted-foreground">
                    اضغط على الرقم الذي لا يتبع النمط
                </p>
                <div className="flex justify-center gap-4 flex-wrap">
                    {puzzle.sequence.map((num: number, index: number) => (
                        <Button
                            key={index}
                            onClick={() => handleSelect(index)}
                            variant="outline"
                            className={cn(
                                "w-24 h-24 text-4xl font-bold bg-muted hover:bg-muted/80 border-2 border-transparent transition-all duration-300",
                                isCorrecting && index === puzzle.mistakeIndex ? "bg-green-100 border-green-500 text-green-600 scale-110" : "",
                                !isCorrecting && selected === index && index !== puzzle.mistakeIndex ? "bg-red-100 border-red-500 text-red-600 animate-shake" : ""
                            )}
                            disabled={isSubmitting || isCorrecting}
                        >
                            {num}
                        </Button>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
