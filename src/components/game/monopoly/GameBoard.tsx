
"use client";

import type { Game, Player, MonopolyState, MonopolyTile } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Dices, Landmark, Train, Zap, HelpCircle, Diamond, Banknote, VenetianMask } from 'lucide-react';

interface GameBoardProps {
  game: Game;
}

const TILE_COMPONENTS: Record<MonopolyTile['type'], React.ElementType> = {
    go: Banknote,
    property: Landmark,
    railroad: Train,
    utility: Zap,
    community_chest: HelpCircle,
    chance: Diamond,
    tax: Banknote,
    jail: VenetianMask,
    free_parking: Banknote,
    go_to_jail: VenetianMask,
};

export function GameBoard({ game }: GameBoardProps) {
  const board = game.monopolyState?.board || [];
  const players = game.players;
  const playerData = game.monopolyState?.playerData || {};

  const renderTile = (tile: MonopolyTile, index: number) => {
    const Icon = TILE_COMPONENTS[tile.type] || HelpCircle;
    return (
      <div className={cn("border border-black flex flex-col justify-between w-full h-full", tile.type === 'go' || tile.type === 'jail' || tile.type === 'free_parking' || tile.type === 'go_to_jail' ? 'p-2 items-center justify-center' : 'p-1')}>
        {tile.type !== 'go' && tile.type !== 'jail' && tile.type !== 'free_parking' && tile.type !== 'go_to_jail' && (
            <>
                <div className={cn("h-5 w-full border border-black", `bg-${tile.color}-500`)}></div>
                <div className="text-center text-[8px] leading-tight font-bold my-1 flex-grow">
                    {tile.name}
                </div>
                <div className="text-center text-[8px] font-bold">
                    {tile.price ? `$${tile.price}` : ''}
                </div>
            </>
        )}
         {(tile.type === 'go' || tile.type === 'jail' || tile.type === 'free_parking' || tile.type === 'go_to_jail') && (
             <>
                <div className="text-center text-[9px] font-bold leading-tight">{tile.name}</div>
                <Icon className="w-8 h-8 my-1" />
             </>
         )}
      </div>
    );
  };
  
  const TILE_SIZE = 60; // Size of a regular tile
  const CORNER_SIZE = 80; // Size of a corner tile
  const BOARD_SIZE = CORNER_SIZE * 2 + TILE_SIZE * 9;

  const getPlayerPositionStyle = (position: number, playerIndex: number) => {
    const offset = playerIndex * 12; // Stagger players on the same tile
    let top = 0, left = 0;

    if (position >= 0 && position <= 10) { // Bottom row
        top = BOARD_SIZE - TILE_SIZE - offset;
        left = BOARD_SIZE - CORNER_SIZE - (position * TILE_SIZE);
    } else if (position > 10 && position <= 20) { // Left row
        top = BOARD_SIZE - CORNER_SIZE - ((position - 10) * TILE_SIZE);
        left = offset;
    } else if (position > 20 && position <= 30) { // Top row
        top = offset;
        left = CORNER_SIZE + ((position - 20) * TILE_SIZE);
    } else { // Right row
        top = CORNER_SIZE + ((position - 30) * TILE_SIZE);
        left = BOARD_SIZE - TILE_SIZE - offset;
    }
    return { top: `${top}px`, left: `${left}px`, transition: 'top 0.5s, left 0.5s' };
  };

  return (
    <div className="relative bg-green-100 p-2 border-4 border-gray-700" style={{ width: BOARD_SIZE, height: BOARD_SIZE }}>
        <div className="grid grid-cols-11 grid-rows-11 w-full h-full">
            {/* Render corners */}
            <div className="col-start-1 row-start-11">{renderTile(board[0], 0)}</div>
            <div className="col-start-1 row-start-1">{renderTile(board[10], 10)}</div>
            <div className="col-start-11 row-start-1">{renderTile(board[20], 20)}</div>
            <div className="col-start-11 row-start-11">{renderTile(board[30], 30)}</div>
            
            {/* Render top and bottom rows */}
            {Array.from({ length: 9 }).map((_, i) => (
                <>
                    <div className="col-start-2-span-9" style={{ gridColumn: 10 - i, gridRow: 11 }}>{renderTile(board[i+1], i+1)}</div>
                    <div className="col-start-2-span-9" style={{ gridColumn: i + 2, gridRow: 1 }}>{renderTile(board[i+21], i+21)}</div>
                </>
            ))}

            {/* Render left and right rows */}
            {Array.from({ length: 9 }).map((_, i) => (
                <>
                    <div className="row-start-2-span-9" style={{ gridRow: 10 - i, gridColumn: 1 }}>{renderTile(board[i+11], i+11)}</div>
                    <div className="row-start-2-span-9" style={{ gridRow: i + 2, gridColumn: 11 }}>{renderTile(board[i+31], i+31)}</div>
                </>
            ))}
        </div>
        
       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
            <h1 className="text-5xl font-bold text-primary transform -rotate-45">مونوبولي</h1>
        </div>
        
        {/* Render Players */}
        {players.map((p, index) => {
            const pos = playerData[p.id]?.position || 0;
            return (
                 <div key={p.id} className="absolute" style={getPlayerPositionStyle(pos, index)}>
                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 border-2 rounded-full border-white shadow-lg" />
                </div>
            )
        })}
    </div>
  );
}
