'use client';

import React, {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  Pen,
  Eraser,
  PaintBucket,
  Undo2,
  Trash2,
  Palette,
  Square,
  Circle,
  Triangle,
  ArrowRight,
} from 'lucide-react';

/**
 * Gartic-like Drawing Canvas — fixed (Tools clickable reliably)
 * - UI (toolbar + palette button) moved OUTSIDE the wrapRef (away from overlay canvas)
 * - Higher z-index for UI + stopPropagation on UI wrappers
 * - Precise cursor ring (no DPI offset)
 * - Color palette updates brush color immediately
 * - Geometry popover via Portal (no clipping)
 * - Eraser has independent sizes; destination-out works
 */

export type GarticTool =
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'line'
  | 'rect'
  | 'roundedRect'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'arrow';

export interface GarticCanvasRef {
  undo: () => void;
  clearAll: () => void;
  getDrawingDataUrl: () => string | undefined;
  setTool: (t: GarticTool) => void;
  setColor: (hex: string) => void;
  setBrushSize: (px: number) => void;
}

interface GarticCanvasProps {
  className?: string;
  disabled?: boolean;
  onDrawEnd?: (dataUrl: string, history: { canUndo: boolean }) => void;
}

const PALETTE: string[] = [
  '#000000', '#3f3f46', '#71717a', '#a1a1aa', '#ffffff',
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#22c55e', '#10b981', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  '#f43f5e', '#14b8a6', '#84cc16', '#65a30d',
  '#b45309', '#7c3aed', '#0ea5e9', '#0891b2',
];

const BRUSH_SIZES = [2, 4, 10, 18] as const; // XS / S / M / L
const ERASER_SIZES = [8, 16, 28, 40] as const; // Larger for eraser
const MAX_HISTORY = 24;

const GarticLikeCanvas = React.forwardRef<GarticCanvasRef, GarticCanvasProps>(
  ({ className, disabled = false, onDrawEnd }, ref) => {
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);

    const dprRef = useRef<number>(1);
    const cssSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

    const [tool, setToolState] = useState<GarticTool>('brush');
    const [color, setColorState] = useState<string>('#000000');
    const [brushSize, setBrushSizeState] = useState<number>(BRUSH_SIZES[1]);
    const [eraserSize, setEraserSize] = useState<number>(ERASER_SIZES[1]);

    const activeSize = tool === 'eraser' ? eraserSize : brushSize;

    // tolerance for flood-fill (0..255)
    const [fillTolerance] = useState<number>(32);

    const [showPalette, setShowPalette] = useState<boolean>(false);
    const [showShapes, setShowShapes] = useState<boolean>(false);

    const isDownRef = useRef(false);
    const startRef = useRef<{ x: number; y: number } | null>(null);
    const lastRef = useRef<{ x: number; y: number } | null>(null);
    const movedRef = useRef(false);

    const [history, setHistory] = useState<string[]>([]);
    const idxRef = useRef<number>(-1);
    const [canUndo, setCanUndo] = useState(false);

    // Anchors for portals
    const shapesBtnRef = useRef<HTMLButtonElement | null>(null);
    const paletteBtnRef = useRef<HTMLButtonElement | null>(null);

    // Helpers: transforms
    const setCtxToCSS = (ctx: CanvasRenderingContext2D) => {
      const dpr = dprRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const setCtxToDevice = (ctx: CanvasRenderingContext2D) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    const snapshot = () => canvasRef.current?.toDataURL('image/png');

    const pushHistory = (from?: string) => {
      const img = from ?? snapshot();
      if (!img) return;
      setHistory((prev) => {
        const base = [...prev.slice(0, idxRef.current + 1), img];
        const next = base.slice(-MAX_HISTORY);
        idxRef.current = next.length - 1;
        const can = idxRef.current > 0;
        setCanUndo(can);
        onDrawEnd?.(img, { canUndo: can });
        return next;
      });
    };

    const restoreFromDataUrl = (dataUrl: string) => {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      const { w, h } = cssSizeRef.current;
      const img = new Image();
      img.onload = () => {
        setCtxToCSS(ctx);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
      };
      img.src = dataUrl;
    };

    const resizeAll = () => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      if (!wrap || !canvas || !overlay) return;

      const rect = wrap.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      dprRef.current = dpr;

      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      cssSizeRef.current = { w, h };

      const snap = snapshot();

      // Canvas backing store in device pixels
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const cctx = canvas.getContext('2d')!;
      setCtxToCSS(cctx);

      overlay.width = Math.max(1, Math.floor(w * dpr));
      overlay.height = Math.max(1, Math.floor(h * dpr));
      overlay.style.width = `${w}px`;
      overlay.style.height = `${h}px`;
      const octx = overlay.getContext('2d')!;
      setCtxToCSS(octx);
      // Clear fully in device space to avoid ghosting
      setCtxToDevice(octx);
      octx.clearRect(0, 0, overlay.width, overlay.height);
      setCtxToCSS(octx);

      const ctx = canvas.getContext('2d')!;
      if (!snap) {
        setCtxToCSS(ctx);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        pushHistory();
      } else {
        const img = new Image();
        img.onload = () => {
          setCtxToCSS(ctx);
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
        };
        img.src = snap;
      }
    };

    useEffect(() => {
      resizeAll();
      const ro = new ResizeObserver(() => resizeAll());
      if (wrapRef.current) ro.observe(wrapRef.current);
      const onWin = () => resizeAll();
      window.addEventListener('resize', onWin);
      window.addEventListener('orientationchange', onWin);
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', onWin);
        window.removeEventListener('orientationchange', onWin);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Drawing primitives */
    const beginStroke = (x: number, y: number) => {
      const ctx = canvasRef.current!.getContext('2d')!;
      setCtxToCSS(ctx);
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      if (tool !== 'eraser') ctx.strokeStyle = color;
      ctx.lineWidth = activeSize;
      ctx.moveTo(x, y);
    };

    const continueStroke = (x: number, y: number) => {
      const ctx = canvasRef.current!.getContext('2d')!;
      setCtxToCSS(ctx);
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const endStroke = (x: number, y: number) => {
      const ctx = canvasRef.current!.getContext('2d')!;
      setCtxToCSS(ctx);
      if (!movedRef.current) {
        if (tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, activeSize / 2), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, activeSize / 2), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      pushHistory();
    };

    /* Flood Fill */
    const hexToRgba = (hex: string) => {
      const h = hex.replace('#', '');
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return [r, g, b, 255] as const;
    };

    const floodFill = (sx: number, sy: number) => {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      const dpr = dprRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const startX = Math.floor(sx * dpr);
      const startY = Math.floor(sy * dpr);
      if (startX < 0 || startY < 0 || startX >= W || startY >= H) return;

      setCtxToDevice(ctx);
      const img = ctx.getImageData(0, 0, W, H);
      const data = img.data;

      const idx = (x: number, y: number) => (y * W + x) * 4;
      const sPos = idx(startX, startY);
      const sr = data[sPos], sg = data[sPos + 1], sb = data[sPos + 2], sa = data[sPos + 3];
      const [tr, tg, tb, ta] = hexToRgba(color);
      const tol = Math.max(0, Math.min(255, Math.round(fillTolerance)));
      const distSq = (r1: number, g1: number, b1: number, a1: number, r2: number, g2: number, b2: number, a2: number) => {
        const dr = r1 - r2, dg = g1 - g2, db = b1 - b2, da = a1 - a2;
        return dr * dr + dg * dg + db * db + da * da;
      };
      const tolSq = tol * tol;
      if (distSq(sr, sg, sb, sa, tr, tg, tb, ta) <= tolSq) return;

      const match = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return false;
        const p = idx(x, y);
        return distSq(data[p], data[p + 1], data[p + 2], data[p + 3], sr, sg, sb, sa) <= tolSq;
      };

      const stack: [number, number][] = [[startX, startY]];
      while (stack.length) {
        const [x0, y0] = stack.pop()!;
        let xLeft = x0;
        while (xLeft >= 0 && match(xLeft, y0)) xLeft--;
        xLeft++;
        let xRight = x0;
        while (xRight < W && match(xRight, y0)) xRight++;
        xRight--;
        for (let x = xLeft; x <= xRight; x++) {
          const p = idx(x, y0);
          data[p] = tr; data[p + 1] = tg; data[p + 2] = tb; data[p + 3] = ta;
        }
        const yUp = y0 - 1;
        if (yUp >= 0) {
          let x = xLeft;
          while (x <= xRight) {
            while (x <= xRight && !match(x, yUp)) x++;
            if (x <= xRight) {
              const nx = x;
              while (x <= xRight && match(x, yUp)) x++;
              stack.push([Math.max(nx, xLeft), yUp]);
            }
          }
        }
        const yDn = y0 + 1;
        if (yDn < H) {
          let x = xLeft;
          while (x <= xRight) {
            while (x <= xRight && !match(x, yDn)) x++;
            if (x <= xRight) {
              const nx = x;
              while (x <= xRight && match(x, yDn)) x++;
              stack.push([Math.max(nx, xLeft), yDn]);
            }
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      setCtxToCSS(ctx);
      pushHistory();
    };

    /* Overlay */
    const clearOverlay = () => {
      const o = overlayRef.current!;
      const octx = o.getContext('2d')!;
      setCtxToDevice(octx);
      octx.clearRect(0, 0, o.width, o.height);
      setCtxToCSS(octx);
    };

    const drawCursor = (x: number, y: number) => {
      const o = overlayRef.current!;
      const octx = o.getContext('2d')!;
      // full clear in device space (no DPI bugs)
      setCtxToDevice(octx);
      octx.clearRect(0, 0, o.width, o.height);
      setCtxToCSS(octx);
      octx.save();
      octx.beginPath();
      octx.arc(x, y, Math.max(2, activeSize / 2), 0, Math.PI * 2);
      octx.lineWidth = 1;
      octx.strokeStyle = tool === 'eraser' ? '#ef4444' : '#111827';
      octx.stroke();
      octx.restore();
    };

    const getLocal = (e: React.PointerEvent): { x: number; y: number } => {
      const rect = overlayRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    /* Pointer handlers */
    const onPointerDown = (e: React.PointerEvent) => {
      if (disabled || e.button !== 0) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const p = getLocal(e);
      isDownRef.current = true;
      startRef.current = p;
      lastRef.current = p;
      movedRef.current = false;

      if (tool === 'fill') {
        floodFill(Math.floor(p.x), Math.floor(p.y));
        isDownRef.current = false;
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        return;
      }

      if (['line','rect','roundedRect','circle','ellipse','triangle','arrow'].includes(tool)) {
        drawCursor(p.x, p.y);
        return;
      }

      beginStroke(p.x, p.y);
      drawCursor(p.x, p.y);
    };

    const onPointerMove = (e: React.PointerEvent) => {
      const p = getLocal(e);
      drawCursor(p.x, p.y);
      if (!isDownRef.current || !startRef.current) return;
      if (tool === 'fill') return;

      if (['line','rect','roundedRect','circle','ellipse','triangle','arrow'].includes(tool)) {
        const o = overlayRef.current!;
        const octx = o.getContext('2d')!;
        setCtxToDevice(octx);
        octx.clearRect(0, 0, o.width, o.height);
        setCtxToCSS(octx);
        octx.save();
        octx.lineWidth = Math.max(1, activeSize / 3);
        octx.strokeStyle = color;
        octx.fillStyle = color;
        const s = startRef.current!;
        const eW = p;
        if (tool === 'line') { octx.beginPath(); octx.moveTo(s.x, s.y); octx.lineTo(eW.x, eW.y); octx.stroke(); }
        else if (tool === 'rect') { octx.strokeRect(s.x, s.y, eW.x - s.x, eW.y - s.y); }
        else if (tool === 'roundedRect') {
          const r = 8; const x = Math.min(s.x, eW.x), y = Math.min(s.y, eW.y);
          const ww = Math.abs(eW.x - s.x), hh = Math.abs(eW.y - s.y);
          octx.beginPath();
          octx.moveTo(x + r, y);
          octx.lineTo(x + ww - r, y);
          octx.quadraticCurveTo(x + ww, y, x + ww, y + r);
          octx.lineTo(x + ww, y + hh - r);
          octx.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh);
          octx.lineTo(x + r, y + hh);
          octx.quadraticCurveTo(x, y + hh, x, y + hh - r);
          octx.lineTo(x, y + r);
          octx.quadraticCurveTo(x, y, x + r, y);
          octx.stroke();
        }
        else if (tool === 'circle' || tool === 'ellipse') {
          const rx = Math.abs(eW.x - s.x) / 2;
          const ry = tool === 'circle' ? rx : Math.abs(eW.y - s.y) / 2;
          const cx = (s.x + eW.x) / 2; const cy = (s.y + eW.y) / 2;
          octx.beginPath(); octx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); octx.stroke();
        }
        else if (tool === 'triangle') {
          const cx = (s.x + eW.x) / 2;
          octx.beginPath(); octx.moveTo(cx, s.y); octx.lineTo(eW.x, eW.y); octx.lineTo(s.x, eW.y); octx.closePath(); octx.stroke();
        }
        else if (tool === 'arrow') {
          octx.beginPath(); octx.moveTo(s.x, s.y); octx.lineTo(eW.x, eW.y); octx.stroke();
          const head = 8; const ang = Math.atan2(eW.y - s.y, eW.x - s.x);
          const hx = Math.cos(ang) * head, hy = Math.sin(ang) * head;
          octx.beginPath();
          octx.moveTo(eW.x, eW.y);
          octx.lineTo(eW.x - hx + hy / 2, eW.y - hy - hx / 2);
          octx.lineTo(eW.x - hx - hy / 2, eW.y - hy + hx / 2);
          octx.closePath(); octx.stroke();
        }
        octx.restore();
        movedRef.current = true;
        return;
      }

      const prev = lastRef.current!;
      if (prev.x !== p.x || prev.y !== p.y) movedRef.current = true;
      continueStroke(p.x, p.y);
      lastRef.current = p;
    };

    const onPointerUp = (e: React.PointerEvent) => {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      const up = getLocal(e);
      if (!isDownRef.current || !startRef.current) return;

      if (['line','rect','roundedRect','circle','ellipse','triangle','arrow'].includes(tool)) {
        const ctx = canvasRef.current!.getContext('2d')!;
        const s = startRef.current!; const eW = up;
        setCtxToCSS(ctx);
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(1, activeSize / 2);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';

        if (tool === 'line') { ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(eW.x, eW.y); ctx.stroke(); }
        else if (tool === 'rect') { ctx.strokeRect(s.x, s.y, eW.x - s.x, eW.y - s.y); }
        else if (tool === 'roundedRect') {
          const r = 8; const x = Math.min(s.x, eW.x), y = Math.min(s.y, eW.y);
          const ww = Math.abs(eW.x - s.x), hh = Math.abs(eW.y - s.y);
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + ww - r, y);
          ctx.quadraticCurveTo(x + ww, y, x + ww, y + r);
          ctx.lineTo(x + ww, y + hh - r);
          ctx.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh);
          ctx.lineTo(x + r, y + hh);
          ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.stroke();
        }
        else if (tool === 'circle' || tool === 'ellipse') {
          const rx = Math.abs(eW.x - s.x) / 2; const ry = tool === 'circle' ? rx : Math.abs(eW.y - s.y) / 2;
          const cx = (s.x + eW.x) / 2; const cy = (s.y + eW.y) / 2;
          ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
        }
        else if (tool === 'triangle') {
          const cx = (s.x + eW.x) / 2; ctx.beginPath(); ctx.moveTo(cx, s.y); ctx.lineTo(eW.x, eW.y); ctx.lineTo(s.x, eW.y); ctx.closePath(); ctx.stroke();
        }
        else if (tool === 'arrow') {
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(eW.x, eW.y); ctx.stroke();
          const head = 8; const ang = Math.atan2(eW.y - s.y, eW.x - s.x);
          const hx = Math.cos(ang) * head, hy = Math.sin(ang) * head;
          ctx.beginPath();
          ctx.moveTo(eW.x, eW.y);
          ctx.lineTo(eW.x - hx + hy / 2, eW.y - hy - hx / 2);
          ctx.lineTo(eW.x - hx - hy / 2, eW.y - hy + hx / 2);
          ctx.closePath(); ctx.stroke();
        }
        clearOverlay();
        pushHistory();
        isDownRef.current = false; startRef.current = null; lastRef.current = null; movedRef.current = false; return;
      }

      if (tool !== 'fill') endStroke(up.x, up.y);

      isDownRef.current = false; startRef.current = null; lastRef.current = null; movedRef.current = false;
    };

    const onLeave = () => clearOverlay();

    /* Keyboard */
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
          e.preventDefault();
          doUndo();
        } else if (!e.ctrlKey && !e.metaKey) {
          if (e.key === 'b' || e.key === 'B') setToolState('brush');
          if (e.key === 'e' || e.key === 'E') setToolState('eraser');
          if (e.key === 'f' || e.key === 'F') setToolState('fill');
          if (e.key === '1') setBrushSizeState(BRUSH_SIZES[0]);
          if (e.key === '2') setBrushSizeState(BRUSH_SIZES[1]);
          if (e.key === '3') setBrushSizeState(BRUSH_SIZES[2]);
          if (e.key === '4') setBrushSizeState(BRUSH_SIZES[3]);
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    /* Undo / Clear */
    const doUndo = () => {
      if (idxRef.current <= 0) return;
      const i = idxRef.current - 1;
      const img = history[i]!;
      restoreFromDataUrl(img);
      idxRef.current = i;
      setCanUndo(i > 0);
      onDrawEnd?.(img, { canUndo: i > 0 });
    };

    const doClear = () => {
      const ctx = canvasRef.current!.getContext('2d')!;
      const { w, h } = cssSizeRef.current;
      setCtxToCSS(ctx);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      pushHistory();
    };

    const getDataUrl = () => snapshot();

    useImperativeHandle(ref, () => ({
      undo: doUndo,
      clearAll: doClear,
      getDrawingDataUrl: getDataUrl,
      setTool: (t: GarticTool) => setToolState(t),
      setColor: (hex: string) => setColorState(hex),
      setBrushSize: (px: number) => setBrushSizeState(px),
    }));

    /* ---- UI helpers (Portals) ---- */
    const useFloating = (anchorRef: React.RefObject<HTMLElement>, deps: any[] = []) => {
      const [style, setStyle] = useState<React.CSSProperties>({});
      useEffect(() => {
        const el = anchorRef.current;
        if (!el) return;
        const update = () => {
          const r = el.getBoundingClientRect();
          setStyle({ position: 'fixed', top: r.bottom + 8, left: r.left + r.width / 2, transform: 'translateX(-50%)' });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
          window.removeEventListener('scroll', update, true);
          window.removeEventListener('resize', update);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, deps);
      return style;
    };

    const shapesStyle = useFloating(shapesBtnRef, [showShapes]);
    const paletteStyle = useFloating(paletteBtnRef, [showPalette]);

    // Close popovers on outside click
    useEffect(() => {
      const onDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (showShapes && !target.closest('#shapes-popover') && !target.closest('#shapes-anchor')) setShowShapes(false);
        if (showPalette && !target.closest('#palette-popover') && !target.closest('#palette-anchor')) setShowPalette(false);
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [showShapes, showPalette]);

    return (
      <div className={cn('relative h-[70vh] min-h-[360px] w-full', className)}>
        {/* Drawing area */}
        <div ref={wrapRef} className="relative h-full w-full overflow-hidden rounded-lg border bg-white">
          <canvas
            ref={canvasRef}
            className={cn('absolute inset-0 z-0 block h-full w-full touch-none', disabled && 'pointer-events-none opacity-60')}
            onContextMenu={(e) => e.preventDefault()}
          />

          <canvas
            ref={overlayRef}
            className={cn('absolute inset-0 z-10 block h-full w-full touch-none', disabled && 'pointer-events-none')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onLeave}
            onPointerCancel={onPointerUp}
          />
        </div>

        {/* ==== UI OUTSIDE THE WRAP (so overlay never covers it) ==== */}
        {/* Toolbar */}
        <div
          data-ui
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute left-2 top-1/2 -translate-y-1/2 z-[1000] select-none"
        >
          <div
            className="max-h-[72vh] md:max-h-[86vh] overflow-auto py-2 px-1 -webkit-overflow-scrolling-touch rounded-2xl border bg-white/90 backdrop-blur"
          >
            <div className="flex flex-col items-center gap-2 p-2">
              <button
                id="brush-btn"
                data-ui
                type="button"
                title="فرشاة (B)"
                onClick={() => { setToolState('brush'); setShowShapes(false); }}
                className={cn('grid place-items-center rounded-lg border h-10 w-10', tool === 'brush' ? 'bg-zinc-100 border-zinc-400' : 'bg-white hover:bg-zinc-50')}
                aria-pressed={tool === 'brush'}
              >
                <Pen className="h-4 w-4" />
              </button>

              <button
                id="eraser-btn"
                data-ui
                type="button"
                title="ممحاة (E)"
                onClick={() => { setToolState('eraser'); setShowShapes(false); }}
                className={cn('grid place-items-center rounded-lg border h-10 w-10', tool === 'eraser' ? 'bg-zinc-100 border-zinc-400' : 'bg-white hover:bg-zinc-50')}
                aria-pressed={tool === 'eraser'}
              >
                <Eraser className="h-4 w-4" />
              </button>

              <button
                id="fill-btn"
                data-ui
                type="button"
                title="دلو تعبئة (F)"
                onClick={() => { setToolState('fill'); setShowShapes(false); }}
                className={cn('grid place-items-center rounded-lg border h-10 w-10', tool === 'fill' ? 'bg-zinc-100 border-zinc-400' : 'bg-white hover:bg-zinc-50')}
                aria-pressed={tool === 'fill'}
              >
                <PaintBucket className="h-4 w-4" />
              </button>

              {/* Shapes trigger */}
              <div className="relative">
                <button
                  id="shapes-anchor"
                  ref={shapesBtnRef}
                  data-ui
                  type="button"
                  title="أدوات هندسية"
                  onClick={() => setShowShapes((s) => !s)}
                  className={cn('grid place-items-center rounded-lg border h-10 w-10', showShapes ? 'bg-zinc-100 border-zinc-400' : 'bg-white hover:bg-zinc-50')}
                >
                  <Square className="h-4 w-4" />
                </button>
              </div>

              {/* Divider */}
              <div className="h-px w-full bg-zinc-100 my-1" />

              <button
                data-ui
                type="button"
                title="تراجع (Ctrl+Z)"
                onClick={doUndo}
                disabled={!canUndo}
                className={cn('grid place-items-center rounded-lg border h-10 w-10 disabled:opacity-40', canUndo ? 'bg-white hover:bg-zinc-50' : 'bg-white')}
              >
                <Undo2 className="h-4 w-4" />
              </button>

              <button
                data-ui
                type="button"
                title="مسح الكل"
                onClick={doClear}
                className="grid place-items-center rounded-lg border h-10 w-10 bg-white hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              {/* Size controls (depend on tool) */}
              <div className="flex flex-col gap-2 mt-1" data-ui>
                {(tool === 'eraser' ? ERASER_SIZES : BRUSH_SIZES).map((s) => (
                  <button
                    key={s}
                    type="button"
                    title={`سماكة ${s}px`}
                    onClick={() => tool === 'eraser' ? setEraserSize(s) : setBrushSizeState(s)}
                    className={cn('grid place-items-center rounded-lg border h-9 w-9', (tool === 'eraser' ? eraserSize : brushSize) === s ? 'bg-zinc-100 border-zinc-400' : 'bg-white hover:bg-zinc-50')}
                  >
                    <div className="rounded-full bg-zinc-800" style={{ width: Math.max(2, s), height: Math.max(2, s) }} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom palette toggle */}
        <div
          data-ui
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000]"
        >
          <div className="flex items-center gap-2">
            <button
              id="palette-anchor"
              ref={paletteBtnRef}
              data-ui
              type="button"
              title="اختر اللون"
              onClick={() => setShowPalette((s) => !s)}
              className="h-10 w-10 rounded-full border grid place-items-center bg-white shadow"
              aria-expanded={showPalette}
            >
              <Palette className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* SHAPES POPOVER (Portal) */}
        {showShapes && typeof window !== 'undefined' && createPortal(
          <div id="shapes-popover" data-ui style={shapesStyle} className="z-[1200] flex flex-col gap-1 bg-white rounded-xl border p-2 shadow w-40">
            {([
              { t: 'line', I: ArrowRight, label: 'خط' },
              { t: 'rect', I: Square, label: 'مستطيل' },
              { t: 'roundedRect', I: Square, label: 'مستطيل مستدير' },
              { t: 'circle', I: Circle, label: 'دائرة' },
              { t: 'ellipse', I: Circle, label: 'بيضاوي' },
              { t: 'triangle', I: Triangle, label: 'مثلث' },
              { t: 'arrow', I: ArrowRight, label: 'سهم' },
            ] as { t: GarticTool; I: any; label: string }[]).map(({ t, I, label }) => (
              <button
                key={label}
                data-ui
                type="button"
                onClick={() => { setToolState(t); setShowShapes(false); }}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-zinc-50"
              >
                <I className="h-4 w-4" />
                <span className="text-sm">{label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}

        {/* PALETTE POPOVER (Portal) */}
        {showPalette && typeof window !== 'undefined' && createPortal(
          <div id="palette-popover" data-ui style={paletteStyle} className="z-[1200] rounded-xl border bg-white p-3 shadow w-[90vw] max-w-[520px] max-h-[40vh] overflow-auto">
            <div className="grid grid-cols-12 gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  data-ui
                  type="button"
                  title={c}
                  onClick={() => { setColorState(c); if (tool === 'eraser') setToolState('brush'); setShowPalette(false); }}
                  className={cn('h-8 w-8 rounded-full border', color === c ? 'ring-2 ring-zinc-800 border-zinc-400' : 'border-zinc-200 hover:scale-105 transition')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }
);

GarticLikeCanvas.displayName = 'GarticLikeCanvas';
export default GarticLikeCanvas;
