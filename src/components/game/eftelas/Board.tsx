
"use client";

import React from 'react';
import type { Game } from '@/types';
import { cn } from '@/lib/utils';
import { LandPlot, Train, Factory, HelpCircle, Diamond, Bank, ParkingCircle, Gavel, ArrowBigLeft } from 'lucide-react';

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

export function Board({ game }: BoardProps) {
    const board = game.eftelasState?.board;

    if (!board) {
        return <div className="w-full h-full bg-green-200 flex items-center justify-center"><p>جاري تحميل لوحة اللعبة...</p></div>;
    }

    const renderTile = (tileIndex: number) => {
        const tile = board[tileIndex];
        if (!tile) return <div />;
        
        const Icon = TILE_ICONS[tile.type];
        const colorClass = tile.color ? `border-${tile.color}-500` : 'border-gray-400';
        
        return (
            <div className={cn("bg-gray-100 border-2 text-center text-[8px] md:text-[10px] flex flex-col justify-between p-1 leading-tight", colorClass)}>
                <div className={cn("h-4 md:h-6 w-full mb-1", tile.color ? `bg-${tile.color}-500` : '')}></div>
                <p className="font-bold uppercase flex-grow">{tile.name}</p>
                {Icon && <Icon className="w-4 h-4 md:w-6 md:h-6 mx-auto my-1" />}
                {tile.price && <p className="font-mono">{tile.price} ريال</p>}
            </div>
        );
    };

    return (
        <div className="w-full h-full bg-green-200 border-4 border-black p-1 grid grid-cols-11 grid-rows-11 gap-1 aspect-square">
            {/* Top Row */}
            <div className="col-start-1 row-start-1">{renderTile(20)}</div>
            {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className={`col-start-${i + 2} row-start-1`}>{renderTile(21 + i)}</div>
            ))}
            <div className="col-start-11 row-start-1">{renderTile(30)}</div>

            {/* Left Column */}
            {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className={`col-start-1 row-start-${i + 2}`}>{renderTile(19 - i)}</div>
            ))}

             {/* Right Column */}
            {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className={`col-start-11 row-start-${i + 2}`}>{renderTile(31 + i)}</div>
            ))}
            
            {/* Bottom Row */}
            <div className="col-start-1 row-start-11">{renderTile(10)}</div>
            {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className={`col-start-${2 + i} row-start-11`}>{renderTile(9 - i)}</div>
            ))}
            <div className="col-start-11 row-start-11">{renderTile(0)}</div>

            <div className="col-start-2 col-span-9 row-start-2 row-span-9 bg-green-300 flex items-center justify-center text-4xl font-bold text-green-700">
                الإفلاس
            </div>
        </div>
    );
}
