
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
import { Banknote, Building, HelpCircle, LandPlot, Trophy } from 'lucide-react';
import { useMemo } from 'react';

interface GameBoardProps {
  game: Game;
  self: Player;
}

const BOARD_SIZE = 28;
const CORNER_INDICES = [0, 7, 14, 21];

const getPositionStyles = (index: number, gridSize: number): React.CSSProperties => {
  const sideLength = gridSize - 1;
  
  const TILE_WIDTH = 112; 
  const TILE_HEIGHT = 112; 
  const GAP_SIZE = 4;
  
  const totalBoardWidth = gridSize * TILE_WIDTH + (gridSize - 1) * GAP_SIZE;
  const totalBoardHeight = gridSize * TILE_HEIGHT + (gridSize - 1) * GAP_SIZE;
  
  let top = '0px', left = '0px';

  if (index >= 0 && index < sideLength) { // Top row
    top = '0px';
    left = `${index * (TILE_WIDTH + GAP_SIZE)}px`;
  } else if (index >= sideLength && index < sideLength * 2) { // Right col
    top = `${(index - sideLength) * (TILE_HEIGHT + GAP_SIZE)}px`;
    left = `${(sideLength) * (TILE_WIDTH + GAP_SIZE)}px`;
  } else if (index >= sideLength * 2 && index < sideLength * 3) { // Bottom row
    top = `${(sideLength) * (TILE_HEIGHT + GAP_SIZE)}px`;
    left = `${(sideLength - (index - sideLength * 2)) * (TILE_WIDTH + GAP_SIZE)}px`;
  } else { // Left col
    top = `${(sideLength - (index - sideLength * 3)) * (TILE_HEIGHT + GAP_SIZE)}px`;
    left = '0px';
  }
  return { top, left, position: 'absolute' };
};


const Tile = ({ property, playersOnTile }: { property: Property, playersOnTile: Player[] }) => {
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
    } else if (property.ownerId && property.color) {
        borderColor = property.color;
    }
    
    const tileStyle = property.ownerId && property.color ? { backgroundColor: property.color } : {};
    const isNewlyBought = false; // This logic needs to be passed down if needed

    return (
        <div className={cn("w-28 h-28 rounded-lg border-2 flex flex-col items-center justify-center p-2 text-center text-white shadow-lg transition-all duration-500", baseBgColor, borderColor, isNewlyBought && 'animate-pulse-glow')} style={tileStyle}>
            <Icon className="w-6 h-6 mb-1"/>
            <p className="text-xs font-bold leading-tight line-clamp-2">{property.name}</p>
            {property.type === 'property' && <p className="text-xs font-mono mt-1">{property.price} دينار</p>}
            {property.type === 'fine' && <p className="text-xs font-mono mt-1">{property.fineAmount} دينار</p>}
        </div>
    );
};

export function GameBoard({ game, self }: GameBoardProps) {
    const board = game.educatedMerchantState?.board;
    const memoizedBoard = useMemo(() => board, [board]);
    
    if (!memoizedBoard || memoizedBoard.length === 0) {
        return <div>جاري تحميل لوحة اللعب...</div>;
    }
    
    const gridSize = 8;
    const turnOrder = game.educatedMerchantState?.turnOrder || [];
    const currentTurnPlayerId = turnOrder[game.educatedMerchantState?.currentTurnIndex || 0];

    const renderCenterContent = () => {
        switch(game.gameState) {
            case 'rolling':
                return <DiceRoll game={game} self={self} />;
            case 'movement':
                 return <DiceRoll game={game} self={self} />;
            case 'property_action':
                const player = game.players.find(p => p.id === currentTurnPlayerId);
                if (player) {
                     const property = memoizedBoard[player.position];
                     return <PropertyCard game={game} self={self} property={property} />;
                }
                return null;
            default:
                 return (
                    <div className="text-center text-white">
                        <HelpCircle className="w-16 h-16 mx-auto mb-4 text-primary" />
                        <h2 className="text-2xl font-bold">
                            {game.gameState === 'turn_end' ? 'انتهى الدور' : 'منطقة التحكم'}
                        </h2>
                         <p className="text-muted-foreground mt-2">
                           {game.gameState === 'turn_end' ? `في انتظار اللاعب التالي...` : `حالة اللعبة: ${game.gameState}`}
                        </p>
                    </div>
                );
        }
    }

    return (
        <div className="w-screen h-screen bg-gray-800 p-4 flex flex-col md:flex-row gap-4 overflow-hidden">
            <QuestionModal game={game} self={self} />

            <div className="w-full md:w-1/4 space-y-4 shrink-0">
                <PlayerHUD players={game.players} turnOrder={turnOrder} currentTurnIndex={game.educatedMerchantState?.currentTurnIndex || 0} />
                <ActivityLog log={game.educatedMerchantState?.activityLog || []} />
            </div>

            <div className="flex-grow flex items-center justify-center">
                 <div className="relative w-[950px] h-[950px]">
                    <div className="absolute inset-28 bg-gray-900/50 rounded-2xl flex items-center justify-center p-8 shadow-inner">
                        {renderCenterContent()}
                    </div>
                    {memoizedBoard.map((property, index) => {
                         const playersOnTile = game.players.filter(p => p.position === index && p.status !== 'bankrupt');
                         return (
                            <div key={index} style={getPositionStyles(index, gridSize)} className="w-28 h-28">
                                <Tile property={property} playersOnTile={[]} />
                                <AnimatePresence>
                                    {playersOnTile.length > 0 && (
                                        <div className="absolute inset-0 flex items-center justify-center -space-x-2 pointer-events-none">
                                            {playersOnTile.map((p, i) => (
                                                <motion.div
                                                    key={p.id}
                                                    layoutId={`player-piece-${p.id}`}
                                                    className="z-10"
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    exit={{ scale: 0 }}
                                                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                                >
                                                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full border-2 border-white shadow-lg" />
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}
                                </AnimatePresence>
                            </div>
                         )
                    })}
                </div>
            </div>
        </div>
    );
}
