'use client';

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Pen,
  Eraser,
  Minus,
  Square,
  Circle,
  Undo2,
  Redo,
  Trash2,
  PaintBucket,
  Image as ImageIcon,
  Move,
  ZoomIn,
  ZoomOut,
  Triangle,
  SquareDashed,
  ArrowRight,
  Palette,
  ChevronDown,
} from 'lucide-react';

export type Tool =
  | 'pen'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'roundedRect'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'arrow'
  | 'fill'
  | 'image'
  | 'hand';

type Point = { x: number; y: number };

export interface DrawingCanvasRef {
  undo: () => void;
  redo: () => void;
  clearAll: () => void;
  getDrawingDataUrl: () => string | undefined;
  setTool: (t: Tool) => void;
  setZoom: (z: number) => void;
  resetView: () => void;
}

interface DrawingCanvasProps {
  className?: string;
  disabled?: boolean;
  onDrawEnd?: (dataUrl: string, historyState: { canUndo: boolean; canRedo: boolean }) => void;
  initialImage?: string | null;
}

/* ----------------------------- Utilities ----------------------------- */
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const withAlphaHex = (hex: string, alpha01: number) =>
  hex + Math.round(clamp(alpha01, 0, 1) * 255).toString(16).padStart(2, '0');

const PALETTE = [
  '#000000', '#1f2937', '#4b5563', '#9ca3af', '#ffffff',
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#22c55e', '#10b981', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  '#f43f5e', '#14b8a6', '#84cc16', '#65a30d',
  '#b45309', '#7c3aed', '#0ea5e9', '#0891b2',
];

/* ----------------------------- Component ----------------------------- */
const DrawingCanvas = React.forwardRef<DrawingCanvasRef, DrawingCanvasProps>(
  ({ className, disabled = false, onDrawEnd, initialImage = null }, ref) => {
    /* DOM refs */
    const wrapperRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<HTMLCanvasElement>(null);     // ما يُعرض للمستخدم
    const overlayRef = useRef<HTMLCanvasElement>(null);  // للمعاينة فقط (لا تُحفظ)
    const contentRef = useRef<HTMLCanvasElement | null>(null); // مخزن الرسم الحقيقي (خلف الكواليس)
    const fileInputRef = useRef<HTMLInputElement>(null);

    /* Sizes / DPR */
    const cssSizeRef = useRef({ w: 0, h: 0 });          // بالحجم CSS
    const dprRef = useRef<number>(1);                   // devicePixelRatio
    const boardSizeRef = useRef({ w: 0, h: 0 });        // مساحة اللوحة بالرسم (CSS units)

    /* View state (pan/zoom) */
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });

    /* Tooling state */
    const [tool, setTool] = useState<Tool>('pen');
    const [color, setColor] = useState<string>('#000000');
    const [thickness, setThickness] = useState<number>(5);
    const [opacity, setOpacity] = useState<number>(1);
    const [shapeMode, setShapeMode] = useState<'stroke' | 'fill' | 'both'>('stroke');

    const [fillTolerance, setFillTolerance] = useState<number>(24);
    const [showPalette, setShowPalette] = useState<boolean>(false);

    /* Drawing state */
    const isDrawingRef = useRef(false);
    const startWorldRef = useRef<Point | null>(null);
    const lastWorldRef = useRef<Point | null>(null);

    /* Placing image state */
    const [placingImage, setPlacingImage] = useState<{
      img: HTMLImageElement;
      x: number; y: number; w: number; h: number; dragging: boolean;
    } | null>(null);

    /* History */
    const [history, setHistory] = useState<string[]>([]);
    const idxRef = useRef(-1);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    /* --------------------------- Coord helpers --------------------------- */
    const screenToWorld = useCallback((p: Point): Point => {
      return { x: (p.x - offset.x) / scale, y: (p.y - offset.y) / scale };
    }, [offset, scale]);

    const clampToBoard = (p: Point): Point => {
      const { w, h } = boardSizeRef.current;
      return { x: clamp(p.x, 0, w), y: clamp(p.y, 0, h) };
    };

    const applyPanClamp = (nextScale: number, nextOffset: Point) => {
      // إبقاء اللوحة داخل الإطار
      const vw = cssSizeRef.current.w;
      const vh = cssSizeRef.current.h;
      const bw = boardSizeRef.current.w * nextScale;
      const bh = boardSizeRef.current.h * nextScale;

      const minX = Math.min(0, vw - bw);
      const maxX = Math.max(0, vw - bw) === 0 ? 0 : 0;
      const minY = Math.min(0, vh - bh);
      const maxY = Math.max(0, vh - bh) === 0 ? 0 : 0;

      // عندما تكون اللوحة أصغر من الإطار، نقوم بتوسيطها
      const cx = bw < vw ? (vw - bw) / 2 : clamp(nextOffset.x, minX, 0);
      const cy = bh < vh ? (vh - bh) / 2 : clamp(nextOffset.y, minY, 0);
      return { x: cx, y: cy };
    };

    /* ---------------------------- Canvas setup --------------------------- */
    const resizeAll = useCallback(() => {
      const wrap = wrapperRef.current;
      const view = viewRef.current;
      const overlay = overlayRef.current;
      if (!wrap || !view || !overlay) return;

      const { width, height } = wrap.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      dprRef.current = dpr;

      // سجل أحجام CSS
      cssSizeRef.current = { w: Math.floor(width), h: Math.floor(height) };
      boardSizeRef.current = { w: Math.floor(width), h: Math.floor(height) }; // اللوحة = مساحة الإطار

      // اضبط view و overlay بدقة عالية
      [view, overlay].forEach((c) => {
        c.width = Math.max(1, Math.floor(width * dpr));
        c.height = Math.max(1, Math.floor(height * dpr));
        c.style.width = `${Math.floor(width)}px`;
        c.style.height = `${Math.floor(height)}px`;
        const ctx = c.getContext('2d')!;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
      });

      // جهّز Canvas المحتوى (الخلفي)
      const old = contentRef.current;
      const newCan = document.createElement('canvas');
      newCan.width = Math.max(1, Math.floor(width * dpr));
      newCan.height = Math.max(1, Math.floor(height * dpr));
      const nctx = newCan.getContext('2d')!;
      // نرسم بالوحدات العالمية (CSS) عبر تكبير DPR
      nctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (old && old.width > 0 && old.height > 0) {
        // أعد التحجيم مع الحفاظ على المحتوى
        const octx = old.getContext('2d')!;
        const temp = new Image();
        temp.src = old.toDataURL('image/png');
        temp.onload = () => {
          // ارسم الصورة لتناسب مساحة اللوحة الجديدة (CSS)
          nctx.setTransform(1, 0, 0, 1, 0, 0);
          // ارسم بالبكسل، ثم أعد إعداد التحويل
          nctx.drawImage(temp, 0, 0, newCan.width, newCan.height);
          nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          contentRef.current = newCan;
          drawView();
        };
      } else {
        contentRef.current = newCan;
        drawView();
      }

      // أعِد ضبط العرض/الإزاحة كي لا تخرج اللوحة
      setOffset((o) => applyPanClamp(scale, o));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      resizeAll();
      const ro = new ResizeObserver(() => resizeAll());
      if (wrapperRef.current) ro.observe(wrapperRef.current);
      return () => ro.disconnect();
    }, [resizeAll]);

    /* ------------------------ Drawing / Rendering ------------------------ */
    const drawBoardFrame = (ctx: CanvasRenderingContext2D) => {
      // إطار داخلي واضح (لا يتأثر بالتكبير لأننا نرسمه في طبقة العرض)
      const dpr = dprRef.current;
      const { w, h } = cssSizeRef.current;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = '#e5e7eb';
      ctx.strokeRect(0.5 * dpr, 0.5 * dpr, w * dpr - 1 * dpr, h * dpr - 1 * dpr);
      ctx.restore();
    };

    const drawView = useCallback(() => {
      const view = viewRef.current;
      const content = contentRef.current;
      if (!view || !content) return;

      const vctx = view.getContext('2d')!;
      const dpr = dprRef.current;

      // امسح
      vctx.setTransform(1, 0, 0, 1, 0, 0);
      vctx.clearRect(0, 0, view.width, view.height);

      // طبّق التحويل (pan/zoom)
      vctx.setTransform(scale * dpr, 0, 0, scale * dpr, offset.x * dpr, offset.y * dpr);

      // ارسم محتوى اللوحة (مقاس CSS = content.width/dpr)
      vctx.drawImage(content, 0, 0, content.width / dpr, content.height / dpr);

      // إطار اللوحة
      drawBoardFrame(vctx);
    }, [offset.x, offset.y, scale]);

    const clearOverlay = () => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const octx = overlay.getContext('2d')!;
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, overlay.width, overlay.height);
    };

    const previewOnOverlay = (draw: (octx: CanvasRenderingContext2D) => void) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const octx = overlay.getContext('2d')!;
      const dpr = dprRef.current;
      clearOverlay();
      octx.setTransform(scale * dpr, 0, 0, scale * dpr, offset.x * dpr, offset.y * dpr);
      draw(octx);
    };

    const commitToContent = (draw: (cctx: CanvasRenderingContext2D) => void) => {
      const content = contentRef.current;
      if (!content) return;
      const dpr = dprRef.current;
      const cctx = content.getContext('2d')!;
      cctx.save();
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0); // نرسم بوحدات CSS
      // قصّ داخل حدود اللوحة
      cctx.beginPath();
      cctx.rect(0, 0, content.width / dpr, content.height / dpr);
      cctx.clip();
      draw(cctx);
      cctx.restore();
      drawView();
    };

    const pushHistory = useCallback(() => {
      const content = contentRef.current;
      if (!content) return;
      const dataUrl = content.toDataURL('image/png');
      setHistory((prev) => {
        const trimmed = prev.slice(0, idxRef.current + 1);
        const next = [...trimmed, dataUrl];
        idxRef.current = next.length - 1;
        setCanUndo(idxRef.current > 0);
        setCanRedo(false);
        onDrawEnd?.(dataUrl, { canUndo: idxRef.current > 0, canRedo: false });
        return next;
      });
    }, [onDrawEnd]);

    /* --------------------------- Initial image --------------------------- */
    useEffect(() => {
      if (!initialImage) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = initialImage;
      img.onload = () => {
        commitToContent((cctx) => {
          const { w, h } = boardSizeRef.current;
          cctx.clearRect(0, 0, w, h);
          const ratio = Math.min(w / img.width, h / img.height);
          const iw = img.width * ratio;
          const ih = img.height * ratio;
          cctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
        });
        pushHistory();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialImage]);

    /* ---------------------------- Pointer logic -------------------------- */
    const getLocalPoint = (e: React.PointerEvent): Point => {
      const rect = overlayRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handlePointerDown = (e: React.PointerEvent) => {
      if (disabled || e.button !== 0) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      const p = getLocalPoint(e);
      const world = clampToBoard(screenToWorld(p));

      if (tool === 'hand') {
        isDrawingRef.current = true;
        lastWorldRef.current = world; // نستخدم screen delta لاحقًا
        startWorldRef.current = null;
        return;
      }

      if (tool === 'image' && placingImage) {
        setPlacingImage((x) => (x ? { ...x, dragging: true } : x));
        return;
      }

      if (tool === 'fill') {
        floodFill(world);
        pushHistory();
        return;
      }

      isDrawingRef.current = true;
      startWorldRef.current = world;
      lastWorldRef.current = world;

      if (tool === 'pen' || tool === 'eraser') {
        commitToContent((cctx) => {
          cctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
          cctx.globalAlpha = opacity;
          cctx.strokeStyle = tool === 'eraser' ? '#000000' : color;
          cctx.lineWidth = thickness;
          cctx.lineCap = 'round';
          cctx.lineJoin = 'round';
          cctx.beginPath();
          cctx.moveTo(world.x, world.y);
        });
      }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      const p = getLocalPoint(e);
      const world = clampToBoard(screenToWorld(p));

      if (tool === 'hand' && isDrawingRef.current && lastWorldRef.current) {
        // نستخدم delta بالشاشة (أسهل للتمرير)
        const rect = overlayRef.current!.getBoundingClientRect();
        const prevScreen = {
          x: (lastWorldRef.current.x * scale + offset.x),
          y: (lastWorldRef.current.y * scale + offset.y),
        };
        const currScreen = { x: p.x, y: p.y };
        const delta = { x: currScreen.x - prevScreen.x, y: currScreen.y - prevScreen.y };
        const nextOffset = applyPanClamp(scale, { x: offset.x + delta.x, y: offset.y + delta.y });
        setOffset(nextOffset);
        drawView();
        return;
      }

      if (!isDrawingRef.current || !startWorldRef.current) return;

      if (tool === 'pen' || tool === 'eraser') {
        const from = lastWorldRef.current!;
        const to = world;
        commitToContent((cctx) => {
          cctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
          cctx.globalAlpha = opacity;
          cctx.strokeStyle = tool === 'eraser' ? '#000000' : color;
          cctx.lineWidth = thickness;
          cctx.lineCap = 'round';
          cctx.lineJoin = 'round';
          cctx.beginPath();
          cctx.moveTo(from.x, from.y);
          cctx.lineTo(to.x, to.y);
          cctx.stroke();
          cctx.globalCompositeOperation = 'source-over';
          cctx.globalAlpha = 1;
        });
        lastWorldRef.current = to;
        return;
      }

      // معاينة الأشكال بدون تكرار: نستخدم overlay ونمسحه كل مرة
      const s = startWorldRef.current!;
      const eW = world;
      previewOnOverlay((o) => {
        o.lineCap = 'round';
        o.lineJoin = 'round';
        o.strokeStyle = withAlphaHex(color, opacity);
        o.fillStyle = withAlphaHex(color, opacity);
        o.lineWidth = thickness / scale; // سماكة ثابتة على الشاشة

        if (tool === 'line') {
          o.beginPath(); o.moveTo(s.x, s.y); o.lineTo(eW.x, eW.y); o.stroke();
        } else if (tool === 'rect') {
          if (shapeMode !== 'fill') o.strokeRect(s.x, s.y, eW.x - s.x, eW.y - s.y);
          if (shapeMode !== 'stroke') o.fillRect(s.x, s.y, eW.x - s.x, eW.y - s.y);
        } else if (tool === 'roundedRect') {
          const r = 12 / scale;
          const x = Math.min(s.x, eW.x), y = Math.min(s.y, eW.y);
          const w = Math.abs(eW.x - s.x), h = Math.abs(eW.y - s.y);
          o.beginPath();
          o.moveTo(x + r, y);
          o.lineTo(x + w - r, y);
          o.quadraticCurveTo(x + w, y, x + w, y + r);
          o.lineTo(x + w, y + h - r);
          o.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
          o.lineTo(x + r, y + h);
          o.quadraticCurveTo(x, y + h, x, y + h - r);
          o.lineTo(x, y + r);
          o.quadraticCurveTo(x, y, x + r, y);
          if (shapeMode !== 'fill') o.stroke();
          if (shapeMode !== 'stroke') o.fill();
        } else if (tool === 'circle' || tool === 'ellipse') {
          const rx = Math.abs(eW.x - s.x) / 2;
          const ry = tool === 'circle' ? rx : Math.abs(eW.y - s.y) / 2;
          const cx = (s.x + eW.x) / 2;
          const cy = (s.y + eW.y) / 2;
          o.beginPath();
          o.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          if (shapeMode !== 'fill') o.stroke();
          if (shapeMode !== 'stroke') o.fill();
        } else if (tool === 'triangle') {
          const cx = (s.x + eW.x) / 2;
          o.beginPath();
          o.moveTo(cx, s.y); o.lineTo(eW.x, eW.y); o.lineTo(s.x, eW.y); o.closePath();
          if (shapeMode !== 'fill') o.stroke();
          if (shapeMode !== 'stroke') o.fill();
        } else if (tool === 'arrow') {
          const head = 12 / scale;
          const ang = Math.atan2(eW.y - s.y, eW.x - s.x);
          const hx = Math.cos(ang) * head, hy = Math.sin(ang) * head;
          o.beginPath(); o.moveTo(s.x, s.y); o.lineTo(eW.x, eW.y); o.stroke();
          o.beginPath();
          o.moveTo(eW.x, eW.y);
          o.lineTo(eW.x - hx + hy / 2, eW.y - hy - hx / 2);
          o.lineTo(eW.x - hx - hy / 2, eW.y - hy + hx / 2);
          o.closePath();
          if (shapeMode !== 'stroke') o.fill();
          if (shapeMode !== 'fill') o.stroke();
        }
      });
      lastWorldRef.current = world;
    };

    const handlePointerUp = (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

      if (tool === 'hand') {
        isDrawingRef.current = false;
        return;
      }

      if (tool === 'image' && placingImage?.dragging) {
        setPlacingImage((img) => (img ? { ...img, dragging: false } : img));
        return;
      }

      if (!isDrawingRef.current || !startWorldRef.current) return;

      const s = startWorldRef.current;
      const eW = lastWorldRef.current ?? s;

      // مسح المعاينة
      clearOverlay();

      if (tool === 'pen' || tool === 'eraser') {
        pushHistory();
      } else if (tool !== 'fill' && tool !== 'image') {
        // ثبّت الشكل لمرة واحدة فقط (لا تكرار)
        commitToContent((c) => {
          c.globalAlpha = opacity;
          c.strokeStyle = color;
          c.fillStyle = color;
          c.lineWidth = thickness;
          c.lineCap = 'round';
          c.lineJoin = 'round';
          if (tool === 'line') {
            c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(eW.x, eW.y); c.stroke();
          } else if (tool === 'rect') {
            if (shapeMode !== 'fill') c.strokeRect(s.x, s.y, eW.x - s.x, eW.y - s.y);
            if (shapeMode !== 'stroke') c.fillRect(s.x, s.y, eW.x - s.x, eW.y - s.y);
          } else if (tool === 'roundedRect') {
            const r = 12;
            const x = Math.min(s.x, eW.x), y = Math.min(s.y, eW.y);
            const w = Math.abs(eW.x - s.x), h = Math.abs(eW.y - s.y);
            c.beginPath();
            c.moveTo(x + r, y);
            c.lineTo(x + w - r, y);
            c.quadraticCurveTo(x + w, y, x + w, y + r);
            c.lineTo(x + w, y + h - r);
            c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            c.lineTo(x + r, y + h);
            c.quadraticCurveTo(x, y + h, x, y + h - r);
            c.lineTo(x, y + r);
            c.quadraticCurveTo(x, y, x + r, y);
            if (shapeMode !== 'fill') c.stroke();
            if (shapeMode !== 'stroke') c.fill();
          } else if (tool === 'circle' || tool === 'ellipse') {
            const rx = Math.abs(eW.x - s.x) / 2;
            const ry = tool === 'circle' ? rx : Math.abs(eW.y - s.y) / 2;
            const cx = (s.x + eW.x) / 2;
            const cy = (s.y + eW.y) / 2;
            c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            if (shapeMode !== 'fill') c.stroke();
            if (shapeMode !== 'stroke') c.fill();
          } else if (tool === 'triangle') {
            const cx = (s.x + eW.x) / 2;
            c.beginPath(); c.moveTo(cx, s.y); c.lineTo(eW.x, eW.y); c.lineTo(s.x, eW.y); c.closePath();
            if (shapeMode !== 'fill') c.stroke();
            if (shapeMode !== 'stroke') c.fill();
          } else if (tool === 'arrow') {
            c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(eW.x, eW.y); c.stroke();
            const head = 12;
            const ang = Math.atan2(eW.y - s.y, eW.x - s.x);
            const hx = Math.cos(ang) * head, hy = Math.sin(ang) * head;
            c.beginPath();
            c.moveTo(eW.x, eW.y);
            c.lineTo(eW.x - hx + hy / 2, eW.y - hy - hx / 2);
            c.lineTo(eW.x - hx - hy / 2, eW.y - hy + hx / 2);
            c.closePath();
            if (shapeMode !== 'stroke') c.fill();
            if (shapeMode !== 'fill') c.stroke();
          }
          c.globalAlpha = 1;
        });
        pushHistory();
      }

      isDrawingRef.current = false;
      startWorldRef.current = null;
      lastWorldRef.current = null;
    };

    /* ------------------------------- Wheel/Pan ------------------------------ */
    const handleWheel = (e: React.WheelEvent) => {
      if (disabled) return;
      const rect = overlayRef.current!.getBoundingClientRect();
      const pScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      // حساسية متّزنة حسب deltaMode
      const PIXELS_PER_LINE = 16;
      const PIXELS_PER_PAGE = rect.height;
      const scaleDelta =
        e.deltaMode === 1 ? PIXELS_PER_LINE : e.deltaMode === 2 ? PIXELS_PER_PAGE : 1;

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const direction = e.deltaY > 0 ? -1 : 1;
        const factor = 1 + direction * 0.12 * (scaleDelta / 100);
        const newScale = clamp(scale * factor, 0.25, 8);

        // تكبير حول نقطة المؤشر
        const world = screenToWorld(pScreen);
        const pre = { x: world.x * newScale + offset.x, y: world.y * newScale + offset.y };
        const nextOffset = applyPanClamp(newScale, {
          x: pScreen.x - (pre.x - offset.x),
          y: pScreen.y - (pre.y - offset.y),
        });

        setScale(newScale);
        setOffset(nextOffset);
        clearOverlay();
        drawView();
      } else {
        // تمرير/سحب
        e.preventDefault();
        const dx = -e.deltaX * (scaleDelta === 1 ? 1 : scaleDelta / 100);
        const dy = -e.deltaY * (scaleDelta === 1 ? 1 : scaleDelta / 100);
        const nextOffset = applyPanClamp(scale, { x: offset.x + dx, y: offset.y + dy });
        setOffset(nextOffset);
        clearOverlay();
        drawView();
      }
    };

    /* ------------------------------ Image place ----------------------------- */
    const triggerImagePicker = () => fileInputRef.current?.click();
    const handleFile = (f: File) => {
      if (!f) return;
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        const { w, h } = boardSizeRef.current;
        const maxW = w * 0.6;
        const maxH = h * 0.6;
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        const iw = img.width * ratio, ih = img.height * ratio;
        setPlacingImage({ img, x: (w - iw) / 2, y: (h - ih) / 2, w: iw, h: ih, dragging: false });
        setTool('image');
        URL.revokeObjectURL(url);
        drawView();
        previewOnOverlay((o) => {
          o.globalAlpha = 0.9;
          o.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
          o.globalAlpha = 1;
        });
      };
      img.src = url;
    };

    const commitPlacedImage = () => {
      if (!placingImage) return;
      commitToContent((c) => c.drawImage(placingImage.img, placingImage.x, placingImage.y, placingImage.w, placingImage.h));
      setPlacingImage(null);
      clearOverlay();
      pushHistory();
    };

    const cancelPlacedImage = () => {
      setPlacingImage(null);
      clearOverlay();
    };

    /* ------------------------------- Flood fill ----------------------------- */
    const floodFill = (world: Point) => {
      const content = contentRef.current;
      if (!content) return;
      const dpr = dprRef.current;
      const cctx = content.getContext('2d')!;

      const px = Math.floor(world.x * dpr);
      const py = Math.floor(world.y * dpr);

      const W = content.width;
      const H = content.height;
      if (px < 0 || py < 0 || px >= W || py >= H) return;

      const img = cctx.getImageData(0, 0, W, H);
      const data = img.data;

      const idx = (x: number, y: number) => (y * W + x) * 4;
      const s = idx(px, py);
      const sr = data[s], sg = data[s + 1], sb = data[s + 2], sa = data[s + 3];

      const rgb = color.replace('#', '');
      const r = parseInt(rgb.slice(0, 2), 16);
      const g = parseInt(rgb.slice(2, 4), 16);
      const b = parseInt(rgb.slice(4, 6), 16);
      const a = Math.round(opacity * 255);

      const tol = clamp(fillTolerance, 0, 255);
      const match = (x: number, y: number) => {
        const i = idx(x, y);
        return Math.abs(data[i] - sr) <= tol &&
               Math.abs(data[i + 1] - sg) <= tol &&
               Math.abs(data[i + 2] - sb) <= tol &&
               Math.abs(data[i + 3] - sa) <= tol;
      };

      const stack: [number, number][] = [[px, py]];
      while (stack.length) {
        const [x0, y0] = stack.pop()!;
        let xl = x0;
        while (xl >= 0 && match(xl, y0)) xl--;
        xl++;
        let xr = x0;
        while (xr < W && match(xr, y0)) xr++;
        for (let x = xl; x < xr; x++) {
          const i = idx(x, y0);
          data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
        }
        const yUp = y0 - 1, yDn = y0 + 1;
        if (yUp >= 0) {
          let x = xl;
          while (x < xr) {
            let inSpan = false;
            while (x < xr && match(x, yUp)) { inSpan = true; x++; }
            if (inSpan) stack.push([x - 1, yUp]);
            while (x < xr && !match(x, yUp)) x++;
          }
        }
        if (yDn < H) {
          let x = xl;
          while (x < xr) {
            let inSpan = false;
            while (x < xr && match(x, yDn)) { inSpan = true; x++; }
            if (inSpan) stack.push([x - 1, yDn]);
            while (x < xr && !match(x, yDn)) x++;
          }
        }
      }

      cctx.putImageData(img, 0, 0);
      drawView();
    };

    /* ------------------------------- Commands ------------------------------ */
    const doUndo = () => {
      if (idxRef.current <= 0) return;
      const i = idxRef.current - 1;
      const img = new Image();
      img.src = history[i]!;
      img.onload = () => {
        commitToContent((c) => {
          const { w, h } = boardSizeRef.current;
          c.clearRect(0, 0, w, h);
          c.drawImage(img, 0, 0, w, h);
        });
        idxRef.current = i;
        setCanUndo(i > 0);
        setCanRedo(true);
        onDrawEnd?.(history[i]!, { canUndo: i > 0, canRedo: true });
      };
    };

    const doRedo = () => {
      if (idxRef.current >= history.length - 1) return;
      const i = idxRef.current + 1;
      const img = new Image();
      img.src = history[i]!;
      img.onload = () => {
        commitToContent((c) => {
          const { w, h } = boardSizeRef.current;
          c.clearRect(0, 0, w, h);
          c.drawImage(img, 0, 0, w, h);
        });
        idxRef.current = i;
        setCanUndo(true);
        setCanRedo(i < history.length - 1);
        onDrawEnd?.(history[i]!, { canUndo: true, canRedo: i < history.length - 1 });
      };
    };

    const doClear = () => {
      commitToContent((c) => {
        const { w, h } = boardSizeRef.current;
        c.clearRect(0, 0, w, h);
      });
      pushHistory();
    };

    const getDataUrl = () => contentRef.current?.toDataURL('image/png');

    const resetView = () => {
      const nextOffset = applyPanClamp(1, { x: 0, y: 0 });
      setScale(1);
      setOffset(nextOffset);
      drawView();
    };

    useImperativeHandle(ref, () => ({
      undo: doUndo,
      redo: doRedo,
      clearAll: doClear,
      getDrawingDataUrl: getDataUrl,
      setTool: (t: Tool) => setTool(t),
      setZoom: (z: number) => {
        const nz = clamp(z, 0.25, 8);
        const nextOffset = applyPanClamp(nz, offset);
        setScale(nz);
        setOffset(nextOffset);
        drawView();
      },
      resetView,
    }));

    /* -------------------------------- Render ------------------------------- */
    return (
      <div className={cn('flex h-[70vh] min-h-[360px] w-full flex-col gap-2', className)}>
        {/* منطقة اللوحة */}
        <div
          ref={wrapperRef}
          className="relative flex-1 min-h-0 w-full overflow-hidden rounded-lg border bg-white"
        >
          {/* Canvas العرض */}
          <canvas
            ref={viewRef}
            className={cn('absolute inset-0 block h-full w-full touch-none', disabled && 'pointer-events-none opacity-60')}
          />
          {/* Canvas المعاينة */}
          <canvas
            ref={overlayRef}
            className={cn('absolute inset-0 block h-full w-full touch-none', disabled && 'pointer-events-none')}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          />

          {/* التحكم في وضع الصورة */}
          {placingImage && (
            <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-xl bg-background/90 p-2 shadow">
              <Button size="sm" variant="secondary" onClick={commitPlacedImage}>تثبيت الصورة</Button>
              <Button size="sm" variant="outline" onClick={cancelPlacedImage}>إلغاء</Button>
            </div>
          )}
        </div>

        {/* الشريط السفلي */}
        <div className="w-full flex-shrink-0 rounded-lg border bg-background/70 p-2 backdrop-blur-sm">
          <div className="flex flex-col gap-2">
            {/* صف الأدوات */}
            <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {[
                { t: 'pen', I: Pen, label: 'قلم' },
                { t: 'eraser', I: Eraser, label: 'ممحاة' },
                { t: 'line', I: Minus, label: 'خط' },
                { t: 'rect', I: Square, label: 'مستطيل' },
                { t: 'roundedRect', I: SquareDashed, label: 'مستطيل مستدير' },
                { t: 'circle', I: Circle, label: 'دائرة' },
                { t: 'ellipse', I: Circle, label: 'بيضاوي' },
                { t: 'triangle', I: Triangle, label: 'مثلث' },
                { t: 'arrow', I: ArrowRight, label: 'سهم' },
                { t: 'fill', I: PaintBucket, label: 'تعبئة' },
                { t: 'image', I: ImageIcon, label: 'صورة' },
                { t: 'hand', I: Move, label: 'تحريك/تكبير' },
              ].map(({ t, I, label }) => (
                <Button
                  key={t}
                  title={label}
                  variant={tool === (t as Tool) ? 'secondary' : 'outline'}
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    if (t === 'image') {
                      fileInputRef.current?.click();
                    }
                    setTool(t as Tool);
                    clearOverlay();
                  }}
                >
                  <I />
                </Button>
              ))}

              <div className="h-8 w-px bg-border" />

              <Button variant="outline" size="icon" onClick={doUndo} disabled={!canUndo}><Undo2 /></Button>
              <Button variant="outline" size="icon" onClick={doRedo} disabled={!canRedo}><Redo /></Button>
              <Button variant="destructive" size="icon" onClick={doClear}><Trash2 /></Button>

              <div className="ms-auto flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const nz = clamp(scale * 0.9, 0.25, 8);
                    const nextOffset = applyPanClamp(nz, offset);
                    setScale(nz); setOffset(nextOffset); clearOverlay(); drawView();
                  }}
                ><ZoomOut /></Button>
                <div className="min-w-[60px] text-center text-sm tabular-nums">{Math.round(scale * 100)}%</div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const nz = clamp(scale * 1.1, 0.25, 8);
                    const nextOffset = applyPanClamp(nz, offset);
                    setScale(nz); setOffset(nextOffset); clearOverlay(); drawView();
                  }}
                ><ZoomIn /></Button>
                <Button variant="outline" size="sm" onClick={resetView} className="ms-1">تصفير العرض</Button>
              </div>
            </div>

            {/* صف الإعدادات */}
            <div className="grid grid-cols-1 gap-3 px-1 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-center gap-3">
                <Label className="whitespace-nowrap">السماكة</Label>
                <Slider value={[thickness]} onValueChange={([v]) => setThickness(v)} max={50} step={1} className="max-w-sm" />
                <div className="w-10 text-center text-sm">{thickness}</div>
              </div>

              <div className="flex items-center gap-3">
                <Label className="whitespace-nowrap">العتامة</Label>
                <Slider value={[Math.round(opacity * 100)]} onValueChange={([v]) => setOpacity(v / 100)} max={100} step={1} className="max-w-sm" />
                <div className="w-10 text-center text-sm">{Math.round(opacity * 100)}%</div>
              </div>

              {['rect', 'roundedRect', 'circle', 'ellipse', 'triangle', 'arrow'].includes(tool) && (
                <div className="flex items-center gap-2">
                  <Label className="whitespace-nowrap">نمط الشكل</Label>
                  <div className="flex rounded-xl border p-1">
                    <Button size="sm" variant={shapeMode === 'stroke' ? 'secondary' : 'ghost'} onClick={() => setShapeMode('stroke')}>حدود</Button>
                    <Button size="sm" variant={shapeMode === 'fill' ? 'secondary' : 'ghost'} onClick={() => setShapeMode('fill')}>تعبئة</Button>
                    <Button size="sm" variant={shapeMode === 'both' ? 'secondary' : 'ghost'} onClick={() => setShapeMode('both')}>كلاهما</Button>
                  </div>
                </div>
              )}

              {/* لوحة الألوان (منبثقة) */}
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap">اللون</Label>
                <Button variant="outline" size="sm" onClick={() => setShowPalette((s) => !s)}>
                  <Palette className="me-2" /> افتح اللوحة <ChevronDown className="ms-2" />
                </Button>
                {showPalette && (
                  <div className="z-20 max-w-[650px] rounded-xl border bg-white p-3 shadow-lg">
                    <div className="grid grid-cols-12 gap-2">
                      {PALETTE.map((c) => (
                        <button
                          key={c}
                          title={c}
                          onClick={() => setColor(c)}
                          className={cn('h-6 w-6 rounded-full border', color === c ? 'border-primary ring-2 ring-primary/50' : 'border-gray-200')}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 p-1" />
                      <Input type="text" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-28" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ملف الصورة المخفي */}
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.currentTarget.value = '';
              }}
            />
          </div>
        </div>
      </div>
    );
  }
);

DrawingCanvas.displayName = 'DrawingCanvas';
export default DrawingCanvas;
