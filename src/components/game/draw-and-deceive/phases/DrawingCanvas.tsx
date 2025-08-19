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
  Type,
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
    const overlayRef = useRef<HTMLCanvasElement>(null);  // للمعاينة فقط
    const contentRef = useRef<HTMLCanvasElement | null>(null); // الرسم الحقيقي
    const fileInputRef = useRef<HTMLInputElement>(null);

    const paletteWrapRef = useRef<HTMLDivElement>(null);
    const shapesWrapRef = useRef<HTMLDivElement>(null);

    /* Sizes / DPR */
    const cssSizeRef = useRef({ w: 0, h: 0 });
    const dprRef = useRef<number>(1);
    const boardSizeRef = useRef({ w: 0, h: 0 });

    /* View state (pan/zoom) */
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });

    /* Tools state */
    const [tool, setTool] = useState<Tool>('pen');
    const [color, setColor] = useState<string>('#000000');
    const [thickness, setThickness] = useState<number>(5);
    const [opacity, setOpacity] = useState<number>(1);
    const [shapeMode, setShapeMode] = useState<'stroke' | 'fill' | 'both'>('stroke');
    const cycleShapeMode = () =>
      setShapeMode((m) => (m === 'stroke' ? 'fill' : m === 'fill' ? 'both' : 'stroke'));

    const [fillTolerance, setFillTolerance] = useState<number>(24);
    const [showPalette, setShowPalette] = useState<boolean>(false);
    const [showShapes, setShowShapes] = useState<boolean>(false);

    /* Drawing state */
    const isDrawingRef = useRef(false);
    const startWorldRef = useRef<Point | null>(null);
    const lastWorldRef = useRef<Point | null>(null);
    const movedRef = useRef<boolean>(false); // لمعالجة “نقرة بدون حركة”

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
      const minY = Math.min(0, vh - bh);

      // إذا كانت اللوحة أصغر من الإطار، نوسّطها
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

      cssSizeRef.current = { w: Math.floor(width), h: Math.floor(height) };
      boardSizeRef.current = { w: Math.floor(width), h: Math.floor(height) };

      [view, overlay].forEach((c) => {
        c.width = Math.max(1, Math.floor(width * dpr));
        c.height = Math.max(1, Math.floor(height * dpr));
        c.style.width = `${Math.floor(width)}px`;
        c.style.height = `${Math.floor(height)}px`;
        const ctx = c.getContext('2d')!;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
      });

      // Canvas المحتوى (خلفي) بوحدات CSS عبر مقياس DPR
      const old = contentRef.current;
      const newCan = document.createElement('canvas');
      newCan.width = Math.max(1, Math.floor(width * dpr));
      newCan.height = Math.max(1, Math.floor(height * dpr));
      const nctx = newCan.getContext('2d')!;
      nctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (old && old.width > 0 && old.height > 0) {
        // نسخ آمن للمحتوى السابق
        const temp = new Image();
        temp.src = old.toDataURL('image/png');
        temp.onload = () => {
          nctx.setTransform(1, 0, 0, 1, 0, 0);
          nctx.drawImage(temp, 0, 0, newCan.width, newCan.height);
          nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          contentRef.current = newCan;
          drawView();
        };
      } else {
        contentRef.current = newCan;
        drawView();
      }

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

      vctx.setTransform(1, 0, 0, 1, 0, 0);
      vctx.clearRect(0, 0, view.width, view.height);

      vctx.setTransform(scale * dpr, 0, 0, scale * dpr, offset.x * dpr, offset.y * dpr);
      vctx.drawImage(content, 0, 0, content.width / dpr, content.height / dpr);

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
      cctx.beginPath();
      cctx.rect(0, 0, content.width / dpr, content.height / dpr);
      cctx.clip(); // ممنوع الخروج خارج اللوحة
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
        lastWorldRef.current = world;
        startWorldRef.current = null;
        movedRef.current = false;
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
      movedRef.current = false;

      if (tool === 'pen' || tool === 'eraser') {
        // افتح مسار للرسم المتصل
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
        // حرّك الشاشة بمقدار الفارق البصري
        const prevScreen = {
          x: lastWorldRef.current.x * scale + offset.x,
          y: lastWorldRef.current.y * scale + offset.y,
        };
        const delta = { x: p.x - prevScreen.x, y: p.y - prevScreen.y };
        const nextOffset = applyPanClamp(scale, { x: offset.x + delta.x, y: offset.y + delta.y });
        setOffset(nextOffset);
        drawView();
        return;
      }

      if (!isDrawingRef.current || !startWorldRef.current) return;

      if (tool === 'pen' || tool === 'eraser') {
        const from = lastWorldRef.current!;
        const to = world;
        if (from.x !== to.x || from.y !== to.y) movedRef.current = true;
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

      // معاينة للأشكال على overlay
      const s = startWorldRef.current!;
      const eW = world;
      if (s.x !== eW.x || s.y !== eW.y) movedRef.current = true;

      previewOnOverlay((o) => {
        o.lineCap = 'round';
        o.lineJoin = 'round';
        o.strokeStyle = withAlphaHex(color, opacity);
        o.fillStyle = withAlphaHex(color, opacity);
        o.lineWidth = Math.max(1, thickness / scale);

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

      clearOverlay();

      if (tool === 'pen' || tool === 'eraser') {
        // في حالة نقرة بلا حركة: ارسم نقطة لا تختفي
        if (!movedRef.current) {
          commitToContent((c) => {
            c.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
            c.globalAlpha = opacity;
            c.fillStyle = tool === 'eraser' ? '#000000' : color;
            c.beginPath();
            c.arc(s.x, s.y, Math.max(1, thickness / 2), 0, Math.PI * 2);
            c.fill();
            c.globalCompositeOperation = 'source-over';
            c.globalAlpha = 1;
          });
        }
        pushHistory();
      } else if (tool !== 'fill' && tool !== 'image') {
        // ثبّت الشكل لمرة واحدة فقط
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
      movedRef.current = false;
    };

    /* ------------------------------- Wheel/Pan ------------------------------ */
    const handleWheel = (e: React.WheelEvent) => {
      if (disabled) return;
      const rect = overlayRef.current!.getBoundingClientRect();
      const pScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      const PIXELS_PER_LINE = 16;
      const PIXELS_PER_PAGE = rect.height;
      const scaleDelta =
        e.deltaMode === 1 ? PIXELS_PER_LINE : e.deltaMode === 2 ? PIXELS_PER_PAGE : 1;

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const direction = e.deltaY > 0 ? -1 : 1;
        const factor = 1 + direction * 0.12 * (scaleDelta / 100);
        const newScale = clamp(scale * factor, 0.25, 8);

        // تكبير حول مؤشر الفأرة
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
        // تمرير
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

    /* ----------------------- Close popovers on outside ---------------------- */
    useEffect(() => {
      const handler = (e: MouseEvent) => {
        const node = e.target as Node;
        if (showPalette && paletteWrapRef.current && !paletteWrapRef.current.contains(node)) {
          setShowPalette(false);
        }
        if (showShapes && shapesWrapRef.current && !shapesWrapRef.current.contains(node)) {
          setShowShapes(false);
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [showPalette, showShapes]);

    /* -------------------------------- Render ------------------------------- */
    return (
      <div className={cn('relative h-[78vh] min-h-[360px] w-full', className)}>
        {/* منطقة اللوحة */}
        <div
          ref={wrapperRef}
          className="relative h-full w-full overflow-hidden rounded-lg border bg-white"
        >
          {/* Canvas العرض */}
          <canvas
            ref={viewRef}
            className={cn('absolute inset-0 z-0 block h-full w-full touch-none', disabled && 'pointer-events-none opacity-60')}
          />
          {/* Canvas المعاينة */}
          <canvas
            ref={overlayRef}
            className={cn('absolute inset-0 z-10 block h-full w-full touch-none', disabled && 'pointer-events-none')}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          />

          {/* شريط أدوات عائم بصفّين، مثبت أعلى اليمين */}
          <div
            className="
              pointer-events-auto absolute right-2 top-2 z-30
              grid grid-rows-2 grid-flow-col auto-cols-max justify-end
              gap-1 rounded-2xl border bg-background/90 p-1 shadow backdrop-blur-sm
              max-w-[calc(100%-1rem)] overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden
            "
          >
            {/* سماكة + شفافية في بداية الصف من اليمين */}
            <div className="flex items-center gap-1 rounded-xl border bg-white/70 px-2 py-1">
              <Minus className="h-4 w-4 opacity-70" />
              <div className="w-24">
                <Slider value={[thickness]} onValueChange={([v]) => setThickness(v)} max={50} step={1} />
              </div>
              <div className="w-8 text-center text-xs tabular-nums">{thickness}</div>
            </div>

            <div className="flex items-center gap-1 rounded-xl border bg-white/70 px-2 py-1">
              <Circle className="h-4 w-4 opacity-70" />
              <div className="w-24">
                <Slider value={[Math.round(opacity * 100)]} onValueChange={([v]) => setOpacity(v / 100)} max={100} step={1} />
              </div>
              <div className="w-10 text-center text-xs">{Math.round(opacity * 100)}%</div>
            </div>

            {/* لون + لوحة منسدلة */}
            <div ref={paletteWrapRef} className="relative">
              <button
                title="اختر اللون"
                onClick={() => setShowPalette((s) => !s)}
                className="h-8 w-8 rounded-full border"
                style={{ backgroundColor: color }}
              />
              {showPalette && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-[60] rounded-xl border bg-white p-3 shadow-lg">
                  <div className="grid grid-cols-12 gap-2 max-w-[72vw] sm:max-w-[520px]">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        title={c}
                        onClick={() => {
                          setColor(c);
                          setShowPalette(false); // يغلق تلقائيًا بعد الاختيار
                        }}
                        className={cn('h-6 w-6 rounded-full border', color === c ? 'border-primary ring-2 ring-primary/50' : 'border-gray-200')}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      type="color"
                      value={color}
                      onChange={(e) => {
                        setColor(e.target.value);
                        setShowPalette(false);
                      }}
                      className="h-9 w-14 p-1"
                    />
                    <Input
                      type="text"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      onBlur={() => setShowPalette(false)}
                      className="h-9 w-28"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* نمط الشكل حدود/تعبئة/كلاهما */}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={cycleShapeMode}
              title={`نمط الشكل: ${shapeMode === 'stroke' ? 'حدود' : shapeMode === 'fill' ? 'تعبئة' : 'كلاهما'}`}
            >
              <Type className="h-4 w-4" />
            </Button>

            <div className="mx-1 h-5 w-px self-center bg-border" />

            {/* أدوات رئيسية */}
            <Button
              key="pen"
              title="قلم"
              variant={tool === 'pen' ? 'secondary' : 'outline'}
              size="icon"
              className="h-8 w-8"
              onClick={() => { setTool('pen'); clearOverlay(); }}
            >
              <Pen className="h-4 w-4" />
            </Button>

            <Button
              key="eraser"
              title="ممحاة"
              variant={tool === 'eraser' ? 'secondary' : 'outline'}
              size="icon"
              className="h-8 w-8"
              onClick={() => { setTool('eraser'); clearOverlay(); }}
            >
              <Eraser className="h-4 w-4" />
            </Button>

            {/* مجموعة الأشكال المنسدلة عموديًا */}
            <div ref={shapesWrapRef} className="relative">
              <Button
                title="أشكال"
                variant={['line','rect','roundedRect','circle','ellipse','triangle','arrow'].includes(tool) ? 'secondary' : 'outline'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowShapes((s) => !s)}
              >
                <SquareDashed className="h-4 w-4" />
              </Button>
              {showShapes && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-[60] flex flex-col gap-1 rounded-xl border bg-white p-2 shadow-lg">
                  {([
                    { t: 'line', I: Minus, label: 'خط' },
                    { t: 'rect', I: Square, label: 'مستطيل' },
                    { t: 'roundedRect', I: SquareDashed, label: 'مستطيل مستدير' },
                    { t: 'circle', I: Circle, label: 'دائرة' },
                    { t: 'ellipse', I: Circle, label: 'بيضاوي' },
                    { t: 'triangle', I: Triangle, label: 'مثلث' },
                    { t: 'arrow', I: ArrowRight, label: 'سهم' },
                  ] as { t: Tool; I: any; label: string }[]).map(({ t, I, label }) => (
                    <Button
                      key={t}
                      variant={tool === t ? 'secondary' : 'ghost'}
                      size="sm"
                      className="justify-start gap-2"
                      onClick={() => {
                        setTool(t);
                        clearOverlay();
                        setShowShapes(false); // يغلق بعد الاختيار
                      }}
                    >
                      <I className="h-4 w-4" />
                      <span className="text-sm">{label}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* أدوات إضافية */}
            <Button
              key="fill"
              title="تعبئة"
              variant={tool === 'fill' ? 'secondary' : 'outline'}
              size="icon"
              className="h-8 w-8"
              onClick={() => { setTool('fill'); clearOverlay(); }}
            >
              <PaintBucket className="h-4 w-4" />
            </Button>

            <Button
              key="image"
              title="إدراج صورة"
              variant={tool === 'image' ? 'secondary' : 'outline'}
              size="icon"
              className="h-8 w-8"
              onClick={() => { triggerImagePicker(); setTool('image'); clearOverlay(); }}
            >
              <ImageIcon className="h-4 w-4" />
            </Button>

            <Button
              key="hand"
              title="تحريك/تكبير"
              variant={tool === 'hand' ? 'secondary' : 'outline'}
              size="icon"
              className="h-8 w-8"
              onClick={() => { setTool('hand'); clearOverlay(); }}
            >
              <Move className="h-4 w-4" />
            </Button>

            <div className="mx-1 h-5 w-px self-center bg-border" />

            <Button variant="outline" size="icon" onClick={doUndo} disabled={!canUndo} className="h-8 w-8" title="تراجع"><Undo2 className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={doRedo} disabled={!canRedo} className="h-8 w-8" title="إعادة"><Redo className="h-4 w-4" /></Button>
            <Button variant="destructive" size="icon" onClick={doClear} className="h-8 w-8" title="مسح الكل"><Trash2 className="h-4 w-4" /></Button>

            <div className="mx-1 h-5 w-px self-center bg-border" />

            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                const nz = clamp(scale * 0.9, 0.25, 8);
                const nextOffset = applyPanClamp(nz, offset);
                setScale(nz); setOffset(nextOffset); clearOverlay(); drawView();
              }}
              className="h-8 w-8"
              title="تصغير"
            ><ZoomOut className="h-4 w-4" /></Button>
            <div className="min-w-[48px] px-1 text-center text-xs tabular-nums self-center">{Math.round(scale * 100)}%</div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                const nz = clamp(scale * 1.1, 0.25, 8);
                const nextOffset = applyPanClamp(nz, offset);
                setScale(nz); setOffset(nextOffset); clearOverlay(); drawView();
              }}
              className="h-8 w-8"
              title="تكبير"
            ><ZoomIn className="h-4 w-4" /></Button>
          </div>

          {/* التحكم في وضع الصورة */}
          {placingImage && (
            <div className="pointer-events-auto absolute bottom-3 left-1/2 z-50 flex -translate-x-1/2 gap-2 rounded-xl bg-background/90 p-2 shadow">
              <Button size="sm" variant="secondary" onClick={commitPlacedImage}>تثبيت الصورة</Button>
              <Button size="sm" variant="outline" onClick={cancelPlacedImage}>إلغاء</Button>
            </div>
          )}
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
    );
  }
);

DrawingCanvas.displayName = 'DrawingCanvas';
export default DrawingCanvas;
