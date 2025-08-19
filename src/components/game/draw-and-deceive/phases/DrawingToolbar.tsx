'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import {
  Pen, Eraser, Minus, Square, Circle, Triangle,
  Undo2, Redo, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ColorSwatch = ({ color, ...props }: { color: string } & React.ComponentProps<'button'>) => (
  <button {...props}>
    <div className="w-6 h-6 rounded-full border-2" style={{ backgroundColor: color }} />
  </button>
);

const BrushGroup = ({ tool, setTool }: { tool: any; setTool: (t: any) => void }) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline" size="icon"><Pen /></Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-2">
      <div className="flex gap-2">
        <Button variant={tool === 'pen' ? 'secondary' : 'ghost'} size="icon" onClick={() => setTool('pen')}><Pen /></Button>
        <Button variant={tool === 'marker' ? 'secondary' : 'ghost'} size="icon" onClick={() => setTool('marker')}><Pen /></Button>
        <Button variant={tool === 'eraser' ? 'secondary' : 'ghost'} size="icon" onClick={() => setTool('eraser')}><Eraser /></Button>
      </div>
    </PopoverContent>
  </Popover>
);

const ShapesGroup = ({ tool, setTool }: { tool: any; setTool: (t: any) => void }) => {
  const shapes: { tool: any; icon: React.ElementType }[] = [
    { tool: 'line', icon: Minus },
    { tool: 'rect', icon: Square },
    { tool: 'circle', icon: Circle },
    { tool: 'triangle', icon: Triangle },
    { tool: 'ellipse', icon: Circle },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon"><Square /></Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="flex gap-2">
          {shapes.map(({ tool: shapeTool, icon: Icon }) => (
            <Button key={shapeTool} variant={tool === shapeTool ? 'secondary' : 'ghost'} size="icon" onClick={() => setTool(shapeTool)}><Icon /></Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ColorGroup = ({ color, setColor }: { color: string; setColor: (c: string) => void }) => {
  const colors = ['#000000', '#ff0000', '#0000ff', '#008000', '#ffff00', '#ffa500'];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon"><ColorSwatch color={color} /></Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="flex gap-2">
          {colors.map(c => <ColorSwatch key={c} color={c} onClick={() => setColor(c)} />)}
          <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 p-1" />
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const DrawingToolbar = React.memo(({
  tool, setTool, color, setColor, thickness, setThickness, opacity, setOpacity,
  canUndo, onUndo, canRedo, onRedo, onClearAll
}: any) => (
  <Card className="w-full">
    <CardContent className="p-2 flex flex-wrap items-center justify-center gap-2">
      <BrushGroup tool={tool} setTool={setTool} />
      <ShapesGroup tool={tool} setTool={setTool} />
      <ColorGroup color={color} setColor={setColor} />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">سمك: {thickness}</Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2">
          <Slider value={[thickness]} onValueChange={([v]) => setThickness(v)} max={50} step={1} />
        </PopoverContent>
      </Popover>

      <Button variant="outline" size="icon" onClick={onUndo} disabled={!canUndo}><Undo2 /></Button>
      <Button variant="outline" size="icon" onClick={onRedo} disabled={!canRedo}><Redo /></Button>
      <Button variant="destructive" size="icon" onClick={onClearAll}><Trash2 /></Button>
    </CardContent>
  </Card>
));
DrawingToolbar.displayName = 'DrawingToolbar';
