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

/**
 * GameBoard (حلقية - مربعة الشكل)
 * - يحسب حجم اللوحة تلقائياً ليناسب عدد الخانات (perimeter)
 * - بداية اللعبة START في الزاوية السفلية اليسرى
 * - المسار يمشي بعقارب الساعة
 * - يدعم خانات فارغة إن لم تكن خصصت جميع الخانات
 *
 * توقعات المدخلات:
 * - properties: مصفوفة تمثل الخانات بالترتيب الذي تريد ظهوره على المحيط (يُفترض أن تبدأ من خانة البداية وتتبع اتجاه الساعة)
 * - players: مصفوفة اللاعبين بها الحقول ({ id, name, avatarId, color, position }) حيث position يمكن أن يكون property.id أو index (اللي استخدمته داخل properties)
 */

interface GameBoardProps {
  players: Player[];
  properties: Property[]; // expected order: startIndex (0) -> clockwise
  tilesPerSide?: number; // optional override
  startLabel?: string; // custom start label (default: "بداية")
  className?: string;
}

const TILE_MIN_SIZE = 64; // px for min tile size; responsive grid uses minmax

export const GameBoard: React.FC<GameBoardProps> = ({ players, properties, tilesPerSide, startLabel = "بداية", className }) => {
  // compute minimal side length n such that perimeter 4n - 4 >= properties.length
  const size = useMemo(() => {
    const m = Math.max(0, properties?.length ?? 0);
    const minimal = Math.max(3, Math.ceil((m + 4) / 4)); // fixed: use Math.ceil to avoid missing tiles
    return typeof tilesPerSide === 'number' && tilesPerSide >= 3 ? Math.max(tilesPerSide, minimal) : minimal;
  }, [properties.length, tilesPerSide]);

  const perimeterLen = 4 * size - 4;

  // create ordered tile slots around perimeter (fill with null if properties shorter)
  const tileSlots = useMemo(() => {
    const slots: Array<Property | null> = Array.from({ length: perimeterLen }, (_, i) => properties[i] ?? null);
    return slots;
  }, [properties, perimeterLen]);

  // helper: map perimeter index -> grid row/col (1-based) for CSS grid
  function indexToGridPos(i: number) {
    const n = size;
    if (i < n) {
      // bottom row: left -> right
      return { col: i + 1, row: n };
    }
    if (i < n + (n - 1)) {
      // right column: bottom-1 -> top
      const j = i - n;
      return { col: n, row: n - 1 - j };
    }
    if (i < n + 2 * (n - 1)) {
      // top row: right-1 -> left
      const j = i - (n + (n - 1));
      return { col: n - 1 - j, row: 1 };
    }
    // left column: top+1 -> bottom-1
    const j = i - (n + 2 * (n - 1));
    return { col: 1, row: 2 + j };
  }

  // helper: get side direction for arrow/icon
  function indexToDirection(i: number) {
    const n = size;
    if (i < n) return 'right';
    if (i < n + (n - 1)) return 'up';
    if (i < n + 2 * (n - 1)) return 'left';
    return 'down';
  }

  // players lookup: we don't assume how position stored, so match by property.id OR numeric index
  function playersOnTileByIndex(idx: number, prop: Property | null) {
    return players.filter(pl => {
      if (pl == null || pl.status === 'bankrupt') return false;
      // match by property id
      if (prop && pl.position != null && String(pl.position) === String(prop.id)) return true;
      // match by numeric index
      if (typeof pl.position === 'number' && pl.position === idx) return true;
      return false;
    });
  }

  // small Player token component (keeps PlayerAvatar API simple)
  const PlayerToken: React.FC<{ pl: Player }> = ({ pl }) => (
    <motion.div
      layout
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      className="w-6 h-6 rounded-full overflow-hidden border-2 border-white shadow-sm"
      title={pl.name}
    >
      <PlayerAvatar avatarId={pl.avatarId} className="w-full h-full" />
    </motion.div>
  );

  // Tile renderer
  function Tile({ prop, idx }: { prop: Property | null; idx: number }) {
    const pos = indexToGridPos(idx);
    const dir = indexToDirection(idx);
    const isStart = idx === 0; // start in bottom-left corner

    const owner = prop?.ownerId ? players.find(p => p.id === prop.ownerId) : undefined;
    const ownerColor = owner?.color ?? undefined;
    const textColor = ownerColor ? (getComputedContrast(ownerColor) ? '#000' : '#fff') : undefined;

    const playersOnTile = playersOnTileByIndex(idx, prop);

    return (
      <TooltipProvider key={`tt-${idx}`}>
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
              {/* small index badge */}
              <div className="absolute right-1 top-1 text-[10px] font-mono text-gray-500">{idx}</div>

              {/* Start tile special */}
              {isStart ? (
                <div className="flex flex-col items-center gap-1">
                  <Home className="w-6 h-6 text-purple-700" />
                  <div className="text-xs font-bold text-purple-800">{startLabel}</div>
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

                  {/* direction icon for non-start tiles (tiny) */}
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

              {/* owner color bar */}
              {ownerColor && <div className="absolute left-0 bottom-0 w-full h-1.5 rounded-b-md" style={{ background: ownerColor }} />}

              {/* players display */}
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
    );
  }

  // compute CSS grid template
  const gridTemplate = `repeat(${size}, minmax(${TILE_MIN_SIZE}px, 1fr))`;

  return (
    <div className={cn('p-3 rounded-3xl shadow-2xl bg-gradient-to-br from-violet-50 to-violet-100 dark:from-zinc-900 dark:to-zinc-800 w-full max-w-[92vh] mx-auto', className)}>
      <div
        className="relative w-full h-full grid"
        style={{ gridTemplateColumns: gridTemplate, gridTemplateRows: gridTemplate, gap: '10px' }}
      >
        {tileSlots.map((prop, idx) => {
          const { row, col } = indexToGridPos(idx);
          return (
            <div key={`slot-${idx}`} style={{ gridRow: row, gridColumn: col }} className="p-0">
              <Tile prop={prop} idx={idx} />
            </div>
          );
        })}

        {/* Center hub: occupies inner square (2..size-1) */}
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

// helper functions used above
function hexToRgb(hex?: string | null) {
  if (!hex) return null;
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
  }
  if (h.length === 6) {
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  return null;
}

function hexToRgba(hex?: string | null, alpha = 1) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function getComputedContrast(hex?: string | null) {
  // returns true if background is light (so black text), false if dark (so white text)
  if (!hex) return true;
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return lum > 0.5;
}
