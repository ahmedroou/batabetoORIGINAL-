
"use client";

import React, { useEffect, useMemo } from "react";
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
  gameState: string;
}

const TILE_GAP = 6; // px

// --- Small color helpers ---
function hexToRgb(hex: string) {
  if (!hex) return null;
  const h = hex.replace('#', '');
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

function hexToRgba(hex: string, alpha = 1) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function getContrastColor(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000';
  // relative luminance
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? '#000000' : '#ffffff';
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

const Tile = React.forwardRef<HTMLDivElement, {
  property: Property;
  ownerColor?: string | undefined;
  playersOnTile?: Player[];
  isActive?: boolean;
}>(({ property, ownerColor, playersOnTile = [], isActive = false }, ref) => {
  const catStyle = property.type === 'property' ? categoryGradientStyle(property.category) : undefined;

  // If tile is owned, mix owner color as a soft overlay to make the entire tile feel like player's color
  const ownerOverlayStyle: React.CSSProperties | undefined = ownerColor
    ? {
        background: `linear-gradient(135deg, ${hexToRgba(ownerColor, 0.15)}, ${hexToRgba(ownerColor, 0.28)}), ${catStyle?.background || 'transparent'}`,
        borderColor: ownerColor,
      }
    : undefined;

  const textColor = ownerColor ? getContrastColor(ownerColor) : undefined;

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={cn(
        'relative rounded-lg border p-2 flex flex-col items-center justify-center text-center select-none',
        property.type === 'start' ? 'shadow-inner' : 'shadow',
        isActive ? 'ring-4 ring-offset-2 ring-opacity-60' : ''
      )}
      style={{
        ...(ownerOverlayStyle || catStyle || {}),
        borderWidth: ownerColor ? 2 : 1,
        borderStyle: 'solid',
        boxShadow: ownerColor ? '0 8px 22px rgba(0,0,0,0.12)' : undefined,
      }}
      title={`${property.name}${property.type === 'property' ? ` — ${property.price} د.ع — إيجار ${property.rent}` : ''}`}
      aria-label={property.name}
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

      {/* owner bar */}
      {ownerColor ? (
        <div className="absolute left-0 bottom-0 w-full h-1 rounded-b-md" style={{ background: ownerColor }} />
      ) : (
        <div className="absolute left-0 bottom-0 w-full h-1 bg-transparent" />
      )}

      {/* players tokens stacked */}
      {playersOnTile.length > 0 && (
        <div className="absolute left-1 bottom-1 flex gap-0.5 items-center">
          {playersOnTile.slice(0, 4).map((pl, i) => (
            <div
              key={pl.id}
              className="w-4 h-4 md:w-5 md:h-5 rounded-full border-2 border-white shadow-sm overflow-hidden"
              style={{ transform: `translateX(${i * 6}px)`, zIndex: 20 + i }}
              title={pl.name}
            >
              <PlayerAvatar avatarId={pl.avatarId} className="w-full h-full" />
            </div>
          ))}
          {playersOnTile.length > 4 && (
            <div className="flex items-center justify-center text-[10px] w-4 h-4 rounded-full bg-gray-800 text-white ml-1">+{playersOnTile.length - 4}</div>
          )}
        </div>
      )}
    </motion.div>
  );
});
Tile.displayName = 'Tile';

export function GameBoard({ board, players, gameId, diceRoll, isMyTurn, activePlayerId, gameState }: GameBoardProps) {
  if (!board || board.length === 0) {
    return <div className="text-center p-6 text-lg">جاري تحميل اللوحة...</div>;
  }

  const sideLength = useMemo(() => Math.ceil(board.length / 4) + 1, [board.length]);

  const perimeterPositions = useMemo(() => {
    const positions = new Map<number, { gridRow: number; gridColumn: number }>();
    const n = sideLength;
    const perimeterCount = (n - 1) * 4;

    for (let i = 0; i < board.length; i++) {
      const idx = i % perimeterCount;
      let row = 1, col = 1;

      if (idx < n) {
        row = 1;
        col = idx + 1;
      } else if (idx < n + (n - 2)) {
        row = idx - (n - 1) + 1;
        col = n;
      } else if (idx < n + (n - 2) + (n - 1)) {
        row = n;
        col = n - (idx - (n + (n - 2)));
      } else {
        row = n - (idx - (n + (n - 2) + (n - 1)));
        col = 1;
      }

      positions.set(i, { gridRow: row, gridColumn: col });
    }
    return positions;
  }, [board, sideLength]);

  const activePlayer = players.find(p => p.id === activePlayerId);
  const activePosition = activePlayer?.position;

  useEffect(() => {
    const movePlayer = async () => {
      if (diceRoll === null || !isMyTurn) return;
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        await handlePropertyAction(gameId, activePlayerId);
      } catch (e) {
        console.error('handlePropertyAction failed', e);
      }
    };

    if (gameState === 'movement') movePlayer();
  }, [diceRoll, isMyTurn, gameId, activePlayerId, gameState]);

  return (
    <div className="p-2 rounded-3xl shadow-2xl bg-gradient-to-br from-violet-50 to-violet-100 dark:from-zinc-900 dark:to-zinc-800 w-full max-w-[92vh] mx-auto">
      <div
        className="relative w-full h-full grid"
        style={{
          gridTemplateColumns: `repeat(${sideLength}, minmax(40px, 1fr))`,
          gridTemplateRows: `repeat(${sideLength}, minmax(40px, 1fr))`,
          gap: `${TILE_GAP}px`,
        }}
      >
        {board.map((property, idx) => {
          const pos = perimeterPositions.get(idx);
          if (!pos) return null;

          const ownerColor = property.ownerId ? players.find(p => p.id === property.ownerId)?.color : undefined;
          const playersOnTile = players.filter(pl => pl.position === property.id && pl.status !== 'bankrupt');
          const isActive = activePosition === property.id;

          return (
            <div key={property.id} style={{ gridRow: pos.gridRow, gridColumn: pos.gridColumn }} className="p-0">
              <Tile property={property} ownerColor={ownerColor} playersOnTile={playersOnTile} isActive={isActive} />
            </div>
          );
        })}

        <div
          className="flex items-center justify-center flex-col p-2 rounded-xl bg-gradient-to-tl from-white/60 to-transparent dark:from-black/40"
          style={{ gridArea: `2 / 2 / ${sideLength} / ${sideLength}` }}
        >
          <h2 className="text-lg md:text-2xl font-extrabold text-violet-700 dark:text-violet-300">التاجر المتعلّم</h2>

          <div className="mt-2 flex items-center gap-3">
            <div className={cn("px-3 py-1 rounded-full text-sm font-semibold shadow-sm flex items-center gap-2", isMyTurn ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-800 dark:bg-zinc-700 dark:text-zinc-200') }>
              <span>{isMyTurn ? 'دورك الآن' : 'انتظر دورك'}</span>
              {isMyTurn && <span className="text-xs opacity-80">•</span>}
            </div>

            <div className="text-sm text-gray-700 dark:text-gray-300">
              {activePlayer ? (
                <span>اللاعب التالي: <strong>{activePlayer.name}</strong></span>
              ) : (
                <span>جارٍ تحديث الحالة...</span>
              )}
            </div>

            <div className="ml-2 text-sm">
              {diceRoll !== null && (
                <div className="px-2 py-1 bg-white/80 dark:bg-black/40 rounded-md shadow">نرد: <strong>{diceRoll}</strong></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
