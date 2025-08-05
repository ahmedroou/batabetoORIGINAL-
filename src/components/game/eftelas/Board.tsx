
"use client";

import React from 'react';
import type { Game } from '@/types';
import { cn } from '@/lib/utils';
import { LandPlot, Train, Factory, HelpCircle, Diamond, Bank, ParkingCircle, Gavel, ArrowBigLeft } from 'lucide-react';
import { PlayerAvatar } from '../PlayerAvatar';

interface BoardProps {
    game: Game;
}

const TILE_ICONS: Record<string, React.ElementType> = {
    'go': Diamond,
    'chance': HelpCircle,
    'community-chest': Bank,
    'tax': Diamond,
    'station': Train,
    'utility': Factory,
    'free-parking': ParkingCircle,
    'jail': Gavel,
    'go-to-jail': ArrowBigLeft
};

const PLAYER_COLORS = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500'];

export function Board({ game }: BoardProps) {
    const board = game.eftelasState?.board;
    const playerStates = game.eftelasState?.playerStates || {};
    const players = game.players;

    if (!board) {
        return <div className="w-full h-full bg-green-200 flex items-center justify-center"><p>جاري تحميل لوحة اللعبة...</p></div>;
    }

    const renderTile = (tileIndex: number, className?: string) => {
        const tile = board[tileIndex];
        if (!tile) return <div />;
        
        const Icon = TILE_ICONS[tile.type];
        
        return (
            <div className={cn("bg-gray-100 border text-center text-[8px] md:text-[10px] flex flex-col justify-start p-0.5 leading-tight relative", className)}>
                 {tile.color && <div className="h-4 md:h-5 w-full mb-1" style={{ backgroundColor: tile.color }}></div>}
                <p className="font-bold uppercase flex-grow px-1">{tile.name}</p>
                {Icon && <Icon className="w-4 h-4 md:w-5 md:h-5 mx-auto my-1" />}
                {tile.price && <p className="font-mono">{tile.price} ريال</p>}
                
                 {/* Player Pieces */}
                <div className="absolute inset-x-0 bottom-1 flex justify-center items-end gap-0.5">
                    {players.map((player, index) => {
                        if (playerStates[player.id]?.position === tileIndex) {
                            return (
                                <div key={player.id} className={cn("w-3 h-3 md:w-4 md:h-4 rounded-full border-2 border-white shadow-lg", PLAYER_COLORS[index % PLAYER_COLORS.length])} title={player.name} />
                            );
                        }
                        return null;
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="w-full h-full bg-green-200 border-4 border-black p-1 grid grid-cols-11 grid-rows-11 gap-1 aspect-square">
            {/* Top Row */}
            <div className="col-start-1 row-start-1">{renderTile(20, 'transform -rotate-45')}</div>
            {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className={`col-start-${i + 2} row-start-1`}>{renderTile(21 + i)}</div>
            ))}
            <div className="col-start-11 row-start-1">{renderTile(30, 'transform rotate-45')}</div>

            {/* Left Column */}
            {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className={`col-start-1 row-start-${i + 2}`}>{renderTile(19 - i)}</div>
            ))}

             {/* Right Column */}
            {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className={`col-start-11 row-start-${i + 2}`}>{renderTile(31 + i)}</div>
            ))}
            
            {/* Bottom Row */}
            <div className="col-start-1 row-start-11">{renderTile(10, 'transform -rotate-135')}</div>
            {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className={`col-start-${2 + i} row-start-11`}>{renderTile(9 - i)}</div>
            ))}
            <div className="col-start-11 row-start-11">{renderTile(0, 'transform rotate-135')}</div>

            <div className="col-start-2 col-span-9 row-start-2 row-span-9 bg-green-300 flex items-center justify-center text-4xl font-bold text-green-700">
                الإفلاس
            </div>
        </div>
    );
}
