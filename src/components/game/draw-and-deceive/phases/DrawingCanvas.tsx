'use client';

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { Game, Player } from '@/types';

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
    if(backingRef.current.width > 0 && backingRef.current.height > 0) {
        dctx.drawImage(backingRef.current, 0, 0);
    }
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
    if (keepContent && old && old.width > 0 && old.height > 0) {
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
