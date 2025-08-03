
'use client';

import type { City, StoreItem, CityCell } from '@/types';
import { useDrop } from 'react-dnd';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Building } from 'lucide-react';
import { iconMap } from '@/data/icons';
import { useRouter } from 'next/navigation';

interface CityGridCellProps {
  cell: CityCell;
  onDrop: (item: StoreItem) => void;
  onSpecialClick: (path: string) => void;
}

function CityGridCell({ cell, onDrop, onSpecialClick }: CityGridCellProps) {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: 'storeItem',
    drop: (item: StoreItem) => onDrop(item),
    canDrop: () => !cell.item && !cell.isSpecial,
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  }));

  const Icon = cell.item ? iconMap[cell.item.icon] || Building : (cell.isSpecial && cell.icon ? iconMap[cell.icon] || Building : null);

  const handleCellClick = () => {
    if (cell.isSpecial && cell.navigatesTo) {
        onSpecialClick(cell.navigatesTo);
    }
  };

  return (
    <motion.div
      ref={drop}
      key={`${cell.x}-${cell.y}`}
      className={cn(
        'w-12 h-12 border border-green-800/30 rounded-sm flex items-center justify-center transition-colors relative group shadow-inner-light',
        'bg-gradient-to-br from-green-900/40 to-green-800/30',
        isOver && canDrop && 'bg-green-600/50 ring-2 ring-green-400',
        isOver && !canDrop && 'bg-red-800/50 cursor-not-allowed',
        !cell.item && !cell.isSpecial && 'hover:bg-green-700/50',
        cell.isSpecial && 'cursor-pointer hover:ring-2 hover:ring-yellow-400',
      )}
      whileHover={{ scale: cell.item || cell.isSpecial ? 1.05 : 1.1, zIndex: 10 }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: (cell.x + cell.y) * 0.005 }}
      onClick={handleCellClick}
    >
      {Icon && <Icon className="w-8 h-8 text-white" />}
    </motion.div>
  );
}

interface CityGridProps {
  city: City;
  onPlaceItem: (item: StoreItem, position: { x: number; y: number }) => void;
  onSpecialClick: (path: string) => void;
}

export function CityGrid({ city, onPlaceItem, onSpecialClick }: CityGridProps) {
  return (
    <div className="p-4 bg-black/20 rounded-lg shadow-inner-dark">
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${city.gridSize}, 1fr)`,
        }}
      >
        {city.layout.map((cell) => (
          <CityGridCell
            key={`${cell.x}-${cell.y}`}
            cell={cell}
            onDrop={(item) => onPlaceItem(item, { x: cell.x, y: cell.y })}
            onSpecialClick={onSpecialClick}
          />
        ))}
      </div>
    </div>
  );
}
