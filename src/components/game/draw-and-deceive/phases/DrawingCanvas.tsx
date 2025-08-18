
'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import {
  Undo2, Redo2, Eraser, Pencil, Highlighter, Type, Droplet,
  Image as ImageIcon, Download, Maximize2, Minimize2, Square, Circle,
  Minus, Grid, Trash2, Hand, PaintBucket, Copy as CopyIcon, RefreshCcw, HelpCircle, Keyboard
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';


type Tool =
  | 'pen'
  | 'marker'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'circle'
  | 'text'
  | 'eyedropper'
  | 'pan'
  | 'fill';

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

/**
 * Canvas Pro — محسّنة
 * - backing canvas (HiDPI) + display/overlay
 * - Pan/Zoom ثابت حول المؤشر
 * - Flood fill محسّن
 * - معاينة مؤشر الفرشاة + قيود Shift + تعبئة أشكال
 * - Space للتحريك مؤقتًا، دبل-كليك لإعادة التعيين
 */
export function DrawingCanvas({
  className,
  disabled = false,
  onDrawEnd,
  initialImage = null,
  maxHistory = 60,
  width,
  height,
}: DrawingCanvasProps) {
  // DOM
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // Backing canvas (offscreen)
  const backingRef = useRef<HTMLCanvasElement | null>(null);

  // مقاسات منطقية (CSS pixels)
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: width || 800,
    h: height || 450,
  });

  // DPI
  const [dpr, setDpr] = useState<number>(1);

  // الكاميرا
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // الحالة
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>('#1f2937'); // slate-800
  const [thickness, setThickness] = useState<number>(5);
  const [opacity, setOpacity] = useState<number>(1);
  const [showGrid, setShowGrid] = useState<boolean>(false);

  // خصائص إضافية
  const [shapeFill, setShapeFill] = useState<boolean>(false); // تعبئة الأشكال
  const shiftDownRef = useRef<boolean>(false);
  const forcedPanRef = useRef<boolean>(false); // Alt أو زر الوسط
  const isDrawingRef = useRef<boolean>(false);
  const lastPtCssRef = useRef<{ x: number; y: number } | null>(null);

  // النص
  const [textValue, setTextValue] = useState<string>('');
  const [textSize, setTextSize] = useState<number>(24);

  // الدلو (التعبئة)
  const [fillTolerance, setFillTolerance] = useState<number>(24); // 0..100

  // التاريخ
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const historyIndexRef = useRef<number>(-1);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

  // شبكة الخلفية CSS (لا تتبع التكبير — خفيفة)
  const gridBg = useMemo(() => {
    if (!showGrid) return '';
    const s = 32;
    return `repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0, rgba(0,0,0,0.06) 1px, transparent 1px, transparent ${s}px),
            repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0, rgba(0,0,0,0.06) 1px, transparent 1px, transparent ${s}px)`;
  }, [showGrid]);

  // Helpers
  const getDisplayCtx = () => displayRef.current!.getContext('2d')!;
  const getOverlayCtx = () => overlayRef.current!.getContext('2d')!;
  const getBackingCtx = () => backingRef.current!.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;

  // تحويلات
  const clientToCss = useCallback((clientX: number, clientY: number) => {
    const rect = displayRef.current!.getBoundingClientRect();
    const xCss = (clientX - rect.left - pan.x) / zoom;
    const yCss = (clientY - rect.top - pan.y) / zoom;
    return { x: Math.max(0, Math.min(size.w, xCss)), y: Math.max(0, Math.min(size.h, yCss)) };
  }, [pan.x, pan.y, zoom, size.w, size.h]);

  const cssToPx = useCallback((ptCss: { x: number; y: number }) => {
    return { x: Math.round(ptCss.x * dpr), y: Math.round(ptCss.y * dpr) };
  }, [dpr]);

  // عرض كل شيء (throttled)
  const rafRef = useRef<number | null>(null);
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
      dctx.drawImage(
        backingRef.current!,
        0, 0, backingRef.current!.width, backingRef.current!.height,
        0, 0, size.w, size.h
      );
      dctx.restore();
    });
  }, [dpr, size.w, size.h, pan.x, pan.y, zoom]);

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
    backingRef.current = newBacking;

    const nctx = getBackingCtx();
    nctx.clearRect(0, 0, newBacking.width, newBacking.height);
    if (keepContent && old) {
      nctx.drawImage(old, 0, 0, old.width, old.height, 0, 0, newBacking.width, newBacking.height);
    }

    renderAll();
  }, [size.w, size.h, renderAll]);

  // مراقبة الحاوية للتجاوب
  useEffect(() => {
    if (width && height) {
      setSize({ w: width, h: height });
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        const w = Math.max(320, Math.floor(cr.width));
        const h = Math.max(220, Math.floor((cr.width * 9) / 16));
        setSize({ w, h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  // تهيئة أولية للدقة
  useEffect(() => {
    const onResize = () => setupCanvases(true);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // عند تغيّر الحجم
  useEffect(() => {
    setupCanvases(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  // History push
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
      return next;
    });
    onDrawEnd?.(dataUrl);
  }, [maxHistory, onDrawEnd]);

  // تحميل صورة ابتدائية (مع ضمان تهيئة backing)
  useEffect(() => {
    if (!backingRef.current) setupCanvases(false);
    if (!initialImage) {
      pushHistory(backingRef.current!.toDataURL('image/png'));
      renderAll();
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = initialImage;
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImage, dpr, size.w, size.h]);

  // مسح طبقة المعاينة
  const clearOverlay = useCallback(() => {
    const octx = getOverlayCtx();
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, size.w, size.h);
  }, [dpr, size.w, size.h]);

  // مؤشر الفرشاة (معاينة)
  const drawCursor = useCallback((ptCss: { x: number; y: number }) => {
    const octx = getOverlayCtx();
    clearOverlay();
    octx.save();
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.translate(pan.x, pan.y);
    octx.scale(zoom, zoom);
    octx.globalAlpha = 0.6;
    octx.beginPath();
    const r = Math.max(1.5, (thickness / 2));
    octx.arc(ptCss.x, ptCss.y, r, 0, Math.PI * 2);
    octx.strokeStyle = '#00000088';
    octx.lineWidth = 1;
    octx.stroke();
    octx.restore();
  }, [clearOverlay, dpr, pan.x, pan.y, zoom, thickness]);

  // ضبط أسلوب القلم على backing
  const setStrokeStyleBacking = (ctx: CanvasRenderingContext2D, pressure = 0.5) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const base = thickness;
    const dynCss = Math.max(1, base * (0.3 + (pressure || 0.5) * 0.7));
    const dynPx = dynCss * dpr;
    ctx.lineWidth = dynPx;

    ctx.globalAlpha = tool === 'marker' ? Math.min(1, opacity * 0.5) : opacity;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = tool === 'eraser' ? '#000' : color;
  };

  // مقطع خط
  const strokeSegmentBacking = (fromCss: { x: number; y: number } | null, toCss: { x: number; y: number }, pressure = 0.5) => {
    if (!fromCss) return;
    const ctx = getBackingCtx();
    const f = cssToPx(fromCss);
    const t = cssToPx(toCss);
    ctx.save();
    setStrokeStyleBacking(ctx, pressure);
    ctx.beginPath();
    ctx.moveTo(f.x + 0.5, f.y + 0.5);
    ctx.lineTo(t.x + 0.5, t.y + 0.5);
    ctx.stroke();
    ctx.restore();
    renderAll();
  };

  // معاينة أشكال على overlay
  const drawPreviewShape = (startCss: { x: number; y: number }, currentCss: { x: number; y: number }) => {
    const octx = getOverlayCtx();
    clearOverlay();
    octx.save();
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.translate(pan.x, pan.y);
    octx.scale(zoom, zoom);
    octx.globalAlpha = 0.95;
    octx.strokeStyle = color;
    octx.lineWidth = Math.max(1, thickness);
    octx.setLineDash([6, 6]);

    let end = currentCss;

    if (tool === 'line') {
      if (shiftDownRef.current) {
        const dx = currentCss.x - startCss.x;
        const dy = currentCss.y - startCss.y;
        const ang = Math.atan2(dy, dx);
        const snap = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
        const r = Math.hypot(dx, dy);
        end = { x: startCss.x + r * Math.cos(snap), y: startCss.y + r * Math.sin(snap) };
      }
      octx.beginPath();
      octx.moveTo(startCss.x, startCss.y);
      octx.lineTo(end.x, end.y);
      octx.stroke();
    } else if (tool === 'rect') {
      if (shiftDownRef.current) {
        const w = currentCss.x - startCss.x;
        const h = currentCss.y - startCss.y;
        const s = Math.sign(w) * Math.min(Math.abs(w), Math.abs(h));
        const r = Math.sign(h) * Math.min(Math.abs(w), Math.abs(h));
        octx.strokeRect(startCss.x, startCss.y, s, r);
      } else {
        octx.strokeRect(startCss.x, startCss.y, currentCss.x - startCss.x, currentCss.y - startCss.y);
      }
    } else if (tool === 'circle') {
      const dx = currentCss.x - startCss.x;
      const dy = currentCss.y - startCss.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      octx.beginPath();
      octx.arc(startCss.x, startCss.y, r, 0, Math.PI * 2);
      octx.stroke();
    }

    octx.restore();
  };

  // تثبيت الأشكال على backing
  const commitShapeBacking = (startCss: { x: number; y: number }, endCss: { x: number; y: number }) => {
    const ctx = getBackingCtx();
    let s = cssToPx(startCss);
    let e = cssToPx(endCss);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, thickness * dpr);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    if (tool === 'line') {
      if (shiftDownRef.current) {
        const dx = endCss.x - startCss.x;
        const dy = endCss.y - startCss.y;
        const ang = Math.atan2(dy, dx);
        const snap = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
        const r = Math.hypot(dx, dy);
        const end = { x: startCss.x + r * Math.cos(snap), y: startCss.y + r * Math.sin(snap) };
        e = cssToPx(end);
      }
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
    } else if (tool === 'rect') {
      let w = e.x - s.x;
      let h = e.y - s.y;
      if (shiftDownRef.current) {
        const side = Math.sign(w) * Math.min(Math.abs(w), Math.abs(h));
        const sideY = Math.sign(h) * Math.min(Math.abs(w), Math.abs(h));
        w = side; h = sideY;
      }
      if (shapeFill) ctx.fillRect(s.x, s.y, w, h);
      ctx.strokeRect(s.x, s.y, w, h);
    } else if (tool === 'circle') {
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      if (shapeFill) ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    clearOverlay();
    renderAll();
  };

  const undo = () => {
    if (historyIndexRef.current <= 0) return;
    const newIndex = historyIndexRef.current - 1;
    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex;
    const img = new Image();
    img.src = history[newIndex];
    img.onload = () => {
      const bctx = getBackingCtx();
      bctx.clearRect(0, 0, backingRef.current!.width, backingRef.current!.height);
      bctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, backingRef.current!.width, backingRef.current!.height);
      renderAll();
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
      const bctx = getBackingCtx();
      bctx.clearRect(0, 0, backingRef.current!.width, backingRef.current!.height);
      bctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, backingRef.current!.width, backingRef.current!.height);
      renderAll();
      onDrawEnd?.(history[newIndex]);
    };
  };

  // استيراد صورة
  const importImage = (file: File) => {
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
  };

  const downloadPng = () => {
    const link = document.createElement('a');
    link.download = `drawing-${Date.now()}.png`;
    link.href = backingRef.current!.toDataURL('image/png');
    link.click();
  };

  const copyToClipboard = async () => {
    try {
      const c = backingRef.current!;
      const blob: Blob = await new Promise(res => c.toBlob(b => res(b!), 'image/png'));
      // Clipboard API إن أمكن
      // @ts-ignore
      if (navigator.clipboard && (window as any).ClipboardItem) {
        // @ts-ignore
        await navigator.clipboard.write([new (window as any).ClipboardItem({ 'image/png': blob })]);
      } else {
        // Fallback: تنزيل سريع
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `drawing-${Date.now()}.png`; a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* تجاهل */ }
  };

  // Flood Fill (تحسين المسافة + إزالة شرط ميت)
  const floodFill = (startPx: { x: number; y: number }, rgba: { r: number; g: number; b: number; a: number }, tolerance: number) => {
    const ctx = getBackingCtx();
    const { width, height } = backingRef.current!;
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;

    const i0 = (startPx.y * width + startPx.x) * 4;
    const target = { r: data[i0], g: data[i0 + 1], b: data[i0 + 2], a: data[i0 + 3] };

    const tol = Math.max(0, Math.min(100, tolerance));
    const thr = tol * 10.2; // ~من 0..1020 (manhattan لـ RGB) + قليل للألفا

    const within = (r: number, g: number, b: number, a: number) => {
      const dr = Math.abs(r - target.r);
      const dg = Math.abs(g - target.g);
      const db = Math.abs(b - target.b);
      const da = Math.abs(a - target.a) * 0.5;
      return (dr + dg + db + da) <= thr;
    };

    // لو لون التعبئة قريب جدًا من الهدف — لا شيء
    if (within(rgba.r, rgba.g, rgba.b, rgba.a)) return;

    const q: Array<{ x: number; y: number }> = [];
    const visited = new Uint8Array(width * height);

    const push = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const i = y * width + x;
      if (visited[i]) return;
      const off = i * 4;
      if (!within(data[off], data[off + 1], data[off + 2], data[off + 3])) return;
      visited[i] = 1;
      q.push({ x, y });
    };

    push(startPx.x, startPx.y);

    while (q.length) {
      const { x, y } = q.pop()!;
      const i = (y * width + x) * 4;
      data[i] = rgba.r;
      data[i + 1] = rgba.g;
      data[i + 2] = rgba.b;
      data[i + 3] = rgba.a;

      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }

    ctx.putImageData(image, 0, 0);
    renderAll();
  };

  const hexToRgba = (hex: string, alpha: number) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const bigint = parseInt(full, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    const a = Math.round(alpha * 255);
    return { r, g, b, a };
  };

  // أحداث المؤشر
  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const id = e.pointerId;
    (e.target as HTMLElement).setPointerCapture?.(id);

    // تحريك مؤقت عبر Alt أو زر الوسط
    if ((e.button === 1) || e.altKey) {
      forcedPanRef.current = true;
    }

    const ptCss = clientToCss(e.clientX, e.clientY);
    lastPtCssRef.current = ptCss;

    // Pan
    if (tool === 'pan' || forcedPanRef.current) {
      isDrawingRef.current = true;
      return;
    }

    // نص
    if (tool === 'text') {
      if (!textValue.trim()) return;
      const bctx = getBackingCtx();
      const ptPx = cssToPx(ptCss);
      bctx.save();
      bctx.globalAlpha = opacity;
      bctx.fillStyle = color;
      bctx.font = `bold ${Math.round(textSize * dpr)}px ui-sans-serif`;
      bctx.textBaseline = 'top';
      const lines = textValue.split('\n');
      const lh = Math.round(textSize * dpr * 1.25);
      lines.forEach((ln, i) => bctx.fillText(ln, ptPx.x, ptPx.y + i * lh));
      bctx.restore();
      pushHistory();
      renderAll();
      return;
    }

    // قطّارة (متوسط 3x3)
    if (tool === 'eyedropper') {
      const bctx = getBackingCtx();
      const ptPx = cssToPx(ptCss);
      const sx = Math.max(0, ptPx.x - 1);
      const sy = Math.max(0, ptPx.y - 1);
      const ex = Math.min(backingRef.current!.width - sx, 3);
      const ey = Math.min(backingRef.current!.height - sy, 3);
      const { data } = bctx.getImageData(sx, sy, ex, ey);
      let r = 0, g = 0, b = 0, a = 0, n = (ex * ey);
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3];
      }
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n); a = Math.round(a / n);
      if (a > 0) {
        const hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
        setColor(hex);
      }
      return;
    }

    // تعبئة
    if (tool === 'fill') {
      const ptPx = cssToPx(ptCss);
      const rgba = hexToRgba(color, opacity);
      floodFill(ptPx, rgba, fillTolerance);
      pushHistory();
      return;
    }

    // أشكال/قلم
    isDrawingRef.current = true;
    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      drawPreviewShape(ptCss, ptCss);
    }
  };

  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const currentCss = clientToCss(e.clientX, e.clientY);

    // معاينة مؤشر الفرشاة عندما لا نرسم ولا في Pan ولا في شكل
    if (!isDrawingRef.current && !forcedPanRef.current && !(tool === 'pan') && !(tool === 'line' || tool === 'rect' || tool === 'circle')) {
      drawCursor(currentCss);
    }

    if (!isDrawingRef.current) return;

    if (tool === 'pan' || forcedPanRef.current) {
      // تحريك الكاميرا — بدون ضرب في zoom
      const dx = e.clientX - (lastPtCssRef.current?.x ?? e.clientX);
      const dy = e.clientY - (lastPtCssRef.current?.y ?? e.clientY);
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      renderAll();
      return;
    }

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      drawPreviewShape(lastPtCssRef.current!, currentCss);
      return;
    }

    const pressure = e.pressure ?? 0.5;
    strokeSegmentBacking(lastPtCssRef.current!, currentCss, pressure);
    lastPtCssRef.current = currentCss;
  };

  const finishStroke = (push = true) => {
    if (push) pushHistory();
    isDrawingRef.current = false;
    forcedPanRef.current = false;
    lastPtCssRef.current = null;
  };

  const pointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const id = e.pointerId;
    (e.target as HTMLElement).releasePointerCapture?.(id);

    const endCss = clientToCss(e.clientX, e.clientY);

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      commitShapeBacking(lastPtCssRef.current!, endCss);
      clearOverlay();
      finishStroke(true);
    } else if (tool === 'pan' || forcedPanRef.current) {
      finishStroke(false);
    } else if (isDrawingRef.current) {
      finishStroke(true);
    } else {
      clearOverlay();
    }
  };

  const pointerCancelOrLeave = () => {
    // لا نثبت الأشكال ولا ندفع للتاريخ عند الإلغاء
    isDrawingRef.current = false;
    forcedPanRef.current = false;
    lastPtCssRef.current = null;
    clearOverlay();
  };

  // عجلة التكبير (حول المؤشر)
  const onWheel = (e: React.WheelEvent) => {
    if (disabled) return;
    if (!e.ctrlKey && !e.metaKey) return;
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

  // مسح
  const clearAll = () => {
    const bctx = getBackingCtx();
    bctx.clearRect(0, 0, backingRef.current!.width, backingRef.current!.height);
    setHistory([]);
    setHistoryIndex(-1);
    historyIndexRef.current = -1;
    renderAll();
    onDrawEnd?.(backingRef.current!.toDataURL('image/png'));
  };

  // اختصارات لوحة المفاتيح
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;

      // تراجع/إعادة
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }

      // Space للتحريك المؤقت
      if (e.code === 'Space') {
        if (!shiftDownRef.current) e.preventDefault();
        forcedPanRef.current = true;
      }

      // Shift للقيود
      if (e.key === 'Shift') shiftDownRef.current = true;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') forcedPanRef.current = false;
      if (e.key === 'Shift') shiftDownRef.current = false;
    };

    window.addEventListener('keydown', onKey, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [disabled, redo, undo]);

  // إعادة العرض عند تغيّر الكاميرا
  useEffect(() => {
    renderAll();
  }, [renderAll]);

  // دبل-كليك لإعادة التعيين
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); renderAll(); };
  
  const VerticalSeparator = () => <div className="h-6 w-px bg-border/80 mx-1" />;

  return (
    <div ref={containerRef} className={cn('w-full select-none flex flex-col gap-2', className)}>
      {/* شريط الأدوات */}
      <div className="w-full">
        <ScrollArea className="w-full whitespace-nowrap rounded-2xl bg-white/75 dark:bg-slate-900/50 backdrop-blur shadow border border-border/50">
          <div className="flex items-center gap-2 p-2">
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
              </div>
              <VerticalSeparator />
              <div className="flex items-center gap-1">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button size="icon" variant={['line', 'rect', 'circle'].includes(tool) ? 'default' : 'secondary'}><Square className="w-4 h-4" /></Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2 space-y-1">
                         <Button size="sm" variant={tool === 'line' ? 'default' : 'ghost'} className="w-full justify-start gap-2" onClick={() => setTool('line')}><Minus className="w-4 h-4"/> خط</Button>
                         <Button size="sm" variant={tool === 'rect' ? 'default' : 'ghost'} className="w-full justify-start gap-2" onClick={() => setTool('rect')}><Square className="w-4 h-4"/> مستطيل</Button>
                         <Button size="sm" variant={tool === 'circle' ? 'default' : 'ghost'} className="w-full justify-start gap-2" onClick={() => setTool('circle')}><Circle className="w-4 h-4"/> دائرة</Button>
                         <div className="flex items-center gap-2 pt-2 border-t mt-1 pl-2">
                           <input type="checkbox" id="shape-fill-check" checked={shapeFill} onChange={e => setShapeFill(e.target.checked)} className="h-4 w-4 rounded" />
                           <label htmlFor="shape-fill-check" className="text-xs">تعبئة الشكل</label>
                         </div>
                    </PopoverContent>
                </Popover>
                
                 <Popover>
                    <PopoverTrigger asChild>
                        <Button size="icon" variant={tool === 'text' ? 'default' : 'secondary'} onClick={() => setTool('text')} title="نص">
                            <Type className="w-4 h-4" />
                        </Button>
                    </PopoverTrigger>
                     <PopoverContent className="w-64 p-2 space-y-2">
                         <Textarea placeholder="اكتب نصك هنا..." value={textValue} onChange={e => setTextValue(e.target.value)} rows={3}/>
                         <div className="flex items-center gap-2">
                            <span className="text-xs">الحجم:</span>
                            <Slider min={10} max={120} step={2} value={[textSize]} onValueChange={v => setTextSize(v[0])} />
                         </div>
                     </PopoverContent>
                </Popover>

                <Popover>
                    <PopoverTrigger asChild>
                         <Button size="icon" variant={tool === 'fill' ? 'default' : 'secondary'} onClick={() => setTool('fill')} title="تعبئة">
                          <PaintBucket className="w-4 h-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2">
                        <Label className="text-xs">دقة التعبئة</Label>
                        <Slider min={0} max={100} step={2} value={[fillTolerance]} onValueChange={v => setFillTolerance(v[0])} />
                    </PopoverContent>
                </Popover>

                 <Button size="icon" variant={tool === 'eyedropper' ? 'default' : 'secondary'} onClick={() => setTool('eyedropper')} title="قطّارة">
                  <Droplet className="w-4 h-4" />
                </Button>

                <Button size="icon" variant={tool === 'pan' ? 'default' : 'secondary'} onClick={() => setTool('pan')} title="تحريك">
                  <Hand className="w-4 h-4" />
                </Button>
              </div>
              <VerticalSeparator />
              <div className="hidden sm:flex items-center gap-4">
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
                      <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-8 p-1 bg-transparent" />
                  </div>
              </div>
              
              <VerticalSeparator />

              <div className="flex items-center gap-1">
                <Button size="icon" variant="secondary" onClick={() => setShowGrid(s => !s)} title="شبكة">
                  <Grid className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="secondary" onClick={undo} disabled={historyIndex <= 0} title="تراجع (Ctrl+Z)">
                  <Undo2 className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="secondary" onClick={redo} disabled={historyIndex >= history.length - 1} title="إعادة (Ctrl+Y)">
                  <Redo2 className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="secondary" onClick={clearAll} title="مسح الكل">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <VerticalSeparator />

              <div className="flex items-center gap-1">
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
                <Button size="icon" variant="secondary" onClick={copyToClipboard} title="نسخ إلى الحافظة">
                  <CopyIcon className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="secondary" onClick={downloadPng} title="حفظ كصورة">
                  <Download className="w-4 h-4" />
                </Button>
              </div>
              
              <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon"><HelpCircle className="w-4 h-4"/></Button>
                  </PopoverTrigger>
                  <PopoverContent>
                      <h4 className="font-bold">الاختصارات</h4>
                      <ul className="text-xs list-disc pr-4 space-y-1 mt-2">
                          <li><kbd>Ctrl/Cmd</kbd> + <kbd>عجلة الماوس</kbd>: تكبير/تصغير</li>
                          <li><kbd>Alt</kbd> أو <kbd>زر وسط</kbd>: تحريك مؤقت</li>
                          <li><kbd>دبل كليك</kbd>: إعادة تعيين المنظور</li>
                          <li><kbd>Shift</kbd>: رسم خطوط/أشكال منتظمة</li>
                           <li><kbd>Ctrl/Cmd</kbd> + <kbd>Z</kbd>: تراجع</li>
                          <li><kbd>Ctrl/Cmd</kbd> + <kbd>Y</kbd>: إعادة</li>
                      </ul>
                  </PopoverContent>
              </Popover>

          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
      
      {/* سطح الرسم + الشبكة */}
      <div
        className={cn('relative w-full rounded-xl overflow-hidden border bg-white', disabled && 'pointer-events-none opacity-75')}
        style={{ backgroundImage: gridBg || undefined, touchAction: (tool === 'pan' || forcedPanRef.current) ? 'none' : 'pinch-zoom' }}
        onWheel={onWheel}
        onDoubleClick={resetView}
      >
        {/* كانفس العرض */}
        <canvas
          ref={displayRef}
          className="block w-full h-auto"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerCancelOrLeave}
          onPointerLeave={pointerCancelOrLeave}
        />
        {/* طبقة معاينة */}
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
      </div>

    </div>
  );
}

    