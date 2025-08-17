
'use client';

import React, { useState } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { submitGuess } from '@/lib/actions/draw-and-deceive';
import { Loader2, HelpCircle } from 'lucide-react';
import Image from 'next/image';
import { motion } from 'framer-motion';

interface GuessingPhaseProps {
    game: Game;
    self: Player;
}

export function GuessingPhase({ game, self }: GuessingPhaseProps) {
    const { toast } = useToast();
    const state = game.drawAndDeceiveState!;
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const hasGuessed = !!state.playerGuesses[self.id];
    const artist = game.players.find(p => p.id === state.artistId);

    const handleSubmit = async () => {
        if (!selectedAnswer) {
            toast({ title: 'اختر تخمينًا', description: 'يجب أن تختار أحد الأوصاف.', variant: 'destructive' });
            return;
        }
        setIsSubmitting(true);
        try {
            await submitGuess(game.id, self.id, selectedAnswer);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (hasGuessed) {
        return (
             <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <CardTitle>تم تسجيل تخمينك!</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="animate-pulse text-lg">في انتظار بقية اللاعبين...</p>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card className="w-full max-w-2xl">
            <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                    <HelpCircle /> ما هو الوصف الصحيح؟
                </CardTitle>
                 <CardDescription>
                    قام {artist?.name || 'الفنان'} برسم هذه اللوحة. اختر الوصف الذي تعتقد أنه الأصلي.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 {state.drawingDataUrl && (
                    <motion.div initial={{opacity: 0}} animate={{opacity: 1}} className="relative aspect-video w-full max-w-md mx-auto rounded-lg overflow-hidden border">
                         <Image
                            src={state.drawingDataUrl}
                            alt="Drawing by the artist"
                            fill
                            className="object-contain bg-white"
                        />
                    </motion.div>
                )}
                 <RadioGroup value={selectedAnswer || ""} onValueChange={setSelectedAnswer} className="grid grid-cols-2 gap-3">
                    {state.shuffledAnswers.map((answer, index) => (
                        <Label key={index} htmlFor={`answer-${index}`} className="p-4 border rounded-md cursor-pointer has-[:checked]:bg-primary/20 has-[:checked]:border-primary">
                             <RadioGroupItem value={answer} id={`answer-${index}`} className="sr-only" />
                             <span className="font-bold">{answer}</span>
                        </Label>
                    ))}
                </RadioGroup>
                <Button onClick={handleSubmit} disabled={isSubmitting || !selectedAnswer} className="w-full">
                    {isSubmitting ? <Loader2 className="animate-spin" /> : "تأكيد التخمين"}
                </Button>
            </CardContent>
        </Card>
    );
}
