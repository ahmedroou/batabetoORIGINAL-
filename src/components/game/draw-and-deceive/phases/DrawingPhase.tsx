'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, Palette, Timer } from 'lucide-react';
import { DrawingCanvas } from './DrawingCanvas';
import { submitDrawing } from '@/lib/actions/draw-and-deceive';
import { motion } from 'framer-motion';

interface DrawingPhaseProps {
    game: Game;
    self: Player;
}

export function DrawingPhase({ game, self }: DrawingPhaseProps) {
    const { toast } = useToast();
    const state = game.drawAndDeceiveState!;
    const isArtist = state.artistId === self.id;
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Local state for artist's inputs
    const [drawingData, setDrawingData] = useState<string | null>(null);
    const [correctAnswer, setCorrectAnswer] = useState('');
    
    const [timeLeft, setTimeLeft] = useState(() => {
        if (!state.timerEndsAt) return state.settings?.drawingTime ?? 120;
        return Math.max(0, Math.round((state.timerEndsAt.toMillis() - Date.now()) / 1000));
    });
    
    useEffect(() => {
        if (!isArtist || !state.timerEndsAt) return;
        const endTime = state.timerEndsAt.toMillis();
        const timer = setInterval(() => {
            const remaining = Math.round((endTime - Date.now()) / 1000);
            if (remaining <= 0) {
                clearInterval(timer);
                setTimeLeft(0);
                // The server will handle timeout via the tick function or host action
            } else {
                setTimeLeft(remaining);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [isArtist, state.timerEndsAt]);

    const handleDrawingChange = useCallback((dataUrl: string) => {
        setDrawingData(dataUrl);
    }, []);

    const handleSubmit = async () => {
        if (!isArtist || isSubmitting) return;
        if (!drawingData) {
            toast({ title: "اللوحة فارغة", description: "يجب أن ترسم شيئًا قبل الإرسال.", variant: "destructive" });
            return;
        }
        if (!correctAnswer.trim()) {
            toast({ title: "الوصف مفقود", description: "يجب أن تكتب وصفًا صحيحًا للرسمة.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            await submitDrawing(game.id, self.id, drawingData, correctAnswer);
            toast({ title: "تم إرسال الرسمة بنجاح!" });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (!isArtist) {
        const artist = game.players.find(p => p.id === state.artistId);
        return (
            <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <CardTitle>مرحلة الرسم</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="animate-pulse text-lg">
                        في انتظار {artist?.name || 'الفنان'} لإكمال رسمته...
                    </p>
                    <div className="w-24 h-24 mx-auto mt-4">
                        <Palette className="w-full h-full text-muted-foreground animate-pulse" />
                    </div>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-2 md:p-4">
            <Card className="w-full max-w-4xl">
                <CardHeader className="text-center">
                    <CardTitle>دورك للرسم!</CardTitle>
                    <CardDescription>
                        الكلمة التي يجب عليك رسمها هي: <strong className="text-primary text-xl mx-2">{state.wordToDraw}</strong>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-center items-center gap-2 text-lg font-bold">
                        <Timer />
                        <span>{timeLeft} ثانية</span>
                    </div>
                    
                    <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.2}}>
                       <DrawingCanvas onDrawEnd={handleDrawingChange} disabled={isSubmitting} />
                    </motion.div>

                    <div className="space-y-2">
                        <Label htmlFor="correct-answer">اكتب الوصف الصحيح للرسمة (كلمة أو كلمتين)</Label>
                        <Input 
                            id="correct-answer"
                            value={correctAnswer}
                            onChange={(e) => setCorrectAnswer(e.target.value)}
                            placeholder="مثال: قطة نائمة"
                            maxLength={30}
                            disabled={isSubmitting}
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleSubmit} disabled={isSubmitting || !drawingData || !correctAnswer.trim()} className="w-full" size="lg">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send className="mr-2"/>إرسال الرسمة والوصف</>}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
