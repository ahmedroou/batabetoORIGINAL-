
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
  let top = '', left = '', right = '', bottom = '';

  if (index >= 0 && index < sideLength) { // Top row
    top = '0%';
    left = `${(index / sideLength) * 100}%`;
  } else if (index >= sideLength && index < sideLength * 2) { // Right col
    top = `${((index - sideLength) / sideLength) * 100}%`;
    right = '0%';
  } else if (index >= sideLength * 2 && index < sideLength * 3) { // Bottom row
    bottom = '0%';
    right = `${((index - sideLength * 2) / sideLength) * 100}%`;
  } else { // Left col
    bottom = `${((index - sideLength * 3) / sideLength) * 100}%`;
    left = '0%';
  }
  return { top, left, right, bottom, position: 'absolute' };
};


const Tile = ({ property, playersOnTile }: { property: Property, playersOnTile: Player[] }) => {
    let Icon = Building;
    let bgColor = 'bg-slate-700';
    let borderColor = 'border-slate-500';

    if (property.type === 'start') {
        Icon = Trophy;
        bgColor = 'bg-yellow-500';
        borderColor = 'border-yellow-300';
    } else if (property.type === 'fine') {
        Icon = Banknote;
        bgColor = 'bg-red-700';
        borderColor = 'border-red-500';
    } else if (property.ownerId) {
        bgColor = property.color || 'bg-gray-500';
        borderColor = 'border-gray-400';
    }

    return (
        <div className={cn("w-28 h-28 rounded-lg border-2 flex flex-col items-center justify-center p-2 text-center text-white shadow-lg", bgColor, borderColor)}>
            <Icon className="w-6 h-6 mb-1"/>
            <p className="text-xs font-bold leading-tight line-clamp-2">{property.name}</p>
            {property.type === 'property' && <p className="text-xs font-mono mt-1">{property.price} دينار</p>}
            {property.type === 'fine' && <p className="text-xs font-mono mt-1">{property.fineAmount} دينار</p>}

            {playersOnTile.length > 0 && (
                <div className="absolute -bottom-2 -right-2 flex -space-x-2">
                    {playersOnTile.map(p => (
                        <PlayerAvatar key={p.id} avatarId={p.avatarId} className="w-8 h-8 rounded-full border-2 border-white"/>
                    ))}
                </div>
            )}
        </div>
    );
};

export function GameBoard({ game, self }: GameBoardProps) {
    const board = game.educatedMerchantState?.board;
    
    if (!board || board.length === 0) {
        return <div>جاري تحميل لوحة اللعب...</div>;
    }
    
    const gridSize = 8; // 8x8 grid for 28 tiles (7 per side)
    const turnOrder = game.educatedMerchantState?.turnOrder || [];
    const currentTurnPlayer = turnOrder[game.educatedMerchantState?.currentTurnIndex || 0];

    const renderCenterContent = () => {
        switch(game.gameState) {
            case 'rolling':
                return <DiceRoll game={game} self={self} />;
            case 'movement':
                 return <p className="text-2xl text-white animate-pulse">يتحرك اللاعب...</p>;
            case 'property_action':
                const player = game.players.find(p => p.id === currentTurnPlayer);
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
                           {game.gameState === 'turn_end' ? `في انتظار اللاعب ${game.players.find(p=>p.id === currentTurnPlayer)?.name} لإنهاء دوره.` : `حالة اللعبة: ${game.gameState}`}
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
                 <div className="relative w-[700px] h-[700px]">
                    <div className="absolute inset-20 bg-gray-900/50 rounded-2xl flex items-center justify-center p-8 shadow-inner">
                        {renderCenterContent()}
                    </div>
                    {board.map((property, index) => {
                         const playersOnTile = game.players.filter(p => p.position === index);
                         return (
                            <motion.div 
                                key={index} 
                                style={getPositionStyles(index, gridSize)}
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.05, type: 'spring' }}
                            >
                                <Tile property={property} playersOnTile={playersOnTile} />
                            </motion.div>
                         )
                    })}
                </div>
            </div>
        </div>
    );
}
