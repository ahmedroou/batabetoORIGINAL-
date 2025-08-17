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

type Tool =
  | 'pen'
  | 'marker'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'circle'
  | 'text'
  | 'eyedropper'
  | 'pan';

interface DrawingCanvasProps {
  className?: string;
  disabled?: boolean;
  onDrawEnd?: (dataUrl: string) => void;
  initialImage?: string | null;
  maxHistory?: number;
  /** إذا تركتها فارغة، اللوحة تتمدّد تلقائياً داخل الحاوية */
  width?: number;
  height?: number;
}

export function DrawingPhase({
  className,
  disabled = false,
  onDrawEnd,
  initialImage = null,
  maxHistory = 60,
  width,
  height,
}: DrawingCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null); // للأشكال قبل التثبيت
  const [dpr, setDpr] = useState<number>(1);

  // لوحة الحالة
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>('#1f2937'); // slate-800
  const [thickness, setThickness] = useState<number>(5);
  const [opacity, setOpacity] = useState<number>(1);
  const [showGrid, setShowGrid] = useState<boolean>(false);

  // نص
  const [textValue, setTextValue] = useState<string>('');
  const [textSize, setTextSize] = useState<number>(24);

  // تكبير/تحريك
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // رسم مباشر
  const isDrawingRef = useRef<boolean>(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  // تاريخ
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const historyIndexRef = useRef<number>(-1);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

  // حساب الحجم الفعلي
  const [size, setSize] = useState<{ w: number; h: number }>({ w: width || 800, h: height || 450 });

  // تهيئة DPI
  const resizeCanvas = useCallback(() => {
    if (!canvasRef.current || !overlayRef.current) return;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const devicePixelRatio = window.devicePixelRatio || 1;
    setDpr(devicePixelRatio);

    const targetW = size.w;
    const targetH = size.h;

    canvas.width = Math.floor(targetW * devicePixelRatio);
    canvas.height = Math.floor(targetH * devicePixelRatio);
    canvas.style.width = `${targetW}px`;
    canvas.style.height = `${targetH}px`;

    overlay.width = canvas.width;
    overlay.height = canvas.height;
    overlay.style.width = `${targetW}px`;
    overlay.style.height = `${targetH}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.imageSmoothingEnabled = true;

    const octx = overlay.getContext('2d')!;
    octx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    octx.imageSmoothingEnabled = true;

    // إعادة عرض التاريخ الحالي
    if (historyIndex >= 0 && history[historyIndex]) {
      const img = new Image();
      img.src = history[historyIndex];
      img.onload = () => {
        ctx.clearRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
      };
    }
  }, [size.w, size.h, history, historyIndex]);

  // مراقبة الحاوية للتجاوب
  useEffect(() => {
    if (width && height) {
      // حجم ثابت
      resizeCanvas();
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setSize({ w: Math.max(320, Math.floor(cr.width)), h: Math.max(220, Math.floor((cr.width * 9) / 16)) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height, resizeCanvas]);

  useEffect(() => {
    if (!canvasRef.current || !overlayRef.current) return;
    resizeCanvas();
  }, [resizeCanvas]);

  // تحميل صورة ابتدائية
  useEffect(() => {
    if (!initialImage || !canvasRef.current) return;
    const img = new Image();
    img.src = initialImage;
    img.onload = () => {
      const ctx = canvasRef.current!.getContext('2d')!;
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.drawImage(img, 0, 0, size.w, size.h);
      pushHistory();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImage]);

  const getCtx = () => canvasRef.current!.getContext('2d')!;
  const getOverlay = () => overlayRef.current!.getContext('2d')!;

  const toCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      // إحداثيات داخل اللوحة مع احتساب zoom/pan
      const x = (clientX - rect.left - pan.x) / zoom;
      const y = (clientY - rect.top - pan.y) / zoom;
      return { x, y };
    },
    [zoom, pan.x, pan.y]
  );

  const setStrokeStyle = (ctx: CanvasRenderingContext2D, pressure = 0.5) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = opacity;
    switch (tool) {
      case 'marker':
        ctx.globalAlpha = Math.min(1, opacity * 0.5);
        break;
      default:
        break;
    }
    ctx.strokeStyle = tool === 'eraser' ? '#000000' : color;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';

    // سماكة ديناميكية بالضغط إن توفر
    const base = thickness;
    const dyn = Math.max(1, base * (0.3 + pressure * 0.7));
    ctx.lineWidth = dyn;
  };

  const drawLineSegment = (from: { x: number; y: number }, to: { x: number; y: number }, pressure = 0.5) => {
    const ctx = getCtx();
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    setStrokeStyle(ctx, pressure);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  };

  const clearOverlay = () => {
    const octx = getOverlay();
    octx.save();
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, size.w, size.h);
    octx.restore();
  };

  const drawPreviewShape = (start: { x: number; y: number }, current: { x: number; y: number }) => {
    const octx = getOverlay();
    clearOverlay();
    octx.save();
    octx.translate(pan.x, pan.y);
    octx.scale(zoom, zoom);
    octx.globalAlpha = 0.9;
    octx.strokeStyle = color;
    octx.lineWidth = Math.max(1, thickness);
    octx.setLineDash([6, 6]);
    if (tool === 'line') {
      octx.beginPath();
      octx.moveTo(start.x, start.y);
      octx.lineTo(current.x, current.y);
      octx.stroke();
    } else if (tool === 'rect') {
      const w = current.x - start.x;
      const h = current.y - start.y;
      octx.strokeRect(start.x, start.y, w, h);
    } else if (tool === 'circle') {
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      octx.beginPath();
      octx.arc(start.x, start.y, r, 0, Math.PI * 2);
      octx.stroke();
    }
    octx.restore();
  };

  const commitPreviewShape = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const ctx = getCtx();
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, thickness);
    ctx.setLineDash([]);
    if (tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    } else if (tool === 'rect') {
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (tool === 'circle') {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      ctx.beginPath();
      ctx.arc(start.x, start.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  const pushHistory = useCallback(
    (custom?: string) => {
      const dataUrl = custom ?? canvasRef.current!.toDataURL('image/png');
      setHistory(prev => {
        const idx = Math.min(Math.max(historyIndexRef.current, -1), prev.length - 1);
        const upto = prev.slice(0, idx + 1);
        const next = [...upto, dataUrl].slice(-maxHistory);
        const newIndex = next.length - 1;
        historyIndexRef.current = newIndex;
        setHistoryIndex(newIndex);
        return next;
      });
      onDrawEnd?.(dataUrl);
    },
    [maxHistory, onDrawEnd]
  );

  const undo = () => {
    if (historyIndexRef.current <= 0) return;
    const newIndex = historyIndexRef.current - 1;
    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex;
    const img = new Image();
    img.src = history[newIndex];
    img.onload = () => {
      const ctx = getCtx();
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.drawImage(img, 0, 0, size.w, size.h);
      onDrawEnd?.(history[newIndex]);
    };
  };

  const redo = () => {
    if (historyIndexRef.current >= history.length - 1) return;
    const newIndex = historyIndexRef.current + 1;
    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex;
    const img = new Image();
    img.src = history[newIndex];
    img.onload = () => {
      const ctx = getCtx();
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.drawImage(img, 0, 0, size.w, size.h);
      onDrawEnd?.(history[newIndex]);
    };
  };

  // أحداث المؤشر/اللمس
  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    const id = e.pointerId;
    (e.target as HTMLElement).setPointerCapture?.(id);
    const pt = toCanvasCoords(e.clientX, e.clientY);
    pointersRef.current.set(id, pt);

    if (tool === 'pan') {
      isDrawingRef.current = true;
      lastPointRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (tool === 'text') {
      if (!textValue.trim()) return;
      const ctx = getCtx();
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.font = `bold ${textSize}px ui-sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(textValue, pt.x, pt.y);
      ctx.restore();
      pushHistory();
      return;
    }

    if (tool === 'eyedropper') {
      // التقط لون البكسل المرئي مع احتساب dpr + pan/zoom
      const ctx = getCtx();
      const rawX = Math.floor((pan.x + pt.x * zoom) * dpr);
      const rawY = Math.floor((pan.y + pt.y * zoom) * dpr);
      const { data } = ctx.getImageData(rawX, rawY, 1, 1);
      const [r, g, b] = data;
      const hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
      setColor(hex);
      setTool('pen');
      return;
    }

    isDrawingRef.current = true;
    lastPointRef.current = pt;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDrawingRef.current) return;
    const id = e.pointerId;
    const prev = pointersRef.current.get(id) || lastPointRef.current;
    const currentClient = { x: e.clientX, y: e.clientY };
    const pt = toCanvasCoords(currentClient.x, currentClient.y);

    if (tool === 'pan') {
      // سحب الشاشة
      const last = lastPointRef.current!;
      setPan(p => ({ x: p.x + (currentClient.x - last.x), y: p.y + (currentClient.y - last.y) }));
      lastPointRef.current = currentClient;
      return;
    }

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      drawPreviewShape(lastPointRef.current!, pt);
      return;
    }

    if (!prev) return;
    const pressure = e.pressure ?? 0.5;
    drawLineSegment(prev, pt, pressure);
    pointersRef.current.set(id, pt);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const id = e.pointerId;
    (e.target as HTMLElement).releasePointerCapture?.(id);
    const pt = toCanvasCoords(e.clientX, e.clientY);

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      commitPreviewShape(lastPointRef.current!, pt);
      clearOverlay();
      pushHistory();
    } else if (tool === 'pan') {
      // لا شي
    } else if (isDrawingRef.current) {
      // نهاية ضربة فرشاة
      pushHistory();
    }

    isDrawingRef.current = false;
    lastPointRef.current = null;
    pointersRef.current.delete(id);
  };

  // عجلة الماوس للتكبير
  const onWheel = (e: React.WheelEvent) => {
    if (disabled) return;
    if (!e.ctrlKey && !e.metaKey) return; // شرط: مع Ctrl/⌘ لتجنب التمرير العرضي
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = Math.exp(delta * 0.001);
    setZoom(z => {
      const newZ = Math.min(6, Math.max(0.25, z * factor));
      return newZ;
    });
  };

  const clearAll = () => {
    const ctx = getCtx();
    ctx.clearRect(0, 0, size.w, size.h);
    setHistory([]);
    setHistoryIndex(-1);
    historyIndexRef.current = -1;
    onDrawEnd?.(canvasRef.current!.toDataURL('image/png'));
  };

  const importImage = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ctx = getCtx();
      ctx.clearRect(0, 0, size.w, size.h);
      // احتواء الصورة داخل اللوحة
      const scale = Math.min(size.w / img.width, size.h / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (size.w - w) / 2;
      const y = (size.h - h) / 2;
      ctx.drawImage(img, x, y, w, h);
      pushHistory();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const downloadPng = () => {
    const link = document.createElement('a');
    link.download = `drawing-${Date.now()}.png`;
    link.href = canvasRef.current!.toDataURL('image/png');
    link.click();
  };

  // شبكة خلفية عبر CSS gradients
  const gridBg = useMemo(() => {
    if (!showGrid) return '';
    const s = 32;
    return `repeating-linear-gradient(0deg, rgba(0,0,0,0.05) 0, rgba(0,0,0,0.05) 1px, transparent 1px, transparent ${s}px),
            repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0, rgba(0,0,0,0.05) 1px, transparent 1px, transparent ${s}px)`;
  }, [showGrid]);

  // اختصارات لوحة المفاتيح
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, history.length, undo, redo]);

  return (
    <div ref={containerRef} className={cn('relative w-full select-none', className)}>
      {/* شريط الأدوات */}
      <div className="absolute z-20 left-2 top-2 right-2 flex flex-wrap gap-2 items-center bg-white/70 backdrop-blur rounded-2xl p-2 shadow">
        <div className="flex items-center gap-1">
          <Button size="icon" variant={tool === 'pen' ? 'default' : 'secondary'} onClick={() => setTool('pen')} title="قلم">
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'marker' ? 'default' : 'secondary'} onClick={() => setTool('marker')} title="ماركر">
            <Highlighter className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'eraser' ? 'default' : 'secondary'} onClick={() => setTool('eraser')} title="ممحاة">
            <Eraser className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'line' ? 'default' : 'secondary'} onClick={() => setTool('line')} title="خط">
            <Minus className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'rect' ? 'default' : 'secondary'} onClick={() => setTool('rect')} title="مستطيل">
            <Square className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'circle' ? 'default' : 'secondary'} onClick={() => setTool('circle')} title="دائرة">
            <Circle className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'text' ? 'default' : 'secondary'} onClick={() => setTool('text')} title="نص">
            <Type className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'eyedropper' ? 'default' : 'secondary'} onClick={() => setTool('eyedropper')} title="قطّارة">
            <Droplet className="w-4 h-4" />
          </Button>
          <Button size="icon" variant={tool === 'pan' ? 'default' : 'secondary'} onClick={() => setTool('pan')} title="تحريك">
            <Hand className="w-4 h-4" />
          </Button>
        </div>

        <div className="hidden md:flex items-center gap-2 ml-2">
          <div className="flex items-center gap-2">
            <span className="text-xs">السماكة</span>
            <div className="w-28">
              <Slider min={1} max={60} step={1} value={[thickness]} onValueChange={v => setThickness(v[0])} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs">الشفافية</span>
            <div className="w-28">
              <Slider min={0.1} max={1} step={0.05} value={[opacity]} onValueChange={v => setOpacity(v[0])} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs">لون</span>
            <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-8 p-1" />
          </div>
          {tool === 'text' && (
            <>
              <span className="text-xs">حجم النص</span>
              <div className="w-28">
                <Slider min={12} max={96} step={2} value={[textSize]} onValueChange={v => setTextSize(v[0])} />
              </div>
              <Input
                placeholder="أدخل النص…"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                className="w-40"
                maxLength={40}
              />
            </>
          )}
        </div>

        {/* أدوات يمين */}
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="secondary" onClick={() => setShowGrid(s => !s)} title="شبكة">
            <Grid className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="secondary" onClick={undo} disabled={historyIndex <= 0} title="تراجع">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="secondary" onClick={redo} disabled={historyIndex >= history.length - 1} title="إعادة">
            <Redo2 className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="secondary" onClick={clearAll} title="مسح الكل">
            <Trash2 className="w-4 h-4" />
          </Button>

          <label className="inline-flex items-center">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files && importImage(e.target.files[0])}
            />
            <Button size="icon" variant="secondary" title="استيراد صورة" asChild>
              <span><ImageIcon className="w-4 h-4" /></span>
            </Button>
          </label>

          <Button size="icon" variant="secondary" onClick={downloadPng} title="حفظ كصورة">
            <Download className="w-4 h-4" />
          </Button>

          <div className="hidden sm:flex items-center gap-1">
            <Button size="icon" variant="secondary" onClick={() => setZoom(z => Math.min(6, z * 1.2))} title="تكبير">
              <Maximize2 className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="secondary" onClick={() => setZoom(z => Math.max(0.25, z / 1.2))} title="تصغير">
              <Minimize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* عناصر مصغرة للجوال */}
        <div className="flex md:hidden w-full gap-2">
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs">سماكة</span>
            <Slider min={1} max={60} step={1} value={[thickness]} onValueChange={v => setThickness(v[0])} />
          </div>
          <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-8 p-1" />
        </div>
        {tool === 'text' && (
          <div className="md:hidden flex w-full items-center gap-2">
            <Input placeholder="أدخل النص…" value={textValue} onChange={(e) => setTextValue(e.target.value)} />
          </div>
        )}
      </div>

      {/* سطح الرسم مع الشبكة */}
      <div
        className={cn(
          'relative w-full rounded-xl overflow-hidden border bg-white',
          disabled && 'pointer-events-none opacity-75'
        )}
        style={{
          backgroundImage: gridBg || undefined,
          touchAction: tool === 'pan' ? 'none' : 'pinch-zoom',
        }}
        onWheel={onWheel}
      >
        <canvas
          ref={canvasRef}
          className="block w-full h-auto"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        {/* طبقة معاينة الأشكال */}
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
      </div>

      {/* تلميحات */}
      <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        <span>اختصارات: ⌘/Ctrl+Z تراجع، ⇧+⌘/Ctrl+Z إعادة</span>
        <span>للتكبير: استخدم عجلة الماوس مع ⌘/Ctrl</span>
        <span>السحب: أداة التحريك</span>
      </div>
    </div>
  );
}
