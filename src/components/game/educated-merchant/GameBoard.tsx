
"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Player, Property } from "@/types";
import { motion } from "framer-motion";
import { PlayerAvatar } from "../PlayerAvatar";
import { Home, Building2, Gavel } from "lucide-react";
import { cn } from "@/lib/utils";
import { handlePropertyAction } from "@/lib/actions/educated-merchant";

interface GameBoardProps {
  board: Property[];
  players: Player[];
  gameId: string;
  diceRoll: number | null;
  isMyTurn: boolean;
  activePlayerId: string;
}

// Tile component remains largely the same visually but is now a grid item.
const Tile = React.forwardRef<
  HTMLDivElement,
  { property: Property; ownerColor?: string }
>(({ property, ownerColor }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "relative rounded-md border-2 flex flex-col items-center justify-center text-center p-1 transition-all duration-300 aspect-square",
        ownerColor ? "shadow-lg" : "bg-gray-200 dark:bg-gray-800 border-gray-300 dark:border-gray-700"
      )}
      style={{ borderColor: ownerColor || undefined }}
      id={`tile-${property.id}`}
    >
      <div className="flex-grow flex flex-col items-center justify-center">
        {property.type === "start" && <Home className="w-4 h-4 md:w-6 md:h-6 text-green-500" />}
        {property.type === "property" && <Building2 className="w-4 h-4 md:w-6 md:h-6 text-gray-500" />}
        {property.type === "fine" && <Gavel className="w-4 h-4 md:w-6 md:h-6 text-red-500" />}
        <p className="text-[8px] md:text-xs font-bold truncate w-full mt-1">{property.name}</p>
        {property.type === "property" && property.price > 0 && (
          <p className="text-[8px] md:text-xs font-semibold text-green-600 dark:text-green-400">{property.price} د.ع</p>
        )}
        {property.type === "fine" && property.fineAmount && (
           <p className="text-[8px] md:text-xs font-semibold text-red-600 dark:text-red-400">{property.fineAmount} د.ع</p>
        )}
      </div>
      {ownerColor && (
        <div
          className="absolute bottom-0 w-full h-1 md:h-2 rounded-b-md"
          style={{ backgroundColor: ownerColor }}
        />
      )}
    </div>
  );
});
Tile.displayName = "Tile";

export function GameBoard({ board, players, gameId, diceRoll, isMyTurn, activePlayerId }: GameBoardProps) {
  
  const playerAnimators = useMemo(() => new Map<string, any>(), []);
  players.forEach(p => {
    if (!playerAnimators.has(p.id)) {
        // This is a placeholder; framer-motion's layout animation will handle it.
    }
  });

  const sideLength = Math.ceil(board.length / 4) + 1;
  const perimeterPositions = useMemo(() => {
    const positions = new Map<number, { gridRow: number; gridColumn: number }>();
    if (board.length === 0) return positions;

    const perimeter = (sideLength - 1) * 4;
    board.forEach((_, index) => {
        const effectiveIndex = index % perimeter;
        let row = 1, col = 1;
        if (effectiveIndex < sideLength) { // Top row
            row = 1;
            col = effectiveIndex + 1;
        } else if (effectiveIndex < sideLength * 2 - 1) { // Right column
            row = (effectiveIndex - (sideLength - 1)) + 1;
            col = sideLength;
        } else if (effectiveIndex < sideLength * 3 - 2) { // Bottom row
            row = sideLength;
            col = sideLength - (effectiveIndex - (sideLength * 2 - 2));
        } else { // Left column
            row = sideLength - (effectiveIndex - (sideLength * 3 - 3));
            col = 1;
        }
        positions.set(index, { gridRow: row, gridColumn: col });
    });
    return positions;
  }, [board, sideLength]);


  useEffect(() => {
    const movePlayer = async () => {
      if (diceRoll === null || !isMyTurn) return;
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for dice animation
      await handlePropertyAction(gameId, activePlayerId);
    };

    if (diceRoll !== null) {
        movePlayer();
    }
  }, [diceRoll, isMyTurn, gameId, activePlayerId]);

  if (!board || board.length === 0) {
    return <div className="text-center p-6 text-lg">جاري تحميل اللوحة...</div>;
  }
  
  return (
    <div className="p-1 md:p-2 bg-gray-300 dark:bg-gray-800/50 rounded-2xl shadow-2xl self-center w-full max-w-[90vh] aspect-square">
      <div
        className="relative w-full h-full grid"
        style={{
          gridTemplateColumns: `repeat(${sideLength}, 1fr)`,
          gridTemplateRows: `repeat(${sideLength}, 1fr)`,
          gap: '4px'
        }}
      >
        {/* Render Tiles */}
        {board.map((property, index) => {
          const pos = perimeterPositions.get(index);
          if (!pos) return null;
          
          const ownerColor = property.ownerId ? players.find(p => p.id === property.ownerId)?.color : undefined;
          
          return (
            <div key={property.id} style={{ gridRow: pos.gridRow, gridColumn: pos.gridColumn }}>
                <Tile property={property} ownerColor={ownerColor} />
            </div>
          );
        })}

        {/* Render Players */}
        {players.map((player, pIndex) => {
          const pos = perimeterPositions.get(player.position);
          if (!pos || player.status === 'bankrupt') return null;
          
          return (
            <motion.div
              key={player.id}
              layoutId={`player-${player.id}`}
              className="absolute z-10 flex items-center justify-center p-0.5"
              style={{
                gridRow: pos.gridRow,
                gridColumn: pos.gridColumn,
              }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
                <div style={{ transform: `translate(${(pIndex % 4) * 8 - 12}px, ${Math.floor(pIndex / 4) * 8 - 12}px)` }}>
                    <PlayerAvatar
                        avatarId={player.avatarId}
                        className="w-5 h-5 md:w-6 md:h-6 border-2 rounded-full shadow-lg"
                        />
                </div>
            </motion.div>
          );
        })}
        <div 
          className="flex items-center justify-center text-center"
          style={{ gridArea: `2 / 2 / ${sideLength} / ${sideLength}`}}
        >
             <h2 className="text-xl md:text-3xl font-bold text-gray-700 dark:text-gray-300">التاجر المتعلم</h2>
        </div>
      </div>
    </div>
  );
}
