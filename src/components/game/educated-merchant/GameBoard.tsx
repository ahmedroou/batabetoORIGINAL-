
"use client";

import React from "react";
import type { Player, Property } from "@/types";
import { motion } from "framer-motion";
import { PlayerAvatar } from "../PlayerAvatar";
import { Home, Building2, Gavel } from "lucide-react";
import { cn } from "@/lib/utils";

const TILE_SIZE = 80;
const TILE_GAP = 8;

const Tile = React.forwardRef<HTMLDivElement, { property: Property, ownerColor?: string | undefined, playersOnTile?: Player[], isActive?: boolean }>(({ property, ownerColor, playersOnTile = [], isActive = false }, ref) => {
    return (
        <motion.div
            ref={ref}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className={cn(
                "relative w-20 h-24 bg-gray-200 dark:bg-gray-800 rounded-lg border-2 p-1 flex flex-col items-center justify-center text-center select-none",
                isActive ? 'border-primary shadow-lg' : 'border-gray-300 dark:border-gray-700'
            )}
            title={`${property.name}${property.type === 'property' ? ` — ${property.price} د.ع` : ''}`}
        >
            <div className="flex-grow flex flex-col items-center justify-center">
                 {property.type === 'start' && <Home className="w-6 h-6 text-green-600"/>}
                 {property.type === 'property' && <Building2 className="w-6 h-6 text-gray-500"/>}
                 {property.type === 'fine' && <Gavel className="w-6 h-6 text-red-600"/>}

                <p className="text-xs font-bold mt-1 truncate w-full">{property.name}</p>
                
                {property.type === 'property' && property.price > 0 && (
                     <p className="text-xs font-semibold text-muted-foreground">{property.price} د.ع</p>
                )}
                 {property.type === 'fine' && property.fineAmount && (
                     <p className="text-xs font-semibold text-red-500">{property.fineAmount} د.ع</p>
                )}
            </div>

            {ownerColor && (
                <div className="absolute left-0 bottom-0 w-full h-1.5 rounded-b-md" style={{ backgroundColor: ownerColor }} />
            )}

            {playersOnTile.length > 0 && (
                <div className="absolute left-1 bottom-2 flex -space-x-2 items-center">
                    {playersOnTile.map(pl => (
                         <PlayerAvatar key={pl.id} avatarId={pl.avatarId} className="w-5 h-5 rounded-full border-2 border-white" />
                    ))}
                </div>
            )}
        </motion.div>
    );
});
Tile.displayName = 'Tile';


export function GameBoard({ board, players, gameId }: { board: Property[], players: Player[], gameId: string }) {
    if (!board || board.length === 0) {
        return <div className="text-center p-6 text-lg">جاري تحميل اللوحة...</div>;
    }

    const gridCells = Math.ceil(board.length / 4) + 1;
    const sideLength = gridCells - 1;

    return (
        <div className="p-4 rounded-3xl shadow-2xl bg-gray-100 dark:bg-gray-900 w-full max-w-[90vh] mx-auto">
            <div
                className="relative w-full h-full grid"
                style={{
                    gridTemplateColumns: `repeat(${gridCells}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${gridCells}, minmax(0, 1fr))`,
                    gap: `${TILE_GAP}px`,
                }}
            >
                {board.map((property, index) => {
                    const pos = {
                        gridRow: 1,
                        gridColumn: 1,
                    };

                    if (index < sideLength) { // Top row
                        pos.gridRow = 1;
                        pos.gridColumn = index + 1;
                    } else if (index < sideLength * 2) { // Right column
                        pos.gridRow = index - sideLength + 1;
                        pos.gridColumn = gridCells;
                    } else if (index < sideLength * 3) { // Bottom row
                        pos.gridRow = gridCells;
                        pos.gridColumn = gridCells - (index - sideLength * 2);
                    } else { // Left column
                        pos.gridRow = gridCells - (index - sideLength * 3);
                        pos.gridColumn = 1;
                    }

                    const ownerColor = property.ownerId ? players.find(p => p.id === property.ownerId)?.color : undefined;
                    const playersOnTile = players.filter(pl => pl.position === property.id);

                    return (
                        <div key={property.id} style={{ gridRow: pos.gridRow, gridColumn: pos.gridColumn }}>
                            <Tile property={property} ownerColor={ownerColor} playersOnTile={playersOnTile} />
                        </div>
                    );
                })}

                 <div
                    className="flex items-center justify-center p-4 rounded-xl"
                    style={{ gridArea: `2 / 2 / ${gridCells} / ${gridCells}`}}
                >
                    <h2 className="text-3xl font-extrabold text-primary">التاجر المتعلم</h2>
                </div>
            </div>
        </div>
    );
}

