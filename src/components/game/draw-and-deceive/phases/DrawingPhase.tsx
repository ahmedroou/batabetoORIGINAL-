
'use client';

import React, { useState, useRef } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DrawingCanvas } from '../DrawingCanvas';
import { submitDrawing } from '@/lib/actions/draw-and-deceive';
import { Loader2, Palette } from 'lucide-react';

interface DrawingPhaseProps {
    game: Game;
    self: Player;
}

export function DrawingPhase({ game, self }: DrawingPhaseProps) {
    const { toast } = useToast();
    const state = game.drawAndDeceiveState!;
    const isArtist = state.artistId === self.id;
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const [drawingData, setDrawingData] = useState<string | null>(null);
    const [correctAnswer, setCorrectAnswer] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!drawingData) {
            toast({ title: "الرسمة فارغة!", description: "الرجاء رسم شيء قبل الإرسال.", variant: "destructive" });
            return;
        }
        if (correctAnswer.trim().split(/\s+/).length > 2 || correctAnswer.trim().length === 0) {
            toast({ title: "وصف غير صالح", description: "الوصف يجب أن يكون كلمة أو كلمتين فقط.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            await submitDrawing(game.id, self.id, drawingData, correctAnswer);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isArtist) {
        return (
            <Card className="w-full max-w-2xl">
                <CardHeader className="text-center">
                    <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                        <Palette /> دورك في الرسم
                    </CardTitle>
                    <CardDescription>
                        الكلمة المطلوب رسمها هي: <strong className="text-primary text-xl">{state.wordToDraw}</strong>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div ref={canvasContainerRef} className="w-full aspect-video rounded-lg overflow-hidden">
                        <DrawingCanvas
                            width={canvasContainerRef.current?.offsetWidth || 500}
                            height={canvasContainerRef.current?.offsetHeight || 300}
                            onDrawEnd={setDrawingData}
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="space-y-2">
                        <Input
                            placeholder="اكتب وصفًا للرسمة (كلمة أو كلمتين)"
                            value={correctAnswer}
                            onChange={(e) => setCorrectAnswer(e.target.value)}
                            maxLength={30}
                            disabled={isSubmitting}
                        />
                         <Button onClick={handleSubmit} disabled={isSubmitting || !drawingData || !correctAnswer} className="w-full">
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "إرسال الرسمة والوصف"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // View for other players
    const artist = game.players.find(p => p.id === state.artistId);
    return (
         <Card className="w-full max-w-lg text-center">
            <CardHeader>
                <CardTitle>مرحلة الرسم</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="animate-pulse text-lg">الرسام <strong className="text-primary">{artist?.name || '...'}</strong> يقوم بالرسم حاليًا. استعد لوضع فخاخك!</p>
                <div className="w-24 h-24 mx-auto mt-4">
                   <Palette className="w-full h-full text-muted-foreground animate-pulse" />
                </div>
            </CardContent>
        </Card>
    );
}
