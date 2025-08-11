
"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Player, Property, GameState } from "@/types";
import { motion, useAnimate } from "framer-motion";
import { PlayerAvatar } from "../PlayerAvatar";
import { Home, Building2, Gavel } from "lucide-react";
import { cn } from "@/lib/utils";
import { handlePropertyAction } from "@/lib/actions/educated-merchant";

interface GameBoardProps {
  board: Property[];
  players: Player[];
  gameId: string;
  gameState: GameState;
  diceRoll: number | null;
  isMyTurn: boolean;
  activePlayerId: string;
}

const Tile = React.forwardRef<
  HTMLDivElement,
  { property: Property; ownerColor?: string }
>(({ property, ownerColor }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "relative rounded-lg border-2 flex flex-col items-center justify-center text-center p-1 transition-all duration-300 hover:scale-105 hover:shadow-primary/50",
        "flex-shrink-0 flex-grow-0 basis-24", // Use flex-basis for responsive sizing
        ownerColor
          ? "shadow-lg"
          : "bg-gray-200 dark:bg-gray-800 border-gray-300 dark:border-gray-700"
      )}
      style={{ borderColor: ownerColor || undefined }}
      id={`tile-${property.id}`}
    >
      <div className="flex-grow flex flex-col items-center justify-center">
        {property.type === "start" && (
          <Home className="w-8 h-8 text-green-500" />
        )}
        {property.type === "property" && (
          <Building2 className="w-8 h-8 text-gray-500" />
        )}
        {property.type === "fine" && (
          <Gavel className="w-8 h-8 text-red-500" />
        )}
        <p className="text-xs font-bold truncate w-full mt-1">
          {property.name}
        </p>
        {property.type === "property" && property.price > 0 && (
          <p className="text-xs font-semibold text-green-600 dark:text-green-400">
            {property.price} د.ع
          </p>
        )}
        {property.type === "fine" && property.fineAmount && (
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">
            {property.fineAmount} د.ع
          </p>
        )}
      </div>
      {ownerColor && (
        <div
          className="absolute bottom-0 w-full h-2 rounded-b-md"
          style={{ backgroundColor: ownerColor }}
        />
      )}
    </div>
  );
});
Tile.displayName = "Tile";

export function GameBoard({
  board,
  players,
  gameId,
  gameState,
  diceRoll,
  isMyTurn,
  activePlayerId,
}: GameBoardProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [tilePositions, setTilePositions] = useState<
    Record<number, { x: number; y: number }>
  >({});
  
  const playerAnimators = useMemo(() => new Map<string, ReturnType<typeof useAnimate>>(), []);
  players.forEach(p => {
      if (!playerAnimators.has(p.id)) {
          // eslint-disable-next-line react-hooks/rules-of-hooks
          playerAnimators.set(p.id, useAnimate());
      }
  });

  if (!board) {
    return <div className="text-center p-6 text-lg">جاري تحميل اللوحة...</div>;
  }

  const sideLength = useMemo(
    () => Math.ceil(board.length / 4) + 1,
    [board.length]
  );

  useEffect(() => {
    const calculatePositions = () => {
      if (!gridRef.current) return;
      const gridRect = gridRef.current.getBoundingClientRect();
      const newPositions: Record<number, { x: number; y: number }> = {};
      board.forEach((property) => {
        const tileEl = tileRefs.current[property.id];
        if (tileEl) {
          const tileRect = tileEl.getBoundingClientRect();
          newPositions[property.id] = {
            x: tileRect.left - gridRect.left,
            y: tileRect.top - gridRect.top,
          };
        }
      });
      setTilePositions(newPositions);
    };

    calculatePositions();
    const resizeObserver = new ResizeObserver(calculatePositions);
    if(gridRef.current) {
        resizeObserver.observe(gridRef.current);
    }
    
    return () => resizeObserver.disconnect();
  }, [board]);

  useEffect(() => {
    const movePlayer = async () => {
      if (diceRoll === null || !isMyTurn || Object.keys(tilePositions).length === 0)
        return;

      const player = players.find((p) => p.id === activePlayerId);
      const animator = playerAnimators.get(activePlayerId);

      if (!player || !animator) return;

      const [scope, animate] = animator;
      const startPos = player.position;

      for (let i = 1; i <= diceRoll; i++) {
        const nextPosIndex = (startPos + i) % board.length;
        const nextPosCoords = tilePositions[nextPosIndex];
        const playerOffset = players.findIndex(p => p.id === player.id) % 4;
        if (nextPosCoords) {
           await animate(
            scope.current,
            { 
              x: nextPosCoords.x + 10 + (playerOffset * 5), 
              y: nextPosCoords.y + 10 + (playerOffset * 5)
            },
            { duration: 0.35, type: "spring", stiffness: 200, damping: 18 }
          );
        }
      }
      
      await handlePropertyAction(gameId, activePlayerId);
    };

    if(gameState === 'movement') {
      movePlayer();
    }
  }, [
    diceRoll,
    isMyTurn,
    tilePositions,
    players,
    activePlayerId,
    playerAnimators,
    board.length,
    gameId,
    gameState
  ]);

  const renderGrid = () => {
    const gridRows: React.ReactNode[] = [];
    const perimeterPositions = new Map<string, Property>();

    board.forEach((property, index) => {
        const getTilePosition = (idx: number) => {
            const perimeter = (sideLength - 1) * 4;
            const effectiveIndex = idx % perimeter;
            if (effectiveIndex < sideLength) return { row: 0, col: effectiveIndex };
            if (effectiveIndex < sideLength * 2 - 1) return { row: effectiveIndex - (sideLength - 1), col: sideLength - 1 };
            if (effectiveIndex < sideLength * 3 - 2) return { row: sideLength - 1, col: sideLength - 1 - (effectiveIndex - (sideLength * 2 - 2)) };
            return { row: sideLength - 1 - (effectiveIndex - (sideLength * 3 - 3)), col: 0 };
        };
        const { row, col } = getTilePosition(index);
        perimeterPositions.set(`${row}-${col}`, property);
    });

    for (let r = 0; r < sideLength; r++) {
        const rowChildren: React.ReactNode[] = [];
        for (let c = 0; c < sideLength; c++) {
            const property = perimeterPositions.get(`${r}-${c}`);
            if (property) {
                const ownerColor = property.ownerId ? players.find((p) => p.id === property.ownerId)?.color : undefined;
                rowChildren.push(
                    <Tile
                        key={property.id}
                        property={property}
                        ownerColor={ownerColor}
                        ref={(el) => (tileRefs.current[property.id] = el)}
                    />
                );
            } else if (r > 0 && r < sideLength - 1 && c > 0 && c < sideLength - 1) {
                rowChildren.push(
                     <div key={`${r}-${c}`} className="flex-shrink-0 flex-grow-0 basis-24 flex items-center justify-center">
                        {r === Math.floor(sideLength / 2) && c === Math.floor(sideLength / 2) && (
                            <div className="text-center text-xl font-bold text-gray-700 dark:text-gray-300">التاجر المتعلم</div>
                        )}
                    </div>
                );
            }
        }
        gridRows.push(
            <div key={r} className="flex gap-1 justify-center">
                {rowChildren}
            </div>
        );
    }
    return gridRows;
  };

  return (
    <div className="p-1 md:p-2 bg-gray-300 dark:bg-gray-800/50 rounded-2xl shadow-2xl relative self-center">
      <div
        ref={gridRef}
        className="flex flex-col gap-1"
      >
        {renderGrid()}
      </div>
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        {players.map((player, pIndex) => {
          const animator = playerAnimators.get(player.id);
          if (!animator) return null;
          
          const initialPos = tilePositions[player.position] || { x: 0, y: 0 };
          const playerOffset = pIndex % 4;
          
          return (
            <motion.div
              key={player.id}
              ref={animator[0]}
              className="absolute z-10"
              initial={{ 
                  x: initialPos.x + 10 + (playerOffset * 5), 
                  y: initialPos.y + 10 + (playerOffset * 5)
              }}
              animate={{ 
                  x: initialPos.x + 10 + (playerOffset * 5), 
                  y: initialPos.y + 10 + (playerOffset * 5)
              }}
            >
              <PlayerAvatar
                avatarId={player.avatarId}
                className="w-8 h-8 md:w-8 md:h-8 border-2 rounded-full shadow-lg"
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
