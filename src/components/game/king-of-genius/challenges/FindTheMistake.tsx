
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
            className: isCorrect ? "bg-green-600 border-green-600 text-white" : ""
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
             <Card className="w-full max-w-md bg-gray-900/80 border-gray-700 text-white text-center">
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
        <Card className="w-full max-w-2xl bg-gray-900/80 border-gray-700 text-white">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription className="text-gray-400">{challenge.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <p className="text-center text-lg text-gray-300">
                    اضغط على الرقم الذي لا يتبع النمط
                </p>
                <div className="flex justify-center gap-4 flex-wrap">
                    {puzzle.sequence.map((num: number, index: number) => (
                        <Button
                            key={index}
                            onClick={() => handleSelect(index)}
                            variant="outline"
                            className={cn(
                                "w-24 h-24 text-4xl font-bold bg-gray-800 border-gray-600 hover:bg-gray-700 text-white",
                                selected === index && (index === puzzle.mistakeIndex ? "bg-green-600 border-green-500" : "bg-red-600 border-red-500")
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
