// .
"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Home, Building2, Gavel, ArrowRight, ArrowLeft, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Player, Property } from "@/types";
import { PlayerAvatar } from "../PlayerAvatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GameBoardProps {
  players: Player[];
  properties: Property[];
  className?: string;
}

const TILE_MIN_SIZE = 64; 

export function GameBoard({ players, properties, className }: GameBoardProps) {
  if (!properties || properties.length === 0) return null;

  const size = useMemo(() => {
    const m = properties.length;
    return Math.max(3, Math.ceil((m + 4) / 4));
  }, [properties.length]);

  const perimeterLen = 4 * size - 4;

  const tileSlots = useMemo(() => {
    const slots: Array<Property | null> = Array.from({ length: perimeterLen }, (_, i) => properties[i] ?? null);
    return slots;
  }, [properties, perimeterLen]);

  function indexToGridPos(i: number) {
    const n = size;
    if (i < n) return { col: i + 1, row: n };
    if (i < n + (n - 1)) return { col: n, row: n - 1 - (i - n) };
    if (i < n + 2 * (n - 1)) return { col: n - 1 - (i - (n + n - 2)), row: 1 };
    return { col: 1, row: 2 + i - (n + 2 * (n-1)) };
  }

  function indexToDirection(i: number) {
    const n = size;
    if (i < n) return 'right';
    if (i < n + (n - 1)) return 'up';
    if (i < n + 2 * (n - 1)) return 'left';
    return 'down';
  }

  function playersOnTileByIndex(idx: number, prop: Property | null) {
    return players.filter(pl => {
      if (pl == null || pl.status === 'bankrupt') return false;
      if (prop && String(pl.position) === String(prop.id)) return true;
      if (typeof pl.position === 'number' && pl.position === idx) return true;
      return false;
    });
  }

  function getComputedContrast(hex?: string | null) {
    if (!hex) return true;
    const rgb = hexToRgb(hex);
    if (!rgb) return true;
    const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return lum > 0.5;
  }
  
  function hexToRgb(hex?: string | null) {
    if (!hex) return null;
    const h = hex.replace('#', '');
    if (h.length === 3) return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
    if (h.length === 6) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    return null;
  }
  
  function hexToRgba(hex?: string | null, alpha = 1) {
    const rgb = hexToRgb(hex);
    if (!rgb) return `rgba(0,0,0,${alpha})`;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  const gridTemplate = `repeat(${size}, minmax(${TILE_MIN_SIZE}px, 1fr))`;

  return (
    <div className={cn('p-3 rounded-3xl shadow-2xl bg-gradient-to-br from-violet-50 to-violet-100 dark:from-zinc-900 dark:to-zinc-800 w-full max-w-[92vh] mx-auto', className)}>
      <div
        className="relative w-full h-full grid"
        style={{ gridTemplateColumns: gridTemplate, gridTemplateRows: gridTemplate, gap: '10px' }}
      >
        {tileSlots.map((prop, idx) => {
          const { row, col } = indexToGridPos(idx);
          const dir = indexToDirection(idx);
          const isStart = idx === 0;
          const owner = prop?.ownerId ? players.find(p => p.id === prop.ownerId) : undefined;
          const ownerColor = owner?.color ?? undefined;
          const textColor = ownerColor ? (getComputedContrast(ownerColor) ? '#000' : '#fff') : undefined;
          const playersOnTile = playersOnTileByIndex(idx, prop);

          return (
            <div key={`slot-${idx}`} style={{ gridRow: row, gridColumn: col }} className="p-0">
               <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.03 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                      className={cn('relative rounded-md border p-2 flex flex-col items-center justify-center text-center select-none bg-white', isStart ? 'shadow-lg' : 'shadow')}
                      style={{
                        minWidth: TILE_MIN_SIZE,
                        minHeight: TILE_MIN_SIZE,
                        borderWidth: 2,
                        borderStyle: 'solid',
                        borderColor: ownerColor ?? (isStart ? '#7c3aed' : 'rgba(15,23,42,0.06)'),
                        background: ownerColor ? `linear-gradient(180deg, ${hexToRgba(ownerColor, 0.06)}, ${hexToRgba(ownerColor, 0.12)})` : undefined,
                        padding: 8,
                      }}
                      role={prop ? 'button' : 'group'}
                      tabIndex={0}
                      aria-label={prop ? prop.name : `خانة ${idx}`}
                    >
                      <div className="absolute right-1 top-1 text-[10px] font-mono text-gray-500">{idx}</div>
                      {isStart ? (
                        <div className="flex flex-col items-center gap-1">
                          <Home className="w-6 h-6 text-purple-700" />
                          <div className="text-xs font-bold text-purple-800">{"بداية"}</div>
                          <div className="text-[10px] text-gray-500">اتجاه</div>
                          <div className="mt-1">
                            {dir === 'right' && <ArrowRight className="w-4 h-4 text-purple-600" />}
                          </div>
                        </div>
                      ) : prop ? (
                        <>
                          <div className="flex items-center gap-2">
                            {prop.type === 'property' && <Building2 className="w-5 h-5 text-gray-700" />}
                            {prop.type === 'fine' && <Gavel className="w-5 h-5 text-red-600" />}
                            <div className="flex flex-col items-start">
                              <div className="text-[12px] font-semibold truncate max-w-[100px]" style={{ color: ownerColor ? textColor : undefined }}>{prop.name}</div>
                              {prop.type === 'property' && <div className="text-[11px] text-gray-600">{prop.price} د.ع</div>}
                            </div>
                          </div>
                          <div className="absolute left-1 top-1">
                            {dir === 'right' && <ArrowRight className="w-4 h-4 text-gray-300" />}
                            {dir === 'up' && <ArrowUp className="w-4 h-4 text-gray-300" />}
                            {dir === 'left' && <ArrowLeft className="w-4 h-4 text-gray-300" />}
                            {dir === 'down' && <ArrowDown className="w-4 h-4 text-gray-300" />}
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-gray-400">فارغ</div>
                      )}
                      {ownerColor && <div className="absolute left-0 bottom-0 w-full h-1.5 rounded-b-md" style={{ background: ownerColor }} />}
                      {playersOnTile.length > 0 && (
                        <div className="absolute left-1 bottom-1 flex items-center -space-x-1">
                          {playersOnTile.slice(0, 4).map(pl => (
                            <div key={pl.id} className="w-6 h-6 rounded-full border-2 border-white shadow-sm overflow-hidden" title={pl.name}>
                              <PlayerAvatar avatarId={pl.avatarId} className="w-full h-full" />
                            </div>
                          ))}
                          {playersOnTile.length > 4 && (
                            <div className="w-6 h-6 rounded-full bg-gray-800 text-white flex items-center justify-center text-xs">+{playersOnTile.length - 4}</div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {prop ? (
                      <div className="text-sm">
                        <div className="font-bold">{prop.name}</div>
                        {prop.type === 'property' && (
                          <>
                            <div>السعر: {prop.price} د.ع</div>
                            <div>الإيجار: {prop.rent} د.ع</div>
                          </>
                        )}
                        {prop.type === 'fine' && <div>غرامة: {prop.fineAmount} د.ع</div>}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">خانة غير مخصصة</div>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          );
        })}
        <div
          className="flex items-center justify-center flex-col p-4 rounded-xl bg-white/70 dark:bg-black/40"
          style={{ gridArea: `2 / 2 / ${size} / ${size}`, minHeight: Math.max(140, TILE_MIN_SIZE * (size - 2)) }}
        >
          <h2 className="text-lg md:text-2xl font-extrabold text-violet-700 dark:text-violet-300">التاجر المتعلّم</h2>
          <p className="text-sm text-gray-600">مركز التحكم — هنا يمكن إضافة أزرار رمية النرد، ملخص الجولات، تفاصيل سريعة.</p>
          <div className="mt-4 w-full flex flex-wrap justify-center gap-2">
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
};
