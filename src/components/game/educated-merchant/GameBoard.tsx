"use client";

import React, { useEffect, useMemo } from "react";
import type { Player, Property } from "@/types";
import { motion } from "framer-motion";
import { PlayerAvatar } from "../PlayerAvatar";
import { Home, Building2, Gavel } from "lucide-react";
import { cn } from "@/lib/utils";
import { handlePropertyAction } from "@/lib/actions/educated-merchant";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GameBoardProps {
  gameId: string;
  players: Player[];
  board: Property[];
  diceRoll: number | null;
  isMyTurn: boolean;
  activePlayerId: string;
  gameState: string;
  currentRound: number;
  maxRounds: number;
}

const TILE_GAP = 6; // px - kept as constant for easy tuning

function hexToRgb(hex: string | undefined | null) {
  if (!hex) return null;
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

function hexToRgba(hex: string | undefined | null, alpha = 1) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function getContrastColor(hex?: string | null) {
  if (!hex) return "#000";
  const rgb = hexToRgb(hex);
  if (!rgb) return "#000";
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return lum > 0.5 ? "#000000" : "#ffffff";
}

function categoryHue(category?: string) {
  const s = (category || "generic").toString();
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash << 5) - hash + s.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return hue;
}

function categoryGradientStyle(category?: string) {
  const hue = categoryHue(category);
  return {
    background: `linear-gradient(135deg, hsla(${hue},70%,96%,0.95), hsla(${hue},70%,70%,0.95))`,
    borderColor: `hsl(${hue} 55% 45%)`,
  } as React.CSSProperties;
}

// Small animated token used to visually represent players on tiles.
function PlayerToken({ player }: { player: Player }) {
  return (
    <motion.div
      layoutId={`token-${player.id}`}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className="w-5 h-5 md:w-6 md:h-6 rounded-full overflow-hidden border-2 border-white shadow-sm"
      title={player.name}
      aria-hidden={false}
      role="img"
    >
      <PlayerAvatar avatarId={player.avatarId} className="w-full h-full" />
    </motion.div>
  );
}

const Tile = React.forwardRef<HTMLDivElement, {
  property: Property;
  ownerColor?: string | undefined;
  playersOnTile?: Player[];
  isActive?: boolean;
  onActivate?: () => void;
}>(({ property, ownerColor, playersOnTile = [], isActive = false, onActivate }, ref) => {
  const catStyle = property.type === "property" ? categoryGradientStyle(property.category) : undefined;

  const ownerOverlayStyle: React.CSSProperties | undefined = ownerColor
    ? {
        background: `linear-gradient(135deg, ${hexToRgba(ownerColor, 0.12)}, ${hexToRgba(ownerColor, 0.22)}), ${catStyle?.background || "transparent"}`,
        borderColor: ownerColor,
      }
    : undefined;

  // Determine text color: prefer owner color contrast, otherwise use dark on light backgrounds
  const textColor = ownerColor ? getContrastColor(ownerColor) : (property.type === 'property' ? '#111827' : '#0f172a');

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate?.();
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            ref={ref}
            layout
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className={cn(
              'relative rounded-lg border p-2 flex flex-col items-center justify-center text-center select-none focus:outline-none focus:ring-4',
              property.type === 'start' ? 'shadow-inner' : 'shadow',
              isActive ? 'ring-offset-2 ring-opacity-60' : '',
              ownerColor ? 'ring-2' : ''
            )}
            style={{
              ...(ownerOverlayStyle || catStyle || {}),
              borderWidth: 2,
              borderStyle: 'solid',
              borderColor: isActive ? (ownerColor || 'hsl(var(--primary))') : (ownerColor || (catStyle?.borderColor || 'hsl(var(--border))')),
              boxShadow: ownerColor ? `0 8px 22px ${hexToRgba(ownerColor, 0.14)}` : undefined,
              minHeight: 56,
              padding: 8,
            }}
            role="button"
            tabIndex={0}
            onKeyDown={handleKey}
            onClick={() => onActivate?.()}
            aria-label={property.name}
            aria-current={isActive}
          >
            <div className="flex-grow flex flex-col items-center justify-center min-h-[36px]">
              {property.type === 'start' && <Home className="w-5 h-5 md:w-6 md:h-6 text-green-700" />}
              {property.type === 'property' && <Building2 className="w-5 h-5 md:w-6 md:h-6 text-gray-700" />}
              {property.type === 'fine' && <Gavel className="w-5 h-5 md:w-6 md:h-6 text-red-700" />}

              <p className="text-[10px] md:text-xs font-extrabold truncate w-full mt-1" style={{ color: textColor }}>{property.name}</p>

              {property.type === 'property' && property.price > 0 && (
                <p className="text-[10px] md:text-xs font-semibold mt-0.5" style={{ color: textColor }}>{property.price} د.ع</p>
              )}

              {property.type === 'fine' && property.fineAmount && (
                <p className="text-[10px] md:text-xs font-semibold mt-0.5" style={{ color: textColor }}>{property.fineAmount} د.ع</p>
              )}
            </div>

            {ownerColor && (
              <div className="absolute left-0 bottom-0 w-full h-1.5 rounded-b-md" style={{ background: ownerColor }} />
            )}

            {playersOnTile.length > 0 && (
              <div className="absolute left-1 bottom-1 flex gap-0.5 items-center">
                {playersOnTile.slice(0, 4).map((pl, i) => (
                  <div
                    key={pl.id}
                    className="-ml-1"
                    style={{ zIndex: 20 + i }}
                    title={pl.name}
                    aria-hidden={false}
                  >
                    <PlayerToken player={pl} />
                  </div>
                ))}
                {playersOnTile.length > 4 && (
                  <div className="flex items-center justify-center text-[10px] w-4 h-4 rounded-full bg-gray-800 text-white ml-1">+{playersOnTile.length - 4}</div>
                )}
              </div>
            )}
          </motion.div>
        </TooltipTrigger>
        <TooltipContent>
          <p className='font-bold'>{property.name}</p>
          {property.type === 'property' && (
            <>
              <p>السعر: {property.price} د.ع</p>
              <p>الإيجار: {property.rent} د.ع</p>
            </>
          )}
          {property.type === 'fine' && (
            <p>غرامة: {property.fineAmount} د.ع</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
Tile.displayName = 'Tile';

function GameBoard({ board, players, gameId, diceRoll, isMyTurn, activePlayerId, gameState, currentRound, maxRounds }: GameBoardProps) {
  // Defensive fallback
  if (!board || board.length === 0) {
    return <div className="text-center p-6 text-lg">جاري تحميل اللوحة...</div>;
  }

  // Compute board geometry once (memoized)
  const { sideLength, totalCells, gridCells } = useMemo(() => {
    const side = Math.floor((board.length + 3) / 4);
    const cells: Array<Property | null> = [];

    // Bottom row (left to right)
    for (let i = 0; i <= side; i++) cells.push(board[i]);
    // Right column (bottom to top)
    for (let i = side + 1; i <= side * 2; i++) cells.push(board[i]);
    // Top row (right to left)
    for (let i = side * 2 + 1; i <= side * 3; i++) cells.push(board[i]);
    // Left column (top to bottom)
    for (let i = side * 3 + 1; i < board.length; i++) cells.push(board[i]);

    const finalGrid: Array<Property | null> = Array((side + 1) * (side + 1)).fill(null);
    let currentCellIndex = 0;
    
    // Place bottom row
    for(let i=0; i<=side; i++) finalGrid[side * (side+1) + i] = cells[currentCellIndex++];
    // Place right col
    for(let i=side-1; i>=0; i--) finalGrid[i * (side+1) + side] = cells[currentCellIndex++];
    // Place top row
    for(let i=side-1; i>=0; i--) finalGrid[i] = cells[currentCellIndex++];
    // Place left col
    for(let i=1; i<side; i++) finalGrid[i * (side+1)] = cells[currentCellIndex++];

    return { sideLength: side, totalCells: board.length, gridCells: finalGrid };
  }, [board]);

  // Fast lookup map: propertyId -> players on that tile
  const playersByPosition = useMemo(() => {
    const map = new Map<string | number, Player[]>();
    for (const p of players) {
      if (!p || p.status === 'bankrupt') continue;
      if (!map.has(p.position)) map.set(p.position, []);
      map.get(p.position)!.push(p);
    }
    return map;
  }, [players]);

  const activePlayer = players.find(p => p.id === activePlayerId);
  const activePosition = activePlayer?.position;

  useEffect(() => {
    // Automatic server-side action when movement phase occurs and dice rolled
    const movePlayer = async () => {
      if (diceRoll === null || !isMyTurn) return;
      // small delay to let frontend animations start
      await new Promise(resolve => setTimeout(resolve, 700));
      try {
        await handlePropertyAction(gameId, activePlayerId);
      } catch (e) {
        console.error('handlePropertyAction failed', e);
      }
    };

    if (gameState === 'movement') movePlayer();
  }, [diceRoll, isMyTurn, gameId, activePlayerId, gameState]);

  // click handler: offer a manual activation for tile (helpful for debugging / accessibility)
  const handleTileActivate = async (prop: Property) => {
    if (!isMyTurn) return;
    if (activePosition !== prop.id) return;
    try {
      await handlePropertyAction(gameId, activePlayerId);
    } catch (e) {
      console.error('manual handlePropertyAction failed', e);
    }
  };

  // Determine grid template sizes (responsive)
  const minTile = 52; // px
  const template = `repeat(${sideLength + 1}, minmax(${minTile}px, 1fr))`;

  return (
    <div className="p-3 rounded-3xl shadow-2xl bg-gradient-to-br from-violet-50 to-violet-100 dark:from-zinc-900 dark:to-zinc-800 w-full max-w-[92vh] mx-auto">
      <div
        className="relative w-full h-full grid"
        style={{
          gridTemplateColumns: template,
          gridTemplateRows: template,
          gap: `${TILE_GAP}px`,
        }}
      >
        {gridCells.map((property: Property | null, index: number) => {
          if (!property) return <div key={index} />;

          const ownerColor = property.ownerId ? players.find(p => p.id === property.ownerId)?.color : undefined;
          const playersOnTile = playersByPosition.get(property.id) || [];
          const isActive = activePosition === property.id;

          return (
            <Tile key={property.id} property={property} ownerColor={ownerColor} playersOnTile={playersOnTile} isActive={isActive} onActivate={() => handleTileActivate(property)} />
          );
        })}

        {/* Center hub */}
        <div
          className="flex items-center justify-center flex-col p-3 rounded-xl bg-gradient-to-tl from-white/60 to-transparent dark:from-black/40"
          style={{ gridArea: `2 / 2 / ${sideLength + 1} / ${sideLength + 1}`, minHeight: 120 }}
        >
          <h2 className="text-lg md:text-2xl font-extrabold text-violet-700 dark:text-violet-300">التاجر المتعلّم</h2>

          <div className="text-center my-2 bg-black/10 dark:bg-white/10 p-2 rounded-lg w-full max-w-[220px]">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">الجولة</p>
            <p className="text-xl font-bold font-mono text-gray-800 dark:text-gray-100">{currentRound}/{maxRounds}</p>
          </div>

          <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
            <div className={cn("px-3 py-1 rounded-full text-sm font-semibold shadow-sm flex items-center gap-2", isMyTurn ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-800 dark:bg-zinc-700 dark:text-zinc-200') }>
              <span>{isMyTurn ? 'دورك الآن' : 'انتظر دورك'}</span>
            </div>

            <div className="ml-2 text-sm">
              {diceRoll !== null && (
                <div className="px-2 py-1 bg-white/80 dark:bg-black/40 rounded-md shadow">نرد: <strong>{diceRoll}</strong></div>
              )}
            </div>
          </div>

          {/* quick players preview */}
          <div className="mt-3 flex items-center gap-2 flex-wrap justify-center">
            {players.map(pl => (
              <div key={pl.id} className="flex items-center gap-2 px-2 py-1 rounded-md bg-white/60 dark:bg-black/30">
                <PlayerAvatar avatarId={pl.avatarId} className="w-6 h-6 rounded-full" />
                <div className="text-sm font-medium">{pl.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { GameBoard };
