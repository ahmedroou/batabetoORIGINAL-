
'use client';

import type { City } from '@/types';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Building } from 'lucide-react';

interface CityGridProps {
    city: City;
    setCity: React.Dispatch<React.SetStateAction<City | null>>;
}

export function CityGrid({ city, setCity }: CityGridProps) {

    const handleDropItem = () => { /* Placeholder for future drag and drop */ };
    const handleRemoveItem = () => { /* Placeholder */ };

    return (
        <div className="p-4 bg-black/20 rounded-lg shadow-inner">
            <div 
                className="grid gap-1"
                style={{
                    gridTemplateColumns: `repeat(${city.gridSize}, 1fr)`,
                    width: `${city.gridSize * 3}rem`, // Example size, can be dynamic
                    height: `${city.gridSize * 3}rem`,
                }}
            >
                {city.layout.map((cell) => {
                    const isWall = false; // Placeholder for future logic
                    return (
                        <motion.div
                            key={`${cell.x}-${cell.y}`}
                            className={cn(
                                'w-12 h-12 border border-green-800/30 rounded-sm flex items-center justify-center transition-colors relative group bg-gradient-to-br from-green-900/40 to-green-800/30 hover:bg-green-700/50',
                            )}
                            whileHover={{ scale: 1.05 }}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: (cell.x + cell.y) * 0.01 }}
                        >
                            {cell.item ? (
                                <Building className="w-8 h-8 text-white" />
                            ) : null}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

