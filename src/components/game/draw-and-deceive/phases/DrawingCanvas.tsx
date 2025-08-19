'use client';

import React, { useCallback, useState, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Pen, Eraser, Minus, Square, Circle, Undo2, Redo, Trash2 } from 'lucide-react';

// ====================================================================================
// Type Definitions
// ====================================================================================
export type Tool = 'pen' | 'eraser' | 'line' | 'rect' | 'circle';

interface Point {
  x: number;
  y: number;
}

export interface DrawingCanvasRef {
  undo: () => void;
  redo: () => void;
  clearAll: () => void;
  getDrawingDataUrl: () => string | undefined;
}

interface DrawingCanvasProps {
  className?: string;
  disabled?: boolean;
  onDrawEnd: (dataUrl: string, historyState: { canUndo: boolean; canRedo: boolean }) => void;
  initialImage?: string | null;
}

const TOOL_CONFIG: { tool: Tool, icon: React.ElementType }[] = [
  { tool: 'pen', icon: Pen },
  { tool: 'eraser', icon: Eraser },
  { tool: 'line', icon: Minus },
  { tool: 'rect', icon: Square },
  { tool: 'circle', icon: Circle },
];

const COLORS = ['#000000', '#EF4444', '#3B82F6', '#22C55E', '#FBBF24', '#A855F7', '#EC4899', '#FFFFFF'];


// ====================================================================================
// Drawing Canvas Component
// ====================================================================================
const DrawingCanvas = React.forwardRef<DrawingCanvasRef, DrawingCanvasProps>(({
  className,
  disabled = false,
  onDrawEnd,
  initialImage = null,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLCanvasElement>(null);
  const backingRef = useRef<HTMLCanvasElement | null>(null);

  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPointRef = useRef<Point | null>(null);
  const startPointRef = useRef<Point | null>(null);
  
  // Toolbar State
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>('#000000');
  const [thickness, setThickness] = useState<number>(5);

  // History State
  const [history, setHistory] = useState<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const getRelativePoint = (e: React.PointerEvent): Point | null => {
    const canvas = displayRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const getDisplayCtx = useCallback(() => displayRef.current?.getContext('2d'), []);
  const getBackingCtx = useCallback(() => backingRef.current?.getContext('2d'), []);
  
  const renderAll = useCallback(() => {
    const dctx = getDisplayCtx();
    const bcan = backingRef.current;
    if (!dctx || !bcan || !displayRef.current) return;
    dctx.clearRect(0, 0, displayRef.current.width, displayRef.current.height);
    if (bcan.width > 0 && bcan.height > 0) {
      dctx.drawImage(bcan, 0, 0);
    }
  }, [getDisplayCtx]);

  const pushHistory = useCallback(() => {
    const bcan = backingRef.current;
    if (!bcan) return;
    const dataUrl = bcan.toDataURL('image/png');
    const newHistory = history.slice(0, historyIndexRef.current + 1);
    newHistory.push(dataUrl);
    setHistory(newHistory);
    historyIndexRef.current = newHistory.length - 1;
    onDrawEnd?.(dataUrl, { canUndo: historyIndexRef.current > 0, canRedo: false });
  }, [history, onDrawEnd]);
  
    // Setup and resize handler
  useEffect(() => {
    const disp = displayRef.current;
    if (!disp) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        
        const oldContent = backingRef.current;

        disp.width = width * dpr;
        disp.height = height * dpr;
        const dctx = disp.getContext('2d');
        dctx?.scale(dpr, dpr);
        
        const newBacking = document.createElement('canvas');
        newBacking.width = disp.width;
        newBacking.height = disp.height;
        const newCtx = newBacking.getContext('2d');

        if (newCtx && oldContent && oldContent.width > 0 && oldContent.height > 0) {
          newCtx.drawImage(oldContent, 0, 0, width, height);
        }
        backingRef.current = newBacking;
        
        renderAll();
      }
    });
    ro.observe(disp);
    return () => ro.disconnect();
  }, [renderAll]);

  // Initial image loader
  useEffect(() => {
    const bctx = getBackingCtx();
    if (!bctx || !backingRef.current) return;

    if (initialImage) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = initialImage;
      img.onload = () => {
        if (!backingRef.current) return;
        bctx.clearRect(0, 0, backingRef.current.width, backingRef.current.height);
        bctx.drawImage(img, 0, 0, backingRef.current.width / (window.devicePixelRatio || 1), backingRef.current.height / (window.devicePixelRatio || 1));
        pushHistory();
        renderAll();
      };
    } else {
        bctx.clearRect(0, 0, backingRef.current.width, backingRef.current.height);
        pushHistory();
        renderAll();
    }
  }, [initialImage, getBackingCtx, pushHistory, renderAll]);
  
  const drawLine = (from: Point, to: Point, ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };
  
  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    const point = getRelativePoint(e);
    if (!point) return;
    lastPointRef.current = point;
    startPointRef.current = point;
  };
  
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || disabled) return;
    const point = getRelativePoint(e);
    if (!point || !lastPointRef.current) return;
    
    const dctx = getDisplayCtx();
    const bctx = getBackingCtx();
    if (!dctx || !bctx) return;

    const currentTool = tool;

    const applyStyle = (ctx: CanvasRenderingContext2D) => {
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = color;
        ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
    };
    
    applyStyle(dctx);
    applyStyle(bctx);

    if (currentTool === 'pen' || currentTool === 'eraser') {
      drawLine(lastPointRef.current, point, bctx);
      renderAll();
    } else {
      renderAll();
      if (startPointRef.current) {
        if (currentTool === 'line') {
            drawLine(startPointRef.current, point, dctx);
        } else if (currentTool === 'rect') {
            dctx.strokeRect(startPointRef.current.x, startPointRef.current.y, point.x - startPointRef.current.x, point.y - startPointRef.current.y);
        } else if (currentTool === 'circle') {
            dctx.beginPath();
            const radius = Math.hypot(point.x - startPointRef.current.x, point.y - startPointRef.current.y);
            dctx.arc(startPointRef.current.x, startPointRef.current.y, radius, 0, 2 * Math.PI);
            dctx.stroke();
        }
      }
    }
    
    lastPointRef.current = point;
  };
  
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDrawing(false);
    
    const bctx = getBackingCtx();
    const point = lastPointRef.current;
    const start = startPointRef.current;
    
    if (!bctx || !point || !start) return;

    if (tool !== 'pen' && tool !== 'eraser') {
        const applyStyle = (ctx: CanvasRenderingContext2D) => {
          ctx.lineWidth = thickness;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = color;
          ctx.globalCompositeOperation = 'source-over';
        };
        applyStyle(bctx);
        if (tool === 'line') {
            drawLine(start, point, bctx);
        } else if (tool === 'rect') {
            bctx.strokeRect(start.x, start.y, point.x - start.x, point.y - start.y);
        } else if (tool === 'circle') {
            bctx.beginPath();
            const radius = Math.hypot(point.x - start.x, point.y - start.y);
            bctx.arc(start.x, start.y, radius, 0, 2 * Math.PI);
            bctx.stroke();
        }
        renderAll();
    }
    
    lastPointRef.current = null;
    startPointRef.current = null;
    pushHistory();
  };

  React.useImperativeHandle(ref, () => ({
    undo: () => {
      if (historyIndexRef.current <= 0) return;
      const newIndex = historyIndexRef.current - 1;
      const img = new Image();
      img.src = history[newIndex]!;
      img.onload = () => {
        const bctx = getBackingCtx()!;
        if (!bctx.canvas) return;
        bctx.clearRect(0,0,bctx.canvas.width, bctx.canvas.height);
        bctx.drawImage(img,0,0);
        renderAll();
        historyIndexRef.current = newIndex;
        onDrawEnd?.(history[newIndex]!, { canUndo: newIndex > 0, canRedo: newIndex < history.length -1 });
      };
    },
    redo: () => {
      if (historyIndexRef.current >= history.length - 1) return;
      const newIndex = historyIndexRef.current + 1;
      const img = new Image();
      img.src = history[newIndex]!;
      img.onload = () => {
        const bctx = getBackingCtx()!;
        if (!bctx.canvas) return;
        bctx.clearRect(0,0,bctx.canvas.width, bctx.canvas.height);
        bctx.drawImage(img,0,0);
        renderAll();
        historyIndexRef.current = newIndex;
        onDrawEnd?.(history[newIndex]!, { canUndo: true, canRedo: newIndex < history.length - 1 });
      };
    },
    clearAll: () => {
      const bctx = getBackingCtx()!;
      if (!bctx.canvas) return;
      bctx.clearRect(0, 0, bctx.canvas.width, bctx.canvas.height);
      pushHistory();
      renderAll();
    },
    getDrawingDataUrl: () => backingRef.current?.toDataURL('image/png'),
  }));

  return (
    <div ref={containerRef} className={cn("w-full h-full flex flex-col gap-2", className)}>
      {/* Canvas Area */}
      <div className="flex-grow w-full rounded-lg overflow-hidden border bg-white relative">
        <canvas
          ref={displayRef}
          className="absolute inset-0 touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      {/* Toolbar Area */}
      <div className="flex-shrink-0 w-full p-2 rounded-lg border bg-background/80 backdrop-blur-sm">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {TOOL_CONFIG.map(({ tool: t, icon: Icon }) => (
              <Button key={t} variant={tool === t ? 'secondary' : 'outline'} size="icon" onClick={() => setTool(t)}>
                <Icon />
              </Button>
            ))}
            <div className="w-px h-8 bg-border" />
            <Button variant="outline" size="icon" onClick={() => ref.current?.undo()} disabled={historyIndexRef.current <= 0}><Undo2 /></Button>
            <Button variant="outline" size="icon" onClick={() => ref.current?.redo()} disabled={historyIndexRef.current >= history.length - 1}><Redo /></Button>
            <Button variant="destructive" size="icon" onClick={() => ref.current?.clearAll()}><Trash2 /></Button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 active:scale-95", color === c ? 'border-primary' : 'border-transparent')} style={{ backgroundColor: c }} />
            ))}
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-12 h-10 p-1" />
          </div>
          <div className="flex items-center gap-3 px-4">
            <Label>السماكة</Label>
            <Slider value={[thickness]} onValueChange={([v]) => setThickness(v)} max={50} step={1} />
          </div>
        </div>
      </div>
    </div>
  );
});
DrawingCanvas.displayName = 'DrawingCanvas';
export default DrawingCanvas;
