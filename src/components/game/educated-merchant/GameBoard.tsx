
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

interface GameBoardProps {
  game: Game;
  self: Player;
}

const BOARD_SIZE = 28; 
const GRID_SIZE = 8; // 8x8 grid for a 28-tile board

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

    const tileStyle = property.ownerId && property.color ? { backgroundColor: property.color } : {};
    
    return (
        <div className={cn("w-full h-full rounded-lg border-2 flex flex-col items-center justify-center p-1 text-center text-white shadow-lg transition-all duration-500", baseBgColor, borderColor, isNewlyBought && 'animate-pulse-glow')} style={tileStyle}>
            <Icon className="w-5 h-5 mb-1 flex-shrink-0"/>
            <p className="text-[10px] font-bold leading-tight line-clamp-2">{property.name}</p>
            {property.type === 'property' && <p className="text-[10px] font-mono mt-1">{property.price} دينار</p>}
            {property.type === 'fine' && <p className="text-[10px] font-mono mt-1">{property.fineAmount} دينار</p>}
        </div>
    );
};

export function GameBoard({ game, self }: GameBoardProps) {
    const board = game.educatedMerchantState?.board;
    const memoizedBoard = useMemo(() => board, [board]);
    const [tileSize, setTileSize] = useState(100);
    const [gapSize, setGapSize] = useState(4);
    const containerRef = useRef<HTMLDivElement>(null);
    
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
                const newTileSize = Math.floor(minDim / (GRID_SIZE + 1)); // +1 for padding
                setTileSize(newTileSize);
                setGapSize(Math.max(2, Math.floor(newTileSize * 0.04)));
            }
        };

        calculateSize();
        window.addEventListener('resize', calculateSize);
        return () => window.removeEventListener('resize', calculateSize);
    }, []);

    
    if (!memoizedBoard || memoizedBoard.length === 0) {
        return <div>جاري تحميل لوحة اللعب...</div>;
    }
    
    const turnOrder = game.educatedMerchantState?.turnOrder || [];
    const currentTurnIndex = game.educatedMerchantState?.currentTurnIndex || 0;
    const currentPlayerId = turnOrder[currentTurnIndex];
    const isMyTurn = self.id === currentPlayerId;
    
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
                return (
                    <div className="text-center text-white space-y-4">
                        <HelpCircle className="w-16 h-16 mx-auto mb-4 text-primary" />
                        <h2 className="text-2xl font-bold">انتهى دور {game.players.find(p=>p.id === currentPlayerId)?.name}</h2>
                        <p className="text-muted-foreground mt-2">في انتظار اللاعب التالي...</p>
                        {isMyTurn && <Button onClick={() => endTurn(game.id, self.id)}><RotateCcw className="ml-2"/> إنهاء الدور</Button>}
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

    return (
        <div className="w-screen h-screen bg-gray-800 p-2 md:p-4 flex flex-col md:flex-row gap-4 overflow-hidden">
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
                        {renderCenterContent()}
                    </div>
                    {memoizedBoard.map((property, index) => (
                        <div key={index} style={{...getPositionStyles(index), width: tileSize, height: tileSize}}>
                            <Tile property={property} isNewlyBought={game.educatedMerchantState?.newlyBoughtPropertyId === property.id}/>
                        </div>
                    ))}
                    {game.players.filter(p => p.status !== 'bankrupt').map(p => {
                        const style = getPositionStyles(p.position);
                        return (
                             <motion.div
                                key={p.id}
                                layoutId={`player-piece-${p.id}`}
                                className="absolute z-10"
                                initial={false}
                                animate={style}
                                onAnimationComplete={() => {
                                    if(game.gameState === 'movement' && p.id === currentPlayerId) {
                                        handlePropertyLanding(game.id, p.id);
                                    }
                                }}
                                transition={{ type: "spring", stiffness: 200, damping: 30 }}
                                style={{width: tileSize, height: tileSize}}
                            >
                                <motion.div 
                                     className={cn("absolute bottom-1 right-1 transition-all duration-300", p.id === currentPlayerId && 'animate-pulse-glow')}
                                     style={{ width: `${tileSize * 0.4}px`, height: `${tileSize * 0.4}px` }}
                                     whileHover={{ scale: 1.2 }}
                                >
                                    <PlayerAvatar avatarId={p.avatarId} className="w-full h-full rounded-full border-2 border-white shadow-lg" />
                                </motion.div>
                            </motion.div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
}
