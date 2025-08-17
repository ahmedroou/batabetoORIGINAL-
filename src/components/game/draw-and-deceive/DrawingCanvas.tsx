'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Line, Image as KonvaImage } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import {
  Eraser, Undo2, Redo2, Trash2, ZoomIn, ZoomOut, Download, Image as ImageIcon, Grid,
} from 'lucide-react';

interface DrawingCanvasProps {
  width: number;
  height: number;
  onDrawEnd: (dataUrl: string) => void;
  disabled?: boolean;
}

type Tool = 'pen' | 'eraser' | 'pan';

type LineData = {
  tool: Exclude<Tool, 'pan'>;
  points: number[];
  color: string;
  strokeWidth: number;
  tension?: number;
};

const PALETTE = ['#FFFFFF', '#EF4444', '#3B82F6', '#22C55E', '#F97316', '#A78BFA', '#000000'];
const MIN_BRUSH = 1;
const MAX_BRUSH = 60;
const MAX_HISTORY = 80; // حد أقصى لمنع تضخّم الذاكرة
const EXPORT_PIXEL_RATIO = 2; // حِدّة أعلى عند التصدير

export function DrawingCanvas({ width, height, onDrawEnd, disabled }: DrawingCanvasProps) {
  // أدوات وخصائص الفرشاة
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#FFFFFF');
  const [brushSize, setBrushSize] = useState(5);
  const [tension, setTension] = useState(0.5);
  const [showGrid, setShowGrid] = useState(false);

  // حالة الرسم
  const [lines, setLines] = useState<LineData[]>([]);
  const [history, setHistory] = useState<LineData[][]>([[]]);
  const [historyStep, setHistoryStep] = useState(0);

  // تكبير/تصغير وسحب
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);

  // مراجع
  const stageRef = useRef<any>(null);
  const isDrawingRef = useRef(false);

  // صورة مستوردة (اختيارية)
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

  // شبكة خلفية CSS (أخف من رسمها داخل Konva)
  const gridBg = useMemo(() => {
    if (!showGrid) return undefined;
    const s = 32;
    return `repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 1px, transparent ${s}px),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 1px, transparent ${s}px)`;
  }, [showGrid]);

  // نسخة عميقة للحفظ في التاريخ
  const cloneLines = useCallback((src: LineData[]) => src.map(l => ({ ...l, points: [...l.points] })), []);

  // دفع لقطة إلى التاريخ
  const pushHistory = useCallback((snapshot?: LineData[]) => {
    setHistory(prev => {
      const upto = prev.slice(0, historyStep + 1);
      const next = [...upto, snapshot ? cloneLines(snapshot) : cloneLines(lines)];
      // قصّ التاريخ إلى الحد الأعلى
      const trimmed = next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
      return trimmed;
    });
    setHistoryStep(s => {
      // بعد القصّ قد يتغير المؤشر
      const tentative = Math.min(historyStep + 1, MAX_HISTORY - 1);
      return tentative;
    });
  }, [cloneLines, lines, historyStep]);

  // إشعار الأب بتغير الرسم (ثروتل عبر RAF لمنع الضغط)
  const rafRef = useRef<number | null>(null);
  const notifyParent = useCallback(() => {
    if (!stageRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const dataUrl = stageRef.current.toDataURL({ mimeType: 'image/png', quality: 0.9, pixelRatio: 1 });
      onDrawEnd?.(dataUrl);
    });
  }, [onDrawEnd]);

  // أدوات التاريخ
  const handleUndo = () => {
    if (historyStep === 0) return;
    const newStep = historyStep - 1;
    setHistoryStep(newStep);
    setLines(cloneLines(history[newStep]!));
    notifyParent();
  };
  const handleRedo = () => {
    if (historyStep >= history.length - 1) return;
    const newStep = historyStep + 1;
    setHistoryStep(newStep);
    setLines(cloneLines(history[newStep]!));
    notifyParent();
  };

  // بداية الرسم
  const handlePointerDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (disabled) return;
    const stage = e.target.getStage();
    if (!stage) return;

    // وضع السحب
    if (tool === 'pan' || isPanningRef.current) {
      isDrawingRef.current = false;
      return;
    }

    const pos = stage.getPointerPosition();
    if (!pos) return;
    isDrawingRef.current = true;

    setLines(prev => [
      ...prev,
      {
        tool: tool === 'eraser' ? 'eraser' : 'pen',
        points: [pos.x, pos.y],
        color,
        strokeWidth: brushSize,
        tension,
      },
    ]);
  };

  // أثناء الرسم
  const handlePointerMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (disabled) return;

    // سحب/تحريك
    if (tool === 'pan' || isPanningRef.current) return;

    if (!isDrawingRef.current) return;
    const stage = e.target.getStage();
    const point = stage?.getPointerPosition();
    if (!point) return;

    // ضغط القلم (إن وجد)
    const pressure = (e.evt as any)?.pressure ?? 0.5;
    const dynamicWidth = Math.max(MIN_BRUSH, Math.min(MAX_BRUSH, brushSize * (0.3 + pressure * 0.7)));

    setLines(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const updated: LineData = {
        ...last,
        strokeWidth: dynamicWidth,
        points: [...last.points, point.x, point.y],
      };
      return [...prev.slice(0, -1), updated];
    });
  };

  // نهاية الرسم
  const handlePointerUp = () => {
    if (disabled) return;
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    pushHistory();     // خزّن لقطة
    notifyParent();    // أخطر الأب بصورة محدثة
  };

  // مسح الكل
  const handleClear = () => {
    setLines([]);
    pushHistory([]);
    notifyParent();
  };

  // تكبير/تصغير
  const zoomBy = (factor: number, pivot?: { x: number; y: number }) => {
    setScale(prev => {
      const next = Math.max(0.25, Math.min(6, prev * factor));
      if (!stageRef.current) return next;
      // تكبير حول نقطة (pivot)
      const stage = stageRef.current;
      const p = pivot ?? { x: width / 2, y: height / 2 };
      const mousePointTo = {
        x: (p.x - stagePos.x) / prev,
        y: (p.y - stagePos.y) / prev,
      };
      const newPos = {
        x: p.x - mousePointTo.x * next,
        y: p.y - mousePointTo.y * next,
      };
      setStagePos(newPos);
      return next;
    });
  };

  // عجلة الماوس للتكبير مع Ctrl/⌘
  const onWheel = (e: any) => {
    if (disabled) return;
    if (!(e.evt.ctrlKey || e.evt.metaKey)) return;
    e.evt.preventDefault();
    const direction = e.evt.deltaY > 0 ? 1 / 1.2 : 1.2;
    const pos = stageRef.current?.getPointerPosition();
    zoomBy(direction, pos ?? { x: width / 2, y: height / 2 });
  };

  // سحب مع شريط المسافة (space)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') isPanningRef.current = true;
      // اختصارات التاريخ
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo(); else handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault(); handleRedo();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') isPanningRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [historyStep, history.length]);

  // استيراد صورة
  const onImport = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      setBgImage(img);
      URL.revokeObjectURL(url);
      // لا ندفع للتاريخ هنا حتى لا نضاعف؛ سيُحفظ عند أول لمسة/إجراء أو يمكنك دفعه الآن:
      pushHistory();
      notifyParent();
    };
    img.src = url;
  };

  // تصدير
  const onExport = () => {
    if (!stageRef.current) return;
    const dataUrl = stageRef.current.toDataURL({
      mimeType: 'image/png',
      quality: 0.95,
      pixelRatio: EXPORT_PIXEL_RATIO,
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `drawing-${Date.now()}.png`;
    a.click();
  };

  // نمط المؤشر حسب الأداة
  const cursor = tool === 'pan' ? 'grab' : tool === 'eraser' ? 'crosshair' : 'crosshair';

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {/* اللوحة */}
      <div
        className={cn(
          'relative w-full rounded-lg overflow-hidden border',
          'bg-slate-700 border-2 border-primary',
        )}
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
          draggable={tool === 'pan' || isPanningRef.current}
          onDragMove={(e) => {
            if (!(tool === 'pan' || isPanningRef.current)) return;
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }}
          onWheel={onWheel}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          style={{ touchAction: 'none', cursor }}
        >
          <Layer listening={false}>
            {/* خلفية الصورة المستوردة إن وُجدت */}
            {bgImage && (
              <KonvaImage
                image={bgImage}
                x={0}
                y={0}
                width={width}
                height={height}
              />
            )}
          </Layer>

          <Layer>
            {lines.map((line, i) => (
              <Line
                key={i}
                points={line.points}
                stroke={line.color}
                strokeWidth={line.strokeWidth}
                tension={line.tension ?? 0.5}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={
                  line.tool === 'eraser' ? 'destination-out' : 'source-over'
                }
              />
            ))}
          </Layer>
        </Stage>
      </div>

      {/* شريط الأدوات */}
      <div className="w-full flex flex-col sm:flex-row gap-2 justify-between p-2 rounded-lg bg-slate-800 border border-slate-700">
        {/* ألوان وأدوات */}
        <div className="flex flex-wrap items-center gap-1">
          {PALETTE.map((c) => (
            <Button
              key={c}
              size="icon"
              className={cn(
                'h-8 w-8 rounded-full border-2',
                color === c && tool === 'pen' ? 'border-white' : 'border-transparent'
              )}
              style={{ backgroundColor: c }}
              onClick={() => { setTool('pen'); setColor(c); }}
              aria-label={`Color ${c}`}
              title="لون القلم"
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => { setTool('pen'); setColor(e.target.value); }}
            className="h-8 w-10 rounded-md overflow-hidden border border-white/20 bg-transparent"
            title="اختر لونًا"
          />
          <Button
            size="icon"
            variant={tool === 'eraser' ? 'secondary' : 'ghost'}
            className="h-8 w-8"
            onClick={() => setTool('eraser')}
            title="ممحاة"
          >
            <Eraser />
          </Button>
        </div>

        {/* سمك/نعومة */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/80">سماكة</span>
          <Slider
            value={[brushSize]}
            onValueChange={(v) => setBrushSize(v[0])}
            max={MAX_BRUSH}
            min={MIN_BRUSH}
            step={1}
            className="w-28"
          />
          <span className="text-xs text-white/80 ml-2">نعومة</span>
          <Slider
            value={[tension]}
            onValueChange={(v) => setTension(v[0])}
            max={1}
            min={0}
            step={0.05}
            className="w-24"
          />
        </div>

        {/* تحكم/تاريخ */}
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => zoomBy(1 / 1.2)} title="تصغير">
            <ZoomOut />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => zoomBy(1.2)} title="تكبير">
            <ZoomIn />
          </Button>
          <Button
            size="icon"
            variant={tool === 'pan' ? 'secondary' : 'ghost'}
            onClick={() => setTool(t => (t === 'pan' ? 'pen' : 'pan'))}
            title="سحب/تحريك (Space للسحب السريع)"
          >
            🖐️
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setShowGrid(v => !v)} title="شبكة">
            <Grid />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleUndo} disabled={historyStep === 0} title="تراجع">
            <Undo2 />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleRedo} disabled={historyStep >= history.length - 1} title="إعادة">
            <Redo2 />
          </Button>
          <Button size="icon" variant="ghost" onClick={onExport} title="حفظ PNG">
            <Download />
          </Button>
          <label className="inline-flex items-center" title="استيراد صورة">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files && onImport(e.target.files[0])}
            />
            <Button size="icon" variant="ghost" asChild>
              <span><ImageIcon /></span>
            </Button>
          </label>
          <Button size="icon" variant="destructive" onClick={handleClear} title="مسح الكل">
            <Trash2 />
          </Button>
        </div>
      </div>

      {/* تلميحات */}
      <div className="text-xs text-white/60 flex flex-wrap gap-x-4 gap-y-1">
        <span>⌘/Ctrl+Z تراجع • ⇧+⌘/Ctrl+Z إعادة • Ctrl+Y إعادة</span>
        <span>عجلة + ⌘/Ctrl للتكبير</span>
        <span>Space للسحب مؤقتًا</span>
      </div>
    </div>
  );
}
