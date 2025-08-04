"use client";

import type { Game, Player, DrawingLine } from '@/types';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { updateDrawing, submitDrawing } from '@/app/actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Send, Loader2, Eye } from 'lucide-react';
import { DrawingCanvas } from '../DrawingCanvas';
import { CountdownTimer } from '@/components/game/CountdownTimer';
import { cn } from '@/lib/utils';


interface DrawingPhaseProps {
    game: Game;
    self: Player;
}

export function DrawingPhase({ game, self }: DrawingPhaseProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const dgs = game.drawAndGuessState;
    const isMyTurn = dgs?.currentDrawerId === self.id;
    const drawer = game.players.find(p => p.id === dgs?.currentDrawerId);
    
    const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleDrawingUpdate = useCallback((lines: DrawingLine[]) => {
        if (!isMyTurn) return;
        
        // Use a timeout to batch updates and reduce network traffic
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }
        updateTimeoutRef.current = setTimeout(() => {
            updateDrawing(game.id, self.id, lines);
        }, 500); // Send updates every 500ms
        
    }, [game.id, self.id, isMyTurn]);

    // Cleanup timeout on component unmount
    useEffect(() => {
        return () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }
        };
    }, []);

    const handleSubmit = async (lines: DrawingLine[]) => {
        if (!isMyTurn || isSubmitting) return;
        
        const stage = document.querySelector('canvas')?.parentElement?.parentElement as HTMLElement;
        if (!stage) {
            toast({ title: "خطأ", description: "لم يتم العثور على لوحة الرسم.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            await submitDrawing(game.id, self.id, {
                lines,
                width: stage.offsetWidth,
                height: stage.offsetHeight,
            });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isMyTurn) {
        return (
            <div className="flex flex-col items-center gap-4 w-full h-full p-4">
                 <div className="w-full text-center p-4 bg-background/80 rounded-xl backdrop-blur-sm">
                    <h2 className="text-2xl font-bold">دور {drawer?.name} للرسم</h2>
                    <p className="text-muted-foreground">الفئة: {dgs?.prompt?.category}</p>
                 </div>
                 {dgs?.timerEndsAt && (
                    <CountdownTimer expiryTimestamp={dgs.timerEndsAt.toMillis()} onExpire={() => {}} />
                )}
                 <div className="flex-grow w-full max-w-4xl">
                    <DrawingCanvas initialLines={dgs.drawing?.lines} onDraw={() => {}} isDrawingDisabled={true} />
                 </div>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col items-center gap-4 w-full h-full p-4">
             <Card className="w-full max-w-4xl text-center p-4">
                <CardHeader className="p-2">
                    <div className="flex justify-between items-center">
                        <div/>
                        <CardTitle>دورك في الرسم!</CardTitle>
                        {dgs?.timerEndsAt && (
                            <CountdownTimer expiryTimestamp={dgs.timerEndsAt.toMillis()} onExpire={() => {}} />
                        )}
                    </div>
                     <CardDescription className="text-xl font-bold text-primary mt-2">
                         ارسم: {dgs?.prompt?.text}
                    </CardDescription>
                </CardHeader>
             </Card>
             <div className="flex-grow w-full max-w-4xl h-full">
                <DrawingCanvas
                    onDraw={handleDrawingUpdate}
                    isDrawingDisabled={isSubmitting}
                />
             </div>
             <Button
                size="lg"
                className="w-full max-w-4xl text-lg mt-4"
                onClick={() => {
                    const canvasElement = document.querySelector('canvas');
                    const lines = (canvasElement as any)?.__konvaNode__?.getStage()?.getLayers()[0]?.getChildren(node => node.getClassName() === 'Line').map((line: any) => ({
                         points: line.points(),
                         color: line.stroke(),
                         strokeWidth: line.strokeWidth(),
                    })) || [];
                    handleSubmit(lines);
                }}
                disabled={isSubmitting}
             >
                {isSubmitting ? <Loader2 className="animate-spin" /> : <Send />}
                تقديم الرسمة
             </Button>
        </div>
    );
}