'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Line as KonvaLine, Rect as KonvaRect, Circle as KonvaCircle } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Pencil, Highlighter, Eraser, Undo2, Redo2, Trash2, ZoomIn, ZoomOut, Download, Image as ImageIcon,
  Grid, Type as TypeIcon, Droplet, Square, Circle as CircleIcon, Minus, PaintBucket, Hand
} from 'lucide-react';

interface DrawingCanvasProps {
  width: number;
  height: number;
  onDrawEnd?: (dataUrl: string) => void;
  disabled?: boolean;
}

type Tool =
  | 'pen'
  | 'marker'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'circle'
  | 'text'
  | 'eyedropper'
  | 'fill'
  | 'pan';

const PALETTE = ['#000000', '#FFFFFF', '#EF4444', '#3B82F6', '#22C55E', '#F97316', '#A78BFA', '#F59E0B'];
const MIN_BRUSH = 1;
const MAX_BRUSH = 60;
const MAX_HISTORY = 80;
const EXPORT_PIXEL_RATIO = 2;

type Preview =
  | { kind: 'none' }
  | { kind: 'line' | 'rect' | 'circle'; start: { x: number; y: number }; end: { x: number; y: number } };

export function DrawingCanvas({ width, height, onDrawEnd, disabled = false }: DrawingCanvasProps) {
  // Konva
  const stageRef = useRef<KonvaStage | null>(null);
  const rasterLayerRef = useRef<any>(null); // Layer الذي يحمل KonvaImage (backing)

  // Backing raster canvas (HiDPI)
  const backingRef = useRef<HTMLCanvasElement | null>(null);
  const [dpr, setDpr] = useState<number>(1);

  // State
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>('#1f2937'); // slate-800
  const [opacity, setOpacity] = useState<number>(1);
  const [brushSize, setBrushSize] = useState<number>(5);
  const [textValue, setTextValue] = useState<string>('');
  const [textSize, setTextSize] = useState<number>(24);
  const [fillTolerance, setFillTolerance] = useState<number>(24);
  const [showGrid, setShowGrid] = useState<boolean>(false);

  // Camera
  const [scale, setScale] = useState<number>(1);
  const [stagePos, setStagePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isSpacePanning = useRef<boolean>(false);

  // Pointer
  const isDrawingRef = useRef<boolean>(false);
  const lastCssRef = useRef<{ x: number; y: number } | null>(null);

  // Preview shape
  const [preview, setPreview] = useState<Preview>({ kind: 'none' });

  // Background image (optional)
  const [bgImageElm, setBgImageElm] = useState<HTMLImageElement | null>(null);

  // History (snapshots of backing canvas)
  const [history, setHistory] = useState<string[]>([]);
  const [historyStep, setHistoryStep] = useState<number>(-1);
  const historyStepRef = useRef<number>(-1);
  useEffect(() => { historyStepRef.current = historyStep; }, [historyStep]);

  // Grid background via CSS
  const gridBg = useMemo(() => {
    if (!showGrid) return undefined;
    const s = 32;
    return `repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 1px, transparent 1px, transparent ${s}px),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 1px, transparent 1px, transparent ${s}px)`;
  }, [showGrid]);

  // Init backing canvas
  const ensureBacking = useCallback(() => {
    const devicePixelRatio = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    setDpr(devicePixelRatio);
    const cvs = backingRef.current || document.createElement('canvas');
    cvs.width = Math.floor(width * devicePixelRatio);
    cvs.height = Math.floor(height * devicePixelRatio);
    backingRef.current = cvs;
    const ctx = cvs.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    // إذا لم يكن لدينا لقطة مبدئية، املأ بالخلفية الشفافة (لا حاجة لملء)
    forceRasterLayerDraw();
  }, [width, height]);

  useEffect(() => {
    ensureBacking();
    const onResize = () => ensureBacking();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ensureBacking]);

  // Map helpers
  const screenToCss = useCallback((p: { x: number; y: number }) => {
    // stage pointer → content CSS coords
    return {
      x: (p.x - stagePos.x) / scale,
      y: (p.y - stagePos.y) / scale,
    };
  }, [scale, stagePos.x, stagePos.y]);

  const cssToPx = useCallback((p: { x: number; y: number }) => {
    return { x: Math.round(p.x * dpr), y: Math.round(p.y * dpr) };
  }, [dpr]);

  // Notify parent (throttled by RAF)
  const rafRef = useRef<number | null>(null);
  const notifyParent = useCallback(() => {
    if (!onDrawEnd || !backingRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      onDrawEnd(backingRef.current!.toDataURL('image/png'));
    });
  }, [onDrawEnd]);

  // History
  const pushHistory = useCallback((custom?: string) => {
    const dataUrl = custom ?? backingRef.current!.toDataURL('image/png');
    setHistory(prev => {
      const upto = prev.slice(0, historyStepRef.current + 1);
      const next = [...upto, dataUrl];
      const trimmed = next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
      return trimmed;
    });
    setHistoryStep(s => {
      const tentative = Math.min(historyStepRef.current + 1, MAX_HISTORY - 1);
      return tentative;
    });
    notifyParent();
  }, [notifyParent]);

  const undo = () => {
    if (historyStepRef.current <= 0) return;
    const newStep = historyStepRef.current - 1;
    setHistoryStep(newStep);
    loadHistoryToBacking(history[newStep]!);
  };

  const redo = () => {
    if (historyStepRef.current >= history.length - 1) return;
    const newStep = historyStepRef.current + 1;
    setHistoryStep(newStep);
    loadHistoryToBacking(history[newStep]!);
  };

  const loadHistoryToBacking = (dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      const ctx = backingRef.current!.getContext('2d')!;
      ctx.clearRect(0, 0, backingRef.current!.width, backingRef.current!.height);
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, backingRef.current!.width, backingRef.current!.height);
      forceRasterLayerDraw();
      notifyParent();
    };
    img.src = dataUrl;
  };

  // Drawing helpers (backing)
  const setStrokeStyle = (ctx: CanvasRenderingContext2D, pressure = 0.5) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = tool === 'marker' ? Math.min(1, opacity * 0.5) : opacity;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    const base = brushSize;
    const dynCss = Math.max(1, base * (0.3 + (pressure || 0.5) * 0.7));
    ctx.lineWidth = dynCss * dpr; // ثابت بصريًا مع الزوم
    ctx.strokeStyle = tool === 'eraser' ? '#000' : color;
  };

  const strokeSegment = (fromCss: { x: number; y: number }, toCss: { x: number; y: number }, pressure = 0.5) => {
    const ctx = backingRef.current!.getContext('2d')!;
    const f = cssToPx(fromCss);
    const t = cssToPx(toCss);
    ctx.save();
    setStrokeStyle(ctx, pressure);
    ctx.beginPath();
    ctx.moveTo(f.x + 0.5, f.y + 0.5);
    ctx.lineTo(t.x + 0.5, t.y + 0.5);
    ctx.stroke();
    ctx.restore();
    forceRasterLayerDraw();
  };

  const commitShape = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const ctx = backingRef.current!.getContext('2d')!;
    const s = cssToPx(start);
    const e = cssToPx(end);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.lineWidth = Math.max(1, brushSize * dpr);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.setLineDash([]);

    if (tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
    } else if (tool === 'rect') {
      ctx.strokeRect(s.x, s.y, e.x - s.x, e.y - s.y);
    } else if (tool === 'circle') {
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    setPreview({ kind: 'none' });
    forceRasterLayerDraw();
  };

  // Eyedropper
  const pickColorAt = (css: { x: number; y: number }) => {
    const { x, y } = cssToPx(css);
    const ctx = backingRef.current!.getContext('2d')!;
    const { data } = ctx.getImageData(x, y, 1, 1);
    const [r, g, b, a] = data;
    if (a > 0) setColor(`#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`);
  };

  // Flood Fill
  const hexToRgba = (hex: string, alpha: number) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const a = Math.round(alpha * 255);
    return { r, g, b, a };
  };

  const floodFill = (startPx: { x: number; y: number }, rgba: { r: number; g: number; b: number; a: number }, tolerance: number) => {
    const ctx = backingRef.current!.getContext('2d', { willReadFrequently: true })!;
    const { width: W, height: H } = backingRef.current!;
    const img = ctx.getImageData(0, 0, W, H);
    const data = img.data;

    const idx = (startPx.y * W + startPx.x) * 4;
    const target = { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };

    const withinTol = (r: number, g: number, b: number, a: number) => {
      const dr = Math.abs(r - target.r);
      const dg = Math.abs(g - target.g);
      const db = Math.abs(b - target.b);
      const da = Math.abs(a - target.a);
      // مقياس بسيط (يمكن تحسينه لاحقًا إلى ΔE)
      return (dr + dg + db + da / 2) <= tolerance * 4;
    };

    // لا داعي إن كان نفس اللون تقريبًا
    if (withinTol(rgba.r, rgba.g, rgba.b, rgba.a)) return;

    const q: Array<{ x: number; y: number }> = [];
    const seen = new Uint8Array(W * H);

    const push = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = y * W + x;
      if (seen[i]) return;
      const off = i * 4;
      if (!withinTol(data[off], data[off + 1], data[off + 2], data[off + 3])) return;
      seen[i] = 1;
      q.push({ x, y });
    };

    push(startPx.x, startPx.y);

    while (q.length) {
      const { x, y } = q.pop()!;
      const i = (y * W + x) * 4;
      data[i] = rgba.r;
      data[i + 1] = rgba.g;
      data[i + 2] = rgba.b;
      data[i + 3] = rgba.a;

      // 4-neighbors
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }

    ctx.putImageData(img, 0, 0);
    forceRasterLayerDraw();
  };

  // Import image (contain)
  const importImage = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setBgImageElm(img); // للإشارة فقط، الرسم يتم على backing
      const ctx = backingRef.current!.getContext('2d')!;
      // contain داخل (width,height) بالـ CSS ثم تحويل لـ px
      const scale = Math.min(width / img.width, height / img.height);
      const wCss = img.width * scale;
      const hCss = img.height * scale;
      const xCss = (width - wCss) / 2;
      const yCss = (height - hCss) / 2;
      const xPx = Math.round(xCss * dpr);
      const yPx = Math.round(yCss * dpr);
      const wPx = Math.round(wCss * dpr);
      const hPx = Math.round(hCss * dpr);

      ctx.clearRect(0, 0, backingRef.current!.width, backingRef.current!.height);
      ctx.drawImage(img, 0, 0, img.width, img.height, xPx, yPx, wPx, hPx);
      pushHistory();
      forceRasterLayerDraw();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // Export
  const exportPNG = () => {
    if (!backingRef.current) return;
    // لزيادة الحدة، نرسم على كانفس أكبر ثم ننزّل
    const src = backingRef.current;
    const out = document.createElement('canvas');
    out.width = src.width * EXPORT_PIXEL_RATIO / dpr;
    out.height = src.height * EXPORT_PIXEL_RATIO / dpr;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, out.width, out.height);
    const dataUrl = out.toDataURL('image/png', 0.95);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `drawing-${Date.now()}.png`;
    a.click();
  };

  // Clear
  const clearAll = () => {
    const ctx = backingRef.current!.getContext('2d')!;
    ctx.clearRect(0, 0, backingRef.current!.width, backingRef.current!.height);
    setHistory([]);
    setHistoryStep(-1);
    historyStepRef.current = -1;
    forceRasterLayerDraw();
    onDrawEnd?.(backingRef.current!.toDataURL('image/png'));
  };

  // Stage wheel zoom (Ctrl/⌘)
  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    if (disabled) return;
    if (!(e.evt.ctrlKey || e.evt.metaKey)) return;
    e.evt.preventDefault();
    const direction = e.evt.deltaY > 0 ? 1 / 1.2 : 1.2;
    const pointer = stageRef.current?.getPointerPosition() ?? { x: width / 2, y: height / 2 };
    zoomBy(direction, pointer);
  };

  const zoomBy = (factor: number, pivot: { x: number; y: number }) => {
    setScale(prev => {
      const next = Math.max(0.25, Math.min(6, prev * factor));
      const mousePointTo = {
        x: (pivot.x - stagePos.x) / prev,
        y: (pivot.y - stagePos.y) / prev,
      };
      const newPos = {
        x: pivot.x - mousePointTo.x * next,
        y: pivot.y - mousePointTo.y * next,
      };
      setStagePos(newPos);
      return next;
    });
  };

  // Keys: space pan + undo/redo
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') isSpacePanning.current = true;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault(); redo();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') isSpacePanning.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [history.length]);

  // Pointer handlers
  const onPointerDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (disabled) return;
    const st = e.target.getStage();
    if (!st) return;

    // Pan
    if (tool === 'pan' || isSpacePanning.current) {
      isDrawingRef.current = false;
      return;
    }

    const pos = st.getPointerPosition();
    if (!pos) return;
    const css = screenToCss(pos);
    lastCssRef.current = css;

    if (tool === 'text') {
      if (!textValue.trim()) return;
      const ctx = backingRef.current!.getContext('2d')!;
      const px = cssToPx(css);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.round(textSize * dpr)}px ui-sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(textValue, px.x, px.y);
      ctx.restore();
      pushHistory();
      forceRasterLayerDraw();
      return;
    }

    if (tool === 'eyedropper') {
      pickColorAt(css);
      setTool('pen');
      return;
    }

    if (tool === 'fill') {
      const px = cssToPx(css);
      const rgba = hexToRgba(color, opacity);
      floodFill(px, rgba, fillTolerance);
      pushHistory();
      return;
    }

    isDrawingRef.current = true;

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      setPreview({ kind: tool, start: css, end: css });
    }
  };

  const onPointerMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (disabled) return;

    // Pan/drag
    if (tool === 'pan' || isSpacePanning.current) return;

    if (!isDrawingRef.current) return;
    const st = e.target.getStage();
    const pos = st?.getPointerPosition();
    if (!pos || !lastCssRef.current) return;

    const css = screenToCss(pos);

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      setPreview(prev => (prev.kind === 'none' ? prev : { ...prev, end: css } as Preview));
      return;
    }

    const pressure = (e.evt as any)?.pressure ?? 0.5;
    strokeSegment(lastCssRef.current, css, pressure);
    lastCssRef.current = css;
  };

  const onPointerUp = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (disabled) return;
    if (!lastCssRef.current) return;

    const st = e.target.getStage();
    const pos = st?.getPointerPosition();
    const css = pos ? screenToCss(pos) : lastCssRef.current;

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      if (preview.kind !== 'none') {
        commitShape(preview.start, css);
        pushHistory();
      }
      setPreview({ kind: 'none' });
    } else if (isDrawingRef.current) {
      pushHistory();
    }

    isDrawingRef.current = false;
    lastCssRef.current = null;
  };

  // Force Konva to redraw raster layer (since image is a Canvas element mutated in-place)
  const forceRasterLayerDraw = () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    rasterLayerRef.current?.batchDraw?.();
  };

  // Cursor
  const cursor = (tool === 'pan' || isSpacePanning.current) ? 'grab' : 'crosshair';

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {/* لوحة الرسم */}
      <div
        className={cn('relative w-full rounded-lg overflow-hidden border bg-slate-800 border-2 border-primary')}
        style={{ backgroundImage: gridBg }}
      >
        <Stage
          ref={stageRef}
          width={width}
          height={height}
          scaleX={scale}
          scaleY={scale}
          x={stagePos.x}
          y={stagePos.y}
          draggable={tool === 'pan' || isSpacePanning.current}
          onDragMove={(e) => {
            if (!(tool === 'pan' || isSpacePanning.current)) return;
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }}
          onWheel={onWheel}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
          style={{ touchAction: 'none', cursor }}
        >
          {/* طبقة الراستر (backing) */}
          <Layer ref={rasterLayerRef} listening={false}>
            <KonvaImage
              image={backingRef.current || undefined}
              x={0}
              y={0}
              width={width}
              height={height}
            />
          </Layer>

          {/* طبقة معاينة الأشكال */}
          <Layer listening={false}>
            {preview.kind === 'line' && (
              <KonvaLine
                points={[preview.start.x, preview.start.y, preview.end.x, preview.end.y]}
                stroke={color}
                strokeWidth={brushSize}
                dash={[6, 6]}
                lineCap="round"
                lineJoin="round"
                opacity={0.9}
              />
            )}
            {preview.kind === 'rect' && (
              <KonvaRect
                x={Math.min(preview.start.x, preview.end.x)}
                y={Math.min(preview.start.y, preview.end.y)}
                width={Math.abs(preview.end.x - preview.start.x)}
                height={Math.abs(preview.end.y - preview.start.y)}
                stroke={color}
                strokeWidth={brushSize}
                dash={[6, 6]}
                opacity={0.9}
              />
            )}
            {preview.kind === 'circle' && (() => {
              const dx = preview.end.x - preview.start.x;
              const dy = preview.end.y - preview.start.y;
              const r = Math.sqrt(dx * dx + dy * dy);
              return (
                <KonvaCircle
                  x={preview.start.x}
                  y={preview.start.y}
                  radius={r}
                  stroke={color}
                  strokeWidth={brushSize}
                  dash={[6, 6]}
                  opacity={0.9}
                />
              );
            })()}
          </Layer>
        </Stage>
      </div>

      {/* شريط الأدوات */}
      <div className="w-full flex flex-col lg:flex-row gap-2 justify-between p-2 rounded-lg bg-slate-900 border border-slate-700">
        {/* أدوات الرسم */}
        <div className="flex flex-wrap items-center gap-1">
          <Button size="icon" variant={tool === 'pen' ? 'default' : 'secondary'} onClick={() => setTool('pen')} title="قلم">
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'marker' ? 'default' : 'secondary'} onClick={() => setTool('marker')} title="ماركر">
            <Highlighter className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'eraser' ? 'default' : 'secondary'} onClick={() => setTool('eraser')} title="ممحاة">
            <Eraser className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'fill' ? 'default' : 'secondary'} onClick={() => setTool('fill')} title="تعبئة (دلو)">
            <PaintBucket className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'line' ? 'default' : 'secondary'} onClick={() => setTool('line')} title="خط">
            <Minus className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'rect' ? 'default' : 'secondary'} onClick={() => setTool('rect')} title="مستطيل">
            <Square className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'circle' ? 'default' : 'secondary'} onClick={() => setTool('circle')} title="دائرة">
            <CircleIcon className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'text' ? 'default' : 'secondary'} onClick={() => setTool('text')} title="نص">
            <TypeIcon className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'eyedropper' ? 'default' : 'secondary'} onClick={() => setTool('eyedropper')} title="قطّارة">
            <Droplet className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant={tool === 'pan' ? 'default' : 'secondary'}
            onClick={() => setTool(t => (t === 'pan' ? 'pen' : 'pan'))}
            title="تحريك (Space للسحب المؤقت)"
          >
            <Hand className="w-4 h-4" />
          </Button>
        </div>

        {/* خصائص الفرشاة واللون */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/80">سماكة</span>
            <Slider className="w-28" value={[brushSize]} onValueChange={v => setBrushSize(v[0])} min={MIN_BRUSH} max={MAX_BRUSH} step={1} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/80">شفافية</span>
            <Slider className="w-28" value={[opacity]} onValueChange={v => setOpacity(v[0])} min={0.1} max={1} step={0.05} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/80">لون</span>
            <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-10 p-1" />
          </div>

          {tool === 'text' && (
            <>
              <span className="text-xs text-white/80">حجم النص</span>
              <Slider className="w-28" value={[textSize]} onValueChange={v => setTextSize(v[0])} min={12} max={96} step={2} />
              <Input
                placeholder="أدخل النص…"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                className="w-44"
                maxLength={60}
              />
            </>
          )}

          {tool === 'fill' && (
            <>
              <span className="text-xs text-white/80">Tolerance</span>
              <Slider className="w-28" value={[fillTolerance]} onValueChange={v => setFillTolerance(v[0])} min={0} max={100} step={1} />
            </>
          )}
        </div>

        {/* تحكم/تاريخ */}
        <div className="flex items-center gap-1">
          <Button size="icon" variant="secondary" onClick={() => setShowGrid(v => !v)} title="شبكة">
            <Grid className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="secondary" onClick={() => zoomBy(1 / 1.2, stageRef.current?.getPointerPosition() ?? { x: width / 2, y: height / 2 })} title="تصغير">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="secondary" onClick={() => zoomBy(1.2, stageRef.current?.getPointerPosition() ?? { x: width / 2, y: height / 2 })} title="تكبير">
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="secondary" onClick={undo} disabled={historyStep <= 0} title="تراجع">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="secondary" onClick={redo} disabled={historyStep >= history.length - 1} title="إعادة">
            <Redo2 className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="secondary" onClick={exportPNG} title="حفظ PNG">
            <Download className="w-4 h-4" />
          </Button>
          <label className="inline-flex items-center" title="استيراد صورة">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files && importImage(e.target.files[0])}
            />
            <Button size="icon" variant="secondary" asChild>
              <span><ImageIcon className="w-4 h-4" /></span>
            </Button>
          </label>
          <Button size="icon" variant="destructive" onClick={clearAll} title="مسح الكل">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* لوحة ألوان سريعة */}
      <div className="w-full flex flex-wrap gap-1">
        {PALETTE.map((c) => (
          <Button
            key={c}
            size="icon"
            className={cn('h-7 w-7 rounded-full border-2', color === c ? 'border-white' : 'border-transparent')}
            style={{ backgroundColor: c }}
            onClick={() => { setTool('pen'); setColor(c); }}
            title={c}
          />
        ))}
      </div>

      {/* تلميحات */}
      <div className="text-xs text-white/70 flex flex-wrap gap-x-4 gap-y-1">
        <span>⌘/Ctrl+Z تراجع • ⇧+⌘/Ctrl+Z إعادة • Ctrl+Y إعادة</span>
        <span>عجلة + ⌘/Ctrl للتكبير</span>
        <span>Space للسحب المؤقّت</span>
      </div>
    </div>
  );
}
