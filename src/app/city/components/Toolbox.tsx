
'use client';

import type { StoreItem } from '@/types';
import { useDrag } from 'react-dnd';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { iconMap } from '@/data/icons';
import { Building, Lock, Coins, ShoppingCart } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from '@/components/ui/button';


interface StoreItemDraggableProps {
    item: StoreItem;
    isUnlocked: boolean;
    onPurchase: (itemId: string) => void;
}

const StoreItemDraggable = ({ item, isUnlocked, onPurchase }: StoreItemDraggableProps) => {
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'storeItem',
        item: item,
        canDrag: isUnlocked,
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
    }));
    
    const Icon = iconMap[item.icon] || Building;

    return (
        <div ref={drag} className={cn(
            "p-2 flex items-center gap-2 bg-slate-800 border-slate-700 rounded-lg transition-all",
            isUnlocked ? "cursor-grab" : "cursor-not-allowed opacity-50",
            isDragging && "opacity-30 ring-2 ring-primary"
        )}>
            <div className="p-2 bg-slate-900 rounded-md">
                <Icon className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-grow">
                <p className="font-bold text-sm">{item.name}</p>
                <div className="flex items-center gap-1 text-xs text-yellow-400">
                    <Coins className="w-3 h-3"/>
                    <span>{item.price}</span>
                </div>
            </div>
            {!isUnlocked && 
                <Button size="icon" className="h-8 w-8" onClick={() => onPurchase(item.id)}>
                    <ShoppingCart className="w-4 h-4"/>
                </Button>
            }
        </div>
    );
};


interface ToolboxProps {
    storeItems: StoreItem[];
    unlockedItems: string[];
    onPurchase: (itemId: string) => void;
}

export function Toolbox({ storeItems, unlockedItems, onPurchase }: ToolboxProps) {

  const categorizedItems = {
    building: storeItems.filter(item => item.type === 'building'),
    road: storeItems.filter(item => item.type === 'road'),
    decoration: storeItems.filter(item => item.type === 'decoration'),
  };

  return (
    <aside className="w-72 bg-black/20 border-r border-white/10 flex flex-col p-2">
      <CardHeader className="p-2 text-center">
        <CardTitle className="text-2xl">متجر المدينة</CardTitle>
        <CardDescription>اسحب العناصر لوضعها</CardDescription>
      </CardHeader>
      <ScrollArea className="flex-grow">
        <Accordion type="multiple" defaultValue={['building', 'road', 'decoration']} className="w-full">
            <AccordionItem value="building">
                <AccordionTrigger>مباني</AccordionTrigger>
                <AccordionContent>
                    <div className="space-y-2">
                        {categorizedItems.building.map(item => (
                            <StoreItemDraggable key={item.id} item={item} isUnlocked={unlockedItems.includes(item.id)} onPurchase={onPurchase} />
                        ))}
                    </div>
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="road">
                <AccordionTrigger>طرق</AccordionTrigger>
                <AccordionContent>
                     <div className="space-y-2">
                        {categorizedItems.road.map(item => (
                            <StoreItemDraggable key={item.id} item={item} isUnlocked={unlockedItems.includes(item.id)} onPurchase={onPurchase} />
                        ))}
                    </div>
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="decoration">
                <AccordionTrigger>ديكورات</AccordionTrigger>
                <AccordionContent>
                     <div className="space-y-2">
                        {categorizedItems.decoration.map(item => (
                            <StoreItemDraggable key={item.id} item={item} isUnlocked={unlockedItems.includes(item.id)} onPurchase={onPurchase} />
                        ))}
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
      </ScrollArea>
    </aside>
  );
}
