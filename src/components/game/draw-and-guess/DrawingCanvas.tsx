"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as StageType } from 'konva/lib/Stage';
import type { DrawingLine } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Eraser, Pen, Undo2 } from 'lucide-react';

const COLORS = [
  '#000000', '#FFFFFF', '#FF3B30', '#FF9500', '#FFCC00',
  '#4CD964', '#5AC8FA', '#007AFF', '#5856D6', '#AF52DE',
  '#FF2D55', '#C69C6D'
];
const STROKE_SIZES = [4, 8, 16, 32];

interface DrawingCanvasProps {
  initialLines?: DrawingLine[];
  onDraw: (lines: DrawingLine[]) => void;
  isDrawingDisabled?: boolean;
}

export function DrawingCanvas({
  initialLines = [],
  onDraw,
  isDrawingDisabled = false
}: DrawingCanvasProps) {
  const [lines, setLines] = useState<DrawingLine[]>(initialLines);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(8);

  const stageRef = useRef<StageType>(null);
  
  // Ref to hold the timeout ID
  const drawTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Function to call onDraw, wrapped in a timeout to batch updates
  const triggerOnDraw = (newLines: DrawingLine[]) => {
    if (drawTimeoutRef.current) {
      clearTimeout(drawTimeoutRef.current);
    }
    drawTimeoutRef.current = setTimeout(() => {
      onDraw(newLines);
    }, 200); // 200ms debounce time
  };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (isDrawingDisabled) return;
    setIsDrawing(true);
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;

    const newLines = [
      ...lines,
      { points: [pos.x, pos.y], color: tool === 'pen' ? color : '#FFFFFF', strokeWidth },
    ];
    setLines(newLines);
    triggerOnDraw(newLines);
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!isDrawing || isDrawingDisabled) return;
    const stage = e.target.getStage();
    const point = stage?.getPointerPosition();
    if (!point) return;

    let lastLine = lines[lines.length - 1];
    if (!lastLine) return;

    lastLine.points = lastLine.points.concat([point.x, point.y]);
    
    // Create a new array to trigger re-render
    const newLines = [...lines]; 
    setLines(newLines);
    triggerOnDraw(newLines);
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };
  
  const handleUndo = () => {
    if (isDrawingDisabled) return;
    const newLines = lines.slice(0, -1);
    setLines(newLines);
    triggerOnDraw(newLines);
  };
  
  return (
    <div className="flex flex-col w-full h-full items-center gap-4 bg-gray-800 p-4 rounded-xl">
        <div className="w-full h-full bg-white rounded-lg shadow-inner overflow-hidden">
             <Stage
                ref={stageRef}
                width={800} // Set a fixed internal resolution
                height={600}
                onMouseDown={handleMouseDown}
                onMousemove={handleMouseMove}
                onMouseup={handleMouseUp}
                onTouchStart={handleMouseDown}
                onTouchMove={handleMouseMove}
                onTouchEnd={handleMouseUp}
                className="w-full h-full"
                style={{ backgroundColor: 'white' }}
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
                            globalCompositeOperation={
                                line.color === '#FFFFFF' ? 'destination-out' : 'source-over'
                            }
                        />
                    ))}
                </Layer>
            </Stage>
        </div>
        {!isDrawingDisabled && (
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 p-3 bg-gray-900 rounded-full shadow-lg">
             <div className="flex items-center gap-2">
                 <Button variant="ghost" size="icon" className={cn(tool === 'pen' && "bg-primary/20")} onClick={() => setTool('pen')}>
                     <Pen className="text-white" />
                 </Button>
                 <Button variant="ghost" size="icon" className={cn(tool === 'eraser' && "bg-primary/20")} onClick={() => setTool('eraser')}>
                     <Eraser className="text-white"/>
                 </Button>
             </div>

              <div className="h-6 w-px bg-gray-600"></div>

              <div className="flex items-center gap-1.5">
                  {COLORS.map(c => (
                      <button
                          key={c}
                          className={cn("w-6 h-6 rounded-full border-2 transition-transform", color === c ? 'border-white scale-110' : 'border-transparent')}
                          style={{ backgroundColor: c }}
                          onClick={() => setColor(c)}
                      />
                  ))}
              </div>
              
              <div className="h-6 w-px bg-gray-600"></div>
              
              <div className="flex items-center gap-2">
                  {STROKE_SIZES.map(size => (
                      <button
                          key={size}
                          className={cn("rounded-full transition-all flex items-center justify-center", strokeWidth === size ? 'bg-primary' : 'bg-gray-700')}
                          onClick={() => setStrokeWidth(size)}
                          style={{ width: `${size+10}px`, height: `${size+10}px`}}
                      >
                         <div className="bg-white rounded-full" style={{width: `${size}px`, height: `${size}px`}}></div>
                      </button>
                  ))}
              </div>
              
              <div className="h-6 w-px bg-gray-600"></div>

              <Button variant="ghost" size="icon" onClick={handleUndo}>
                <Undo2 className="text-white"/>
              </Button>
          </div>
        )}
    </div>
  );
}