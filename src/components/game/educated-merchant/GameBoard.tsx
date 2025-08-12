"use client";

import React, { useMemo, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Building2, Gavel, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Dice } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Player, Property } from "@/types";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

// ----- CONFIG -----
const TILE_MIN_SIZE = 64; // minimum pixel size for each tile
const DICE_ANIM_MS = 1400; // how long the dice spin animation runs

interface GameBoardProps {
  players: Player[];
  properties: Property[];
  className?: string;
  currentPlayerId?: string | null;
  lastDiceRoll?: number | null;
  isRolling?: boolean;
  onRoll?: () => void;
  onTileClick?: (prop: Property | null) => void;
  onBuy?: (prop: Property) => void;
  onSkip?: (prop: Property) => void;
  round?: number;
  maxRounds?: number;
  turnOrder?: string[];
}

// Simple deterministic color for a category (small hash)
function categoryColor(cat?: string) {
  if (!cat) return "bg-gray-200";
  const colors = [
    "#F97316",
    "#3B82F6",
    "#10B981",
    "#A855F7",
    "#EF4444",
    "#F59E0B",
    "#0EA5E9",
    "#F43F5E",
  ];
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h << 5) - h + cat.charCodeAt(i);
  return colors[Math.abs(h) % colors.length];
}

function hexToRgb(hex?: string | null) {
  if (!hex) return null;
  const h = hex.replace('#', '');
  if (h.length === 3) return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
  if (h.length === 6) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  return null;
}
function rgba(hex?: string | null, a = 1) {
  const c = hexToRgb(hex);
  if (!c) return `rgba(0,0,0,${a})`;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}

export default function GameBoard({
  players,
  properties,
  className,
  currentPlayerId = null,
  lastDiceRoll = null,
  isRolling = false,
  onRoll,
  onTileClick,
  onBuy,
  onSkip,
  round = 1,
  maxRounds = 20,
  turnOrder = [],
}: GameBoardProps) {
  // --- layout size ---
  const size = useMemo(() => {
    const m = properties.length;
    // minimal n such that perimeter (4*n - 4) >= m
    const n = Math.max(3, Math.ceil((m + 4) / 4));
    return n;
  }, [properties.length]);

  const perimeterLen = 4 * size - 4;

  // slots: fill up to perimeterLen with properties or null placeholders
  const tileSlots = useMemo(() => {
    const slots: Array<Property | null> = Array.from({ length: perimeterLen }, (_, i) => {
      // prefer to find property whose id equals i (common when board was generated sequentially)
      const p = properties.find((pr) => Number(pr.id) === i);
      if (p) return p;
      // fallback to index-based mapping if properties array aligned
      return properties[i] ?? null;
    });
    return slots;
  }, [properties, perimeterLen]);

  // mapping index -> grid position
  function indexToGridPos(i: number) {
    const n = size;
    const bottomLen = n;
    const rightLen = n - 1;
    const topLen = n - 1;
    const leftLen = n - 2;

    if (i < bottomLen) return { col: i + 1, row: n }; // bottom row left->right
    if (i < bottomLen + rightLen) {
      const offset = i - bottomLen; // 0..rightLen-1
      return { col: n, row: n - 1 - offset }; // right column bottom-1 -> top
    }
    if (i < bottomLen + rightLen + topLen) {
      const offset = i - (bottomLen + rightLen);
      return { col: n - 1 - offset, row: 1 }; // top row right->left
    }
    const offset = i - (bottomLen + rightLen + topLen);
    return { col: 1, row: 2 + offset }; // left column top+1 -> bottom-1
  }

  function indexToDirection(i: number) {
    const n = size;
    if (i < n) return 'right';
    if (i < n + (n - 1)) return 'up';
    if (i < n + 2 * (n - 1)) return 'left';
    return 'down';
  }

  function playersOnTileByIndex(idx: number, prop: Property | null) {
    return players.filter((pl) => {
      if (!pl || pl.status === 'bankrupt') return false;
      if (prop && Number(pl.position) === Number(prop.id)) return true;
      if (typeof pl.position === 'number' && pl.position === idx) return true;
      return false;
    });
  }

  // Dice spinner local state (visual only). We animate for DICE_ANIM_MS and then show lastDiceRoll
  const [diceSpinning, setDiceSpinning] = useState(false);
  const [visualDice, setVisualDice] = useState<number | null>(null);

  useEffect(() => {
    if (isRolling) {
      setDiceSpinning(true);
      // run spinner until either lastDiceRoll arrives or timeout
      const start = Date.now();
      const int = setInterval(() => setVisualDice(Math.floor(Math.random() * 6) + 1), 100);
      const t = setTimeout(() => {
        clearInterval(int);
        setVisualDice(lastDiceRoll ?? Math.floor(Math.random() * 6) + 1);
        setDiceSpinning(false);
      }, DICE_ANIM_MS);

      return () => {
        clearInterval(int);
        clearTimeout(t);
      };
    } else {
      // show real dice when animation not active
      setVisualDice(lastDiceRoll ?? null);
    }
  }, [isRolling, lastDiceRoll]);

  // helper to compute contrast text color for owner
  function getComputedContrast(hex?: string | null) {
    if (!hex) return true;
    const rgb = hexToRgb(hex);
    if (!rgb) return true;
    const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return lum > 0.5;
  }

  const gridTemplate = `repeat(${size}, minmax(${TILE_MIN_SIZE}px, 1fr))`;

  // small helper for currency formatting
  function fmt(n?: number) {
    if (n == null) return "-";
    return `${n.toLocaleString('ar-EG')} د.ع`;
  }

  // current player's object
  const currentPlayer = players.find(p => p.id === currentPlayerId) ?? players[0];

  return (
    <div className={cn('p-3 rounded-3xl shadow-2xl bg-gradient-to-br from-violet-50 to-violet-100 dark:from-zinc-900 dark:to-zinc-800 w-full max-w-[92vh] mx-auto', className)}>
      <div
        className="relative w-full aspect-square grid"
        style={{ gridTemplateColumns: gridTemplate, gridTemplateRows: gridTemplate, gap: '10px' }}
      >
        {tileSlots.map((prop, idx) => {
          const { row, col } = indexToGridPos(idx);
          const dir = indexToDirection(idx);
          const isStart = idx === 0 && prop?.type === 'start';
          const owner = prop?.ownerId ? players.find(p => p.id === prop.ownerId) : undefined;
          const ownerColor = owner?.color ?? undefined;
          const textColor = ownerColor ? (getComputedContrast(ownerColor) ? '#000' : '#fff') : undefined;
          const playersOnTile = playersOnTileByIndex(idx, prop);

          const isActiveTile = currentPlayer && Number(currentPlayer.position) === idx;

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
                        borderWidth: isActiveTile ? 3 : 2,
                        borderStyle: 'solid',
                        borderColor: ownerColor ?? (isStart ? '#7c3aed' : 'rgba(15,23,42,0.06)'),
                        background: ownerColor ? `linear-gradient(180deg, ${rgba(ownerColor, 0.06)}, ${rgba(ownerColor, 0.12)})` : undefined,
                        padding: 8,
                      }}
                      role={prop ? 'button' : 'group'}
                      tabIndex={0}
                      aria-label={prop ? prop.name : `خانة ${idx}`}
                      onClick={() => onTileClick && onTileClick(prop ?? null)}
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
                              <div className="text-[12px] font-semibold truncate max-w-[110px]" style={{ color: ownerColor ? textColor : undefined }}>{prop.name}</div>
                              {prop.type === 'property' && <div className="text-[11px] text-gray-600">{fmt(prop.price)}</div>}
                            </div>
                          </div>

                          <div className="absolute left-1 top-1">
                            {dir === 'right' && <ArrowRight className="w-4 h-4 text-gray-300" />}
                            {dir === 'up' && <ArrowUp className="w-4 h-4 text-gray-300" />}
                            {dir === 'left' && <ArrowLeft className="w-4 h-4 text-gray-300" />}
                            {dir === 'down' && <ArrowDown className="w-4 h-4 text-gray-300" />}
                          </div>

                          {/* category pill */}
                          {prop.type === 'property' && (
                            <div className="absolute top-1 left-1/2 -translate-x-1/2">
                              <div className="px-2 py-0.5 text-[10px] rounded-full font-medium" style={{ background: categoryColor(prop.category), color: '#fff', boxShadow: '0 1px 0 rgba(0,0,0,0.08)' }}>{prop.category}</div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-gray-400">فارغ</div>
                      )}

                      {/* owner stripe */}
                      {ownerColor && <div className="absolute left-0 bottom-0 w-full h-1.5 rounded-b-md" style={{ background: ownerColor }} />}

                      {/* players tokens */}
                      {playersOnTile.length > 0 && (
                        <div className="absolute left-1 bottom-1 flex items-center -space-x-1">
                          {playersOnTile.slice(0, 4).map(pl => (
                            <motion.div key={pl.id} layoutId={`player-${pl.id}`} className="w-6 h-6 rounded-full border-2 border-white shadow-sm overflow-hidden" title={pl.name} style={{ boxShadow: isActiveTile && pl.id === currentPlayerId ? `0 0 12px ${rgba(pl.color ?? '#7c3aed', 0.35)}` : undefined }}>
                              <PlayerAvatar avatarId={pl.avatarId} className="w-full h-full" />
                            </motion.div>
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
                            <div>السعر: {fmt(prop.price)}</div>
                            <div>الإيجار: {fmt(prop.rent)}</div>
                            <div>القسم: {prop.category}</div>
                            <div>المالك: {prop.ownerId ? (players.find(p => p.id === prop.ownerId)?.name ?? 'مجهول') : 'لا أحد'}</div>
                          </>
                        )}
                        {prop.type === 'fine' && <div>غرامة: {fmt(prop.fineAmount)}</div>}
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

        {/* center hub */}
        <div
          className="flex items-center justify-center flex-col p-4 rounded-xl bg-white/90 dark:bg-black/50"
          style={{ gridArea: `2 / 2 / ${size} / ${size}`, minHeight: Math.max(140, TILE_MIN_SIZE * (size - 2)) }}
        >
          <h2 className="text-lg md:text-2xl font-extrabold text-violet-700 dark:text-violet-300">التاجر المتعلّم</h2>
          <p className="text-sm text-gray-600">مركز التحكم — ملخص سريع عن الدور الحالي والجولة واللاعب.</p>

          <div className="mt-3 w-full flex flex-col items-center gap-3">
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2" style={{ borderColor: currentPlayer?.color ?? '#ddd' }}>
                    <PlayerAvatar avatarId={currentPlayer?.avatarId} className="w-full h-full" />
                  </div>
                </div>
                <div className="text-sm">
                  <div className="font-medium">{currentPlayer?.name ?? 'لاعب'}</div>
                  <div className="text-xs text-gray-500">رصيد: {fmt((currentPlayer && (Number((players.reduce((acc:any, p:any) => { acc[p.id] = p.balance ?? 0; return acc; }, {}))[currentPlayer.id] || 0))) )}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-xs text-gray-500">جولة {round}/{maxRounds}</div>
                <div className="w-36">
                  <Progress value={Math.min(100, (round / (maxRounds || 1)) * 100)} />
                </div>
              </div>
            </div>

            {/* turn order */}
            <div className="w-full flex items-center gap-2 overflow-x-auto py-1">
              {turnOrder && turnOrder.map((id, i) => {
                const pl = players.find(p => p.id === id);
                return pl ? (
                  <div key={id} className={cn('flex items-center gap-2 px-2 py-1 rounded-md', pl.id === currentPlayerId ? 'ring-2 ring-violet-300' : 'bg-white/50')}>
                    <PlayerAvatar avatarId={pl.avatarId} className="w-6 h-6 rounded-full" />
                    <div className="text-xs">{pl.name}</div>
                  </div>
                ) : null;
              })}
            </div>

            {/* dice + actions */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2">
                  <motion.div animate={{ rotate: diceSpinning ? 12 : 0 }} transition={{ repeat: diceSpinning ? Infinity : 0, duration: 0.25 }} className="w-12 h-12 rounded-md bg-white/80 flex items-center justify-center shadow-md">
                    <Dice className="w-6 h-6 text-gray-700" />
                  </motion.div>
                  <div className="text-sm text-gray-700">{visualDice ? <span className="font-extrabold text-xl">{visualDice}</span> : <span className="text-xs text-gray-400">لا رمية</span>}</div>
                </div>
                <div className="text-[11px] text-gray-500 mt-1">نتيجة النرد</div>
              </div>

              <div className="flex flex-col gap-2">
                <Button onClick={() => { if (onRoll) { onRoll(); } }} disabled={isRolling}>
                  رمي النرد
                </Button>
                <div className="text-xs text-gray-500 text-center">اضغط لبدء حركة اللاعب</div>
              </div>
            </div>

            {/* optional quick actions when current tile is buyable */}
            <div className="w-full flex items-center justify-center gap-3">
              {(() => {
                const cp = currentPlayer;
                if (!cp) return null;
                const prop = tileSlots.find((t, i) => t && Number(cp.position) === Number(t.id));
                if (!prop) return null;
                if (prop.type === 'property' && !prop.ownerId) {
                  return (
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => onSkip && onSkip(prop)}>تخطي</Button>
                      <Button onClick={() => onBuy && onBuy(prop)}>شراء ({fmt(prop.price)})</Button>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
