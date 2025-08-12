'use client';

import type { Game, Player, Property } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import { PropertyCard } from './PropertyCard';
import { QuestionModal } from './QuestionModal';
import { DiceRoll } from './DiceRoll';
import { PlayerHUD } from './PlayerHUD';
import { ActivityLog } from './ActivityLog';
import { cn } from '@/lib/utils';
import { Banknote, Building, HelpCircle, LandPlot, Trophy, RotateCcw } from 'lucide-react';
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { handlePropertyLanding, endTurn } from '@/lib/actions/educated-merchant';
import { Button } from '@/components/ui/button';
import { CountdownTimer } from '@/components/game/CountdownTimer';

interface GameBoardProps {
  game: Game;
  self: Player;
}

const BOARD_SIZE = 28; 
const GRID_SIZE = 8;

const Tile = ({ property, isNewlyBought }: { property: Property, isNewlyBought: boolean }) => {
    let Icon = Building;
    let baseBgColor = 'bg-slate-700';
    let borderColor = 'border-slate-500';

    if (property.type === 'start') {
        Icon = Trophy;
        baseBgColor = 'bg-yellow-500';
        borderColor = 'border-yellow-300';
    } else if (property.type === 'fine') {
        Icon = Banknote;
        baseBgColor = 'bg-red-700';
        borderColor = 'border-red-500';
    }

    const tileStyle: React.CSSProperties = {
        transition: 'background-color 0.5s ease, box-shadow 0.5s ease',
    };
    if (property.ownerId && property.color) {
        tileStyle.backgroundColor = property.color;
    }
    
    return (
        <motion.div 
            className={cn("w-full h-full rounded-lg border-2 flex flex-col items-center justify-center p-1 text-center text-white shadow-lg transition-all duration-500", baseBgColor, borderColor, isNewlyBought && 'animate-pulse-glow')} 
            style={tileStyle}
        >
            <Icon className="w-5 h-5 mb-1 flex-shrink-0"/>
            <p className="text-[10px] font-bold leading-tight line-clamp-2">{property.name}</p>
            {property.type === 'property' && <p className="text-[10px] font-mono mt-1">{property.price} دينار</p>}
            {property.type === 'fine' && <p className="text-[10px] font-mono mt-1">{property.fineAmount} دينار</p>}
        </motion.div>
    );
};

export function GameBoard({ game, self }: GameBoardProps) {
    const board = game.educatedMerchantState?.board;
    const memoizedBoard = useMemo(() => board, [board]);
    const [tileSize, setTileSize] = useState(100);
    const [gapSize, setGapSize] = useState(4);
    const containerRef = useRef<HTMLDivElement>(null);

    const [playerPositions, setPlayerPositions] = useState<Record<string, number>>({});
    const [isJumping, setIsJumping] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const initialPositions: Record<string, number> = {};
        game.players.forEach(p => {
            initialPositions[p.id] = p.position;
        });
        setPlayerPositions(initialPositions);
    }, []); // Only on initial mount

    const getPositionStyles = useCallback((index: number): React.CSSProperties => {
      const sideLength = GRID_SIZE - 1;
      let top = 0, left = 0;
      const step = tileSize + gapSize;

      if (index >= 0 && index < sideLength) { // Top row
        top = 0;
        left = index * step;
      } else if (index >= sideLength && index < sideLength * 2) { // Right col
        top = (index - sideLength) * step;
        left = sideLength * step;
      } else if (index >= sideLength * 2 && index < sideLength * 3) { // Bottom row
        top = sideLength * step;
        left = (sideLength - (index - sideLength * 2)) * step;
      } else { // Left col
        top = (sideLength - (index - sideLength * 3)) * step;
        left = 0;
      }
      return { top: `${top}px`, left: `${left}px`, position: 'absolute' };
    }, [tileSize, gapSize]);


    useEffect(() => {
        const calculateSize = () => {
            if (containerRef.current) {
                const containerWidth = containerRef.current.offsetWidth;
                const containerHeight = containerRef.current.offsetHeight;
                const minDim = Math.min(containerWidth, containerHeight);
                const newTileSize = Math.floor(minDim / (GRID_SIZE + 1));
                setTileSize(newTileSize);
                setGapSize(Math.max(2, Math.floor(newTileSize * 0.04)));
            }
        };

        calculateSize();
        window.addEventListener('resize', calculateSize);
        return () => window.removeEventListener('resize', calculateSize);
    }, []);

    const movePlayerPiece = useCallback(async (playerId: string, steps: number, oldPos: number) => {
        let currentPos = oldPos;
        for (let i = 0; i < steps; i++) {
            setIsJumping(prev => ({ ...prev, [playerId]: true }));
            currentPos = (currentPos + 1) % BOARD_SIZE;
            setPlayerPositions(prev => ({ ...prev, [playerId]: currentPos }));
            await new Promise(res => setTimeout(res, 250)); // Wait for jump animation
            setIsJumping(prev => ({ ...prev, [playerId]: false }));
            await new Promise(res => setTimeout(res, 50)); // Small delay between jumps
        }
        // After movement animation finishes, call the server action
        if (self.id === playerId) {
            handlePropertyLanding(game.id, playerId);
        }
    }, [game.id, self.id]);

    useEffect(() => {
        if (game.gameState === 'movement') {
            const movingPlayer = game.players.find(p => p.id === game.educatedMerchantState?.turnOrder[game.educatedMerchantState.currentTurnIndex]);
            if (movingPlayer) {
                const lastRoll = game.educatedMerchantState.lastDiceRoll || 0;
                const oldPosition = (movingPlayer.position - lastRoll + BOARD_SIZE) % BOARD_SIZE;
                movePlayerPiece(movingPlayer.id, lastRoll, oldPosition);
            }
        }
    }, [game.gameState, game.educatedMerchantState?.lastDiceRoll, movePlayerPiece]);
    
    if (!memoizedBoard || memoizedBoard.length === 0) {
        return <div>جاري تحميل لوحة اللعب...</div>;
    }
    
    const turnOrder = game.educatedMerchantState?.turnOrder || [];
    const currentTurnIndex = game.educatedMerchantState?.currentTurnIndex || 0;
    const currentPlayerId = turnOrder[currentTurnIndex];
    const isMyTurn = self.id === currentPlayerId;
    const isHost = game.hostId === self.id;
    
    const boardWidth = GRID_SIZE * tileSize + (GRID_SIZE - 1) * gapSize;
    const boardHeight = boardWidth;


    const renderCenterContent = () => {
        switch(game.gameState) {
            case 'rolling':
            case 'movement':
                return <DiceRoll game={game} self={self} />;
            case 'property_action':
                const player = game.players.find(p => p.id === currentPlayerId);
                if (player) {
                     const property = memoizedBoard[player.position];
                     if (property) {
                        return <PropertyCard game={game} self={self} property={property} />;
                     }
                }
                return null;
            case 'turn_end':
                 const turnEndingPlayer = game.players.find(p => p.id === currentPlayerId);
                 const nextPlayerIndex = (currentTurnIndex + 1) % turnOrder.length;
                 const nextPlayer = game.players.find(p => p.id === turnOrder[nextPlayerIndex]);
                return (
                    <div className="text-center text-white space-y-4 p-4 bg-slate-800 rounded-lg">
                        <h2 className="text-2xl font-bold">انتهى دور {turnEndingPlayer?.name}</h2>
                        <p className="text-muted-foreground mt-2 animate-pulse">الدور على: {nextPlayer?.name}</p>
                        {isMyTurn && (
                            <Button onClick={() => endTurn(game.id, self.id)}>
                                إنهاء الدور
                            </Button>
                        )}
                    </div>
                )
            default:
                 return (
                    <div className="text-center text-white">
                        <HelpCircle className="w-16 h-16 mx-auto mb-4 text-primary" />
                        <h2 className="text-2xl font-bold">
                            منطقة التحكم
                        </h2>
                         <p className="text-muted-foreground mt-2">
                           حالة اللعبة: {game.gameState}
                        </p>
                    </div>
                );
        }
    }

    const playersGroupedByPosition = useMemo(() => {
        return game.players
            .filter(p => p.status !== 'bankrupt')
            .reduce((acc, player) => {
                const pos = playerPositions[player.id] ?? player.position;
                if (!acc[pos]) {
                    acc[pos] = [];
                }
                acc[pos].push(player);
                return acc;
            }, {} as Record<number, Player[]>);
    }, [game.players, playerPositions]);


    return (
        <div className="w-screen h-screen bg-gray-800 p-2 md:p-4 flex flex-col md:flex-row gap-4 overflow-hidden">
            {game.educatedMerchantState?.timerEndsAt && game.gameState !== 'question' && (
                 <div className="absolute top-4 left-4 z-20">
                    <CountdownTimer
                        gameId={game.id}
                        gameType='educated-merchant'
                        expiryTimestamp={game.educatedMerchantState.timerEndsAt.toMillis()}
                        selfId={self.id}
                        isHost={game.hostId === self.id}
                     />
                 </div>
            )}
           
            <QuestionModal game={game} self={self} />

            <div className="w-full md:w-1/4 xl:w-1/5 space-y-4 shrink-0 flex flex-col">
                <PlayerHUD players={game.players} turnOrder={turnOrder} currentTurnIndex={game.educatedMerchantState?.currentTurnIndex || 0} />
                <ActivityLog log={game.educatedMerchantState?.activityLog || []} />
            </div>

            <div ref={containerRef} className="flex-grow flex items-center justify-center relative min-h-0 min-w-0">
                 <div className="relative" style={{ width: boardWidth, height: boardHeight }}>
                    <div 
                        className="absolute bg-gray-900/50 rounded-2xl flex items-center justify-center p-2 md:p-8 shadow-inner"
                        style={{
                            top: tileSize + gapSize,
                            left: tileSize + gapSize,
                            right: tileSize + gapSize,
                            bottom: tileSize + gapSize,
                        }}
                    >
                         <AnimatePresence mode="wait">
                            <motion.div
                                key={game.gameState}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.3 }}
                            >
                                {renderCenterContent()}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                    {memoizedBoard.map((property, index) => (
                        <div key={index} style={{...getPositionStyles(index), width: tileSize, height: tileSize}}>
                            <Tile property={property} isNewlyBought={game.educatedMerchantState?.newlyBoughtPropertyId === property.id}/>
                        </div>
                    ))}
                     {Object.entries(playersGroupedByPosition).map(([positionStr, playersOnTile]) => {
                        const position = parseInt(positionStr, 10);
                        const baseStyle = getPositionStyles(position);
                        const playerCount = playersOnTile.length;

                        return playersOnTile.map((p, playerIndex) => {
                            const pieceSize = playerCount > 1 ? tileSize * 0.35 : tileSize * 0.4;
                            let offsetX = (tileSize - pieceSize) / 2;
                            let offsetY = (tileSize - pieceSize) / 2;

                            if (playerCount === 2) {
                                offsetX = playerIndex === 0 ? (tileSize * 0.1) : (tileSize * 0.9 - pieceSize);
                            } else if (playerCount === 3) {
                                if (playerIndex === 0) { offsetX = (tileSize - pieceSize) / 2; offsetY = (tileSize * 0.1); }
                                if (playerIndex === 1) { offsetX = (tileSize * 0.1); offsetY = (tileSize * 0.9 - pieceSize); }
                                if (playerIndex === 2) { offsetX = (tileSize * 0.9 - pieceSize); offsetY = (tileSize * 0.9 - pieceSize); }
                            } else if (playerCount >= 4) {
                                if (playerIndex === 0) { offsetX = (tileSize * 0.1); offsetY = (tileSize * 0.1); }
                                if (playerIndex === 1) { offsetX = (tileSize * 0.9 - pieceSize); offsetY = (tileSize * 0.1); }
                                if (playerIndex === 2) { offsetX = (tileSize * 0.1); offsetY = (tileSize * 0.9 - pieceSize); }
                                if (playerIndex === 3) { offsetX = (tileSize * 0.9 - pieceSize); offsetY = (tileSize * 0.9 - pieceSize); }
                            }

                            const finalStyle = {
                                ...baseStyle,
                                top: `${(baseStyle.top as number) + offsetY}px`,
                                left: `${(baseStyle.left as number) + offsetX}px`,
                                width: pieceSize,
                                height: pieceSize,
                            };
                            
                            return (
                                <motion.div
                                    key={p.id}
                                    layoutId={`player-piece-${p.id}`}
                                    className={cn("absolute z-10", p.id === currentPlayerId && 'animate-pulse-glow', isJumping[p.id] && 'player-jumping')}
                                    initial={false}
                                    animate={finalStyle}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    whileHover={{ scale: 1.2, zIndex: 20 }}
                                >
                                    <PlayerAvatar avatarId={p.avatarId} className="w-full h-full rounded-full border-2 border-white shadow-lg" />
                                </motion.div>
                            );
                        });
                    })}
                </div>
            </div>
        </div>
    );
}
