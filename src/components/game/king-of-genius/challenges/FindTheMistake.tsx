
'use client';

import { useState, useEffect } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { Check, Eye } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';


const generatePattern = () => {
    const start = Math.floor(Math.random() * 10) + 1;
    const increment = Math.floor(Math.random() * 5) + 2;
    const length = 6;
    const sequence = Array.from({ length }, (_, i) => start + i * increment);
    const mistakeIndex = Math.floor(Math.random() * (length -1)) + 1; // not the first one
    sequence[mistakeIndex] += (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 2) + 1);
    return { sequence, mistakeIndex };
};

export function FindTheMistake({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const [puzzle] = useState(() => game.challengeState?.puzzle || generatePattern());
    const [selected, setSelected] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [startTime] = useState(Date.now());

    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
        }
    }, [game.challengeState, self.id]);

    const handleSelect = async (index: number) => {
        if (isSubmitting || hasSubmitted) return;

        setSelected(index);
        setIsSubmitting(true);

        const endTime = Date.now();
        const timeTaken = (endTime - startTime) / 1000;
        const isCorrect = index === puzzle.mistakeIndex;

        toast({
            title: isCorrect ? "صحيح!" : "خطأ!",
            description: isCorrect ? "لقد اكتشفت الخطأ في النمط." : `الخطأ كان في الرقم ${puzzle.sequence[puzzle.mistakeIndex]}.`,
            variant: isCorrect ? "default" : "destructive",
        });
        
        try {
            await submitChallengeResult(game.id, self.id, { isCorrect, time: timeTaken });
            setHasSubmitted(true);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
            setIsSubmitting(false);
        }
    };
    
    if (hasSubmitted) {
        return (
             <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Check className="w-20 h-20 text-green-500 mx-auto mb-4" />
                    <p className="text-xl">تم إرسال نتيجتك. في انتظار بقية اللاعبين...</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="w-full max-w-2xl bg-white/80 backdrop-blur-sm border-gray-200">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>{challenge.description}</CardDescription>
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
                                "w-24 h-24 text-4xl font-bold bg-muted hover:bg-muted/80 border-2 border-transparent",
                                selected === index && (index === puzzle.mistakeIndex ? "bg-green-100 border-green-500 text-green-600" : "bg-red-100 border-red-500 text-red-600")
                            )}
                            disabled={isSubmitting}
                        >
                            {num}
                        </Button>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
