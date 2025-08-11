
"use client";

import type { Player, Property } from '@/types';
import { motion } from 'framer-motion';
import { PlayerAvatar } from '../PlayerAvatar';
import { Home, Building2, CircleDollarSign, Gavel } from 'lucide-react';
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

const Tile = ({ property, playersOnTile, allPlayers }: { property: Property, playersOnTile: Player[], allPlayers: Player[] }) => {
    const ownerColor = property.ownerId ? getPlayerColor(property.ownerId, allPlayers) : null;
    
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
                 {property.type === 'property' && <Building2 className="w-8 h-8 text-gray-500"/>}
                 {property.type === 'fine' && <Gavel className="w-8 h-8 text-red-500"/>}
                <p className="text-xs font-bold truncate w-full mt-1">{property.name}</p>
                {property.type === 'property' && property.price > 0 && <p className="text-xs font-semibold text-green-600 dark:text-green-400">{property.price} د.ع</p>}
                {property.type === 'fine' && property.fineAmount && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{property.fineAmount} د.ع</p>}
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

    const boardSize = Math.sqrt(board.length);
    const sideLength = Math.ceil(board.length / 4) + 1;


    const getTilePosition = (index: number) => {
        const perimeter = (sideLength - 1) * 4;
        const effectiveIndex = index % perimeter;

        if (effectiveIndex < sideLength) { // Top row
            return { row: 0, col: effectiveIndex };
        }
        if (effectiveIndex < sideLength * 2 - 1) { // Right col
            return { row: effectiveIndex - (sideLength - 1), col: sideLength - 1 };
        }
        if (effectiveIndex < sideLength * 3 - 2) { // Bottom row
            return { row: sideLength - 1, col: sideLength - 1 - (effectiveIndex - (sideLength * 2 - 2)) };
        }
        // Left col
        return { row: sideLength - 1 - (effectiveIndex - (sideLength * 3 - 3)), col: 0 };
    };
    
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
                        return <Tile key={property.id} property={property} playersOnTile={playersOnTile} allPlayers={players} />;
                    })
                ))}
            </div>
        </div>
    );
}
