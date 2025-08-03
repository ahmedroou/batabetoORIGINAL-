
'use client';

import type { StoreItem } from '@/types';
import { useDrag } from 'react-dnd';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { iconMap } from '@/data/icons';
import { Building, Lock, Coins, ShoppingCart, Zap, Package, TreeDeciduous, Users } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


interface StoreItemDraggableProps {
    item: StoreItem;
    isUnlocked: boolean;
    onPurchase: (itemId: string) => void;
}

const StoreItemDraggable = ({ item, isUnlocked, onPurchase }: StoreItemDraggableProps) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [{ isDragging }, drag] = useDrag(() => ({
        type: 'storeItem',
        item: item,
        canDrag: isUnlocked,
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
    }));

    const handlePurchaseClick = async (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent accordion from closing
      setIsSubmitting(true);
      await onPurchase(item.id);
      setIsSubmitting(false);
    }
    
    const Icon = iconMap[item.icon] || Building;

    const renderRates = (rates: Partial<Record<keyof StoreItem['production'], number>> | undefined) => {
        if (!rates) return null;
        return Object.entries(rates).map(([resource, value]) => {
            if (value === 0) return null;
            const isProduction = value > 0;
            const color = isProduction ? 'text-green-400' : 'text-red-400';
            const sign = isProduction ? '+' : '';
            return (
                <span key={resource} className={cn("text-xs font-mono", color)}>
                    {sign}{value} {resource}
                </span>
            );
        });
    }

    return (
        <TooltipProvider delayDuration={200}>
        <Tooltip>
        <TooltipTrigger asChild>
            <div ref={drag} className={cn(
                "p-2 flex items-center gap-3 bg-slate-800 border-2 border-slate-700 rounded-lg transition-all relative",
                isUnlocked ? "cursor-grab" : "cursor-not-allowed opacity-60",
                isDragging && "opacity-30 ring-2 ring-primary"
            )}>
                <div className="p-2 bg-slate-900 rounded-md">
                    <Icon className="w-8 h-8 text-primary" />
                </div>
                <div className="flex-grow">
                    <p className="font-bold text-sm">{item.name}</p>
                    <div className="flex items-center gap-1 text-xs text-yellow-400">
                        <Coins className="w-3 h-3"/>
                        <span>{item.price}</span>
                    </div>
                </div>
                {!isUnlocked && 
                    <Button size="icon" className="h-8 w-8 shrink-0" onClick={handlePurchaseClick} disabled={isSubmitting}>
                        <ShoppingCart className="w-4 h-4"/>
                    </Button>
                }
            </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="bg-slate-900 text-white border-slate-700">
             <div className="space-y-1">
                <p className='font-bold text-base'>{item.name}</p>
                <p>السعر: <span className="text-yellow-400">{item.price} كوينز</span></p>
                 <div className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-teal-300"/>
                    <p>السكان: <span className="text-teal-300">+{item.population}</span></p>
                 </div>
                {item.production && <div className="flex flex-col items-start">{renderRates(item.production)}</div>}
                {item.consumption && <div className="flex flex-col items-start">{renderRates(item.consumption)}</div>}
            </div>
        </TooltipContent>
        </Tooltip>
        </TooltipProvider>
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
    <aside className="w-80 bg-black/20 border-r-2 border-white/10 flex flex-col p-2 shadow-inner-dark">
      <CardHeader className="p-2 text-center">
        <CardTitle className="text-2xl font-sans">متجر المدينة</CardTitle>
        <CardDescription>اسحب العناصر لبنائها</CardDescription>
      </CardHeader>
      <ScrollArea className="flex-grow pr-2">
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
