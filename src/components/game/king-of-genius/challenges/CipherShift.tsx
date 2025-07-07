

'use client';

import { useState, useEffect } from 'react';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Lightbulb, Loader2 } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';

export function CipherShift({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const puzzle = game.challengeState?.puzzle;
    const [guess, setGuess] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [startTime] = useState(Date.now());
    
    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
        }
    }, [game.challengeState, self.id]);

    const handleSubmit = async () => {
        if (!puzzle || isSubmitting || hasSubmitted) return;
        setIsSubmitting(true);
        const endTime = Date.now();
        const timeTaken = (endTime - startTime) / 1000;
        const isCorrect = guess.trim().toUpperCase() === puzzle.plaintext;

        toast({
            title: isCorrect ? "صحيح!" : "خطأ!",
            description: isCorrect ? `لقد فككت الشيفرة: ${puzzle.plaintext}` : "للأسف، إجابة خاطئة.",
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

    if (!puzzle) {
        return (
            <Card className="w-full max-w-md text-center bg-white/80 backdrop-blur-sm border-gray-200">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">جاري توليد اللغز...</p>
                </CardContent>
            </Card>
        )
    }
    
    return (
        <Card className="w-full max-w-md bg-white/80 backdrop-blur-sm border-gray-200">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription>{challenge.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="p-6 bg-muted rounded-lg border text-center">
                    <p className="text-muted-foreground text-sm mb-2">النص المشفّر</p>
                    <p className="font-mono text-4xl tracking-widest text-amber-500">{puzzle.encrypted}</p>
                </div>
                <div className="flex items-center justify-center gap-2 text-card-foreground p-2 bg-background/50 rounded-md">
                    <Lightbulb className="w-5 h-5 text-yellow-500" />
                    <p><span className="font-semibold">تلميح:</span> {puzzle.hint}</p>
                </div>
                <div className="space-y-2">
                    <Input
                        type="text"
                        placeholder="أدخل إجابتك هنا..."
                        value={guess}
                        onChange={(e) => setGuess(e.target.value)}
                        className="text-center h-12 text-lg"
                        disabled={isSubmitting}
                        onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                    />
                    <Button onClick={handleSubmit} disabled={isSubmitting || !guess.trim()} className="w-full" size="lg" variant="secondary">
                        {isSubmitting ? '...' : 'تأكيد'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
