'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { submitDrawing } from '@/lib/actions/draw-and-deceive';
import { Loader2, Palette } from 'lucide-react';
import { DrawingCanvas } from './DrawingCanvas'; // استيراد من نفس الملف

interface DrawingPhaseProps {
    game: Game;
    self: Player;
}

export function DrawingPhase({ game, self }: DrawingPhaseProps) {
    const { toast } = useToast();
    const state = game.drawAndDeceiveState!;
    const isArtist = state.artistId === self.id;

    const [drawingDataUrl, setDrawingDataUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submittingRef = useRef(false);

    const handleSubmit = async () => {
        if (!drawingDataUrl) {
            toast({ title: "اللوحة فارغة", description: "الرجاء رسم شيء قبل الإرسال.", variant: "destructive" });
            return;
        }
        if (isSubmitting || submittingRef.current) return;
        submittingRef.current = true;
        setIsSubmitting(true);
        try {
            // The `correctAnswer` is the word the artist was given to draw.
            await submitDrawing(game.id, self.id, drawingDataUrl, state.wordToDraw!);
            toast({ title: 'تم إرسال لوحتك بنجاح!' });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message ?? 'تعذر إرسال الرسم', variant: "destructive" });
            setIsSubmitting(false);
            submittingRef.current = false;
        }
    };

    if (!isArtist) {
        return (
            <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <CardTitle>مرحلة الرسم</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="animate-pulse text-lg">
                        في انتظار الفنان {game.players.find(p => p.id === state.artistId)?.name || '...'} للانتهاء من الرسم.
                    </p>
                    <div className="w-24 h-24 mx-auto mt-4">
                        <Palette className="w-full h-full text-muted-foreground animate-pulse" />
                    </div>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card className="w-full max-w-4xl h-[90vh] flex flex-col">
            <CardHeader className="text-center">
                <CardTitle>دورك للرسم!</CardTitle>
                <CardDescription>
                    الكلمة المطلوب منك رسمها هي: <strong className="text-primary text-xl">{state.wordToDraw}</strong>
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col min-h-0">
                <DrawingCanvas
                    onDrawEnd={setDrawingDataUrl}
                    className="w-full h-full"
                    disabled={isSubmitting}
                />
            </CardContent>
            <CardFooter>
                 <Button onClick={handleSubmit} disabled={isSubmitting || !drawingDataUrl} className="w-full">
                    {isSubmitting ? <Loader2 className="animate-spin" /> : 'إرسال الرسم النهائي'}
                </