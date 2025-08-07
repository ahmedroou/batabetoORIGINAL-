
"use client";

import type { Game, Player, MonopolyState, MonopolyTile } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';

interface GameBoardProps {
  game: Game;
  players: Player[];
  board: MonopolyTile[];
}

export function GameBoard({ game, players, board }: GameBoardProps) {

  const renderTile = (tile: MonopolyTile, index: number) => {
    return (
      <div key={index} className="border border-black flex flex-col justify-between">
        <div className={`h-6 ${tile.color ? `bg-${tile.color}-500` : 'bg-gray-200'}`}></div>
        <div className="text-center text-xs p-1 flex-grow">
            {tile.name}
        </div>
        <div className="text-center text-xs font-bold">
            {tile.price ? `$${tile.price}` : ''}
        </div>
      </div>
    );
  };
  
  return (
    <div className="relative w-[700px] h-[700px] bg-green-100 p-5 grid grid-cols-11 grid-rows-11 gap-1">
        {board.map((tile, index) => {
             // Logic to place tiles around the board
             let row = 0, col = 0;
             if (index < 11) { // Bottom row
                 row = 10;
                 col = 10 - index;
             } else if (index < 21) { // Left col
                 row = 10 - (index - 10);
                 col = 0;
             } else if (index < 31) { // Top row
                 row = 0;
                 col = index - 20;
             } else { // Right col
                 row = index - 30;
                 col = 10;
             }
             
             return (
                <div key={index} style={{ gridRow: row + 1, gridColumn: col + 1 }} className="bg-white">
                    {renderTile(tile, index)}
                </div>
             )
        })}
       <div className="col-start-2 col-span-9 row-start-2 row-span-9 bg-gray-300 flex items-center justify-center">
            <h1 className="text-5xl font-bold text-primary">مونوبولي</h1>
        </div>

    </div>
  );
}
