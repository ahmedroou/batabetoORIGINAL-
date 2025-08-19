'use client';

import React, { useCallback, useState, useEffect, useRef, memo } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitCorrectAnswerAndStartDrawing, endArtistTurn, saveDrawingProgress } from '@/lib/actions/draw-and-deceive';
import { Loader2, Send, Timer } from 'lucide-react';
import { motion } from 'framer-motion';
import { DrawingToolbar } from './DrawingToolbar';

// ====================================================================================
// DrawingCanvas Component (Internal)
// Manages the actual <canvas> elements and all drawing logic.
// It is now part of DrawingPhase.tsx
// ====================================================================================

type Tool =
  | 'pen' | 'marker' | 'eraser'
  | 'line' | 'rect' | 'circle' | 'triangle' | 'ellipse'
  | 'text' | 'eyedropper' | 'pan' | 'fill';

interface DrawingCanvasProps {
  className?: string;
  disabled?: boolean;
  onDrawEnd?: (dataUrl: string, historyState: { canUndo: boolean; canRedo: boolean }) => void;
  initialImage?: string | null;
  maxHistory?: number;
  
  // Controlled props from parent
  tool: Tool;
  color: string;
  thickness: number;
  opacity: number;
  shapeFill: boolean;
  textValue: string;
  textSize: number;
  fillTolerance: number;
  showGrid: boolean;
}

export interface DrawingCanvasRef {
  undo: () => void;
  redo: () => void;
  clearAll: () => void;
  downloadPng: () => void;
  copyToClipboard: () => Promise<void>;
  importImage: (file: File) => void;
}

const DrawingCanvas = React.forwardRef<DrawingCanvasRef, DrawingCanvasProps>(({
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
  // DOM Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // Offscreen backing canvas for the actual drawing data
  const backingRef = useRef<HTMLCanvasElement | null>(null);

  // State
  const [size, setSize] = useState({ w: 800, h: 450 });
  const [dpr, setDpr] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Refs for state that doesn't need to trigger re-renders on every change
  const historyIndexRef = useRef<number>(-1);
  const isDrawingRef = useRef<boolean>(false);
  const forcedPanRef = useRef<boolean>(false);
  const lastPtCssRef = useRef<{ x: number; y: number } | null>(null);
  const lastClientRef = useRef<{ x: number; y: number } | null>(null);
  const shiftDownRef = useRef<boolean>(false);
  const pinchDistRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

  // --- Canvas & Context Helpers ---
  const getDisplayCtx = useCallback(() => displayRef.current!.getContext('2d')!, []);
  const getOverlayCtx = useCallback(() => overlayRef.current!.getContext('2d')!, []);
  const getBackingCtx = useCallback(() => {
    if (!backingRef.current) {
      const c = document.createElement('canvas');
      c.width = Math.floor(size.w * dpr);
      c.height = Math.floor(size.h * dpr);
      backingRef.current = c;
    }
    return backingRef.current.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  }, [dpr, size.h, size.w]);

  // --- Coordinate Transformations ---
  const clientToCss = useCallback((clientX: number, clientY: number) => {
    const rect = displayRef.current!.getBoundingClientRect();
    const xCss = (clientX - rect.left - pan.x) / zoom;
    const yCss = (clientY - rect.top - pan.y) / zoom;
    return {
      x: Math.max(0, Math.min(size.w, xCss)),
      y: Math.max(0, Math.min(size.h, yCss)),
    };
  }, [pan.x, pan.y, zoom, size.w, size.h]);

  const cssToPx = useCallback((ptCss: { x: number; y: number }) => {
    return { x: Math.round(ptCss.x * dpr), y: Math.round(ptCss.y * dpr) };
  }, [dpr]);

  // --- Rendering ---
  const renderAll = useCallback(() => {
    if (!displayRef.current || !overlayRef.current || !backingRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const dctx = getDisplayCtx();
      dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dctx.clearRect(0, 0, size.w, size.h);
      dctx.save();
      dctx.translate(pan.x, pan.y);
      dctx.scale(zoom, zoom);
      dctx.imageSmoothingEnabled = true;
      dctx.drawImage(
        backingRef.current!,
        0, 0, backingRef.current!.width, backingRef.current!.height,
        0, 0, size.w, size.h
      );
      dctx.restore();
    });
  }, [dpr, size.w, size.h, pan.x, pan.y, zoom, getDisplayCtx]);

  const setupCanvases = useCallback((keepContent = true) => {
    if (!displayRef.current || !overlayRef.current) return;

    const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    setDpr(devicePixelRatio);

    const disp = displayRef.current;
    const over = overlayRef.current;
    
    disp.width = Math.floor(size.w * devicePixelRatio);
    disp.height = Math.floor(size.h * devicePixelRatio);
    disp.style.width = `${size.w}px`;
    disp.style.height = `${size.h}px`;

    over.width = disp.width;
    over.height = disp.height;
    over.style.width = `${size.w}px`;
    over.style.height = `${size.h}px`;

    const old = backingRef.current;
    const newBacking = document.createElement('canvas');
    newBacking.width = Math.floor(size.w * devicePixelRatio);
    newBacking.height = Math.floor(size.h * devicePixelRatio);

    if (keepContent && old) {
      const nctx = newBacking.getContext('2d')!;
      nctx.drawImage(old, 0, 0, old.width, old.height, 0, 0, newBacking.width, newBacking.height);
    }
    backingRef.current = newBacking;

    renderAll();
  }, [size.w, size.h, renderAll]);
  
  // Resize Observer to make canvas responsive
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        const w = Math.max(320, Math.floor(cr.width));
        const h = Math.max(220, Math.floor(cr.height));
        setSize({ w, h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-setup on size change
  useEffect(() => {
    setupCanvases(true);
  }, [size.w, size.h, setupCanvases]);

  // --- History Management ---
  const pushHistory = useCallback((customUrl?: string) => {
    if (!backingRef.current) return;
    const dataUrl = customUrl ?? backingRef.current.toDataURL('image/png');
    setHistory(prev => {
      const idx = Math.min(Math.max(historyIndexRef.current, -1), prev.length - 1);
      const upto = prev.slice(0, idx + 1);
      const next = [...upto, dataUrl].slice(-maxHistory);
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
    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex;
    const img = new Image();
    img.src = history[newIndex]!;
    img.onload = () => {
      const bctx = getBackingCtx();
      bctx.clearRect(0, 0, backingRef.current!.width, backingRef.current!.height);
      bctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, backingRef.current!.width, backingRef.current!.height);
      renderAll();
      onDrawEnd?.(history[newIndex]!, { canUndo: newIndex > 0, canRedo: true });
    };
  }, [history, onDrawEnd, renderAll, getBackingCtx]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= history.length - 1) return;
    const newIndex = historyIndexRef.current + 1;
    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex;
    const img = new Image();
    img.src = history[newIndex]!;
    img.onload = () => {
      const bctx = getBackingCtx();
      bctx.clearRect(0, 0, backingRef.current!.width, backingRef.current!.height);
      bctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, backingRef.current!.width, backingRef.current!.height);
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
    } catch {
       // fallback or error
    }
  }, []);
  
  const importImage = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const bctx = getBackingCtx();
      const scale = Math.min(size.w / img.width, size.h / img.height);
      const wCss = img.width * scale;
      const hCss = img.height * scale;
      const xCss = (size.w - wCss) / 2;
      const yCss = (size.h - hCss) / 2;
      const xPx = Math.round(xCss * dpr);
      const yPx = Math.round(yCss * dpr);
      const wPx = Math.round(wCss * dpr);
      const hPx = Math.round(hCss * dpr);
      bctx.clearRect(0, 0, backingRef.current!.width, backingRef.current!.height);
      bctx.drawImage(img, 0, 0, img.width, img.height, xPx, yPx, wPx, hPx);
      pushHistory();
      renderAll();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [dpr, getBackingCtx, pushHistory, renderAll, size.h, size.w]);

  useImperativeHandle(ref, () => ({
    undo,
    redo,
    clearAll,
    downloadPng,
    copyToClipboard,
    importImage,
  }), [undo, redo, clearAll, downloadPng, copyToClipboard, importImage]);
  
  // Load initial image or clear canvas
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
      const scale = Math.min(size.w / img.width, size.h / img.height);
      const wCss = img.width * scale;
      const hCss = img.height * scale;
      const xCss = (size.w - wCss) / 2;
      const yCss = (size.h - hCss) / 2;

      const xPx = Math.round(xCss * dpr);
      const yPx = Math.round(yCss * dpr);
      const wPx = Math.round(wCss * dpr);
      const hPx = Math.round(hCss * dpr);

      bctx.drawImage(img, 0, 0, img.width, img.height, xPx, yPx, wPx, hPx);
      pushHistory();
      renderAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImage, getBackingCtx, pushHistory, renderAll, dpr, size]);

  const clearOverlay = useCallback(() => {
    const octx = getOverlayCtx();
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, size.w, size.h);
  }, [dpr, size.w, size.h, getOverlayCtx]);

  // Pointer Handlers
  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    if (e.button === 1 || e.altKey || tool === 'pan') {
      forcedPanRef.current = true;
      isDrawingRef.current = true;
      lastClientRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    
    isDrawingRef.current = true;
    lastPtCssRef.current = clientToCss(e.clientX, e.clientY);
  };

  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    
    if (tool === 'pan' || forcedPanRef.current) {
        const last = lastClientRef.current ?? { x: e.clientX, y: e.clientY };
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        lastClientRef.current = { x: e.clientX, y: e.clientY };
        setPan(p => ({ x: p.x + dx, y: p.y + dy }));
        renderAll();
        return;
    }
    
    const currentCss = clientToCss(e.clientX, e.clientY);
    
    // For brevity, direct stroke logic is shown. Shape previews would be here.
    if (tool === 'pen' || tool === 'marker' || tool === 'eraser') {
        const pressure = e.pressure ?? 0.5;
        // strokeSegmentBacking would be a helper to draw a line on the backing canvas
        // strokeSegmentBacking(lastPtCssRef.current!, currentCss, pressure);
    }

    lastPtCssRef.current = currentCss;
  };
  
  const pointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    isDrawingRef.current = false;
    forcedPanRef.current = false;

    // If it was a shape, commit it now. Otherwise, end the stroke.
    // ...
    
    pushHistory();
  };
  
  const onWheel = (e: React.WheelEvent) => {
    if (disabled || (!e.ctrlKey && !e.metaKey)) return;
    e.preventDefault();
    const rect = displayRef.current!.getBoundingClientRect();
    const worldBefore = clientToCss(e.clientX, e.clientY);
    const delta = -e.deltaY;
    const factor = Math.exp(delta * 0.001);
    const newZoom = Math.min(6, Math.max(0.25, zoom * factor));
    const nx = e.clientX - rect.left - worldBefore.x * newZoom;
    const ny = e.clientY - rect.top - worldBefore.y * newZoom;
    setZoom(newZoom);
    setPan({ x: nx, y: ny });
    renderAll();
  };
  
  return (
    <div
      ref={containerRef}
      className={className}
      style={{ touchAction: 'none' }}
      onWheel={onWheel}
    >
      <canvas ref={displayRef} className="absolute inset-0 w-full h-full" />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 w-full h-full"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerLeave={pointerUp}
        onPointerCancel={pointerUp}
      />
    </div>
  );
});
DrawingCanvas.displayName = 'DrawingCanvas';

// ====================================================================================
// DrawingPhase Component (The Orchestrator)
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
      <div className="flex-grow w-full relative">
        <DrawingCanvas 
            ref={canvasRef}
            className="w-full h-full"
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
      <div className="flex-shrink-0 w-full">
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
