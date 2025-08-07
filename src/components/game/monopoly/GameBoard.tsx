
"use client";

import type { Game, Player, MonopolyState, MonopolyTile } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Dices, Landmark, Train, Zap, HelpCircle, Diamond, Banknote, VenetianMask, Gavel, Cog } from 'lucide-react';
import './GameBoard.css';

interface GameBoardProps {
  game: Game;
}

const TILE_COMPONENTS: Record<string, React.ElementType> = {
    go: Banknote,
    property: Landmark,
    railroad: Train,
    utility: Zap,
    community_chest: HelpCircle,
    chance: Diamond,
    tax: Banknote,
    jail: Gavel,
    free_parking: Banknote,
    go_to_jail: VenetianMask,
};

const TILE_COLORS = {
  brown: 'bg-yellow-900',
  lightblue: 'bg-sky-300',
  pink: 'bg-pink-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  yellow: 'bg-yellow-400',
  green: 'bg-green-500',
  darkblue: 'bg-blue-800',
};


const CornerTile = ({ tile, position }: { tile: MonopolyTile; position: 'bottom-left' | 'top-left' | 'top-right' | 'bottom-right' }) => {
    const Icon = TILE_COMPONENTS[tile.type] || HelpCircle;
    const rotationClasses = {
        'bottom-left': 'rotate-45',
        'top-left': '-rotate-45',
        'top-right': '-rotate-135',
        'bottom-right': 'rotate-135'
    };

    return (
        <div className="w-full h-full bg-slate-200 border border-black flex items-center justify-center">
            <div className={cn("flex flex-col items-center justify-center text-center", rotationClasses[position])}>
                 <p className="font-bold text-xs uppercase">{tile.name}</p>
                 <Icon className="w-8 h-8 my-1" />
            </div>
        </div>
    );
};

const SideTile = ({ tile, position }: { tile: MonopolyTile; position: 'bottom' | 'top' | 'left' | 'right' }) => {
    const Icon = TILE_COMPONENTS[tile.type] || HelpCircle;
    const isHorizontal = position === 'bottom' || position === 'top';
    const colorBarClass = TILE_COLORS[tile.color as keyof typeof TILE_COLORS] || 'bg-transparent';

    return (
        <div className={cn(
            "w-full h-full bg-slate-200 border border-black flex",
            isHorizontal ? 'flex-col' : 'flex-row'
        )}>
            {tile.type === 'property' && (
                <div className={cn(
                    "shrink-0",
                    colorBarClass,
                    isHorizontal ? 'h-5 w-full' : 'w-5 h-full'
                )}></div>
            )}
            <div className="flex-grow flex flex-col items-center justify-around p-1 text-center">
                 {tile.type !== 'property' && <Icon className={cn("shrink-0", isHorizontal ? 'w-5 h-5' : 'w-6 h-6')} />}
                <p className={cn("font-bold leading-tight", isHorizontal ? 'text-[9px]' : 'text-[8px] writing-sideways')}>{tile.name}</p>
                {tile.price && <p className="font-bold text-[9px] mt-auto">${tile.price}</p>}
            </div>
        </div>
    );
};

export function GameBoard({ game }: GameBoardProps) {
  const board = game.monopolyState?.board || [];
  const players = game.players;
  const playerData = game.monopolyState?.playerData || {};

  if (board.length === 0) {
      return <div className="w-full h-full flex items-center justify-center bg-green-200"><p>جاري تحميل اللوحة...</p></div>
  }

  const boardGrid = Array(11 * 11).fill(null);

  // Place corners
  boardGrid[10 * 11 + 0] = <CornerTile tile={board[0]} position="bottom-left" />;
  boardGrid[0 * 11 + 0] = <CornerTile tile={board[10]} position="top-left" />;
  boardGrid[0 * 11 + 10] = <CornerTile tile={board[20]} position="top-right" />;
  boardGrid[10 * 11 + 10] = <CornerTile tile={board[30]} position="bottom-right" />;
  
  // Place bottom row (1-9)
  for (let i = 1; i < 10; i++) {
    boardGrid[10 * 11 + i] = <SideTile tile={board[i]} position="bottom" />;
  }
  // Place left row (11-19)
  for (let i = 1; i < 10; i++) {
    boardGrid[(10 - i) * 11 + 0] = <SideTile tile={board[i + 10]} position="left" />;
  }
  // Place top row (21-29)
  for (let i = 1; i < 10; i++) {
    boardGrid[0 * 11 + (10 - i)] = <SideTile tile={board[i + 20]} position="top" />;
  }
  // Place right row (31-39)
  for (let i = 1; i < 10; i++) {
    boardGrid[i * 11 + 10] = <SideTile tile={board[i + 30]} position="right" />;
  }
  
  const getPlayerPosition = (position: number) => {
    let row, col;
    if (position >= 0 && position <= 10) { // Bottom row
        row = 10;
        col = 10 - position;
    } else if (position > 10 && position <= 20) { // Left row
        row = 10 - (position - 10);
        col = 0;
    } else if (position > 20 && position <= 30) { // Top row
        row = 0;
        col = position - 20;
    } else { // Right row
        row = position - 30;
        col = 10;
    }
    return { row, col };
  };


  return (
    <div className="relative w-[600px] h-[600px] bg-green-200 p-4 border-8 border-gray-700 rounded-lg">
        <div className="w-full h-full grid grid-cols-11 grid-rows-11 gap-0.5">
           {boardGrid.map((tile, index) => (
                <div key={index} className="bg-green-100">
                    {tile}
                </div>
            ))}
        </div>
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
            <h1 className="text-5xl font-bold text-primary transform -rotate-45 opacity-50">مونوبولي</h1>
        </div>

        {/* Player Pawns */}
        {players.map((p, playerIndex) => {
            const pos = playerData[p.id]?.position || 0;
            const { row, col } = getPlayerPosition(pos);
            const playersOnSameTile = players.filter(pl => playerData[pl.id]?.position === pos).length;
            const myIndexOnTile = players.filter(pl => playerData[pl.id]?.position === pos).findIndex(pl => pl.id === p.id);
            
            // Stagger pawns on the same tile
            const offset = (myIndexOnTile - (playersOnSameTile - 1) / 2) * 12;

            return (
                <div 
                    key={p.id} 
                    className="absolute player-pawn"
                    style={{
                        top: `calc(${row * (100/11)}% + 5px)`, // +5 for centering
                        left: `calc(${col * (100/11)}% + 5px)`, // +5 for centering
                        transform: `translate(${offset}px, ${offset}px)`,
                    }}
                >
                    <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8 border-2 rounded-full border-white shadow-lg" />
                </div>
            )
        })}
    </div>
  );
}
