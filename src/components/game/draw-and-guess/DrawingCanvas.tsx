
"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Line, Rect, Circle, RegularPolygon } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as StageType } from 'konva/lib/Stage';
import type { DrawingLine, DrawingRect, DrawingCircle, DrawingShape, DrawingTriangle } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Eraser, Pen, Slash, Square, Circle as CircleIcon, Triangle, PaintBucket, Pipette, Undo2, RotateCcw, Minus, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';


const STROKE_SIZES = [2, 4, 8, 16, 32];
type Tool = 'pen' | 'eraser' | 'line' | 'rect' | 'circle' | 'triangle' | 'fill';

const QUICK_COLORS = [
  '#000000', '#FFFFFF', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#78716c'
];

interface DrawingCanvasProps {
  initialDrawing?: { lines: DrawingLine[], shapes: DrawingShape[], bgColor: string };
  onDraw: (drawing: { lines: DrawingLine[], shapes: DrawingShape[], bgColor: string }) => void;
  isDrawingDisabled?: boolean;
  isViewingOnly?: boolean; // New prop to control view-only state
}

export function DrawingCanvas({
  initialDrawing,
  onDraw,
  isDrawingDisabled = false,
  isViewingOnly = false, // Default to false
}: DrawingCanvasProps) {
  const [lines, setLines] = useState<DrawingLine[]>(initialDrawing?.lines || []);
  const [shapes, setShapes] = useState<DrawingShape[]>(initialDrawing?.shapes || []);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(8);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [bgColor, setBgColor] = useState(initialDrawing?.bgColor || '#FFFFFF');
  
  const stageRef = useRef<StageType>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const drawTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // When viewing, we want to update the canvas when the initialDrawing prop changes.
  useEffect(() => {
    if (isViewingOnly && initialDrawing) {
        setLines(initialDrawing.lines || []);
        setShapes(initialDrawing.shapes || []);
        setBgColor(initialDrawing.bgColor || '#FFFFFF');
    }
  }, [isViewingOnly, initialDrawing]);

  // For the drawer, we only want to set the initial drawing once.
  useEffect(() => {
    if (!isViewingOnly && initialDrawing) {
        setLines(initialDrawing.lines || []);
        setShapes(initialDrawing.shapes || []);
        setBgColor(initialDrawing.bgColor || '#FFFFFF');
    }
  }, []); // Empty dependency array ensures this runs only on mount for the drawer.


  const triggerOnDraw = useCallback(() => {
    if (drawTimeoutRef.current) clearTimeout(drawTimeoutRef.current);
    drawTimeoutRef.current = setTimeout(() => {
      if (!isDrawingDisabled) {
         onDraw({
            lines: lines,
            shapes: shapes,
            bgColor: bgColor
        });
      }
    }, 500); // 500ms debounce
  }, [lines, shapes, bgColor, onDraw, isDrawingDisabled]);


  useEffect(() => {
    const checkSize = () => {
      if (containerRef.current) {
        setCanvasSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  const getRelativePointerPosition = (stage: StageType) => {
    const pointerPosition = stage.getPointerPosition();
    if (!pointerPosition) return null;
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    return transform.point(pointerPosition);
  };
  
  const handleMouseDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (isDrawingDisabled) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = getRelativePointerPosition(stage);
    if (!pos) return;
    
    setIsDrawing(true);
    setStartPos(pos);
    
    if (tool === 'pen' || tool === 'eraser') {
      const newLine: DrawingLine = { points: [pos.x, pos.y], color, strokeWidth, tool };
      setLines(prevLines => [...prevLines, newLine]);
    } else if (tool === 'fill') {
        setBgColor(color);
        triggerOnDraw();
    }
  };

 const handleMouseMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!isDrawing || isDrawingDisabled) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = getRelativePointerPosition(stage);
    if (!pos) return;

    if (tool === 'pen' || tool === 'eraser') {
      setLines(prevLines => {
          // Create a new array to avoid direct mutation
          const newLines = [...prevLines];
          if (newLines.length === 0) return newLines;

          // Get the last line, create a new object for it to ensure immutability
          const lastLine = { ...newLines[newLines.length - 1] };
          
          // Add new points to the new last line object
          lastLine.points = lastLine.points.concat([pos.x, pos.y]);
          
          // Replace the old last line with the new one in the new array
          newLines[newLines.length - 1] = lastLine;
          
          return newLines;
      });
    } else { // Shape drawing logic
       setShapes(prevShapes => {
           const tempShapes = [...prevShapes];
           let currentShape = tempShapes[tempShapes.length - 1];
           // If the last shape was a temporary drawing shape, remove it before adding the new one
           if (currentShape && currentShape.isDrawing) {
               tempShapes.pop();
           }
           
           let newShape: DrawingShape | null = null;
           if (tool === 'rect') {
                newShape = { type: 'rect', x: startPos.x, y: startPos.y, width: pos.x - startPos.x, height: pos.y - startPos.y, stroke: color, strokeWidth, isDrawing: true };
           } else if (tool === 'circle') {
                const dx = pos.x - startPos.x;
                const dy = pos.y - startPos.y;
                const radius = Math.sqrt(dx * dx + dy * dy);
                newShape = { type: 'circle', x: startPos.x, y: startPos.y, radius, stroke: color, strokeWidth, isDrawing: true };
           } else if (tool === 'line') {
                newShape = { type: 'line', points: [startPos.x, startPos.y, pos.x, pos.y], stroke: color, strokeWidth, isDrawing: true };
           } else if (tool === 'triangle') {
               const side = Math.max(Math.abs(pos.x - startPos.x), Math.abs(pos.y - startPos.y));
               newShape = { type: 'triangle', x: startPos.x, y: startPos.y, radius: side / Math.sqrt(3), stroke: color, strokeWidth, isDrawing: true };
           }
           
           if (newShape) {
               return [...tempShapes, newShape];
           }
           return tempShapes;
       });
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || isDrawingDisabled) return;
    setIsDrawing(false);

    if (tool !== 'pen' && tool !== 'eraser') {
       setShapes(prevShapes => {
            const finalShapes = [...prevShapes];
            const currentShape = finalShapes[finalShapes.length - 1];
            if (currentShape && currentShape.isDrawing) {
                // Finalize the shape by removing the isDrawing flag
                const { isDrawing, ...finalShape } = currentShape;
                finalShapes[finalShapes.length - 1] = finalShape as DrawingShape;
            }
            return finalShapes;
       });
    }
    triggerOnDraw();
  };
  
    const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;

        const scaleBy = 1.1;
        const oldScale = stage.scaleX();
        
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        
        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };
        
        const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
        
        // Clamp scale
        const clampedScale = Math.max(1, Math.min(5, newScale));

        stage.scale({ x: clampedScale, y: clampedScale });
        
        const newPos = {
            x: pointer.x - mousePointTo.x * clampedScale,
            y: pointer.y - mousePointTo.y * clampedScale,
        };

        stage.position(newPos);
        stage.batchDraw();
    };


  const handleUndo = () => {
    if (isDrawingDisabled) return;
    if (shapes.length > 0) {
      setShapes(shapes.slice(0, -1));
    } else if (lines.length > 0) {
      setLines(lines.slice(0, -1));
    }
    triggerOnDraw();
  };

  const handleClear = () => {
    if (isDrawingDisabled) return;
    setLines([]);
    setShapes([]);
    setBgColor('#FFFFFF');
    triggerOnDraw();
  };
  
  const cursorClass = useMemo(() => {
    if (isDrawingDisabled && !isViewingOnly) return 'cursor-not-allowed';
    if (isViewingOnly) return 'cursor-grab';
    switch(tool) {
        case 'pen': return 'cursor-crosshair';
        case 'eraser': return 'cursor-cell';
        case 'fill': return 'cursor-copy';
        case 'line':
        case 'rect':
        case 'circle':
        case 'triangle':
            return 'cursor-crosshair';
        default: return 'cursor-crosshair';
    }
  }, [tool, isDrawingDisabled, isViewingOnly]);

  return (
    <div className="flex flex-col w-full h-full items-center gap-2 bg-gray-800 p-2 rounded-xl">
      <div ref={containerRef} className={cn("w-full h-full rounded-lg shadow-inner overflow-hidden", cursorClass)} style={{ backgroundColor: bgColor }}>
        <Stage
          ref={stageRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
          onWheel={handleWheel}
        >
          <Layer>
            <Rect x={0} y={0} width={canvasSize.width} height={canvasSize.height} fill={bgColor} />
            {lines.map((line, i) => (
              <Line
                key={`line-${i}`}
                points={line.points}
                stroke={line.tool === 'eraser' ? bgColor : line.color}
                strokeWidth={line.strokeWidth}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={line.tool === 'eraser' ? 'destination-out' : 'source-over'}
              />
            ))}
            {shapes.map((shape, i) => {
                const { isDrawing, ...shapeProps } = shape;
                switch (shape.type) {
                    case 'rect':
                        return <Rect key={`shape-${i}`} {...(shapeProps as DrawingRect)} />;
                    case 'circle':
                        return <Circle key={`shape-${i}`} {...(shapeProps as DrawingCircle)} />;
                    case 'line':
                        return <Line key={`shape-${i}`} points={(shape as any).points} stroke={shape.stroke} strokeWidth={shape.strokeWidth} lineCap="round" />;
                    case 'triangle':
                        return <RegularPolygon key={`shape-${i}`} x={shape.x} y={shape.y} sides={3} radius={shape.radius} stroke={shape.stroke} strokeWidth={shape.strokeWidth} />;
                    default:
                        return null;
                }
            })}
          </Layer>
        </Stage>
      </div>
      {!isDrawingDisabled && (
        <div className="flex flex-wrap items-center justify-center gap-2 p-2 bg-gray-900 rounded-full shadow-lg">
          <div className="flex items-center gap-1 p-1 bg-slate-700 rounded-full">
            <Button variant="ghost" size="icon" className={cn("text-white", tool === 'pen' && "bg-primary/50")} onClick={() => setTool('pen')}><Pen /></Button>
            <Button variant="ghost" size="icon" className={cn("text-white", tool === 'eraser' && "bg-primary/50")} onClick={() => setTool('eraser')}><Eraser /></Button>
            <Button variant="ghost" size="icon" className={cn("text-white", tool === 'fill' && "bg-primary/50")} onClick={() => setTool('fill')}><PaintBucket /></Button>
          </div>
          <div className="h-6 w-px bg-gray-600"></div>
           <div className="flex items-center gap-1 p-1 bg-slate-700 rounded-full">
            <Button variant="ghost" size="icon" className={cn("text-white", tool === 'line' && "bg-primary/50")} onClick={() => setTool('line')}><Slash /></Button>
            <Button variant="ghost" size="icon" className={cn("text-white", tool === 'rect' && "bg-primary/50")} onClick={() => setTool('rect')}><Square /></Button>
            <Button variant="ghost" size="icon" className={cn("text-white", tool === 'circle' && "bg-primary/50")} onClick={() => setTool('circle')}><CircleIcon /></Button>
            <Button variant="ghost" size="icon" className={cn("text-white", tool === 'triangle' && "bg-primary/50")} onClick={() => setTool('triangle')}><Triangle /></Button>
          </div>
          <div className="h-6 w-px bg-gray-600"></div>
           <div className="flex items-center gap-1.5 p-1 bg-slate-700 rounded-full">
            {QUICK_COLORS.map(c => (
              <button key={c} className={cn("w-6 h-6 rounded-full border-2 transition-transform", color === c ? 'border-white scale-110' : 'border-transparent')} style={{ backgroundColor: c }} onClick={() => setColor(c)} />
            ))}
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-white"><Pipette/></Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 border-none bg-transparent">
                    <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-20 h-20 bg-transparent border-none cursor-pointer" />
                </PopoverContent>
            </Popover>
          </div>
          <div className="h-6 w-px bg-gray-600"></div>
          <div className="flex items-center gap-2 p-1 bg-slate-700 rounded-full">
            <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => setStrokeWidth(s => Math.max(1, s-1))}><Minus /></Button>
            <div className="text-white font-mono w-5 text-center">{strokeWidth}</div>
            <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => setStrokeWidth(s => Math.min(50, s+1))}><Plus /></Button>
          </div>
          <div className="h-6 w-px bg-gray-600"></div>
          <div className="flex items-center gap-1 p-1 bg-slate-700 rounded-full">
            <Button variant="ghost" size="icon" className="text-white" onClick={handleUndo}><Undo2/></Button>
            <Button variant="ghost" size="icon" className="text-white" onClick={handleClear}><RotateCcw /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
