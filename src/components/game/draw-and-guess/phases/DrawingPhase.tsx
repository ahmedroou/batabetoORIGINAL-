
"use client";

import type { Game, Player, DrawingData } from '@/types';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { updateDrawing, submitDrawing, handleDrawAndGuessTimeout } from '@/app/actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Send, Loader2, Eye } from 'lucide-react';
import { DrawingCanvas } from '../DrawingCanvas';
import { CountdownTimer } from '@/components/game/CountdownTimer';


interface DrawingPhaseProps {
    game: Game;
    self: Player;
}

export function DrawingPhase({ game, self }: DrawingPhaseProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const dgs = game.drawAndGuessState;
    const isMyTurn = dgs?.currentDrawerId === self.id;
    const isHost = game.hostId === self.id;
    const drawer = game.players.find(p => p.id === dgs?.currentDrawerId);
    
    const drawingDataRef = useRef<DrawingData>({ lines: [], shapes: [], bgColor: '#FFFFFF', width: 800, height: 600 });
    const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const onExpire = useCallback(() => {
        if (isHost) {
            handleDrawAndGuessTimeout(game.id, self.id);
        }
    }, [isHost, game.id, self.id]);

    const handleDrawingUpdate = useCallback((data: Omit<DrawingData, 'width' | 'height'>) => {
        if (!isMyTurn) return;
        
        drawingDataRef.current = {
            ...drawingDataRef.current,
            lines: data.lines,
            shapes: data.shapes,
            bgColor: data.bgColor
        };

        if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = setTimeout(() => {
            const canvasElement = document.querySelector('.drawing-container');
            if (canvasElement) {
                updateDrawing(game.id, self.id, {
                    ...drawingDataRef.current,
                    width: canvasElement.clientWidth,
                    height: canvasElement.clientHeight
                });
            }
        }, 2000); // Send updates every 2 seconds
    }, [game.id, self.id, isMyTurn]);

    const handleSubmit = async () => {
        if (!isMyTurn || isSubmitting) return;

        if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
        
        const canvasElement = document.querySelector('.drawing-container');
        if (!canvasElement) {
            toast({ title: "خطأ", description: "لم يتم العثور على لوحة الرسم.", variant: "destructive" });
            return;
        }

        const finalDrawingData: DrawingData = {
            ...drawingDataRef.current,
            width: canvasElement.clientWidth,
            height: canvasElement.clientHeight
        };
        
        setIsSubmitting(true);
        try {
            await submitDrawing(game.id, self.id, finalDrawingData);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
             setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-4 w-full h-full p-4">
             <Card className="w-full max-w-4xl text-center p-4">
                <CardHeader className="p-2">
                    <div className="flex justify-between items-center">
                         <h2 className="text-2xl font-bold">{isMyTurn ? "دورك في الرسم!" : `دور ${drawer?.name} للرسم`}</h2>
                        {dgs?.timerEndsAt && (
                            <CountdownTimer expiryTimestamp={dgs.timerEndsAt.toMillis()} onExpire={onExpire} />
                        )}
                    </div>
                     <CardDescription className="text-xl font-bold text-primary mt-2">
                         {isMyTurn ? `ارسم: ${dgs?.prompt?.text}` : `الفئة: ${dgs?.prompt?.category}`}
                    </CardDescription>
                </CardHeader>
             </Card>
             <div className="flex-grow w-full max-w-4xl h-full drawing-container">
                <DrawingCanvas
                    initialDrawing={dgs.drawing || { lines: [], shapes: [], bgColor: '#FFFFFF' }}
                    onDraw={handleDrawingUpdate}
                    isDrawingDisabled={!isMyTurn || isSubmitting}
                />
             </div>
             {isMyTurn && (
                <Button
                    size="lg"
                    className="w-full max-w-4xl text-lg mt-4"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? <Loader2 className="animate-spin" /> : <Send />}
                    تقديم الرسمة
                </Button>
             )}
        </div>
    );
}
