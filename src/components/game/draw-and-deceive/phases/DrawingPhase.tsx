'use client';

import React, { useCallback, useState, useEffect, useRef, memo } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitCorrectAnswerAndStartDrawing, endArtistTurn, saveDrawingProgress } from '@/lib/actions/draw-and-deceive';
import { Loader2, Send, Timer, Pen, Eraser, Minus, Square, Circle, Triangle, Type, MousePointer, PaintBucket, Grid, Undo2, Redo, Trash2, Download, Copy, Upload } from 'lucide-react';
import { motion } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';


// ====================================================================================
// Type Definitions (Internal to this component)
// ====================================================================================

type Tool =
  | 'pen' | 'marker' | 'eraser'
  | 'line' | 'rect' | 'circle' | 'triangle' | 'ellipse'
  | 'text' | 'eyedropper' | 'pan' | 'fill';

export interface DrawingCanvasRef {
  undo: () => void;
  redo: () => void;
  clearAll: () => void;
  downloadPng: () => void;
  copyToClipboard: () => Promise<void>;
  importImage: (file: File) => void;
}

// ====================================================================================
// DrawingCanvas Component
// Manages the actual <canvas> elements and all drawing logic.
// ====================================================================================

const DrawingCanvas = React.forwardRef<DrawingCanvasRef, any>(({
  className,
  disabled = false,
  onDrawEnd,
  initialImage = null,
  maxHistory = 60,
  tool,
  color,
  thickness,
  opacity,
  shapeFill,
  textValue,
  textSize,
  fillTolerance,
  showGrid,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLCanvasElement>(null);
  const backingRef = useRef<HTMLCanvasElement | null>(null);

  const [size, setSize] = useState({ w: 800, h: 450 });
  const [dpr, setDpr] = useState<number>(1);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const historyIndexRef = useRef<number>(-1);

  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

  const getDisplayCtx = useCallback(() => displayRef.current!.getContext('2d')!, []);
  const getBackingCtx = useCallback(() => {
    if (!backingRef.current) {
      const c = document.createElement('canvas');
      c.width = Math.floor(size.w * dpr);
      c.height = Math.floor(size.h * dpr);
      backingRef.current = c;
    }
    return backingRef.current.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  }, [dpr, size.h, size.w]);

  const renderAll = useCallback(() => {
    if (!displayRef.current || !backingRef.current) return;
    const dctx = getDisplayCtx();
    dctx.clearRect(0, 0, displayRef.current.width, displayRef.current.height);
    dctx.drawImage(backingRef.current, 0, 0);
  }, [getDisplayCtx]);

  const setupCanvases = useCallback((keepContent = true) => {
    if (!displayRef.current) return;
    const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    setDpr(devicePixelRatio);
    const disp = displayRef.current;
    disp.width = Math.floor(size.w * devicePixelRatio);
    disp.height = Math.floor(size.h * devicePixelRatio);
    disp.style.width = `${size.w}px`;
    disp.style.height = `${size.h}px`;

    const old = backingRef.current;
    const newBacking = document.createElement('canvas');
    newBacking.width = disp.width;
    newBacking.height = disp.height;
    if (keepContent && old) {
      const nctx = newBacking.getContext('2d')!;
      nctx.drawImage(old, 0, 0, old.width, old.height, 0, 0, newBacking.width, newBacking.height);
    }
    backingRef.current = newBacking;
    renderAll();
  }, [size.w, size.h, renderAll]);
  
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setSize({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setupCanvases(true);
  }, [size.w, size.h, setupCanvases]);

  const pushHistory = useCallback((customUrl?: string) => {
    if (!backingRef.current) return;
    const dataUrl = customUrl ?? backingRef.current.toDataURL('image/png');
    setHistory(prev => {
      const idx = Math.min(Math.max(historyIndexRef.current, -1), prev.length - 1);
      const next = [...prev.slice(0, idx + 1), dataUrl].slice(-maxHistory);
      const newIndex = next.length - 1;
      historyIndexRef.current = newIndex;
      setHistoryIndex(newIndex);
      onDrawEnd?.(dataUrl, { canUndo: newIndex > 0, canRedo: false });
      return next;
    });
  }, [maxHistory, onDrawEnd]);
  
  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    const newIndex = historyIndexRef.current - 1;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
    const img = new Image();
    img.src = history[newIndex]!;
    img.onload = () => {
      const bctx = getBackingCtx();
      bctx.clearRect(0, 0, backingRef.current!.width, backingRef.current!.height);
      bctx.drawImage(img, 0, 0);
      renderAll();
      onDrawEnd?.(history[newIndex]!, { canUndo: newIndex > 0, canRedo: true });
    };
  }, [history, onDrawEnd, renderAll, getBackingCtx]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= history.length - 1) return;
    const newIndex = historyIndexRef.current + 1;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
    const img = new Image();
    img.src = history[newIndex]!;
    img.onload = () => {
      const bctx = getBackingCtx();
      bctx.clearRect(0, 0, backingRef.current!.width, backingRef.current!.height);
      bctx.drawImage(img, 0, 0);
      renderAll();
      onDrawEnd?.(history[newIndex]!, { canUndo: true, canRedo: newIndex < history.length - 1 });
    };
  }, [history, onDrawEnd, renderAll, getBackingCtx]);
  
  const clearAll = useCallback(() => {
    const bctx = getBackingCtx();
    bctx.clearRect(0, 0, backingRef.current!.width, backingRef.current!.height);
    setHistory([]);
    setHistoryIndex(-1);
    historyIndexRef.current = -1;
    pushHistory(backingRef.current!.toDataURL('image/png'));
    renderAll();
  }, [getBackingCtx, pushHistory, renderAll]);
  
  const downloadPng = useCallback(() => {
    if (!backingRef.current) return;
    const link = document.createElement('a');
    link.download = `drawing-${Date.now()}.png`;
    link.href = backingRef.current!.toDataURL('image/png');
    link.click();
  }, []);

  const copyToClipboard = useCallback(async () => {
    if (!backingRef.current) return;
    try {
      const blob = await new Promise<Blob | null>(res => backingRef.current!.toBlob(res, 'image/png'));
      if (blob && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      }
    } catch { }
  }, []);
  
  const importImage = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const bctx = getBackingCtx();
      bctx.clearRect(0, 0, backingRef.current!.width, backingRef.current!.height);
      bctx.drawImage(img, 0, 0);
      pushHistory();
      renderAll();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [getBackingCtx, pushHistory, renderAll]);

  React.useImperativeHandle(ref, () => ({
    undo, redo, clearAll, downloadPng, copyToClipboard, importImage
  }), [undo, redo, clearAll, downloadPng, copyToClipboard, importImage]);
  
  useEffect(() => {
    const bctx = getBackingCtx();
    bctx.clearRect(0, 0, backingRef.current!.width, backingRef.current!.height);
    if (!initialImage) {
      pushHistory(backingRef.current!.toDataURL('image/png'));
      renderAll();
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = initialImage;
    img.onload = () => {
      bctx.drawImage(img, 0, 0);
      pushHistory();
      renderAll();
    };
  }, [initialImage, getBackingCtx, pushHistory, renderAll]);

  // Drawing logic placeholder
  const handlePointerDown = (e: React.PointerEvent) => { /* Drawing logic here */ };
  const handlePointerMove = (e: React.PointerEvent) => { /* Drawing logic here */ };
  const handlePointerUp = () => { /* Drawing logic here */ };

  return (
    <div ref={containerRef} className={cn("w-full h-full relative touch-none bg-white", className)}>
      <canvas
        ref={displayRef}
        className="absolute inset-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
});
DrawingCanvas.displayName = 'DrawingCanvas';

// ====================================================================================
// Toolbar Component
// ====================================================================================
const ColorSwatch = ({ color, ...props }: { color: string } & React.ComponentProps<'button'>) => (
  <button {...props}>
    <div className="w-6 h-6 rounded-full border-2" style={{ backgroundColor: color }} />
  </button>
);

const BrushGroup = ({ tool, setTool }: { tool: Tool; setTool: (t: Tool) => void }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" size="icon"><Pen/></Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-2">
      <div className="flex gap-2">
        <Button variant={tool === 'pen' ? 'secondary' : 'ghost'} size="icon" onClick={() => setTool('pen')}><Pen/></Button>
        <Button variant={tool === 'marker' ? 'secondary' : 'ghost'} size="icon" onClick={() => setTool('marker')}><Pen/></Button>
        <Button variant={tool === 'eraser' ? 'secondary' : 'ghost'} size="icon" onClick={() => setTool('eraser')}><Eraser/></Button>
      </div>
    </PopoverContent>
  </Popover>
);

const ShapesGroup = ({ tool, setTool }: { tool: Tool; setTool: (t: Tool) => void }) => {
  const shapes: { tool: Tool; icon: React.ElementType }[] = [
    { tool: 'line', icon: Minus },
    { tool: 'rect', icon: Square },
    { tool: 'circle', icon: Circle },
    { tool: 'triangle', icon: Triangle },
    { tool: 'ellipse', icon: Circle }, // Using Circle as fallback for Oval
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon"><Square/></Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="flex gap-2">
          {shapes.map(({ tool: shapeTool, icon: Icon }) => (
            <Button key={shapeTool} variant={tool === shapeTool ? 'secondary' : 'ghost'} size="icon" onClick={() => setTool(shapeTool)}><Icon/></Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ColorGroup = ({ color, setColor }: { color: string; setColor: (c: string) => void }) => {
  const colors = ['#000000', '#ff0000', '#0000ff', '#008000', '#ffff00', '#ffa500'];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon"><ColorSwatch color={color}/></Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="flex gap-2">
          {colors.map(c => <ColorSwatch key={c} color={c} onClick={() => setColor(c)} />)}
          <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 p-1"/>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const Toolbar = memo(({
  tool, setTool, color, setColor, thickness, setThickness, opacity, setOpacity,
  canUndo, onUndo, canRedo, onRedo, onClearAll
}: any) => (
  <Card className="w-full">
    <CardContent className="p-2 flex flex-wrap items-center justify-center gap-2">
      <BrushGroup tool={tool} setTool={setTool} />
      <ShapesGroup tool={tool} setTool={setTool} />
      <ColorGroup color={color} setColor={setColor} />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">سمك: {thickness}</Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2">
          <Slider value={[thickness]} onValueChange={([v]) => setThickness(v)} max={50} step={1} />
        </PopoverContent>
      </Popover>

      <Button variant="outline" size="icon" onClick={onUndo} disabled={!canUndo}><Undo2/></Button>
      <Button variant="outline" size="icon" onClick={onRedo} disabled={!canRedo}><Redo/></Button>
      <Button variant="destructive" size="icon" onClick={onClearAll}><Trash2/></Button>
    </CardContent>
  </Card>
));
Toolbar.displayName = 'Toolbar';

// ====================================================================================
// DrawingPhase Component (The Orchestrator)
// ====================================================================================
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

export function DrawingPhase({ game, self }: { game: Game; self: Player }) {
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const [drawingDataUrl, setDrawingDataUrl] = useState<string | null>(state.drawingDataUrl ?? null);
  const [isSubmitting, setIsSubmitting] = useState<'answer' | 'drawing' | false>(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<DrawingCanvasRef>(null);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>('#1f2937');
  const [thickness, setThickness] = useState<number>(5);
  const [opacity, setOpacity] = useState<number>(1);
  const [shapeFill, setShapeFill] = useState<boolean>(false);
  const [textValue, setTextValue] = useState<string>('');
  const [textSize, setTextSize] = useState<number>(24);
  const [fillTolerance, setFillTolerance] = useState<number>(24);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  
  const [canUndo, setCanUndo] = useState(false);
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

  const handleDrawEnd = useCallback((dataUrl: string, historyState: { canUndo: boolean; canRedo: boolean }) => {
    setDrawingDataUrl(dataUrl);
    setCanUndo(historyState.canUndo);
    setCanRedo(historyState.canRedo);

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
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
      <div className="w-full flex-shrink-0">
         <Toolbar
            tool={tool} setTool={setTool}
            color={color} setColor={setColor}
            thickness={thickness} setThickness={setThickness}
            opacity={opacity} setOpacity={setOpacity}
            canUndo={canUndo} onUndo={() => canvasRef.current?.undo()}
            canRedo={canRedo} onRedo={() => canvasRef.current?.redo()}
            onClearAll={() => canvasRef.current?.clearAll()}
         />
      </div>

      <div className="flex-grow w-full relative">
        <DrawingCanvas 
            ref={canvasRef}
            className="w-full h-full rounded-lg border-2 border-muted"
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

      <div className="flex-shrink-0 w-full flex justify-between items-center p-2">
         <div className="flex items-center gap-2 text-lg font-mono">
            <Timer /> {timeLeft}s
        </div>
        <Button size="lg" onClick={handleManualDrawingSubmit} disabled={isSubmitting === 'drawing'}>
            {isSubmitting === 'drawing' ? <Loader2 className="animate-spin" /> : "إرسال الرسمة النهائية"}
        </Button>
      </div>
    </div>
  );
}
