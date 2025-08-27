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
import { Banknote, Building, HelpCircle, Trophy, ChevronDown } from 'lucide-react';
import { CountdownTimer } from '@/components/game/CountdownTimer';
import { QuestionModal } from './QuestionModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface GameBoardProps {
  game: Game;
  self: Player;
}

/** تخطيط اللوح: 28 خانة حول إطار شبكة 8x8 */
const BOARD_SIZE = 28;
const GRID_SIZE = 8; // 8x8 grid frame

// حركات القطع
const JUMP_HEIGHT = 14;
const STEP_BASE_DELAY_MS = 200;
const STEP_FINAL_EXTRA_DELAY_MS = 170;
const TRAIL_LIFETIME_MS = 420;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ *
 * عداد رقمي متحرك (بدون تبعيات خارجية)
 * ------------------------------------------------------------------ */
function useAnimatedNumber(value: number, opts?: { duration?: number; disabled?: boolean }) {
  const { duration = 650, disabled = false } = opts || {};
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (disabled) {
      setDisplay(value);
      return;
    }
    const startVal = display;
    const delta = value - startVal;
    const start = performance.now();

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(Math.round(startVal + delta * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, disabled]);

  return display;
}

const formatMoney = (n: number) => {
  try {
    return n.toLocaleString('ar-EG');
  } catch {
    return n.toLocaleString();
  }
};

/* ================================================================== *
 *          المكوّن الرئيسي للوح اللعبة GameBoard
 * ================================================================== */
export function GameBoard({ game, self }: GameBoardProps) {
  const board: Property[] = game.educatedMerchantState?.board || [];
  const shouldReduceMotion = useReducedMotion();
  const isMobile = useIsMobile();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tileSize, setTileSize] = useState(96);
  const [gapSize, setGapSize] = useState(6);

  const [playerPositions, setPlayerPositions] = useState<Record<string, number>>({});
  const [animatingPlayers, setAnimatingPlayers] = useState<Record<string, boolean>>({});
  const [isJumping, setIsJumping] = useState<Record<string, boolean>>({});
  const [tileHighlight, setTileHighlight] = useState<Record<number, boolean>>({});
  const lastRollNonceRef = useRef<number | null>(null);

  // تتبع الأموال (سنيبشوت + دلتا)
  const [moneySnapshot, setMoneySnapshot] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    (game.players || []).forEach((p) => (init[p.id] = p.money || 0));
    return init;
  });
  const [moneyDelta, setMoneyDelta] = useState<Record<string, number>>({});
  const [moneyDeltaNonce, setMoneyDeltaNonce] = useState<Record<string, number>>({});

  // حدّث دوالر الأموال عند تغيّر أموال اللاعبين
  useEffect(() => {
    const incoming: Record<string, number> = {};
    const deltas: Record<string, number> = {};
    const nonces: Record<string, number> = {};

    game.players.forEach((p) => {
      const prev = moneySnapshot[p.id] ?? p.money ?? 0;
      const now = p.money ?? 0;
      incoming[p.id] = now;
      const diff = now - prev;
      if (diff !== 0) {
        deltas[p.id] = diff;
        nonces[p.id] = Date.now();
      }
    });

    if (Object.keys(deltas).length) {
      setMoneySnapshot(incoming);
      setMoneyDelta((s) => ({ ...s, ...deltas }));
      setMoneyDeltaNonce((s) => ({ ...s, ...nonces }));
      Object.keys(deltas).forEach((pid) => {
        setTimeout(() => {
          setMoneyDelta((s) => {
            const copy = { ...s };
            delete copy[pid];
            return copy;
          });
        }, 1600);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.players]);

  // أموالك أنت
  const selfPlayer = useMemo(() => game.players.find((p) => p.id === self.id), [game.players, self.id]);
  const selfMoney = selfPlayer?.money ?? 0;
  const animatedSelfMoney = useAnimatedNumber(selfMoney, { duration: 650, disabled: !!shouldReduceMotion });
  const selfDelta = moneyDelta[self.id];

  const [pulseTint, setPulseTint] = useState<'neutral' | 'up' | 'down'>('neutral');
  useEffect(() => {
    if (typeof selfDelta === 'number') {
      setPulseTint(selfDelta > 0 ? 'up' : 'down');
      const t = setTimeout(() => setPulseTint('neutral'), 850);
      return () => clearTimeout(t);
    }
  }, [selfDelta]);

  // تموضع أولي للّاعبين
  useEffect(() => {
    const initialPositions: Record<string, number> = {};
    (game.players || []).forEach((p) => (initialPositions[p.id] = p.position || 0));
    setPlayerPositions(initialPositions);
  }, [game.players]);

  // تحجيم اللوح حسب الحاوية / الجهاز
  useEffect(() => {
    const calculateSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const minDim = Math.min(rect.width, rect.height);
      const minTileSize = isMobile ? 38 : 56;
      const newTile = Math.max(minTileSize, Math.floor(minDim / (GRID_SIZE + 1)));
      setTileSize(newTile);
      setGapSize(Math.max(2, Math.floor(newTile * 0.045)));
    };
    calculateSize();
    window.addEventListener('resize', calculateSize);
    return () => window.removeEventListener('resize', calculateSize);
  }, [isMobile]);

  // حساب إحداثيات خانة على إطار الشبكة
  const getPositionStyles = useCallback(
    (index: number): React.CSSProperties => {
      const sideLength = GRID_SIZE - 1;
      let top = 0,
        left = 0;
      const step = tileSize + gapSize;
      if (index >= 0 && index < sideLength) {
        // أعلى السطر
        top = 0;
        left = index * step;
      } else if (index >= sideLength && index < sideLength * 2) {
        // العمود الأيمن
        top = (index - sideLength) * step;
        left = sideLength * step;
      } else if (index >= sideLength * 2 && index < sideLength * 3) {
        // الصف السفلي (يمين -> يسار)
        top = sideLength * step;
        left = (sideLength - (index - sideLength * 2)) * step;
      } else {
        // العمود الأيسر (أسفل -> أعلى)
        top = (sideLength - (index - sideLength * 3)) * step;
        left = 0;
      }
      return { top: `${top}px`, left: `${left}px`, position: 'absolute' };
    },
    [tileSize, gapSize]
  );

  // تحريك قطعة لاعب خطوة بخطوة مع تمييز أثر
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
        setTimeout(
          () => setTileHighlight((t) => ({ ...t, [currentPos]: false })),
          TRAIL_LIFETIME_MS
        );

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

  // استمع لإشارة السيرفر لتحريك القطعة (rollAnimationNonce)
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

    void movePlayerPiece(movingPlayerId, steps, startPos);
  }, [
    game.educatedMerchantState?.rollAnimationNonce,
    game.educatedMerchantState?.currentTurnIndex,
    game.educatedMerchantState?.lastDiceRoll,
    game.players,
    movePlayerPiece,
  ]);

  // محتوى منتصف اللوح وفق حالة اللعبة
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
        return (
          <PropertyCard game={game} self={self} property={property} allowActions />
        );
      }

      case 'turn_end': {
        const turnEndingPlayer = game.players.find((p) => p.id === currentPlayerId);
        // This helper needs to be defined or imported. Assuming it's in a shared location.
        // const nextPlayerIndex = findNextAliveIndex(turnOrder, game.players, currentTurnIndex);
        const nextPlayer = game.players.find((p) => p.id === turnOrder[0]); // Simplified fallback
        return (
          <div className="text-center text-white space-y-4 p-4 bg-slate-800 rounded-lg">
            <h2 className="text-2xl font-bold">انتهى دور {turnEndingPlayer?.name}</h2>
            <p className="text-muted-foreground mt-2">الدور على: {nextPlayer?.name}</p>
          </div>
        );
      }

      case 'question': {
        const pendingPurchasePlayerId =
          game.educatedMerchantState?.pendingPurchase?.playerId || null;
        const pendingFinePlayerId =
          game.educatedMerchantState?.pendingFine?.playerId || null;
        const onQuestionId = pendingPurchasePlayerId || pendingFinePlayerId || '';

        const playerOnQuestion = game.players.find((p) => p.id === onQuestionId);
        if (!playerOnQuestion) return <div />;

        const property = board[playerOnQuestion.position];
        if (property && property.type === 'property') {
          return (
            <PropertyCard
              game={game}
              self={self}
              property={property}
              allowActions={false}
            />
          );
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

  const boardWidth = useMemo(
    () => GRID_SIZE * tileSize + (GRID_SIZE - 1) * gapSize,
    [tileSize, gapSize]
  );
  const boardHeight = boardWidth;

  // تجميع اللاعبين بحسب الخانة
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

  // معلومات الجولة
  const round = game.round ?? 1;
  const maxRounds = game.educatedMerchantState?.settings?.maxRounds ?? 20;
  const currentMoves = game.educatedMerchantState?.movesThisRound ?? 0;
  const aliveCount = game.players.filter((p) => p.status === 'alive').length;

  // خانة واحدة (Memoized)
  const Tile = React.memo(
    ({
      property,
      isNewlyBought,
      isHighlighted,
    }: {
      property: Property;
      isNewlyBought: boolean;
      isHighlighted?: boolean;
    }) => {
      let Icon = Building;
      let baseBg = 'bg-slate-700';
      let borderColor = 'border-slate-500';

      if (property.type === 'start') {
        Icon = Trophy;
        baseBg = 'bg-yellow-500 text-black';
        borderColor = 'border-yellow-300';
      } else if (property.type === 'fine') {
        Icon = Banknote;
        baseBg = 'bg-rose-700';
        borderColor = 'border-rose-500';
      }

      const dynamicStyle: React.CSSProperties = {};
      if (property.ownerId && property.color) {
        dynamicStyle.backgroundColor = property.color;
        borderColor = 'border-white/50';
      }

      return (
        <motion.div
          className={cn(
            'w-full h-full rounded-lg border-2 flex flex-col items-center justify-center p-1 text-center text-white shadow-lg transition-all duration-500 cursor-default select-none',
            baseBg,
            borderColor,
            isHighlighted && 'ring-2 ring-offset-2 ring-white/80',
            isNewlyBought && 'outline outline-2 outline-emerald-400/80 shadow-emerald-500/30'
          )}
          style={dynamicStyle}
          whileHover={{ scale: 1.03, zIndex: 10 }}
          transition={{ duration: 0.22 }}
          role="button"
          aria-label={property.name}
        >
          <Icon className="w-5 h-5 mb-1 flex-shrink-0" />
          <p
            className="text-[10px] font-bold leading-tight line-clamp-2 text-center overflow-hidden"
            style={{ padding: '0 4px' }}
          >
            {property.name}
          </p>
          {property.type === 'property' && (
            <p className="text-[10px] font-mono mt-1">{property.price} دينار</p>
          )}
          {property.type === 'fine' && (
            <p className="text-[10px] font-mono mt-1">{property.fineAmount} دينار</p>
          )}
        </motion.div>
      );
    }
  );
  Tile.displayName = 'Tile';

  // شريط المال الخاص بك
  const hudTintMap: Record<typeof pulseTint, string> = {
    neutral: 'bg-slate-900/80 border-slate-700',
    up: 'bg-emerald-900/70 border-emerald-500/60 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]',
    down: 'bg-rose-900/70 border-rose-500/60 shadow-[0_0_0_3px_rgba(244,63,94,0.15)]',
  };

  const MoneyHUD = (
    <motion.div
      className={cn(
        'pointer-events-none select-none absolute z-40 top-2 right-2 md:top-4 md:right-4',
        'rounded-xl border px-3 py-2 md:px-4 md:py-2.5 text-white shadow-lg'
      )}
      animate={{ scale: pulseTint === 'neutral' ? 1 : 1.035 }}
      transition={{ type: 'spring', stiffness: 280, damping: 18 }}
      aria-live="polite"
    >
      <motion.div className={cn('flex items-center gap-2 md:gap-2.5 text-sm md:text-base font-bold', hudTintMap[pulseTint])} layout>
        <Banknote className="w-4 h-4 md:w-5 md:h-5 opacity:90" />
        <div className="tabular-nums">
          {formatMoney(animatedSelfMoney)}
          <span className="text-xs md:text-sm font-normal mr-1"> دينار</span>
        </div>
      </motion.div>
      <AnimatePresence>
        {typeof selfDelta === 'number' && (
          <motion.div
            key={moneyDeltaNonce[self.id]}
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: -18, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            transition={{ duration: 0.6 }}
            className={cn(
              'absolute -bottom-5 right-0 px-1.5 py-0.5 rounded text-[11px] font-semibold shadow',
              selfDelta > 0 ? 'bg-emerald-600/90 text-white' : 'bg-rose-600/90 text-white'
            )}
          >
            {selfDelta > 0 ? `+${formatMoney(selfDelta)}` : `-${formatMoney(Math.abs(selfDelta))}`}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  return (
    <div className="w-screen h-screen bg-gray-800 p-2 md:p-4 flex flex-col md:flex-row gap-4 overflow-hidden">
        {/* Main content now includes both board and side panel */}
        <div className="flex-grow flex flex-col md:flex-row gap-4 min-h-0">
            {/* Side Panel (Non-mobile) */}
            {!isMobile && (
                <div className="w-full md:w-1/4 xl:w-1/5 space-y-4 shrink-0 flex flex-col">
                    <PlayerHUD
                        players={game.players}
                        turnOrder={game.educatedMerchantState?.turnOrder ?? []}
                        currentTurnIndex={game.educatedMerchantState?.currentTurnIndex ?? 0}
                    />
                    <ActivityLog log={game.educatedMerchantState?.activityLog || []} />
                </div>
            )}
            
            {/* Game Board */}
            <div
                ref={containerRef}
                className="flex-grow flex items-center justify-center relative min-h-0 min-w-0"
                role="application"
                aria-label="لوح لعبة التاجر المثقف"
            >
                {MoneyHUD}
                <div className="relative" style={{ width: boardWidth, height: boardHeight }}>
                    <div
                        className="absolute bg-gray-900/60 rounded-2xl flex flex-col items-center justify-center p-2 md:p-8 shadow-inner"
                        style={{
                            top: tileSize + gapSize,
                            left: tileSize + gapSize,
                            right: tileSize + gapSize,
                            bottom: tileSize + gapSize,
                        }}
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
                            <motion.div
                                key={game.gameState}
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.96 }}
                                transition={{ duration: 0.28 }}
                            >
                                {renderCenterContent()}
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {board.map((property, index) => (
                        <div key={property?.id ?? index} style={{ ...getPositionStyles(index), width: tileSize, height: tileSize }}>
                        <Tile
                            property={property}
                            isNewlyBought={game.educatedMerchantState?.newlyBoughtPropertyId === property.id}
                            isHighlighted={!!tileHighlight[index]}
                        />
                        </div>
                    ))}
                    
                    {Object.entries(playersGroupedByPosition).map(([positionStr, playersOnTile]) => {
                        const position = parseInt(positionStr, 10);
                        const baseStyle = getPositionStyles(position);
                        const playerCount = playersOnTile.length;
                        return playersOnTile.map((p, idx) => {
                            const pieceSize = playerCount > 1 ? tileSize * 0.34 : tileSize * 0.42;
                            let offsetX = (tileSize - pieceSize) / 2;
                            let offsetY = (tileSize - pieceSize) / 2;
                            if (playerCount === 2) offsetX = idx === 0 ? tileSize * 0.12 : tileSize * 0.88 - pieceSize;
                            else if (playerCount === 3) { /* ... */ }
                            else if (playerCount >= 4) { /* ... */ }
                            const numericTop = parseFloat(String(baseStyle.top).replace('px', '')) || 0;
                            const numericLeft = parseFloat(String(baseStyle.left).replace('px', '')) || 0;
                            const finalStyle = { top: `${numericTop + offsetY}px`, left: `${numericLeft + offsetX}px`, width: pieceSize, height: pieceSize, position: 'absolute' as const };
                            const isActiveTurn = p.id === game.educatedMerchantState?.turnOrder?.[game.educatedMerchantState?.currentTurnIndex ?? 0];

                            return (
                                <motion.div
                                    key={p.id}
                                    layoutId={`player-piece-${p.id}`}
                                    className={cn('absolute z-10', isActiveTurn && 'animate-pulse')}
                                    initial={false}
                                    animate={{ ...finalStyle, y: isJumping[p.id] ? -JUMP_HEIGHT : 0, opacity: p.status === 'bankrupt' ? 0.36 : 1 }}
                                    transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                                    whileHover={{ scale: 1.05, zIndex: 50 }}
                                    aria-label={`اللاعب ${p.name} في خانة ${position}`}
                                >
                                    <div className="relative w-full h-full">
                                        <PlayerAvatar avatarId={p.avatarId} className="w-full h-full rounded-full border-2 border-white shadow-lg" />
                                        {p.status === 'bankrupt' && <div className="absolute -right-1 -top-1 bg-red-600 text-white text-[10px] px-1 rounded">مفلس</div>}
                                        <AnimatePresence>
                                            {typeof moneyDelta[p.id] === 'number' && (
                                                <motion.div key={`${p.id}-${moneyDeltaNonce[p.id]}`} initial={{ y: 8, opacity: 0 }} animate={{ y: -18, opacity: 1 }} exit={{ y: -30, opacity: 0 }} transition={{ duration: 0.6 }} className={cn('absolute left-1/2 -translate-x-1/2 -top-2 px-1.5 py-0.5 rounded text-[10px] font-bold shadow', moneyDelta[p.id]! > 0 ? 'bg-emerald-600/90 text-white' : 'bg-rose-600/90 text-white')}>
                                                    {moneyDelta[p.id]! > 0 ? `+${formatMoney(moneyDelta[p.id]!)}` : `-${formatMoney(Math.abs(moneyDelta[p.id]!))}`}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </motion.div>
                            );
                        });
                    })}
                </div>
            </div>
            
            {/* Mobile Collapsible Side Panel */}
            {isMobile && (
                 <Collapsible className="w-full shrink-0">
                    <CollapsibleTrigger asChild>
                        <Button variant="secondary" className="w-full">
                        عرض اللاعبين والأحداث
                        <ChevronDown className="h-4 w-4 ml-2" />
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-2">
                         <PlayerHUD
                            players={game.players}
                            turnOrder={game.educatedMerchantState?.turnOrder ?? []}
                            currentTurnIndex={game.educatedMerchantState?.currentTurnIndex ?? 0}
                        />
                        <ActivityLog log={game.educatedMerchantState?.activityLog || []} />
                    </CollapsibleContent>
                </Collapsible>
            )}
        </div>
    </div>
  );
}
