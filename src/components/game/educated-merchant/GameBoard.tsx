
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
const GRID_SIZE = 8; // 8x8 grid for a 28-tile board

// Adjust tile size for better fit on screen
const TILE_WIDTH = 100;
const TILE_HEIGHT = 100; 
const GAP_SIZE = 4;

const getPositionStyles = (index: number): React.CSSProperties => {
  const sideLength = GRID_SIZE - 1;
  let top = 0, left = 0;

  if (index >= 0 && index < sideLength) { // Top row
    top = 0;
    left = index * (TILE_WIDTH + GAP_SIZE);
  } else if (index >= sideLength && index < sideLength * 2) { // Right col
    top = (index - sideLength) * (TILE_HEIGHT + GAP_SIZE);
    left = (sideLength) * (TILE_WIDTH + GAP_SIZE);
  } else if (index >= sideLength * 2 && index < sideLength * 3) { // Bottom row
    top = (sideLength) * (TILE_HEIGHT + GAP_SIZE);
    left = (sideLength - (index - sideLength * 2)) * (TILE_WIDTH + GAP_SIZE);
  } else { // Left col
    top = (sideLength - (index - sideLength * 3)) * (TILE_HEIGHT + GAP_SIZE);
    left = 0;
  }
  return { top: `${top}px`, left: `${left}px`, position: 'absolute' };
};


const Tile = ({ property, playersOnTile, isNewlyBought }: { property: Property, playersOnTile: Player[], isNewlyBought: boolean }) => {
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
    
    if (!memoizedBoard || memoizedBoard.length === 0) {
        return <div>جاري تحميل لوحة اللعب...</div>;
    }
    
    const turnOrder = game.educatedMerchantState?.turnOrder || [];
    const currentTurnIndex = game.educatedMerchantState?.currentTurnIndex || 0;
    const currentPlayerId = turnOrder[currentTurnIndex];

    const renderCenterContent = () => {
        switch(game.gameState) {
            case 'rolling':
                return <DiceRoll game={game} self={self} />;
            case 'movement':
                 return <DiceRoll game={game} self={self} />;
            case 'property_action':
                const player = game.players.find(p => p.id === currentPlayerId);
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
                 <div className="relative" style={{ width: `${GRID_SIZE * TILE_WIDTH + (GRID_SIZE - 1) * GAP_SIZE}px`, height: `${GRID_SIZE * TILE_HEIGHT + (GRID_SIZE - 1) * GAP_SIZE}px`}}>
                    <div className="absolute inset-28 bg-gray-900/50 rounded-2xl flex items-center justify-center p-8 shadow-inner">
                        {renderCenterContent()}
                    </div>
                    {memoizedBoard.map((property, index) => (
                        <div key={index} style={{...getPositionStyles(index), width: TILE_WIDTH, height: TILE_HEIGHT}}>
                            <Tile property={property} playersOnTile={[]} isNewlyBought={game.educatedMerchantState?.newlyBoughtPropertyId === property.id}/>
                        </div>
                    ))}
                    {game.players.filter(p => p.status !== 'bankrupt').map(p => {
                        const style = getPositionStyles(p.position);
                        return (
                             <motion.div
                                key={p.id}
                                layoutId={`player-piece-${p.id}`}
                                className="absolute z-10"
                                initial={style}
                                animate={style}
                                transition={{ type: "spring", stiffness: 200, damping: 30 }}
                                style={{width: TILE_WIDTH, height: TILE_HEIGHT}}
                            >
                                <div className={cn("absolute bottom-1 right-1 w-10 h-10 transition-all duration-300", p.id === currentPlayerId && 'animate-pulse-glow')}>
                                    <PlayerAvatar avatarId={p.avatarId} className="w-full h-full rounded-full border-2 border-white shadow-lg" />
                                </div>
                            </motion.div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
}
