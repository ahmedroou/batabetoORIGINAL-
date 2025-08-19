
'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import {
  Undo2, Redo2, Eraser, Pencil, Highlighter, Type, Droplet,
  Image as ImageIcon, Download, Square, Circle, Minus, Grid, Trash2,
  Hand, PaintBucket, Copy as CopyIcon, RefreshCcw, HelpCircle, ZoomIn, ZoomOut, Triangle, Ellipse
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

type Tool =
  | 'pen' | 'marker' | 'eraser'
  | 'line' | 'rect' | 'circle' | 'triangle' | 'ellipse'
  | 'text' | 'eyedropper' | 'pan' | 'fill';

interface DrawingCanvasProps {
  className?: string;
  disabled?: boolean;
  onDrawEnd?: (dataUrl: string) => void;
  initialImage?: string | null;
  maxHistory?: number;
  width?: number;
  height?: number;
  aspect?: number; // مثال 16/9
}

export function DrawingCanvas({
  className,
  disabled = false,
  onDrawEnd,
  initialImage = null,
  maxHistory = 60,
  width,
  height,
  aspect = 16 / 9,
}: DrawingCanvasProps) {
  // DOM
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const inputFileRef = useRef<HTMLInputElement>(null);

  // Backing canvas (offscreen)
  const backingRef = useRef<HTMLCanvasElement | null>(null);

  // مقاسات منطقية (CSS pixels)
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: width || 800,
    h: height || Math.round(800 / aspect),
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
  const [shapeFill, setShapeFill] = useState<boolean>(false);
  const shiftDownRef = useRef<boolean>(false);
  const forcedPanRef = useRef<boolean>(false); // Space/Alt/زر وسط
  const isDrawingRef = useRef<boolean>(false);
  const lastPtCssRef = useRef<{ x: number; y: number } | null>(null);
  const lastClientRef = useRef<{ x: number; y: number } | null>(null);

  // Mobile pinch state
  const pinchDistRef = useRef<number>(0);

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

  // شبكة الخلفية CSS
  const gridBg = useMemo(() => {
    if (!showGrid) return '';
    const s = 32;
    return `repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0, rgba(0,0,0,0.06) 1px, transparent 1px, transparent ${s}px),
            repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0, rgba(0,0,0,0.06) 1px, transparent 1px, transparent ${s}px)`;
  }, [showGrid]);

  // Helpers
  const getDisplayCtx = () => displayRef.current!.getContext('2d')!;
  const getOverlayCtx = () => overlayRef.current!.getContext('2d')!;
  const getBackingCtx = () => {
    if (!backingRef.current) {
      const c = document.createElement('canvas');
      c.width = Math.floor(size.w * dpr);
      c.height = Math.floor(size.h * dpr);
      backingRef.current = c;
    }
    return backingRef.current.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  };

  // تحويلات
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

  // رسم كل شيء (throttled via RAF)
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
      dctx.imageSmoothingEnabled = true;
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

    if (keepContent && old) {
      const nctx = newBacking.getContext('2d')!;
      nctx.drawImage(old, 0, 0, old.width, old.height, 0, 0, newBacking.width, newBacking.height);
    }
    backingRef.current = newBacking;

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
        const h = Math.max(220, Math.floor(w / aspect));
        setSize({ w, h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height, aspect]);

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
  }, [size.w, size.h, setupCanvases]);

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

  // تحميل صورة ابتدائية
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!displayRef.current || !overlayRef.current) return;
    if (!didInitRef.current) {
      setupCanvases(false);
      didInitRef.current = true;
    }
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
  }, [initialImage]);

  // مسح طبقة المعاينة
  const clearOverlay = useCallback(() => {
    const octx = getOverlayCtx();
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, size.w, size.h);
  }, [dpr, size.w, size.h]);

  // مؤشر الفرشاة
  const drawCursor = useCallback((ptCss: { x: number; y: number }) => {
    const octx = getOverlayCtx();
    clearOverlay();
    octx.save();
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.translate(pan.x, pan.y);
    octx.scale(zoom, zoom);
    octx.globalAlpha = 0.6;
    octx.beginPath();
    const r = Math.max(1.5, thickness / 2);
    octx.arc(ptCss.x, ptCss.y, r, 0, Math.PI * 2);
    octx.strokeStyle = '#00000088';
    octx.lineWidth = 1;
    octx.stroke();
    octx.restore();
  }, [clearOverlay, dpr, pan.x, pan.y, zoom, thickness]);

  // إعداد أسلوب القلم
  const setStrokeStyleBacking = (ctx: CanvasRenderingContext2D, pressure = 0.5) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const base = thickness;
    const dynCss = Math.max(1, base * (0.3 + (pressure || 0.5) * 0.7));
    const dynPx = dynCss * dpr;
    ctx.lineWidth = dynPx;
    ctx.globalAlpha = (tool === 'marker') ? Math.min(1, opacity * 0.5) : opacity;
    ctx.globalCompositeOperation = (tool === 'eraser') ? 'destination-out' : 'source-over';
    ctx.strokeStyle = (tool === 'eraser') ? '#000' : color;
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

  // معاينة الأشكال على overlay
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
    } else if (tool === 'ellipse') {
      const rx = Math.abs(currentCss.x - startCss.x);
      const ry = Math.abs(currentCss.y - startCss.y);
      octx.beginPath();
      octx.ellipse(startCss.x, startCss.y, rx, ry, 0, 0, Math.PI * 2);
      octx.stroke();
    } else if (tool === 'triangle') {
      const left = Math.min(startCss.x, currentCss.x);
      const right = Math.max(startCss.x, currentCss.x);
      const top = Math.min(startCss.y, currentCss.y);
      const bottom = Math.max(startCss.y, currentCss.y);
      const w = right - left;
      let p1 = { x: left, y: bottom };
      let p2 = { x: right, y: bottom };
      let p3 = { x: left + w / 2, y: top };
      if (shiftDownRef.current) {
        const hEq = w * Math.sqrt(3) / 2;
        p1 = { x: left, y: top + hEq };
        p2 = { x: right, y: top + hEq };
        p3 = { x: left + w / 2, y: top };
      }
      octx.beginPath();
      octx.moveTo(p1.x, p1.y);
      octx.lineTo(p2.x, p2.y);
      octx.lineTo(p3.x, p3.y);
      octx.closePath();
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
    } else if (tool === 'ellipse') {
      const rx = Math.abs(e.x - s.x);
      const ry = Math.abs(e.y - s.y);
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, rx, ry, 0, 0, Math.PI * 2);
      if (shapeFill) ctx.fill();
      ctx.stroke();
    } else if (tool === 'triangle') {
      const left = Math.min(startCss.x, endCss.x);
      const right = Math.max(startCss.x, endCss.x);
      const top = Math.min(startCss.y, endCss.y);
      const bottom = Math.max(startCss.y, endCss.y);
      const w = right - left;
      let p1 = cssToPx({ x: left, y: bottom });
      let p2 = cssToPx({ x: right, y: bottom });
      let p3 = cssToPx({ x: left + w / 2, y: top });
      if (shiftDownRef.current) {
        const hEq = w * Math.sqrt(3) / 2;
        p1 = cssToPx({ x: left, y: top + hEq });
        p2 = cssToPx({ x: right, y: top + hEq });
        p3 = cssToPx({ x: left + w / 2, y: top });
      }
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      if (shapeFill) ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    clearOverlay();
    renderAll();
  };

  const undo = useCallback(() => {
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
  }, [history, onDrawEnd, renderAll]);

  const redo = useCallback(() => {
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
  }, [history, onDrawEnd, renderAll]);

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

  // تحويل DataURL إلى Blob (fallback للنسخ)
  const dataURLToBlob = (dataURL: string) => {
    const [head, body] = dataURL.split(',');
    const mime = head.match(/:(.*?);/)?.[1] || 'image/png';
    const binStr = atob(body!);
    const len = binStr.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = binStr.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };

  const copyToClipboard = async () => {
    try {
      const c = backingRef.current!;
      const blob: Blob = await new Promise((res, rej) =>
        c.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png')
      );

      // Clipboard API إن أمكن
      // @ts-ignore
      if (navigator.clipboard && window.ClipboardItem) {
        // @ts-ignore
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
        return;
      }

      // Fallback: DataURL -> Blob -> تنزيل سريع كحل أخير
      const url = URL.createObjectURL(blob || dataURLToBlob(c.toDataURL('image/png')));
      const a = document.createElement('a');
      a.href = url; a.download = `drawing-${Date.now()}.png`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      // آخر حل: نسخ DataURL كنص
      try {
        await navigator.clipboard?.writeText(backingRef.current!.toDataURL('image/png'));
      } catch { /* تجاهل */ }
    }
  };

  // Flood Fill
  const floodFill = (startPx: { x: number; y: number }, rgba: { r: number; g: number; b: number; a: number }, tolerance: number) => {
    if (!backingRef.current) return;
    const ctx = getBackingCtx();
    const { width, height } = backingRef.current!;
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;

    const i0 = (startPx.y * width + startPx.x) * 4;
    const target = { r: data[i0], g: data[i0 + 1], b: data[i0 + 2], a: data[i0 + 3] };

    const tol = Math.max(0, Math.min(100, tolerance));
    const thr = tol * 10.2;

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
      if (!within(data[off]!, data[off + 1]!, data[off + 2]!, data[off + 3]!)) return;
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
      lastClientRef.current = { x: e.clientX, y: e.clientY };
    }

    const ptCss = clientToCss(e.clientX, e.clientY);
    lastPtCssRef.current = ptCss;
    if (!lastPtCssRef.current) return;

    // Pan
    if (tool === 'pan' || forcedPanRef.current) {
      isDrawingRef.current = true;
      lastClientRef.current = { x: e.clientX, y: e.clientY };
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
      bctx.textBaseline = 'top';
      bctx.font = `600 ${Math.round(textSize * dpr)}px ui-sans-serif`;
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
        r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; a += data[i + 3]!;
      }
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n); a = Math.round(a / n);
      if (a > 0) {
        const hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
        setColor(hex);
        setOpacity(Math.max(0.1, Math.min(1, a / 255)));
      }
      return;
    }

    // تعبئة — تُفعّل الآن فعليًا من زر الأداة
    if (tool === 'fill') {
      const ptPx = cssToPx(ptCss);
      const rgba = hexToRgba(color, opacity);
      floodFill(ptPx, rgba, fillTolerance);
      pushHistory();
      return;
    }

    // أشكال/قلم
    isDrawingRef.current = true;
    if (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'triangle' || tool === 'ellipse') {
      drawPreviewShape(ptCss, ptCss);
    }
  };

  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const currentCss = clientToCss(e.clientX, e.clientY);

    // معاينة مؤشر الفرشاة
    if (!isDrawingRef.current && !forcedPanRef.current && !(tool === 'pan') &&
        !(tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'triangle' || tool === 'ellipse')) {
      drawCursor(currentCss);
    }

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

    if (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'triangle' || tool === 'ellipse') {
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
    lastClientRef.current = null;
  };

  const pointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const id = e.pointerId;
    (e.target as HTMLElement).releasePointerCapture?.(id);

    const endCss = clientToCss(e.clientX, e.clientY);

    if (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'triangle' || tool === 'ellipse') {
      if (lastPtCssRef.current) {
        commitShapeBacking(lastPtCssRef.current!, endCss);
      }
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
    isDrawingRef.current = false;
    forcedPanRef.current = false;
    lastPtCssRef.current = null;
    lastClientRef.current = null;
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

  // Touch pinch/drag
  const onTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      pinchDistRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    } else if (e.touches.length === 1) {
      const t = e.touches[0]!;
      if (tool === 'pan') {
        isDrawingRef.current = true;
        lastClientRef.current = { x: t.clientX, y: t.clientY };
      }
    }
  };

  const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const factor = currentDist / (pinchDistRef.current || currentDist);
      const newZoom = Math.min(6, Math.max(0.25, zoom * factor));

      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const worldBefore = clientToCss(midX, midY);

      const rect = displayRef.current!.getBoundingClientRect();
      const nx = midX - rect.left - worldBefore.x * newZoom;
      const ny = midY - rect.top - worldBefore.y * newZoom;

      setZoom(newZoom);
      setPan({ x: nx, y: ny });
      pinchDistRef.current = currentDist;
      renderAll();
    } else if (e.touches.length === 1 && (tool === 'pan' || forcedPanRef.current)) {
      const t = e.touches[0]!;
      const last = lastClientRef.current ?? { x: t.clientX, y: t.clientY };
      const dx = t.clientX - last.x;
      const dy = t.clientY - last.y;
      lastClientRef.current = { x: t.clientX, y: t.clientY };
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      renderAll();
    }
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

      // + و - للتكبير/التصغير
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoom(z => Math.min(6, z * 1.1));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        setZoom(z => Math.max(0.25, z / 1.1));
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === '0') {
        e.preventDefault();
        resetView();
      }
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

  // إلغاء RAF عند التفكيك
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // دبل-كليك لإعادة التعيين
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); renderAll(); };

  /* ============================== واجهة الأدوات ============================== */

  // مجموعات: فرش / أشكال / تعبئة / نص / بقية الأدوات
  const BrushesGroup = () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          aria-label="الفرش"
          variant={['pen', 'marker', 'eraser'].includes(tool) ? 'default' : 'secondary'}
          title="الفرش"
        >
          <Pencil className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2 space-y-1">
        <Button size="sm" variant={tool === 'pen' ? 'default' : 'ghost'} className="w-full justify-start gap-2" onClick={() => setTool('pen')}>
          <Pencil className="w-4 h-4" /> قلم
        </Button>
        <Button size="sm" variant={tool === 'marker' ? 'default' : 'ghost'} className="w-full justify-start gap-2" onClick={() => setTool('marker')}>
          <Highlighter className="w-4 h-4" /> ماركر
        </Button>
        <Button size="sm" variant={tool === 'eraser' ? 'default' : 'ghost'} className="w-full justify-start gap-2" onClick={() => setTool('eraser')}>
          <Eraser className="w-4 h-4" /> ممحاة
        </Button>
      </PopoverContent>
    </Popover>
  );

  const ShapesGroup = () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          aria-label="أشكال"
          variant={['line', 'rect', 'circle', 'triangle', 'ellipse'].includes(tool) ? 'default' : 'secondary'}
          title="أشكال"
        >
          <Square className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2 space-y-1">
        <Button size="sm" variant={tool === 'line' ? 'default' : 'ghost'} className="w-full justify-start gap-2" onClick={() => setTool('line')}>
          <Minus className="w-4 h-4" /> خط
        </Button>
        <Button size="sm" variant={tool === 'rect' ? 'default' : 'ghost'} className="w-full justify-start gap-2" onClick={() => setTool('rect')}>
          <Square className="w-4 h-4" /> مستطيل
        </Button>
        <Button size="sm" variant={tool === 'circle' ? 'default' : 'ghost'} className="w-full justify-start gap-2" onClick={() => setTool('circle')}>
          <Circle className="w-4 h-4" /> دائرة
        </Button>
        <Button size="sm" variant={tool === 'ellipse' ? 'default' : 'ghost'} className="w-full justify-start gap-2" onClick={() => setTool('ellipse')}>
          <Ellipse className="w-4 h-4" /> بيضاوي
        </Button>
        <Button size="sm" variant={tool === 'triangle' ? 'default' : 'ghost'} className="w-full justify-start gap-2" onClick={() => setTool('triangle')}>
          <Triangle className="w-4 h-4" /> مثلث
        </Button>
        <div className="flex items-center gap-2 pt-2 border-t mt-1 pl-1">
          <input type="checkbox" id="shape-fill-check" checked={shapeFill} onChange={e => setShapeFill(e.target.checked)} className="h-4 w-4 rounded" />
          <label htmlFor="shape-fill-check" className="text-xs">تعبئة الشكل</label>
        </div>
      </PopoverContent>
    </Popover>
  );

  const FillGroup = () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          aria-label="تعبئة"
          variant={tool === 'fill' ? 'default' : 'secondary'}
          title="تعبئة"
          onClick={() => setTool('fill')} // <<< مهم: تفعيل الأداة فور الضغط
        >
          <PaintBucket className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <Label className="text-xs">حساسية التعبئة</Label>
        <Slider min={0} max={100} step={2} value={[fillTolerance]} onValueChange={v => setFillTolerance(v[0]!)} />
      </PopoverContent>
    </Popover>
  );

  const TextGroup = () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" aria-label="نص" variant={tool === 'text' ? 'default' : 'secondary'} title="نص"><Type className="w-4 h-4" /></Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 space-y-2">
        <Textarea placeholder="اكتب نصك هنا..." value={textValue} onChange={e => setTextValue(e.target.value)} rows={3} />
        <div className="flex items-center gap-2">
          <span className="text-xs">الحجم:</span>
          <Slider min={10} max={120} step={2} value={[textSize]} onValueChange={v => setTextSize(v[0]!)} />
        </div>
      </PopoverContent>
    </Popover>
  );

  // نمط المؤشر حسب الأداة
  const cursorClass = useMemo(() => {
    if (disabled) return 'cursor-not-allowed';
    if (tool === 'pan' || forcedPanRef.current) return 'cursor-grab';
    if (tool === 'text') return 'cursor-text';
    return 'cursor-crosshair';
  }, [tool, disabled, forcedPanRef]);

  return (
    <div ref={containerRef} className={cn('w-full h-full select-none flex flex-col gap-2', className)}>
      {/* شريط الأدوات */}
      <div className="p-2 rounded-2xl bg-white/75 dark:bg-slate-900/50 backdrop-blur shadow border border-border/50">
        {/* Desktop */}
        <div className="hidden md:flex md:flex-col md:gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <BrushesGroup />
            <ShapesGroup />
            <FillGroup />
            <TextGroup />

            <div className="flex items-center gap-2">
              <span className="text-xs">لون</span>
              <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-8 p-1 bg-transparent" aria-label="لون الفرشاة" />
            </div>

            <Button size="icon" aria-label="تحريك" variant={tool === 'pan' ? 'default' : 'secondary'} onClick={() => setTool('pan')} title="تحريك"><Hand className="w-4 h-4" /></Button>
            <Button size="icon" aria-label="قطّارة" variant={tool === 'eyedropper' ? 'default' : 'secondary'} onClick={() => setTool('eyedropper')} title="قطّارة"><Droplet className="w-4 h-4" /></Button>
            <Button size="icon" aria-label="شبكة" variant={showGrid ? 'default' : 'secondary'} onClick={() => setShowGrid(s => !s)} title="شبكة"><Grid className="w-4 h-4" /></Button>

            <div className="flex items-center gap-1">
              <Button size="icon" variant="secondary" onClick={() => setZoom(z => Math.max(0.25, z / 1.1))} title="تصغير"><ZoomOut className="w-4 h-4" /></Button>
              <Button size="icon" variant="secondary" onClick={() => setZoom(z => Math.min(6, z * 1.1))} title="تكبير"><ZoomIn className="w-4 h-4" /></Button>
              <Button size="icon" variant="secondary" onClick={resetView} title="إعادة ضبط"><RefreshCcw className="w-4 h-4" /></Button>
            </div>

            <Button size="icon" variant="secondary" onClick={undo} disabled={historyIndex <= 0} title="تراجع (Ctrl+Z)"><Undo2 className="w-4 h-4" /></Button>
            <Button size="icon" variant="secondary" onClick={redo} disabled={historyIndex >= history.length - 1} title="إعادة (Ctrl+Y)"><Redo2 className="w-4 h-4" /></Button>
            <Button size="icon" variant="secondary" onClick={clearAll} title="مسح الكل"><Trash2 className="w-4 h-4" /></Button>

            <input ref={inputFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files && importImage(e.target.files[0])} />
            <Button size="icon" variant="secondary" title="استيراد صورة" onClick={() => inputFileRef.current?.click()}><ImageIcon className="w-4 h-4" /></Button>

            <Button size="icon" variant="secondary" onClick={copyToClipboard} title="نسخ للصق"><CopyIcon className="w-4 h-4" /></Button>
            <Button size="icon" variant="secondary" onClick={downloadPng} title="حفظ كصورة"><Download className="w-4 h-4" /></Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" title="مساعدة"><HelpCircle className="w-4 h-4" /></Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 text-xs space-y-1">
                <p className="font-semibold">اختصارات سريعة</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Ctrl/Cmd + عجلة: تكبير/تصغير حول المؤشر</li>
                  <li>مسطرة (Space): تحريك مؤقت</li>
                  <li>Shift: قيود للأشكال/الخط</li>
                  <li>Ctrl/Cmd + Z / Shift+Z / Y: تراجع/إعادة</li>
                  <li>دبل-كليك على اللوحة: إعادة الضبط</li>
                </ul>
              </PopoverContent>
            </Popover>
          </div>

          {/* تحكم السماكة/الشفافية */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t mt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs">السماكة</span>
              <div className="w-28">
                <Slider min={1} max={60} step={1} value={[thickness]} onValueChange={v => setThickness(v[0]!)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs">الشفافية</span>
              <div className="w-28">
                <Slider min={0.1} max={1} step={0.05} value={[opacity]} onValueChange={v => setOpacity(v[0]!)} />
              </div>
            </div>
          </div>
        </div>

        {/* Mobile: collapsible */}
        <div className="md:hidden">
          <Collapsible>
            <div className="flex justify-between items-center">
              <p className="text-sm font-semibold">الأدوات</p>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">إظهار/إخفاء</Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="mt-2 pt-2 border-t">
              <div className="flex flex-col gap-3">
                {/* نعيد استخدام نفس المجموعات في الموبايل */}
                <div className="flex flex-wrap items-center gap-2">
                  <BrushesGroup />
                  <ShapesGroup />
                  <FillGroup />
                  <TextGroup />
                  <div className="flex items-center gap-2">
                    <span className="text-xs">لون</span>
                    <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-8 p-1 bg-transparent" aria-label="لون الفرشاة" />
                  </div>
                  <Button size="icon" aria-label="تحريك" variant={tool === 'pan' ? 'default' : 'secondary'} onClick={() => setTool('pan')} title="تحريك"><Hand className="w-4 h-4" /></Button>
                  <Button size="icon" aria-label="قطّارة" variant={tool === 'eyedropper' ? 'default' : 'secondary'} onClick={() => setTool('eyedropper')} title="قطّارة"><Droplet className="w-4 h-4" /></Button>
                  <Button size="icon" aria-label="شبكة" variant={showGrid ? 'default' : 'secondary'} onClick={() => setShowGrid(s => !s)} title="شبكة"><Grid className="w-4 h-4" /></Button>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="secondary" onClick={() => setZoom(z => Math.max(0.25, z / 1.1))} title="تصغير"><ZoomOut className="w-4 h-4" /></Button>
                    <Button size="icon" variant="secondary" onClick={() => setZoom(z => Math.min(6, z * 1.1))} title="تكبير"><ZoomIn className="w-4 h-4" /></Button>
                    <Button size="icon" variant="secondary" onClick={resetView} title="إعادة ضبط"><RefreshCcw className="w-4 h-4" /></Button>
                  </div>
                  <Button size="icon" variant="secondary" onClick={undo} disabled={historyIndex <= 0} title="تراجع (Ctrl+Z)"><Undo2 className="w-4 h-4" /></Button>
                  <Button size="icon" variant="secondary" onClick={redo} disabled={historyIndex >= history.length - 1} title="إعادة (Ctrl+Y)"><Redo2 className="w-4 h-4" /></Button>
                  <Button size="icon" variant="secondary" onClick={clearAll} title="مسح الكل"><Trash2 className="w-4 h-4" /></Button>
                  <input ref={inputFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files && importImage(e.target.files[0])} />
                  <Button size="icon" variant="secondary" title="استيراد صورة" onClick={() => inputFileRef.current?.click()}><ImageIcon className="w-4 h-4" /></Button>
                  <Button size="icon" variant="secondary" onClick={copyToClipboard} title="نسخ للصق"><CopyIcon className="w-4 h-4" /></Button>
                  <Button size="icon" variant="secondary" onClick={downloadPng} title="حفظ كصورة"><Download className="w-4 h-4" /></Button>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">السماكة</span>
                    <div className="w-28">
                      <Slider min={1} max={60} step={1} value={[thickness]} onValueChange={v => setThickness(v[0]!)} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs">الشفافية</span>
                    <div className="w-28">
                      <Slider min={0.1} max={1} step={0.05} value={[opacity]} onValueChange={v => setOpacity(v[0]!)} />
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* سطح الرسم + الشبكة */}
      <div
        className={cn(
          'relative w-full h-full rounded-xl overflow-hidden border bg-white flex-grow',
          disabled && 'pointer-events-none opacity-75',
          cursorClass
        )}
        style={{ backgroundImage: gridBg || undefined, touchAction: 'none' }}
        onWheel={onWheel}
        onDoubleClick={resetView}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        {/* كانفس العرض */}
        <canvas
          ref={displayRef}
          className="absolute inset-0 w-full h-full"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerCancelOrLeave}
          onPointerLeave={pointerCancelOrLeave}
        />
        {/* طبقة معاينة */}
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 w-full h-full" />
      </div>
    </div>
  );
}
