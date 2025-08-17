
      
'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Button } from '@/components/ui/button';
import { Circle, Square, Minus, Eraser, Undo, Redo, Trash2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface DrawingCanvasProps {
  width: number;
  height: number;
  onDrawEnd: (dataUrl: string) => void;
  disabled?: boolean;
}

type LineData = {
  tool: 'pen' | 'eraser';
  points: number[];
  color: string;
  strokeWidth: number;
};

const BRUSH_SIZES = [2, 5, 10, 20];
const COLORS = ['#FFFFFF', '#EF4444', '#3B82F6', '#22C55E', '#F97316', '#FDE047', '#A78BFA'];

export function DrawingCanvas({ width, height, onDrawEnd, disabled }: DrawingCanvasProps) {
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [lines, setLines] = useState<LineData[]>([]);
  const [history, setHistory] = useState<LineData[][]>([[]]);
  const [historyStep, setHistoryStep] = useState(0);

  const [color, setColor] = useState('#FFFFFF');
  const [brushSize, setBrushSize] = useState(5);

  const isDrawing = useRef(false);
  const stageRef = useRef<any>(null);

  const handleMouseDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (disabled) return;
    isDrawing.current = true;
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    setLines([...lines, { tool, points: [pos.x, pos.y], color, strokeWidth: brushSize }]);
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!isDrawing.current || disabled) return;
    const stage = e.target.getStage();
    const point = stage?.getPointerPosition();
    if (!point) return;
    let lastLine = lines[lines.length - 1];
    if (!lastLine) return;

    lastLine.points = lastLine.points.concat([point.x, point.y]);
    setLines([...lines.slice(0, lines.length - 1), lastLine]);
  };

  const handleMouseUp = () => {
    if (disabled) return;
    isDrawing.current = false;
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(lines);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyStep === 0) return;
    const newStep = historyStep - 1;
    setHistoryStep(newStep);
    setLines(history[newStep]!);
  };

  const handleRedo = () => {
    if (historyStep === history.length - 1) return;
    const newStep = historyStep + 1;
    setHistoryStep(newStep);
    setLines(history[newStep]!);
  };

  const handleClear = () => {
    setLines([]);
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push([]);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <div className="w-full rounded-lg overflow-hidden bg-slate-700 border-2 border-primary">
        <Stage
          ref={stageRef}
          width={width}
          height={height}
          onMouseDown={handleMouseDown}
          onMousemove={handleMouseMove}
          onMouseup={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
        >
          <Layer>
            {lines.map((line, i) => (
              <Line
                key={i}
                points={line.points}
                stroke={line.color}
                strokeWidth={line.strokeWidth}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={line.tool === 'eraser' ? 'destination-out' : 'source-over'}
              />
            ))}
          </Layer>
        </Stage>
      </div>

      <div className="w-full flex flex-col sm:flex-row gap-2 justify-between p-2 rounded-lg bg-slate-800 border border-slate-700">
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <Button
              key={c}
              size="icon"
              className={cn("h-8 w-8 rounded-full border-2", color === c ? 'border-white' : 'border-transparent')}
              style={{ backgroundColor: c }}
              onClick={() => { setTool('pen'); setColor(c); }}
              aria-label={`Select color ${c}`}
            />
          ))}
          <Button size="icon" variant={tool === 'eraser' ? 'secondary' : 'ghost'} className="h-8 w-8" onClick={() => setTool('eraser')}>
            <Eraser />
          </Button>
        </div>

        <div className="flex gap-2 items-center">
          {BRUSH_SIZES.map((size) => (
            <Button
              key={size}
              size="icon"
              variant={brushSize === size ? 'secondary' : 'ghost'}
              className="h-8 w-8 rounded-full"
              onClick={() => setBrushSize(size)}
            >
              <div style={{ width: size + 4, height: size + 4 }} className="bg-white rounded-full" />
            </Button>
          ))}
        </div>

        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={handleUndo} disabled={historyStep === 0}><Undo /></Button>
          <Button size="icon" variant="ghost" onClick={handleRedo} disabled={historyStep === history.length - 1}><Redo /></Button>
          <Button size="icon" variant="destructive" onClick={handleClear}><Trash2 /></Button>
        </div>
      </div>
    </div>
  );
}

    