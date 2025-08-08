
"use client";

import React from 'react';
import type { Game, Player } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Home } from 'lucide-react';

interface GameBoardProps {
    game: Game;
    self: Player;
}

const BOARD_SIZE = 24;
const SIDE_LENGTH = 7; // (24/4)+1 to account for corners

export const GameBoard: React.FC<GameBoardProps> = ({ game, self }) => {
    const board = game.snakesAndScissorsState?.board || [];
    const players = game.players;

    const getPosition = (index: number) => {
        if (index < SIDE_LENGTH -1) return { top: 0, left: `${(index / (SIDE_LENGTH - 1)) * 100}%` }; // Top
        if (index < (SIDE_LENGTH - 1) * 2) return { top: `${((index - (SIDE_LENGTH - 1)) / (SIDE_LENGTH-1)) * 100}%`, left: '100%' }; // Right
        if (index < (SIDE_LENGTH - 1) * 3) return { top: '100%', left: `${(1 - ((index - (SIDE_LENGTH - 1) * 2) / (SIDE_LENGTH-1))) * 100}%` }; // Bottom
        return { top: `${(1- ((index - (SIDE_LENGTH - 1) * 3) / (SIDE_LENGTH -1))) * 100}%`, left: 0 }; // Left
    };

    return (
        <div className="w-full h-full bg-gray-700 rounded-lg p-10 relative">
            <div className="w-full h-full relative">
                {board.map((property, index) => {
                     const pos = getPosition(index);
                    return (
                        <div key={property.id} className="absolute p-1 border-2 bg-gray-800/50 rounded-md -translate-x-1/2 -translate-y-1/2" style={{...pos}}>
                            <div className="w-20 h-20 flex flex-col items-center justify-center p-1" style={{backgroundColor: property.color || 'transparent'}}>
                               <span className="text-xs font-bold text-white truncate">{property.name}</span>
                               <span className="text-xs text-yellow-300 font-bold">{property.price}</span>
                               <div className="flex -space-x-2 mt-auto">
                               {players.filter(p => p.position === index).map(p => (
                                   <PlayerAvatar key={p.id} avatarId={p.avatarId} className="w-6 h-6 border-2 rounded-full" style={{borderColor: p.team || '#FFF'}}/>
                               ))}
                               </div>
                            </div>
                        </div>
                    );
                })}
                 <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2/3 h-2/3 bg-gray-800 rounded-lg flex items-center justify-center">
                        <h2 className="text-4xl font-bold text-primary">بنك الحظ</h2>
                    </div>
                </div>
            </div>
        </div>
    );
};
