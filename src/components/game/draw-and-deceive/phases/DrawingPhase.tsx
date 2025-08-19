'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Eraser, Trash2, Pencil, Undo2 } from 'lucide-react';

type Props = {
  className?: string;
  disabled?: boolean;
  onDrawEnd?: (dataUrl: string) => void;
};

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number; erase?: boolean };

export function DrawingCanvas({ className, disabled = false, onDrawEnd }: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);

  const [color, setColor] = useState<string>('#111111');
  const [width, setWidth] = useState<number>(6);
  const [erase, setErase] = useState<boolean>(false);

  const dpr = typeof window !== 'undefined' ? Math.max(1, Math.min(3, window.devicePixelRatio || 1)) : 1;

  // ألوان وأحجام جاهزة
  const palette = useMemo(
    () => ['#111111', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#e11d48', '#22d3ee'],
    []
  );
  const widths = useMemo(() => [2, 4, 6, 10, 14, 20], []);

  // تهيئة الحجم + سياق الرسم
  useEffect(() => {
    if (!wrapperRef.current || !canvasRef.current) return;

    const resize = () => {
      const rect = wrapperRef.current!.getBoundingClientRect();
      const w = Math.max(10, Math.floor(rect.width));
      const h = Math.max(10, Math.floor(rect.height));
      setSize({ w, h });

      const canvas = canvasRef.current!;
      // خصائص العنصر (وليس CSS) للدقة العالية
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d')!;
      ctxRef.current = ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // خلفية بيضاء (مفيد عند التحويل إلى webp/png)
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // إعادة رسم الضربات الحالية بعد تغيير الحجم
      redrawAll();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrapperRef.current);
    resize();

    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpr]);

  const redrawAll = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    // املا الخلفية أبيض
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.restore();

    for (const s of strokes) {
      drawStroke(ctx, s);
    }
  }, [strokes, size.w, size.h]);

  const drawStroke = (ctx: CanvasRenderingContext2D, s: Stroke) => {
    if (s.points.length < 2) return;
    ctx.save();
    if (s.erase) {
      // eraser = رسم باللون الأبيض (مطابق للخلفية)
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = s.color;
    }
    ctx.lineWidth = s.width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(s.points[0]!.x, s.points[0]!.y);
    for (let i = 1; i < s.points.length; i++) {
      const p = s.points[i]!;
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  };

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const p = getPos(e);
    setIsDrawing(true);
    setRedoStack([]); // أي سحبة جديدة تلغي redo
    setStrokes((prev) => [...prev, { points: [p], color, width, erase }]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const p = getPos(e);
    setStrokes((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (!last) return next;
      last.points.push(p);
      // رسم incremental لتحسين الأداء
      const ctx = ctxRef.current;
      if (ctx && last.points.length >= 2) {
        // ارسم آخر مقطع فقط
        drawStroke(ctx, { ...last, points: last.points.slice(-2) });
      }
      return next;
    });
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    // إعادة رسم نظيفة + إصدار dataURL
    requestAnimationFrame(() => {
      redrawAll();
      if (onDrawEnd && canvasRef.current) {
        try {
          onDrawEnd(canvasRef.current.toDataURL('image/png'));
        } catch {
          // تجاهل
        }
      }
    });
  };

  const clearCanvas = () => {
    setStrokes([]);
    setRedoStack([]);
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.restore();
    onDrawEnd?.(canvasRef.current?.toDataURL('image/png') || '');
  };

  const undo = () => {
    if (!strokes.length) return;
    const last = strokes[strokes.length - 1]!;
    setStrokes((prev) => prev.slice(0, -1));
    setRedoStack((r) => [last, ...r]);
    requestAnimationFrame(() => {
      redrawAll();
      onDrawEnd?.(canvasRef.current?.toDataURL('image/png') || '');
    });
  };

  const redo = () => {
    if (!redoStack.length) return;
    const [first, ...rest] = redoStack;
    setStrokes((prev) => [...prev, first]);
    setRedoStack(rest);
    requestAnimationFrame(() => {
      redrawAll();
      onDrawEnd?.(canvasRef.current?.toDataURL('image/png') || '');
    });
  };

  return (
    <div className={cn('flex h-full w-full flex-col', className)}>
      {/* شريط الأدوات */}
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <div className="inline-flex items-center gap-1">
          <Pencil className="w-4 h-4" />
          <div className="flex gap-1">
            {palette.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c);
                  setErase(false);
                }}
                className={cn(
                  'h-6 w-6 rounded-full border',
                  c === color && !erase ? 'ring-2 ring-offset-1' : ''
                )}
                style={{ background: c }}
                aria-label={`لون ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="inline-flex items-center gap-1">
          <span className="text-xs text-muted-foreground">الحجم</span>
          <div className="flex gap-1">
            {widths.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWidth(w)}
                className={cn(
                  'h-6 min-w-6 px-2 rounded border text-xs',
                  width === w ? 'bg-primary text-primary-foreground' : 'bg-background'
                )}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setErase((e) => !e)}
            className={cn(
              'inline-flex items-center gap-1 rounded border px-2 py-1 text-sm',
              erase ? 'bg-destructive text-destructive-foreground' : 'bg-background'
            )}
            aria-pressed={erase}
          >
            <Eraser className="w-4 h-4" />
            ممحاة
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={!strokes.length}
            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm disabled:opacity-50"
          >
            <Undo2 className="w-4 h-4 -scale-x-100" /> تراجع
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!redoStack.length}
            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm disabled:opacity-50"
          >
            <Undo2 className="w-4 h-4" /> إعادة
          </button>
          <button
            type="button"
            onClick={clearCanvas}
            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm"
          >
            <Trash2 className="w-4 h-4" /> مسح
          </button>
        </div>
      </div>

      {/* مساحة الرسم */}
      <div ref={wrapperRef} className="relative w-full flex-1 min-h-[300px] rounded-lg border bg-white shadow">
        <canvas
          ref={canvasRef}
          className={cn('absolute inset-0 touch-none', disabled && 'pointer-events-none opacity-70')}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
    </div>
  );
}

export default DrawingCanvas;
