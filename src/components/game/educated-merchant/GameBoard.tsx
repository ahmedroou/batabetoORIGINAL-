
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

interface GameBoardProps {
  game: Game;
  self: Player;
}

const BOARD_SIZE = 28;
const CORNER_INDICES = [0, 7, 14, 21];

const getPositionStyles = (index: number, gridSize: number): React.CSSProperties => {
  const sideLength = gridSize - 1;
  let top = '0px', left = '0px', transform = '';

  const TILE_SIZE = 112; // 28rem
  const GAP_SIZE = 4; // 1rem

  if (index >= 0 && index < sideLength) { // Top row
    top = '0px';
    left = `${index * (TILE_SIZE + GAP_SIZE)}px`;
  } else if (index >= sideLength && index < sideLength * 2) { // Right col
    top = `${(index - sideLength) * (TILE_SIZE + GAP_SIZE)}px`;
    left = `${sideLength * (TILE_SIZE + GAP_SIZE)}px`;
  } else if (index >= sideLength * 2 && index < sideLength * 3) { // Bottom row
    top = `${sideLength * (TILE_SIZE + GAP_SIZE)}px`;
    left = `${(sideLength - (index - sideLength * 2)) * (TILE_SIZE + GAP_SIZE)}px`;
  } else { // Left col
    top = `${(sideLength - (index - sideLength * 3)) * (TILE_SIZE + GAP_SIZE)}px`;
    left = '0px';
  }
  return { top, left, transform, position: 'absolute' };
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
    } else if (property.ownerId) {
        // If there's an owner, we use inline style for dynamic color
        borderColor = property.color || 'border-gray-400';
    }
    
    // Style for dynamically colored background
    const tileStyle = property.ownerId ? { backgroundColor: property.color } : {};

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
    
    if (!board || board.length === 0) {
        return <div>جاري تحميل لوحة اللعب...</div>;
    }
    
    const gridSize = 8;
    const turnOrder = game.educatedMerchantState?.turnOrder || [];
    const currentTurnPlayerId = turnOrder[game.educatedMerchantState?.currentTurnIndex || 0];
    const newlyBoughtPropertyId = game.educatedMerchantState?.newlyBoughtPropertyId;


    const renderCenterContent = () => {
        switch(game.gameState) {
            case 'rolling':
                return <DiceRoll game={game} self={self} />;
            case 'movement':
                 return <p className="text-2xl text-white animate-pulse">يتحرك اللاعب...</p>;
            case 'property_action':
                const player = game.players.find(p => p.id === currentTurnPlayerId);
                if (player) {
                     const property = board[player.position];
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
                    {board.map((property, index) => {
                         const playersOnTile = game.players.filter(p => p.position === index && p.status !== 'bankrupt');
                         const isNewlyBought = property.id === newlyBoughtPropertyId;
                         return (
                            <div key={index} style={getPositionStyles(index, gridSize)} className="w-28 h-28">
                                <Tile property={property} playersOnTile={[]} isNewlyBought={isNewlyBought} />
                                {playersOnTile.length > 0 && (
                                     <div className="absolute inset-0 flex items-center justify-center -space-x-2 pointer-events-none">
                                        {playersOnTile.map((p, i) => (
                                            <motion.div
                                                key={p.id}
                                                layoutId={`player-piece-${p.id}`}
                                                className="z-10"
                                                initial={false}
                                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                            >
                                                <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full border-2 border-white shadow-lg" />
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </div>
                         )
                    })}
                </div>
            </div>
        </div>
    );
}
