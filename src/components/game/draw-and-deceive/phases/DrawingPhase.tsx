'use client';

import React, { useCallback, useState, useEffect, useRef } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitCorrectAnswerAndStartDrawing, endArtistTurn, saveDrawingProgress } from '@/lib/actions/draw-and-deceive';
import { Loader2, Send, Timer } from 'lucide-react';
import { DrawingCanvas, type DrawingCanvasRef } from './DrawingCanvas';
import { DrawingToolbar } from './DrawingToolbar';

// ====================================================================================
// DrawingPhase Component
// This is the main parent component that orchestrates the drawing stage.
// It manages the state for tools and passes them down to the toolbar and canvas.
// ====================================================================================

interface DrawingPhaseProps {
  game: Game;
  self: Player;
}

const WritingView = ({ onSubmit, isSubmitting }: { onSubmit: (text: string) => Promise<void>; isSubmitting: boolean }) => {
  const [correctAnswer, setCorrectAnswer] = useState('');
  
  const handleAnswerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctAnswer.trim() || isSubmitting) return;
    onSubmit(correctAnswer);
  };

  return (
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>أنت الفنان!</CardTitle>
          <CardDescription>اكتب الوصف الصحيح لرسمتك (كلمة أو كلمتين فقط).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAnswerSubmit} className="flex gap-2">
            <Input
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              placeholder="مثال: قطار سريع"
              maxLength={30}
              disabled={isSubmitting}
            />
            <Button type="submit" disabled={isSubmitting || !correctAnswer.trim()}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </form>
        </CardContent>
      </Card>
  );
};

export function DrawingPhase({ game, self }: DrawingPhaseProps) {
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const [drawingDataUrl, setDrawingDataUrl] = useState<string | null>(state.drawingDataUrl ?? null);
  const [isSubmitting, setIsSubmitting] = useState<'answer' | 'drawing' | false>(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<DrawingCanvasRef>(null);

  // Toolbar state
  const [tool, setTool] = useState<any>('pen');
  const [color, setColor] = useState<string>('#1f2937');
  const [thickness, setThickness] = useState<number>(5);
  const [opacity, setOpacity] = useState<number>(1);
  const [shapeFill, setShapeFill] = useState<boolean>(false);
  const [textValue, setTextValue] = useState<string>('');
  const [textSize, setTextSize] = useState<number>(24);
  const [fillTolerance, setFillTolerance] = useState<number>(24);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  
  const [canUndo, setCanUndo] = useState(false); // To enable/disable undo/redo buttons
  const [canRedo, setCanRedo] = useState(false);

  const [timeLeft, setTimeLeft] = useState<number>(() => {
      const ends = state.timerEndsAt?.toMillis();
      return ends ? Math.max(0, Math.round((ends - Date.now()) / 1000)) : 0;
  });

  const hasAnswerBeenSet = !!state.correctAnswer;
  
  useEffect(() => {
    const ends = state.timerEndsAt?.toMillis();
    if (!ends) return;
    const update = () => {
        const remaining = Math.max(0, Math.round((ends - Date.now())/1000));
        setTimeLeft(remaining);
    };
    const timer = setInterval(update, 1000);
    update();
    return () => clearInterval(timer);
  }, [state.timerEndsAt]);

  const handleAnswerSubmit = async (correctAnswer: string) => {
    if (isSubmitting) return;
    setIsSubmitting('answer');
    try {
      await submitCorrectAnswerAndStartDrawing(game.id, self.id, correctAnswer);
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualDrawingSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting('drawing');
    try {
      await endArtistTurn(game.id, self.id, drawingDataUrl ?? undefined);
      toast({title: "تم استلام الرسمة!", description: "بانتظار اللاعبين لوضع فخاخهم."});
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDrawEnd = useCallback((dataUrl: string) => {
    setDrawingDataUrl(dataUrl);
    if(autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
        saveDrawingProgress(game.id, self.id, dataUrl).catch(() => {});
    }, 2000);
  }, [game.id, self.id]);
  
  useEffect(() => {
    return () => {
      if(autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    }
  }, []);

  if (!hasAnswerBeenSet) {
    return <WritingView onSubmit={handleAnswerSubmit} isSubmitting={isSubmitting === 'answer'} />;
  }

  return (
    <div className="w-full h-full flex flex-col items-center gap-4">
      <div className="flex items-center gap-2 text-lg font-mono">
        <Timer /> {timeLeft}s
      </div>
      
      <DrawingToolbar
        tool={tool} setTool={setTool}
        color={color} setColor={setColor}
        thickness={thickness} setThickness={setThickness}
        opacity={opacity} setOpacity={setOpacity}
        shapeFill={shapeFill} setShapeFill={setShapeFill}
        textValue={textValue} setTextValue={setTextValue}
        textSize={textSize} setTextSize={setTextSize}
        fillTolerance={fillTolerance} setFillTolerance={setFillTolerance}
        showGrid={showGrid} setShowGrid={setShowGrid}
        onUndo={() => canvasRef.current?.undo()}
        canUndo={canUndo}
        onRedo={() => canvasRef.current?.redo()}
        canRedo={canRedo}
        onClearAll={() => canvasRef.current?.clearAll()}
        onDownload={() => canvasRef.current?.downloadPng()}
        onCopy={() => canvasRef.current?.copyToClipboard()}
        onImport={(e) => e.target.files && canvasRef.current?.importImage(e.target.files[0])}
      />
      
      <div className="w-full flex-grow min-h-0">
        <DrawingCanvas 
            ref={canvasRef}
            onDrawEnd={handleDrawEnd}
            initialImage={state.drawingDataUrl}
            tool={tool}
            color={color}
            thickness={thickness}
            opacity={opacity}
            shapeFill={shapeFill}
            textValue={textValue}
            textSize={textSize}
            fillTolerance={fillTolerance}
            showGrid={showGrid}
        />
      </div>

      <Button size="lg" onClick={handleManualDrawingSubmit} disabled={isSubmitting === 'drawing'} className="w-full max-w-md mt-2">
        {isSubmitting === 'drawing' ? <Loader2 className="animate-spin" /> : "إرسال الرسمة النهائية"}
      </Button>
    </div>
  );
}
```
,
    <file>src/components/game/draw-and