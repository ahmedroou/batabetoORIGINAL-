'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game, Player, Property } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { PropertyCard } from './PropertyCard';
import { DiceRoll } from './DiceRoll';
import { PlayerHUD } from './PlayerHUD';
import { ActivityLog } from './ActivityLog';
import { cn } from '@/lib/utils';
import { Banknote, Building, HelpCircle, Trophy } from 'lucide-react';
import { CountdownTimer } from '@/components/game/CountdownTimer';
import { RentPaidOverlay } from './RentPaidOverlay';
import { QuestionModal } from './QuestionModal';

interface GameBoardProps {
  game: Game;
  self: Player;
}

const BOARD_SIZE = 28;
const GRID_SIZE = 8;

const JUMP_HEIGHT = 14;
const STEP_BASE_DELAY_MS = 200;
const TRAIL_LIFETIME_MS = 420;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* Tile extracted & memoized */
const Tile = React.memo(({ property, isNewlyBought, isHighlighted }: { property: Property; isNewlyBought: boolean; isHighlighted?: boolean }) => {
  let Icon = Building;
  let baseBg = 'bg-slate-700';
  let borderColor = 'border-slate-500';

  if (property.type === 'start') { Icon = Trophy; baseBg = 'bg-yellow-500 text-black'; borderColor = 'border-yellow-300'; }
  else if (property.type === 'fine') { Icon = Banknote; baseBg = 'bg-rose-700'; borderColor = 'border-rose-500'; }

  const dynamicStyle: React.CSSProperties = {};
  if (property.ownerId && property.color) {
    dynamicStyle.backgroundColor = property.color;
    borderColor = 'border-white/50';
  }

  return (
    <motion.div
      title={property.name}
      className={cn(
        'w-full h-full rounded-lg border-2 flex flex-col items-center justify-center p-1 text-center text-white shadow-lg transition-all duration-500 cursor-pointer',
        baseBg, borderColor, isNewlyBought && 'animate-pulse-glow', isHighlighted && 'tile-highlight'
      )}
      style={dynamicStyle}
      whileHover={{ scale: 1.03, zIndex: 10 }}
      transition={{ duration: 0.22 }}
    >
      <Icon className="w-5 h-5 mb-1 flex-shrink-0" />
      <p className="text-[10px] font-bold leading-tight line-clamp-2 text-center overflow-hidden" style={{ padding: '0 4px' }}>
        {property.name}
      </p>
      {property.type === 'property' && <p className="text-[10px] font-mono mt-1">{property.price} دينار</p>}
      {property.type === 'fine' && <p className="text-[10px] font-mono mt-1">{property.fineAmount} دينار</p>}
    </motion.div>
  );
});
Tile.displayName = 'Tile';

/* helpers */
function findNextAliveIndex(turnOrder: string[], players: Player[], startIndex: number): number {
  if (!turnOrder || turnOrder.length === 0) return -1;
  let idx = (startIndex + 1) % turnOrder.length;
  let attempts = 0;
  while (attempts < turnOrder.length) {
    const pid = turnOrder[idx];
    const p = players.find((x) => x.id === pid);
    if (p && p.status === 'alive') return idx;
    idx = (idx + 1) % turnOrder.length;
    attempts++;
  }
  return -1;
}

/* layout presets for 1..4 players in a tile */
function getLayoutsForCount(n: number) {
  if (n <= 1) return [{ x: 0.5, y: 0.5 }];
  if (n === 2) return [{ x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 }];
  if (n === 3) return [{ x: 0.5, y: 0.25 }, { x: 0.25, y: 0.75 }, { x: 0.75, y: 0.75 }];
  // 4 or more -> stable 2x2 grid
  return [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.25, y: 0.75 }, { x: 0.75, y: 0.75 }];
}

export function GameBoard({ game, self }: GameBoardProps) {
  const board = game.educatedMerchantState?.board || [];
  const shouldReduceMotion = useReducedMotion();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]); // highlight timers
  const resizeTimerRef = useRef<number | null>(null);

  const [tileSize, setTileSize] = useState(96);
  const [gapSize, setGapSize] = useState(6);
  const [playerPositions, setPlayerPositions] = useState<Record<string, number>>({});
  const [tileHighlight, setTileHighlight] = useState<Record<number, boolean>>({});
  const lastRollNonceRef = useRef<number | null>(null);

  /* initialize playerPositions from server when players list changes */
  useEffect(() => {
    const initialPositions: Record<string, number> = {};
    (game.players || []).forEach((p) => (initialPositions[p.id] = p.position ?? 0));
    setPlayerPositions(initialPositions);
  }, [game.players]);

  /* cleanup on unmount: cancel timers & resize timers */
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
    };
  }, []);

  /* resize handling with debounce */
  useEffect(() => {
    const calculateSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const minDim = Math.min(rect.width, rect.height);
      const newTile = Math.max(56, Math.floor(minDim / (GRID_SIZE + 1)));
      setTileSize(newTile);
      setGapSize(Math.max(4, Math.floor(newTile * 0.045)));
    };

    calculateSize();

    const onResize = () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = window.setTimeout(() => {
        calculateSize();
        resizeTimerRef.current = null;
      }, 120);
    };

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
    };
  }, []);

  /* compute pixel coords for a board index */
  const getPositionStyles = useCallback(
    (index: number): { top: number; left: number } => {
      const sideLength = GRID_SIZE - 1;
      let top = 0, left = 0;
      const step = tileSize + gapSize;

      if (index >= 0 && index < sideLength) { top = 0; left = index * step; }
      else if (index >= sideLength && index < sideLength * 2) { top = (index - sideLength) * step; left = sideLength * step; }
      else if (index >= sideLength * 2 && index < sideLength * 3) { top = sideLength * step; left = (sideLength - (index - sideLength * 2)) * step; }
      else { top = (sideLength - (index - sideLength * 3)) * step; left = 0; }

      return { top, left };
    },
    [tileSize, gapSize]
  );

  /* move a player's piece visually (UI-side)
     - uses playerPositions to compute final pos and triggers a single state update at the end
     - creates light "trail" highlights for steps (timers cleaned)
  */
  const movePlayerPiece = useCallback(
    async (playerId: string, steps: number, startPos: number) => {
      // clear outstanding highlight timers to avoid buildup
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];

      // if no steps or user prefers reduced motion, just set final pos
      if (steps === 0 || shouldReduceMotion) {
        const finalPos = (startPos + steps) % BOARD_SIZE;
        setPlayerPositions((prev) => ({ ...prev, [playerId]: finalPos }));
        return;
      }

      // ensure UI starts from the given start position
      setPlayerPositions((prev) => ({ ...prev, [playerId]: startPos }));

      let currentPos = startPos;
      for (let i = 0; i < steps; i++) {
        currentPos = (currentPos + 1) % BOARD_SIZE;

        // set highlight for this tile
        setTileHighlight((t) => ({ ...t, [currentPos]: true }));

        // schedule clear of the highlight (captured currentPos)
        const tid = window.setTimeout(() => {
          setTileHighlight((t) => {
            const copy = { ...t };
            delete copy[currentPos];
            return copy;
          });
        }, TRAIL_LIFETIME_MS + i * STEP_BASE_DELAY_MS);
        timersRef.current.push(tid);

        // wait between steps to create trail effect (this does not update player position until end)
        await sleep(STEP_BASE_DELAY_MS);
      }

      // finally set the final position so motion / layout animates the avatar to new tile
      setPlayerPositions((prev) => ({ ...prev, [playerId]: currentPos }));
    },
    [shouldReduceMotion]
  );

  /* react to server nonce -> animate piece movement */
  useEffect(() => {
    const nonce = game.educatedMerchantState?.rollAnimationNonce;
    if (nonce === null || nonce === undefined || lastRollNonceRef.current === nonce) return;

    lastRollNonceRef.current = nonce;

    const currentTurnIndex = game.educatedMerchantState?.currentTurnIndex ?? 0;
    const turnOrder = game.educatedMerchantState?.turnOrder ?? [];
    const movingPlayerId = turnOrder[currentTurnIndex];
    if (!movingPlayerId) return;

    const steps = game.educatedMerchantState?.lastDiceRoll ?? 0;
    const serverPos = game.players.find((p) => p.id === movingPlayerId)?.position ?? 0;

    // prefer local tracked start if present (prevents visual jumps), fallback to server-derived start
    const localStart = playerPositions[movingPlayerId];
    const startPos = typeof localStart === 'number' ? localStart : (serverPos - steps + BOARD_SIZE) % BOARD_SIZE;

    void movePlayerPiece(movingPlayerId, steps, startPos);
  }, [
    game.educatedMerchantState?.rollAnimationNonce,
    game.players,
    game.educatedMerchantState?.currentTurnIndex,
    game.educatedMerchantState?.turnOrder,
    game.educatedMerchantState?.lastDiceRoll,
    movePlayerPiece,
    playerPositions,
  ]);

  /* Render center panel content */
  const renderCenterContent = useCallback(() => {
    const turnOrder = game.educatedMerchantState?.turnOrder ?? [];
    const currentTurnIndex = game.educatedMerchantState?.currentTurnIndex ?? 0;
    const currentPlayerId = turnOrder[currentTurnIndex];

    switch (game.gameState) {
      case 'rolling':
        return <DiceRoll game={game} self={self} />;
      case 'property_action': {
        const player = game.players.find((p) => p.id === currentPlayerId);
        if (!player) return null;
        const property = board[player.position];
        if (!property) return null;
        return <PropertyCard game={game} self={self} property={property} allowActions={true} />;
      }
      case 'turn_end': {
        const turnEndingPlayer = game.players.find((p) => p.id === currentPlayerId);
        const nextPlayerIndex = findNextAliveIndex(turnOrder, game.players, currentTurnIndex);
        const nextPlayer = game.players.find((p) => p.id === turnOrder[nextPlayerIndex]);
        return (
          <div className="text-center text-white space-y-4 p-4 bg-slate-800 rounded-lg">
            <h2 className="text-2xl font-bold">انتهى دور {turnEndingPlayer?.name}</h2>
            <p className="text-muted-foreground mt-2">الدور على: {nextPlayer?.name}</p>
          </div>
        );
      }
      case 'question': {
        const questionPlayerId = game.educatedMerchantState?.pendingPurchase?.playerId ?? game.educatedMerchantState?.pendingFine?.playerId;
        const playerOnQuestion = game.players.find(p => p.id === questionPlayerId);
        if (!playerOnQuestion) return <div />;
        const property = board[playerOnQuestion.position];
        if (property && property.type === 'property') {
          return <PropertyCard game={game} self={self} property={property} allowActions={false} />;
        }
        return (
          <div className="text-center text-white space-y-4 p-4 bg-slate-800 rounded-lg">
            <HelpCircle className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h2 className="text-2xl font-bold animate-pulse">
              في انتظار إجابة {playerOnQuestion.name}...
            </h2>
          </div>
        );
      }
      default:
        return (
          <div className="text-center text-white">
            <HelpCircle className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h2 className="text-2xl font-bold">منطقة التحكم</h2>
            <p className="text-muted-foreground mt-2">حالة اللعبة: {game.gameState}</p>
          </div>
        );
    }
  }, [board, game, self]);

  const boardWidth = GRID_SIZE * tileSize + (GRID_SIZE - 1) * gapSize;
  const boardHeight = boardWidth;

  /* group players by position, but sort each tile's players by turn order to keep deterministic UI */
  const playersGroupedByPosition = useMemo(() => {
    const map: Record<number, Player[]> = {};
    const turnOrder = game.educatedMerchantState?.turnOrder ?? [];
    const orderMap = new Map<string, number>();
    turnOrder.forEach((id, i) => orderMap.set(id, i));

    game.players.forEach((player) => {
      const pos = playerPositions[player.id] ?? player.position ?? 0;
      if (!map[pos]) map[pos] = [];
      map[pos].push(player);
    });

    // sort each bucket by turnOrder index (fallback to name)
    Object.keys(map).forEach((k) => {
      map[parseInt(k, 10)].sort((a, b) => {
        const ai = orderMap.get(a.id) ?? 9999;
        const bi = orderMap.get(b.id) ?? 9999;
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name);
      });
    });

    return map;
  }, [game.players, playerPositions, game.educatedMerchantState?.turnOrder]);

  const round = game.round ?? 1;
  const maxRounds = game.educatedMerchantState?.settings?.maxRounds ?? 20;
  const currentMoves = game.educatedMerchantState?.movesThisRound ?? 0;
  const aliveCount = game.players.filter((p) => p.status === 'alive').length;

  return (
    <div className="w-screen h-screen bg-gray-800 p-2 md:p-4 flex flex-col md:flex-row gap-4 overflow-hidden">
      <QuestionModal game={game} self={self} />
      <RentPaidOverlay rentInfo={game.educatedMerchantState?.lastRentPayment ?? null} />

      <div className="w-full md:w-1/4 xl:w-1/5 space-y-4 shrink-0 flex flex-col">
        <div className="p-2 bg-slate-900/40 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">جولة</div>
              <div className="text-lg font-bold">{round} / {maxRounds}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">تحركات</div>
              <div className="text-lg font-semibold">{currentMoves} / {aliveCount}</div>
            </div>
          </div>
        </div>
        <PlayerHUD players={game.players} turnOrder={game.educatedMerchantState?.turnOrder ?? []} currentTurnIndex={game.educatedMerchantState?.currentTurnIndex ?? 0} />
        <ActivityLog log={game.educatedMerchantState?.activityLog || []} />
      </div>

      <div ref={containerRef} className="flex-grow flex items-center justify-center relative min-h-0 min-w-0">
        <div className="relative" style={{ width: boardWidth, height: boardHeight }}>
          <div
            className="absolute bg-gray-900/60 rounded-2xl flex flex-col items-center justify-center p-2 md:p-8 shadow-inner"
            style={{ top: tileSize + gapSize, left: tileSize + gapSize, right: tileSize + gapSize, bottom: tileSize + gapSize }}
          >
            {game.educatedMerchantState?.timerEndsAt && game.gameState !== 'question' && (
              <div className="mb-4 z-20">
                <CountdownTimer
                  gameId={game.id}
                  gameType="educated-merchant"
                  expiryTimestamp={game.educatedMerchantState.timerEndsAt.toMillis()}
                  selfId={self.id}
                  isHost={game.hostId === self.id}
                />
              </div>
            )}
            <AnimatePresence mode="wait">
              <motion.div key={game.gameState} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.28 }}>
                {renderCenterContent()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Tiles */}
          {board.map((property, index) => {
            const { top, left } = getPositionStyles(index);
            return (
              <div key={index} style={{ top, left, width: tileSize, height: tileSize, position: 'absolute' }}>
                <Tile property={property} isNewlyBought={game.educatedMerchantState?.newlyBoughtPropertyId === property.id} isHighlighted={!!tileHighlight[index]} />
              </div>
            );
          })}

          {/* Player pieces */}
          {Object.entries(playersGroupedByPosition).map(([positionStr, playersOnTile]) => {
            const position = parseInt(positionStr, 10);
            const { top: baseTop, left: baseLeft } = getPositionStyles(position);
            const playerCount = playersOnTile.length;

            // layout for this tile
            const layout = getLayoutsForCount(Math.min(playerCount, 4));

            return playersOnTile.map((p, playerIndex) => {
              const pieceSize = playerCount > 1 ? tileSize * 0.34 : tileSize * 0.42;

              // pick layout in deterministic way (if more players than layout slots, wrap)
              const slot = layout[playerIndex % layout.length] ?? { x: 0.5, y: 0.5 };
              const offsetX = slot.x * tileSize - (pieceSize / 2);
              const offsetY = slot.y * tileSize - (pieceSize / 2);

              const targetCoords = getPositionStyles(playerPositions[p.id] ?? p.position ?? 0);

              return (
                <motion.div
                  key={p.id}
                  layoutId={`player-piece-${p.id}`}
                  className={cn('absolute z-10', p.id === game.educatedMerchantState?.turnOrder?.[game.educatedMerchantState.currentTurnIndex] && 'animate-pulse-glow')}
                  initial={{
                    x: getPositionStyles(p.position).left,
                    y: getPositionStyles(p.position).top,
                  }}
                  animate={{
                    x: targetCoords.left + offsetX,
                    y: targetCoords.top + offsetY,
                    opacity: p.status === 'bankrupt' ? 0.4 : 1,
                  }}
                  transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                  style={{ width: pieceSize, height: pieceSize }}
                  whileHover={{ scale: 1.05, zIndex: 50 }}
                >
                  <div className="relative w-full h-full">
                    <PlayerAvatar avatarId={p.avatarId} className="w-full h-full rounded-full border-2 border-white shadow-lg" />
                    {p.status === 'bankrupt' && (
                      <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center text-white font-bold text-xs">
                        X
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}
