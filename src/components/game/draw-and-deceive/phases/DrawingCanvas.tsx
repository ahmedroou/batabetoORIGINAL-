'use client';

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
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
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// ====================================================================================
// Types
// ====================================================================================
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

interface Point { x: number; y: number }

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

// ====================================================================================
// Constants
// ====================================================================================
const BASE_TOOLS: { tool: Tool; icon: React.ElementType; label: string }[] = [
  { tool: 'pen', icon: Pen, label: 'قلم' },
  { tool: 'eraser', icon: Eraser, label: 'ممحاة' },
  { tool: 'line', icon: Minus, label: 'خط' },
  { tool: 'rect', icon: Square, label: 'مستطيل' },
  { tool: 'roundedRect', icon: SquareDashed, label: 'مستطيل مستدير' },
  { tool: 'circle', icon: Circle, label: 'دائرة' },
  { tool: 'ellipse', icon: Circle, label: 'بيضاوي' },
  { tool: 'triangle', icon: Triangle, label: 'مثلث' },
  { tool: 'arrow', icon: ArrowRight, label: 'سهم' },
  { tool: 'fill', icon: PaintBucket, label: 'تعبئة' },
  { tool: 'image', icon: ImageIcon, label: 'صورة' },
  { tool: 'hand', icon: Move, label: 'تحريك/تكبير' },
];

// لوحة ألوان كبيرة (72 لونًا)
const PALETTE: string[] = [
  '#000000','#111827','#374151','#4B5563','#6B7280','#9CA3AF','#D1D5DB','#FFFFFF',
  '#EF4444','#DC2626','#B91C1C','#F87171',
  '#F59E0B','#D97706','#B45309','#FBBF24',
  '#22C55E','#16A34A','#15803D','#86EFAC',
  '#06B6D4','#0891B2','#0E7490','#67E8F9',
  '#3B82F6','#2563EB','#1D4ED8','#93C5FD',
  '#8B5CF6','#7C3AED','#5B21B6','#C4B5FD',
  '#EC4899','#DB2777','#9D174D','#F9A8D4',
  '#F43F5E','#BE123C','#881337','#FDA4AF',
  '#A3E635','#84CC16','#65A30D','#D9F99D',
  '#14B8A6','#0D9488','#0F766E','#99F6E4',
  '#EAB308','#CA8A04','#A16207','#FDE68A',
  '#FB923C','#F97316','#EA580C','#FED7AA',
];

// ====================================================================================
// Helpers
// ====================================================================================
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  const signW = w < 0 ? -1 : 1;
  const signH = h < 0 ? -1 : 1;
  ctx.beginPath();
  ctx.moveTo(x + rr * signW, y);
  ctx.lineTo(x + w - rr * signW, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr * signH);
  ctx.lineTo(x + w, y + h - rr * signH);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr * signW, y + h);
  ctx.lineTo(x + rr * signW, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr * signH);
  ctx.lineTo(x, y + rr * signH);
  ctx.quadraticCurveTo(x, y, x + rr * signW, y);
}

function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, headLength = 12) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const hx = Math.cos(angle) * headLength;
  const hy = Math.sin(angle) * headLength;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - hx + hy / 2, to.y - hy - hx / 2);
  ctx.lineTo(to.x - hx - hy / 2, to.y - hy + hx / 2);
  ctx.closePath();
  ctx.fill();
}

// ====================================================================================
// Component
// ====================================================================================
const DrawingCanvas = React.forwardRef<DrawingCanvasRef, DrawingCanvasProps>(
  ({ className, disabled = false, onDrawEnd, initialImage = null }, ref) => {
    // Refs & canvases
    const wrapperRef = useRef<HTMLDivElement>(null);
    const displayRef = useRef<HTMLCanvasElement>(null);
    const backingRef = useRef<HTMLCanvasElement | null>(null);

    const cssSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
    const dprRef = useRef<number>(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

    // Viewport (zoom/pan) في بُعد CSS (العالم هو حجم اللوحة الكامل)
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });

    // Toolbar state
    const [tool, setTool] = useState<Tool>('pen');
    const [color, setColor] = useState<string>('#000000');
    const [thickness, setThickness] = useState<number>(5);
    const [opacity, setOpacity] = useState<number>(1);
    const [shapeMode, setShapeMode] = useState<'stroke' | 'fill' | 'both'>('stroke');

    // Fill bucket tolerance (0–255)
    const [fillTolerance, setFillTolerance] = useState<number>(24);

    // Drawing state
    const [isDrawing, setIsDrawing] = useState(false);
    const lastPointRef = useRef<Point | null>(null);
    const startPointRef = useRef<Point | null>(null);

    // Image placement state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [placingImage, setPlacingImage] = useState<{
      img: HTMLImageElement;
      x: number; // world coords
      y: number;
      w: number;
      h: number;
      dragging: boolean;
    } | null>(null);

    // History state
    const [history, setHistory] = useState<string[]>([]);
    const historyIndexRef = useRef<number>(-1);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    // Multi-pointer (for pinch)
    const pointersRef = useRef<Map<number, Point>>(new Map());
    const lastPinchDistRef = useRef<number | null>(null);
    const lastPinchCenterRef = useRef<Point | null>(null);

    // --------------------------------------------------------------------------------
    // Utilities
    // --------------------------------------------------------------------------------
    const getDisplayCtx = useCallback(() => displayRef.current?.getContext('2d') ?? null, []);
    const getBackingCtx = useCallback(() => backingRef.current?.getContext('2d') ?? null, []);

    const worldToScreen = useCallback((p: Point): Point => ({ x: p.x * scale + offset.x, y: p.y * scale + offset.y }), [scale, offset]);
    const screenToWorld = useCallback((p: Point): Point => ({ x: (p.x - offset.x) / scale, y: (p.y - offset.y) / scale }), [scale, offset]);

    const applyStrokeStyle = useCallback((ctx: CanvasRenderingContext2D, forPreview = false) => {
      ctx.lineWidth = forPreview ? thickness / scale : thickness; // ثبات السماكة بصريًا في المعاينة
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color + Math.round(opacity * 255).toString(16).padStart(2, '0');
    }, [thickness, color, opacity, scale]);

    const applyFillStyle = useCallback((ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = color + Math.round(opacity * 255).toString(16).padStart(2, '0');
    }, [color, opacity]);

    // حدود اللوحة + منع الخروج عنها
    const clampOffsetToBounds = useCallback((off: Point, sc = scale): Point => {
      const vw = cssSizeRef.current.w; // حجم اللوحة (العالم)
      const vh = cssSizeRef.current.h;
      const sw = vw * sc; // حجم العالم بعد التكبير
      const sh = vh * sc;

      // إذا كان العالم أصغر من الإطار: نوسّطه دائمًا
      const x = sw <= vw ? Math.round((vw - sw) / 2) : clamp(off.x, vw - sw, 0);
      const y = sh <= vh ? Math.round((vh - sh) / 2) : clamp(off.y, vh - sh, 0);
      return { x, y };
    }, [scale]);

    const setOffsetClamped = useCallback((next: Point, sc = scale) => {
      setOffset(clampOffsetToBounds(next, sc));
    }, [clampOffsetToBounds, scale]);

    const zoomAtScreenPoint = useCallback((pScreen: Point, newScale: number) => {
      const ns = clamp(newScale, 0.25, 8);
      const centerWorld = screenToWorld(pScreen);
      const pre = worldToScreen(centerWorld);
      const raw = { x: pScreen.x - (pre.x - offset.x) * (ns / scale), y: pScreen.y - (pre.y - offset.y) * (ns / scale) };
      setScale(ns);
      setOffsetClamped(raw, ns);
    }, [offset, scale, screenToWorld, worldToScreen, setOffsetClamped]);

    const renderAll = useCallback(() => {
      const dctx = getDisplayCtx();
      const bcan = backingRef.current;
      const disp = displayRef.current;
      if (!dctx || !bcan || !disp) return;

      // Clear display (CSS pixels)
      dctx.setTransform(1, 0, 0, 1, 0, 0);
      dctx.clearRect(0, 0, cssSizeRef.current.w, cssSizeRef.current.h);

      // Apply viewport + DPR
      const dpr = dprRef.current;
      dctx.setTransform(scale * dpr, 0, 0, scale * dpr, offset.x * dpr, offset.y * dpr);

      // Draw backing
      dctx.drawImage(bcan, 0, 0, bcan.width / dpr, bcan.height / dpr);

      // If placing an image, preview it on top
      if (placingImage) {
        dctx.save();
        applyStrokeStyle(dctx, true);
        applyFillStyle(dctx);
        dctx.globalAlpha = 0.9;
        dctx.drawImage(placingImage.img, placingImage.x, placingImage.y, placingImage.w, placingImage.h);
        dctx.globalAlpha = 1;
        dctx.strokeRect(placingImage.x, placingImage.y, placingImage.w, placingImage.h);
        dctx.restore();
      }

      // ====== حدود اللوحة (لا تتأثر بالتكبير) ======
      dctx.setTransform(1, 0, 0, 1, 0, 0);
      const x = offset.x, y = offset.y, w = cssSizeRef.current.w * scale, h = cssSizeRef.current.h * scale;
      dctx.save();
      dctx.lineWidth = 2;
      dctx.strokeStyle = '#2563eb80'; // حد واضح
      dctx.setLineDash([6, 4]);
      dctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
      dctx.restore();
    }, [getDisplayCtx, scale, offset, placingImage, applyStrokeStyle, applyFillStyle]);

    const pushHistory = useCallback(() => {
      const bcan = backingRef.current;
      if (!bcan) return;
      const dataUrl = bcan.toDataURL('image/png');
      setHistory((prev) => {
        const trimmed = prev.slice(0, historyIndexRef.current + 1);
        const next = [...trimmed, dataUrl];
        historyIndexRef.current = next.length - 1;
        setCanUndo(historyIndexRef.current > 0);
        setCanRedo(false);
        onDrawEnd?.(dataUrl, { canUndo: historyIndexRef.current > 0, canRedo: false });
        return next;
      });
    }, [onDrawEnd]);

    const getRelativePoint = (e: React.PointerEvent): Point | null => {
      const disp = displayRef.current;
      if (!disp) return null;
      const rect = disp.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    // --------------------------------------------------------------------------------
    // Resize / DPR setup
    // --------------------------------------------------------------------------------
    useEffect(() => {
      const wrapper = wrapperRef.current;
      const disp = displayRef.current;
      if (!wrapper || !disp) return;

      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        dprRef.current = dpr;
        cssSizeRef.current = { w: Math.max(1, Math.floor(width)), h: Math.max(1, Math.floor(height)) };

        // Preserve old content (if any)
        const oldBacking = backingRef.current;
        const oldDataUrl = oldBacking && oldBacking.width > 0 && oldBacking.height > 0 ? oldBacking.toDataURL('image/png') : null;

        // Prepare display canvas
        disp.width = Math.max(1, Math.floor(width * dpr));
        disp.height = Math.max(1, Math.floor(height * dpr));
        disp.style.width = `${Math.floor(width)}px`;
        disp.style.height = `${Math.floor(height)}px`;
        const dctx = disp.getContext('2d');
        if (!dctx) return;
        dctx.setTransform(1, 0, 0, 1, 0, 0);

        // Prepare backing canvas (draw in CSS coordinates by scaling the context)
        const bcan = document.createElement('canvas');
        bcan.width = disp.width;
        bcan.height = disp.height;
        const bctx = bcan.getContext('2d');
        if (!bctx) return;
        bctx.setTransform(1, 0, 0, 1, 0, 0);
        bctx.scale(dpr, dpr);
        backingRef.current = bcan;

        // Restore old content
        if (oldDataUrl) {
          const img = new Image();
          img.src = oldDataUrl;
          img.onload = () => {
            bctx.clearRect(0, 0, cssSizeRef.current.w, cssSizeRef.current.h);
            bctx.drawImage(img, 0, 0, cssSizeRef.current.w, cssSizeRef.current.h);
            // ضبط الإزاحة بعد تغيّر الحجم
            setOffset((o) => clampOffsetToBounds(o));
            renderAll();
          };
        } else {
          setOffset((o) => clampOffsetToBounds(o));
          renderAll();
        }
      });

      ro.observe(wrapper);
      return () => ro.disconnect();
    }, [renderAll, clampOffsetToBounds]);

    // --------------------------------------------------------------------------------
    // Initial image
    // --------------------------------------------------------------------------------
    useEffect(() => {
      if (!initialImage) {
        if (backingRef.current) {
          const bctx = getBackingCtx();
          if (bctx) {
            bctx.clearRect(0, 0, cssSizeRef.current.w, cssSizeRef.current.h);
            pushHistory();
            renderAll();
          }
        }
        return;
      }

      const id = requestAnimationFrame(() => {
        const bctx = getBackingCtx();
        if (!bctx || !backingRef.current) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = initialImage;
        img.onload = () => {
          bctx.clearRect(0, 0, cssSizeRef.current.w, cssSizeRef.current.h);
          bctx.drawImage(img, 0, 0, cssSizeRef.current.w, cssSizeRef.current.h);
          pushHistory();
          renderAll();
        };
      });
      return () => cancelAnimationFrame(id);
    }, [initialImage, getBackingCtx, pushHistory, renderAll]);

    // --------------------------------------------------------------------------------
    // Drawing helpers
    // --------------------------------------------------------------------------------
    const commitStrokeOrErase = (from: Point, to: Point) => {
      const bctx = getBackingCtx();
      if (!bctx) return;
      if (tool === 'eraser') bctx.globalCompositeOperation = 'destination-out';
      else bctx.globalCompositeOperation = 'source-over';
      bctx.globalAlpha = opacity;
      bctx.lineWidth = thickness;
      bctx.lineCap = 'round';
      bctx.lineJoin = 'round';
      bctx.strokeStyle = color;
      bctx.beginPath();
      bctx.moveTo(from.x, from.y);
      bctx.lineTo(to.x, to.y);
      bctx.stroke();
      bctx.globalAlpha = 1;
      bctx.globalCompositeOperation = 'source-over';
    };

    const previewShape = (s: Point, e: Point) => {
      const dctx = getDisplayCtx();
      if (!dctx) return;
      renderAll(); // redraw backing under preview
      dctx.save();
      applyStrokeStyle(dctx, true);
      applyFillStyle(dctx);

      if (tool === 'line') {
        dctx.beginPath();
        dctx.moveTo(s.x, s.y);
        dctx.lineTo(e.x, e.y);
        dctx.stroke();
      } else if (tool === 'rect') {
        if (shapeMode !== 'fill') dctx.strokeRect(s.x, s.y, e.x - s.x, e.y - s.y);
        if (shapeMode !== 'stroke') dctx.fillRect(s.x, s.y, e.x - s.x, e.y - s.y);
      } else if (tool === 'roundedRect') {
        drawRoundedRect(dctx, s.x, s.y, e.x - s.x, e.y - s.y, 12);
        if (shapeMode !== 'fill') dctx.stroke();
        if (shapeMode !== 'stroke') dctx.fill();
      } else if (tool === 'circle' || tool === 'ellipse') {
        const rx = Math.abs(e.x - s.x) / 2;
        const ry = tool === 'circle' ? rx : Math.abs(e.y - s.y) / 2;
        const cx = (s.x + e.x) / 2;
        const cy = (s.y + e.y) / 2;
        dctx.beginPath();
        dctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (shapeMode !== 'fill') dctx.stroke();
        if (shapeMode !== 'stroke') dctx.fill();
      } else if (tool === 'triangle') {
        const cx = (s.x + e.x) / 2;
        dctx.beginPath();
        dctx.moveTo(cx, s.y);
        dctx.lineTo(e.x, e.y);
        dctx.lineTo(s.x, e.y);
        dctx.closePath();
        if (shapeMode !== 'fill') dctx.stroke();
        if (shapeMode !== 'stroke') dctx.fill();
      } else if (tool === 'arrow') {
        const headLength = 12;
        const angle = Math.atan2(e.y - s.y, e.x - s.x);
        const hx = Math.cos(angle) * headLength;
        const hy = Math.sin(angle) * headLength;
        dctx.beginPath();
        dctx.moveTo(s.x, s.y);
        dctx.lineTo(e.x, e.y);
        dctx.stroke();
        dctx.beginPath();
        dctx.moveTo(e.x, e.y);
        dctx.lineTo(e.x - hx + hy / 2, e.y - hy - hx / 2);
        dctx.lineTo(e.x - hx - hy / 2, e.y - hy + hx / 2);
        dctx.closePath();
        if (shapeMode !== 'stroke') dctx.fill();
        if (shapeMode !== 'fill') dctx.stroke();
      }
      dctx.restore();
    };

    const commitShape = (s: Point, e: Point) => {
      const bctx = getBackingCtx();
      if (!bctx) return;
      bctx.globalAlpha = opacity;
      bctx.lineWidth = thickness;
      bctx.lineCap = 'round';
      bctx.lineJoin = 'round';
      bctx.strokeStyle = color;
      bctx.fillStyle = color;

      if (tool === 'line') {
        bctx.beginPath();
        bctx.moveTo(s.x, s.y);
        bctx.lineTo(e.x, e.y);
        bctx.stroke();
      } else if (tool === 'rect') {
        if (shapeMode !== 'fill') bctx.strokeRect(s.x, s.y, e.x - s.x, e.y - s.y);
        if (shapeMode !== 'stroke') bctx.fillRect(s.x, s.y, e.x - s.x, e.y - s.y);
      } else if (tool === 'roundedRect') {
        drawRoundedRect(bctx, s.x, s.y, e.x - s.x, e.y - s.y, 12);
        if (shapeMode !== 'fill') bctx.stroke();
        if (shapeMode !== 'stroke') bctx.fill();
      } else if (tool === 'circle' || tool === 'ellipse') {
        const rx = Math.abs(e.x - s.x) / 2;
        const ry = tool === 'circle' ? rx : Math.abs(e.y - s.y) / 2;
        const cx = (s.x + e.x) / 2;
        const cy = (s.y + e.y) / 2;
        bctx.beginPath();
        bctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (shapeMode !== 'fill') bctx.stroke();
        if (shapeMode !== 'stroke') bctx.fill();
      } else if (tool === 'triangle') {
        const cx = (s.x + e.x) / 2;
        bctx.beginPath();
        bctx.moveTo(cx, s.y);
        bctx.lineTo(e.x, e.y);
        bctx.lineTo(s.x, e.y);
        bctx.closePath();
        if (shapeMode !== 'fill') bctx.stroke();
        if (shapeMode !== 'stroke') bctx.fill();
      } else if (tool === 'arrow') {
        bctx.beginPath();
        bctx.moveTo(s.x, s.y);
        bctx.lineTo(e.x, e.y);
        bctx.stroke();
        const headLength = 12;
        const angle = Math.atan2(e.y - s.y, e.x - s.x);
        const hx = Math.cos(angle) * headLength;
        const hy = Math.sin(angle) * headLength;
        bctx.beginPath();
        bctx.moveTo(e.x, e.y);
        bctx.lineTo(e.x - hx + hy / 2, e.y - hy - hx / 2);
        bctx.lineTo(e.x - hx - hy / 2, e.y - hy + hx / 2);
        bctx.closePath();
        if (shapeMode !== 'stroke') bctx.fill();
        if (shapeMode !== 'fill') bctx.stroke();
      }

      bctx.globalAlpha = 1;
    };

    // --------------------------------------------------------------------------------
    // Fill bucket (tolerance-based flood fill)
    // --------------------------------------------------------------------------------
    const floodFill = (startCss: Point) => {
      const bcan = backingRef.current;
      const bctx = getBackingCtx();
      if (!bcan || !bctx) return;
      const dpr = dprRef.current;

      const imgData = bctx.getImageData(0, 0, bcan.width, bcan.height);
      const data = imgData.data;

      const targetX = Math.floor(startCss.x * dpr);
      const targetY = Math.floor(startCss.y * dpr);
      const W = imgData.width;
      const H = imgData.height;
      if (targetX < 0 || targetX >= W || targetY < 0 || targetY >= H) return;

      const idx = (y: number, x: number) => (y * W + x) * 4;
      const startIdx = idx(targetY, targetX);
      const sr = data[startIdx];
      const sg = data[startIdx + 1];
      const sb = data[startIdx + 2];
      const sa = data[startIdx + 3];

      const hex = color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const a = Math.round(opacity * 255);

      const tol = clamp(fillTolerance, 0, 255);
      const match = (x: number, y: number) => {
        const i = idx(y, x);
        return (
          Math.abs(data[i] - sr) <= tol &&
          Math.abs(data[i + 1] - sg) <= tol &&
          Math.abs(data[i + 2] - sb) <= tol &&
          Math.abs(data[i + 3] - sa) <= tol
        );
      };

      const sameColor = (x: number, y: number) => {
        const i = idx(y, x);
        return (
          Math.abs(data[i] - r) <= 0 &&
          Math.abs(data[i + 1] - g) <= 0 &&
          Math.abs(data[i + 2] - b) <= 0 &&
          Math.abs(data[i + 3] - a) <= 0
        );
      };
      if (sameColor(targetX, targetY)) return;

      const stack: [number, number][] = [[targetX, targetY]];
      while (stack.length) {
        const [x0, y0] = stack.pop()!;
        let xl = x0;
        while (xl >= 0 && match(xl, y0)) xl--;
        xl++;
        let xr = x0;
        while (xr < W && match(xr, y0)) xr++;
        for (let x = xl; x < xr; x++) {
          const i = idx(y0, x);
          data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
        }
        const yUp = y0 - 1;
        const yDn = y0 + 1;
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

      bctx.putImageData(imgData, 0, 0);
      renderAll();
      pushHistory();
    };

    // --------------------------------------------------------------------------------
    // Pointer handling (draw / shapes / pan / pinch / image placing)
    // --------------------------------------------------------------------------------
    const handlePointerDown = (e: React.PointerEvent) => {
      if (disabled || e.button !== 0) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const pScreen = getRelativePoint(e);
      if (!pScreen) return;

      // Track pointers for pinch
      pointersRef.current.set(e.pointerId, pScreen);
      if (pointersRef.current.size === 2) {
        const [p1, p2] = Array.from(pointersRef.current.values());
        lastPinchDistRef.current = distance(p1, p2);
        lastPinchCenterRef.current = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        return;
      }

      const pWorld = screenToWorld(pScreen);

      if (tool === 'hand') {
        setIsDrawing(true);
        lastPointRef.current = pScreen; // screen space
        return;
      }

      if (tool === 'image' && placingImage) {
        setPlacingImage((prev) => (prev ? { ...prev, dragging: true } : prev));
        return;
      }

      if (tool === 'fill') {
        floodFill(pWorld);
        return;
      }

      setIsDrawing(true);
      lastPointRef.current = pWorld;
      startPointRef.current = pWorld;
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      const pScreen = getRelativePoint(e);
      if (!pScreen) return;

      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, pScreen);
      }

      // Pinch zoom
      if (pointersRef.current.size === 2) {
        const [p1, p2] = Array.from(pointersRef.current.values());
        const dist = distance(p1, p2);
        const lastDist = lastPinchDistRef.current ?? dist;
        const factor = clamp(dist / Math.max(1, lastDist), 0.5, 2);
        const newScale = clamp(scale * factor, 0.25, 8);
        zoomAtScreenPoint({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, newScale);
        lastPinchDistRef.current = dist;
        renderAll();
        return;
      }

      const pWorld = screenToWorld(pScreen);

      if (tool === 'hand' && isDrawing && lastPointRef.current) {
        const delta = { x: pScreen.x - lastPointRef.current.x, y: pScreen.y - lastPointRef.current.y };
        setOffsetClamped({ x: offset.x + delta.x, y: offset.y + delta.y });
        lastPointRef.current = pScreen;
        renderAll();
        return;
      }

      if (tool === 'image' && placingImage?.dragging) {
        setPlacingImage((img) => (img ? { ...img, x: pWorld.x - img.w / 2, y: pWorld.y - img.h / 2 } : img));
        renderAll();
        return;
      }

      if (!isDrawing || !lastPointRef.current) return;

      if (tool === 'pen' || tool === 'eraser') {
        commitStrokeOrErase(lastPointRef.current, pWorld);
        renderAll();
        lastPointRef.current = pWorld;
      } else {
        previewShape(startPointRef.current!, pWorld);
        lastPointRef.current = pWorld;
      }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) {
        lastPinchDistRef.current = null;
      }

      if (tool === 'hand') {
        setIsDrawing(false);
        setOffset((o) => clampOffsetToBounds(o));
        renderAll();
        return;
      }

      if (tool === 'image' && placingImage?.dragging) {
        setPlacingImage((img) => (img ? { ...img, dragging: false } : img));
        return;
      }

      if (!isDrawing) return;
      setIsDrawing(false);

      if (tool !== 'pen' && tool !== 'eraser' && tool !== 'fill' && tool !== 'image') {
        const end = lastPointRef.current;
        const start = startPointRef.current;
        if (end && start) {
          commitShape(start, end);
          renderAll();
        }
        lastPointRef.current = null;
        startPointRef.current = null;
        pushHistory();
      } else if (tool === 'pen' || tool === 'eraser') {
        pushHistory();
      }
    };

    // Wheel: zoom (Ctrl/Cmd + wheel) or pan
    const handleWheel = (e: React.WheelEvent) => {
      if (disabled) return;
      const rect = displayRef.current?.getBoundingClientRect();
      const pScreen = rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 };

      // deltaMode تصحيح
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cssSizeRef.current.h : 1; // line/page/pixel
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = dy < 0 ? 1.1 : 0.9;
        zoomAtScreenPoint(pScreen, scale * factor);
        renderAll();
      } else {
        setOffsetClamped({ x: offset.x - dx, y: offset.y - dy });
        renderAll();
      }
    };

    // --------------------------------------------------------------------------------
    // Image upload / placement
    // --------------------------------------------------------------------------------
    const triggerImagePicker = () => fileInputRef.current?.click();

    const handleFile = async (file: File) => {
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const maxW = cssSizeRef.current.w * 0.6;
        const scaleTo = Math.min(maxW / img.width, (cssSizeRef.current.h * 0.6) / img.height, 1);
        const w = img.width * scaleTo;
        const h = img.height * scaleTo;
        const x = (cssSizeRef.current.w - w) / 2;
        const y = (cssSizeRef.current.h - h) / 2;
        setPlacingImage({ img, x, y, w, h, dragging: false });
        setTool('image');
        URL.revokeObjectURL(url);
        renderAll();
      };
      img.src = url;
    };

    const commitPlacedImage = () => {
      if (!placingImage) return;
      const bctx = getBackingCtx();
      if (!bctx) return;
      bctx.drawImage(placingImage.img, placingImage.x, placingImage.y, placingImage.w, placingImage.h);
      setPlacingImage(null);
      renderAll();
      pushHistory();
    };

    const cancelPlacedImage = () => {
      setPlacingImage(null);
      renderAll();
    };

    // --------------------------------------------------------------------------------
    // Commands
    // --------------------------------------------------------------------------------
    const doUndo = useCallback(() => {
      if (historyIndexRef.current <= 0) return;
      const newIndex = historyIndexRef.current - 1;
      const img = new Image();
      img.src = history[newIndex]!;
      img.onload = () => {
        const bctx = getBackingCtx();
        if (!bctx) return;
        bctx.clearRect(0, 0, cssSizeRef.current.w, cssSizeRef.current.h);
        bctx.drawImage(img, 0, 0, cssSizeRef.current.w, cssSizeRef.current.h);
        renderAll();
        historyIndexRef.current = newIndex;
        setCanUndo(historyIndexRef.current > 0);
        setCanRedo(historyIndexRef.current < history.length - 1);
        onDrawEnd?.(history[newIndex]!, { canUndo: historyIndexRef.current > 0, canRedo: historyIndexRef.current < history.length - 1 });
      };
    }, [history, getBackingCtx, onDrawEnd, renderAll]);

    const doRedo = useCallback(() => {
      if (historyIndexRef.current >= history.length - 1) return;
      const newIndex = historyIndexRef.current + 1;
      const img = new Image();
      img.src = history[newIndex]!;
      img.onload = () => {
        const bctx = getBackingCtx();
        if (!bctx) return;
        bctx.clearRect(0, 0, cssSizeRef.current.w, cssSizeRef.current.h);
        bctx.drawImage(img, 0, 0, cssSizeRef.current.w, cssSizeRef.current.h);
        renderAll();
        historyIndexRef.current = newIndex;
        setCanUndo(true);
        setCanRedo(historyIndexRef.current < history.length - 1);
        onDrawEnd?.(history[newIndex]!, { canUndo: true, canRedo: historyIndexRef.current < history.length - 1 });
      };
    }, [history, getBackingCtx, onDrawEnd, renderAll]);

    const doClear = useCallback(() => {
      const bctx = getBackingCtx();
      if (!bctx) return;
      bctx.clearRect(0, 0, cssSizeRef.current.w, cssSizeRef.current.h);
      renderAll();
      pushHistory();
    }, [getBackingCtx, pushHistory, renderAll]);

    const getDataUrl = useCallback(() => backingRef.current?.toDataURL('image/png'), []);

    const resetView = () => {
      const ns = 1;
      setScale(ns);
      setOffsetClamped({ x: 0, y: 0 }, ns);
      renderAll();
    };

    useImperativeHandle(ref, () => ({
      undo: doUndo,
      redo: doRedo,
      clearAll: doClear,
      getDrawingDataUrl: getDataUrl,
      setTool: (t: Tool) => setTool(t),
      setZoom: (z: number) => setScale(clamp(z, 0.25, 8)),
      resetView,
    }));

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
      <div ref={wrapperRef} className={cn('flex h-[70vh] min-h-[360px] w-full flex-col gap-2', className)}>
        {/* Canvas Area */}
        <div className="relative flex-1 min-h-0 w/full overflow-hidden rounded-lg border bg-white">
          <canvas
            ref={displayRef}
            className={cn('absolute inset-0 block h-full w-full touch-none', disabled && 'pointer-events-none opacity-60')}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          />

          {/* Image placement controls */}
          {placingImage && (
            <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-xl bg-background/90 p-2 shadow">
              <Button size="sm" variant="secondary" onClick={commitPlacedImage}>تثبيت الصورة</Button>
              <Button size="sm" variant="outline" onClick={cancelPlacedImage}>إلغاء</Button>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="w-full flex-shrink-0 rounded-lg border bg-background/80 p-2 backdrop-blur-sm">
          <div className="flex flex-col gap-2">
            {/* Row 1: tools + color */}
            <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {BASE_TOOLS.map(({ tool: t, icon: Icon, label }) => (
                <Button
                  key={t}
                  title={label}
                  variant={tool === t ? 'secondary' : 'outline'}
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    if (t === 'image') triggerImagePicker();
                    setTool(t);
                  }}
                >
                  <Icon />
                </Button>
              ))}

              {/* لوحة الألوان (تم نقلها هنا وإلغاء الألوان الجاهزة أسفل) */}
              <div className="h-8 w-px bg-border" />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <span className="inline-flex h-5 w-5 rounded-full border" style={{ backgroundColor: color }} />
                    <Palette className="h-4 w-4" />
                    <span>لوحة الألوان</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72">
                  <div className="mb-2 font-medium">اختر لونًا</div>
                  <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto pr-1">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={cn('h-7 w-7 rounded-full border transition-transform hover:scale-110 active:scale-95', color === c ? 'border-primary' : 'border-muted-foreground/30')}
                        style={{ backgroundColor: c }}
                        aria-label={`pick ${c}`}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 p-1" />
                    <input
                      type="text"
                      className="flex-1 rounded-md border px-2 py-1 text-sm outline-none"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                    />
                  </div>
                </PopoverContent>
              </Popover>

              <div className="ms-auto flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => { const ns = clamp(scale * 0.9, 0.25, 8); zoomAtScreenPoint({ x: cssSizeRef.current.w / 2, y: cssSizeRef.current.h / 2 }, ns); renderAll(); }}
                >
                  <ZoomOut />
                </Button>
                <div className="min-w-[60px] text-center text-sm tabular-nums">{Math.round(scale * 100)}%</div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => { const ns = clamp(scale * 1.1, 0.25, 8); zoomAtScreenPoint({ x: cssSizeRef.current.w / 2, y: cssSizeRef.current.h / 2 }, ns); renderAll(); }}
                >
                  <ZoomIn />
                </Button>
                <Button variant="outline" size="sm" onClick={resetView} className="ms-1">تصفير العرض</Button>
              </div>
            </div>

            {/* (تم حذف صف الألوان الجاهزة؛ كل الألوان أصبحت في لوحة واحدة) */}

            {/* Row 2: sliders & switches */}
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
              {tool === 'fill' && (
                <div className="flex items-center gap-3">
                  <Label className="whitespace-nowrap">حساسية التعبئة</Label>
                  <Slider value={[fillTolerance]} onValueChange={([v]) => setFillTolerance(v)} max={128} step={1} className="max-w-sm" />
                  <div className="w-10 text-center text-sm">{fillTolerance}</div>
                </div>
              )}
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
            </div>

            {/* hidden file input for images */}
            <input ref={fileInputRef} className="hidden" type="file" accept="image/*" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.currentTarget.value = '';
            }} />
          </div>
        </div>
      </div>
    );
  }
);

DrawingCanvas.displayName = 'DrawingCanvas';
export default DrawingCanvas;
