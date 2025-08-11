
"use client";

import type { Player, Property } from '@/types';
import { motion } from 'framer-motion';
import { PlayerAvatar } from '../PlayerAvatar';
import { Home, Zap, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GameBoardProps {
    board: Property[];
    players: Player[];
}

const TILE_SIZE_LG = 'w-28 h-28'; // For large screens
const TILE_SIZE_MD = 'w-24 h-24'; // For medium screens
const TILE_SIZE_SM = 'w-20 h-20'; // For small screens

const getPlayerColor = (playerId: string, players: Player[]) => {
    const index = players.findIndex(p => p.id === playerId);
    const colors = ['#EF4444', '#3B82F6', '#22C55E', '#EAB308']; // red, blue, green, yellow
    return colors[index % colors.length];
};

const Tile = ({ property, playersOnTile }: { property: Property, playersOnTile: Player[] }) => {
    const ownerColor = property.ownerId ? getPlayerColor(property.ownerId, playersOnTile) : null;
    
    return (
        <div className={cn(
            'relative rounded-lg border-2 flex flex-col items-center justify-center text-center p-1 transition-all duration-300',
            TILE_SIZE_SM, `md:${TILE_SIZE_MD}`, `lg:${TILE_SIZE_LG}`,
            ownerColor ? 'shadow-lg' : 'bg-gray-200 dark:bg-gray-800 border-gray-300 dark:border-gray-700'
        )} style={{ borderColor: ownerColor || undefined }}>
            
            <div className="absolute top-1 right-1 flex -space-x-2">
                {playersOnTile.map(p => (
                    <PlayerAvatar key={p.id} avatarId={p.avatarId} className="w-6 h-6 rounded-full border-2 border-white" />
                ))}
            </div>

            <div className="flex-grow flex flex-col items-center justify-center">
                 {property.type === 'start' && <Home className="w-8 h-8 text-green-500"/>}
                 {property.type === 'chance' && <Zap className="w-8 h-8 text-yellow-500"/>}
                 {property.type === 'property' && <Building2 className="w-8 h-8 text-gray-500"/>}
                <p className="text-xs font-bold truncate w-full mt-1">{property.name}</p>
                {property.price > 0 && <p className="text-xs font-semibold text-green-600 dark:text-green-400">{property.price} د.ع</p>}
            </div>
            {ownerColor && (
                <div className="absolute bottom-0 w-full h-2 rounded-b-md" style={{ backgroundColor: ownerColor }}/>
            )}
        </div>
    );
};

export function GameBoard({ board, players }: GameBoardProps) {
    if (!board || board.length === 0) {
        return <div className="text-center">جاري تحميل اللوحة...</div>;
    }

    const boardSize = Math.sqrt(board.length + 4); // Assuming a square board with corners
    const sideLength = Math.ceil(board.length / 4);

    const getTilePosition = (index: number) => {
        // This logic places tiles in a square loop
        if (index < sideLength) return { row: 0, col: index }; // Top row
        if (index < sideLength * 2) return { row: index - sideLength, col: sideLength -1 }; // Right col
        if (index < sideLength * 3) return { row: sideLength - 1, col: sideLength - 1 - (index - sideLength * 2) }; // Bottom row
        return { row: sideLength - 1 - (index - sideLength * 3), col: 0 }; // Left col
    };
    
    // Create a grid representation
    const grid: (Property | null)[][] = Array(sideLength).fill(null).map(() => Array(sideLength).fill(null));
    board.forEach((property, index) => {
        const { row, col } = getTilePosition(index);
        if (grid[row] && grid[row][col] === null) {
            grid[row][col] = property;
        }
    });

    return (
        <div className="p-4 bg-gray-300 dark:bg-gray-800/50 rounded-2xl shadow-2xl">
            <div className="grid gap-1" style={{gridTemplateColumns: `repeat(${sideLength}, min-content)`}}>
                {grid.map((row, rowIndex) => (
                    row.map((property, colIndex) => {
                         if (property === null) {
                             // Render empty space for the center
                            if (rowIndex > 0 && rowIndex < sideLength - 1 && colIndex > 0 && colIndex < sideLength - 1) {
                                return <div key={`${rowIndex}-${colIndex}`} className={cn(TILE_SIZE_SM, `md:${TILE_SIZE_MD}`, `lg:${TILE_SIZE_LG}`)} />;
                            }
                            return null;
                         }
                        const playersOnTile = players.filter(p => p.position === property.id);
                        return <Tile key={property.id} property={property} playersOnTile={playersOnTile}/>;
                    })
                ))}
            </div>
        </div>
    );
}
