'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import {
  Undo2, Redo2, Eraser, Pencil, Highlighter, Type, Droplet,
  ImageIcon, Download, Square, Circle, Minus, Grid, Trash2, Hand,
  PaintBucket, Copy as CopyIcon,
  Triangle, Ellipse
} from 'lucide-react';
import type { Tool } from './DrawingCanvas';

// ====================================================================================
// DrawingToolbar Component
// Manages the UI for selecting tools and their properties. It's a "controlled" component.
// ====================================================================================

interface DrawingToolbarProps {
  tool: Tool;
  setTool: (tool: Tool) => void;
  color: string;
  setColor: (color: string) => void;
  thickness: number;
  setThickness: (thickness: number) => void;
  opacity: number;
  setOpacity: (opacity: number) => void;
  shapeFill: boolean;
  setShapeFill: (fill: boolean) => void;
  textValue: string;
  setTextValue: (text: string) => void;
  textSize: number;
  setTextSize: (size: number) => void;
  fillTolerance: number;
  setFillTolerance: (tolerance: number) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  onClearAll: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function DrawingToolbar({
  tool, setTool, color, setColor, thickness, setThickness, opacity, setOpacity,
  shapeFill, setShapeFill, textValue, setTextValue, textSize, setTextSize, fillTolerance,
  setFillTolerance, showGrid, setShowGrid, onUndo, canUndo, onRedo, canRedo, onClearAll,
  onDownload, onCopy, onImport,
}: DrawingToolbarProps) {

  const inputFileRef = React.useRef<HTMLInputElement>(null);

  const BrushesGroup = () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" aria-label="الفرش" variant={['pen', 'marker', 'eraser'].includes(tool) ? 'default' : 'secondary'} title="الفرش">
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
        <Button size="icon" aria-label="أشكال" variant={['line', 'rect', 'circle', 'triangle', 'ellipse'].includes(tool) ? 'default' : 'secondary'} title="أشكال">
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
        <Button size="icon" aria-label="تعبئة" variant={tool === 'fill' ? 'default' : 'secondary'} title="تعبئة" onClick={() => setTool('fill')}>
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

  return (
    <div className="p-2 rounded-2xl bg-background/80 dark:bg-slate-900/50 backdrop-blur shadow border border-border shrink-0">
      <div className="flex flex-col gap-2">
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

          <Button size="icon" variant="secondary" onClick={onUndo} disabled={!canUndo} title="تراجع (Ctrl+Z)"><Undo2 className="w-4 h-4" /></Button>
          <Button size="icon" variant="secondary" onClick={onRedo} disabled={!canRedo} title="إعادة (Ctrl+Y)"><Redo2 className="w-4 h-4" /></Button>
          <Button size="icon" variant="secondary" onClick={onClearAll} title="مسح الكل"><Trash2 className="w-4 h-4" /></Button>

          <input ref={inputFileRef} type="file" accept="image/*" className="hidden" onChange={onImport} />
          <Button size="icon" variant="secondary" title="استيراد صورة" onClick={() => inputFileRef.current?.click()}><ImageIcon className="w-4 h-4" /></Button>

          <Button size="icon" variant="secondary" onClick={onCopy} title="نسخ للصق"><CopyIcon className="w-4 h-4" /></Button>
          <Button size="icon" variant="secondary" onClick={onDownload} title="حفظ كصورة"><Download className="w-4 h-4" /></Button>
        </div>

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
    </div>
  );
}
