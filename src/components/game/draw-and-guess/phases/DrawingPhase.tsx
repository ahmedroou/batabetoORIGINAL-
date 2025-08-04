
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
    
    // For the drawer, this ref holds the drawing state that they are manipulating.
    // It's only set once initially to avoid overwriting their work with server updates.
    const initialDrawingRef = useRef(dgs?.drawing);
    
    const drawingDataRef = useRef<Omit<DrawingData, 'width' | 'height'>>({ 
        lines: initialDrawingRef.current?.lines || [], 
        shapes: initialDrawingRef.current?.shapes || [], 
        bgColor: initialDrawingRef.current?.bgColor || '#FFFFFF' 
    });
    
    const onExpire = useCallback(() => {
        if (isHost) {
            handleDrawAndGuessTimeout(game.id, self.id);
        }
    }, [isHost, game.id, self.id]);

    const sendUpdateToServer = useCallback(() => {
        const canvasElement = document.querySelector('.drawing-container');
        if (canvasElement && isMyTurn) { // Only the drawer sends updates
             updateDrawing(game.id, self.id, {
                ...drawingDataRef.current,
                width: canvasElement.clientWidth,
                height: canvasElement.clientHeight
            });
        }
    }, [game.id, self.id, isMyTurn]);
    
    // Set up a timer to send updates periodically
    useEffect(() => {
        if (!isMyTurn) return; // Only drawer should send updates
        const interval = setInterval(() => {
            sendUpdateToServer();
        }, 3000); // Send updates every 3 seconds
        
        return () => clearInterval(interval);
    }, [isMyTurn, sendUpdateToServer]);


    const handleDrawingUpdate = useCallback((data: Omit<DrawingData, 'width' | 'height'>) => {
        if (!isMyTurn) return;
        drawingDataRef.current = data;
        // Send an update immediately when drawing stops (mouse up)
        sendUpdateToServer();
    }, [isMyTurn, sendUpdateToServer]);

    const handleSubmit = async () => {
        if (!isMyTurn || isSubmitting) return;

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
                    // The drawer uses their own local state primarily, only getting the initial drawing once.
                    // Spectators will get the drawing from the server state (`dgs?.drawing`).
                    initialDrawing={isMyTurn ? initialDrawingRef.current : dgs?.drawing || undefined}
                    onDraw={handleDrawingUpdate}
                    isDrawingDisabled={!isMyTurn || isSubmitting}
                    isViewingOnly={!isMyTurn}
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
