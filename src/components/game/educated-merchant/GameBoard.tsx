

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game, Player, Property } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { PropertyCard } from './PropertyCard';
import { QuestionModal } from './QuestionModal';
import { DiceRoll } from './DiceRoll';
import { PlayerHUD } from './PlayerHUD';
import { ActivityLog } from './ActivityLog';
import { cn } from '@/lib/utils';
import { Banknote, Building, HelpCircle, Trophy } from 'lucide-react';
import { endTurn } from '@/lib/actions/educated-merchant';
import { CountdownTimer } from '@/components/game/CountdownTimer';
import { DiceResultOverlay } from './DiceResultOverlay';
import { RentPaidOverlay } from './RentPaidOverlay';

interface GameBoardProps {
  game: Game;
  self: Player;
}

const BOARD_SIZE = 28;
const GRID_SIZE = 8;

const JUMP_HEIGHT = 14; 
const STEP_BASE_DELAY_MS = 200;
const STEP_FINAL_EXTRA_DELAY_MS = 170; 
const TRAIL_LIFETIME_MS = 420;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function GameBoard({ game, self }: GameBoardProps) {
  const board = game.educatedMerchantState?.board || [];
  const shouldReduceMotion = useReducedMotion();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tileSize, setTileSize] = useState(96);
  const [gapSize, setGapSize] = useState(6);
  const [playerPositions, setPlayerPositions] = useState<Record<string, number>>({});
  const [animatingPlayers, setAnimatingPlayers] = useState<Record<string, boolean>>({});
  const [isJumping, setIsJumping] = useState<Record<string, boolean>>({});
  const [tileHighlight, setTileHighlight] = useState<Record<number, boolean>>({});
  const lastRollNonceRef = useRef<number | null>(null);

  useEffect(() => {
    const initialPositions: Record<string, number> = {};
    (game.players || []).forEach((p) => (initialPositions[p.id] = p.position || 0));
    setPlayerPositions(initialPositions);
  }, [game.players]);

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
    window.addEventListener('resize', calculateSize);
    return () => window.removeEventListener('resize', calculateSize);
  }, []);

  const getPositionStyles = useCallback(
    (index: number): React.CSSProperties => {
      const sideLength = GRID_SIZE - 1;
      let top = 0,
        left = 0;
      const step = tileSize + gapSize;

      if (index >= 0 && index < sideLength) {
        top = 0;
        left = index * step;
      } else if (index >= sideLength && index < sideLength * 2) {
        top = (index - sideLength) * step;
        left = sideLength * step;
      } else if (index >= sideLength * 2 && index < sideLength * 3) {
        top = sideLength * step;
        left = (sideLength - (index - sideLength * 2)) * step;
      } else {
        top = (sideLength - (index - sideLength * 3)) * step;
        left = 0;
      }

      return { top: `${top}px`, left: `${left}px`, position: 'absolute' };
    },
    [tileSize, gapSize]
  );
  
  const movePlayerPiece = useCallback(
    async (playerId: string, steps: number, startPos: number) => {
      if (steps === 0) return;

      setAnimatingPlayers((s) => ({ ...s, [playerId]: true }));

      let currentPos = startPos;
      for (let i = 0; i < steps; i++) {
        const isLast = i === steps - 1;
        setIsJumping((s) => ({ ...s, [playerId]: true }));

        currentPos = (currentPos + 1) % BOARD_SIZE;
        setPlayerPositions((prev) => ({ ...prev, [playerId]: currentPos }));

        setTileHighlight((t) => ({ ...t, [currentPos]: true }));
        setTimeout(() => setTileHighlight((t) => ({ ...t, [currentPos]: false })), TRAIL_LIFETIME_MS);
        
        if (!shouldReduceMotion) {
          const delay = STEP_BASE_DELAY_MS + (isLast ? STEP_FINAL_EXTRA_DELAY_MS : 0);
          await sleep(delay);
        }

        setIsJumping((s) => ({ ...s, [playerId]: false }));
        if (!shouldReduceMotion) await sleep(50);
      }
      
      setAnimatingPlayers((s) => {
        const copy = { ...s };
        delete copy[playerId];
        return copy;
      });
    },
    [shouldReduceMotion]
  );

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
    const startPos = (serverPos - steps + BOARD_SIZE) % BOARD_SIZE;

    movePlayerPiece(movingPlayerId, steps, startPos);
  }, [game.educatedMerchantState?.rollAnimationNonce, game, movePlayerPiece]);


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
        const playerOnQuestion = game.players.find(p => p.id === game.educatedMerchantState?.pendingPurchase?.playerId || p.id === game.educatedMerchantState?.pendingFine?.playerId);
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

  const playersGroupedByPosition = useMemo(() => {
    const map: Record<number, Player[]> = {};
    game.players.forEach((player) => {
      if (player.status === 'bankrupt') return;
      const pos = playerPositions[player.id] ?? player.position ?? 0;
      if (!map[pos]) map[pos] = [];
      map[pos].push(player);
    });
    return map;
  }, [game.players, playerPositions]);

  const round = game.round ?? 1;
  const maxRounds = game.educatedMerchantState?.settings?.maxRounds ?? 20;
  const currentMoves = game.educatedMerchantState?.movesThisRound ?? 0;
  const aliveCount = game.players.filter((p) => p.status === 'alive').length;

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

  return (
    <div className="w-screen h-screen bg-gray-800 p-2 md:p-4 flex flex-col md:flex-row gap-4 overflow-hidden">
      <QuestionModal game={game} self={self} />
      <DiceResultOverlay rollResult={game.educatedMerchantState?.displayingRollResult ?? null} />
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
          {board.map((property, index) => (
            <div key={index} style={{ ...getPositionStyles(index), width: tileSize, height: tileSize }}>
              <Tile property={property} isNewlyBought={game.educatedMerchantState?.newlyBoughtPropertyId === property.id} isHighlighted={!!tileHighlight[index]} />
            </div>
          ))}
          {Object.entries(playersGroupedByPosition).map(([positionStr, playersOnTile]) => {
            const position = parseInt(positionStr, 10);
            const baseStyle = getPositionStyles(position);
            const playerCount = playersOnTile.length;

            return playersOnTile.map((p, playerIndex) => {
              const pieceSize = playerCount > 1 ? tileSize * 0.34 : tileSize * 0.42;
              let offsetX = (tileSize - pieceSize) / 2;
              let offsetY = (tileSize - pieceSize) / 2;

              if (playerCount === 2) offsetX = playerIndex === 0 ? tileSize * 0.12 : tileSize * 0.88 - pieceSize;
              if (playerCount === 3) {
                if (playerIndex === 0) { offsetX = (tileSize - pieceSize) / 2; offsetY = tileSize * 0.12; }
                if (playerIndex === 1) { offsetX = tileSize * 0.12; offsetY = tileSize * 0.88 - pieceSize; }
                if (playerIndex === 2) { offsetX = tileSize * 0.88 - pieceSize; offsetY = tileSize * 0.88 - pieceSize; }
              }
              if (playerCount >= 4) {
                const layout = [ [0.12,0.12], [0.88-pc(pieceSize,tileSize),0.12], [0.12,0.88-pc(pieceSize,tileSize)], [0.88-pc(pieceSize,tileSize),0.88-pc(pieceSize,tileSize)] ];
                const coords = layout[Math.min(playerIndex,3)];
                offsetX = coords[0]*tileSize;
                offsetY = coords[1]*tileSize;
              }

              const numericTop = parseFloat(String(baseStyle.top).replace('px','')) || 0;
              const numericLeft = parseFloat(String(baseStyle.left).replace('px','')) || 0;

              const finalStyle = {
                top: `${numericTop + offsetY}px`,
                left: `${numericLeft + offsetX}px`,
                width: pieceSize,
                height: pieceSize,
                position: 'absolute',
              };

              return (
                <motion.div
                  key={p.id}
                  layoutId={`player-piece-${p.id}`}
                  className={cn('absolute z-10', p.id === game.educatedMerchantState?.turnOrder?.[game.educatedMerchantState.currentTurnIndex] && 'animate-pulse-glow')}
                  initial={false}
                  animate={{ ...finalStyle, y: isJumping[p.id] ? -JUMP_HEIGHT : 0, opacity: p.status === 'bankrupt' ? 0.36 : 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                  whileHover={{ scale: 1.05, zIndex: 50 }}
                >
                  <div className="relative w-full h-full">
                    <PlayerAvatar avatarId={p.avatarId} className="w-full h-full rounded-full border-2 border-white shadow-lg" />
                    {p.status === 'bankrupt' && (
                      <div className="absolute -right-1 -top-1 bg-red-600 text-white text-[10px] px-1 rounded">
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


function pc(size: number, tile: number) {
  return size / tile;
}
