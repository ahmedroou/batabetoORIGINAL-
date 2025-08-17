'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import {
  Undo2, Redo2, Eraser, Pencil, Highlighter, Type, Droplet,
  Image as ImageIcon, Download, Maximize2, Minimize2, Square, Circle,
  Minus, Grid, Trash2, Hand
} from 'lucide-react';
import { submitDrawing } from '@/lib/actions/draw-and-deceive';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { DrawingCanvas } from './DrawingCanvas';
import { PlayerAvatar } from '../../PlayerAvatar';


interface DrawingPhaseProps {
    game: Game;
    self: Player;
}

export function DrawingPhase({ game, self }: DrawingPhaseProps) {
    const { toast } = useToast();
    const state = game.drawAndDeceiveState!;
    const isArtist = state.artistId === self.id;
    const [drawingDataUrl, setDrawingDataUrl] = useState<string | null>(null);
    const [correctAnswer, setCorrectAnswer] = useState('');
    const [loading, setLoading] = useState(false);
    
    const artist = game.players.find(p => p.id === state.artistId);

    const handleSubmit = async () => {
        if (!drawingDataUrl || !correctAnswer.trim()) {
            toast({
                title: "بيانات ناقصة",
                description: "الرجاء إكمال الرسم وكتابة الوصف الصحيح.",
                variant: "destructive",
            });
            return;
        }
        setLoading(true);
        try {
            await submitDrawing(game.id, self.id, drawingDataUrl, correctAnswer);
        } catch (error: any) {
            toast({
                title: "خطأ في الإرسال",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    if (!isArtist) {
        return (
            <div className="text-center p-8 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <PlayerAvatar avatarId={artist?.avatarId || 'Avatar00.png'} className="w-24 h-24 mx-auto mb-4 border-4 border-primary"/>
                <p className="text-xl animate-pulse">في انتظار الفنان {artist?.name || ''} لإكمال الرسمة...</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl mx-auto p-4 space-y-4">
             <div className="text-center p-4 bg-primary/10 border border-primary/20 rounded-lg">
                <p className="text-lg">دورك للرسم! الكلمة هي:</p>
                <p className="text-3xl font-extrabold text-primary">{state.wordToDraw}</p>
            </div>
            
            <DrawingCanvas onDrawEnd={setDrawingDataUrl} />

            <div className="flex flex-col sm:flex-row gap-2">
                <Input 
                    placeholder="اكتب الوصف الصحيح هنا (كلمتين فقط)"
                    value={correctAnswer}
                    onChange={(e) => setCorrectAnswer(e.target.value)}
                    className="flex-grow h-12 text-base"
                />
                <Button onClick={handleSubmit} disabled={loading || !drawingDataUrl || !correctAnswer.trim()} size="lg" className="h-12">
                    {loading ? <Loader2 className="animate-spin" /> : "إرسال الرسم"}
                </Button>
            </div>
        </div>
    );
}
