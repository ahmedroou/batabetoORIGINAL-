
"use client";

import React from 'react';
import type { Game, Player, BoardProperty } from '@/types';
import { cn } from '@/lib/utils';
import { LandPlot, Train, Factory, HelpCircle, Diamond, Bank, ParkingCircle, Gavel, ArrowBigLeft, Home, Hotel } from 'lucide-react';
import { PlayerAvatar } from '../PlayerAvatar';

interface BoardProps {
    game: Game;
    onTileClick: (tileIndex: number) => void;
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

const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#8b5cf6', '#ec4899'];

// Helper to get player color
const getPlayerColor = (playerId: string, players: Player[]): string => {
    const index = players.findIndex(p => p.id === playerId);
    return PLAYER_COLORS[index % PLAYER_COLORS.length] || '#78716c';
};

const Tile = ({ tile, players, playerStates, onTileClick, className, tileIndex }: { tile: BoardProperty, players: Player[], playerStates: Game['eftelasState']['playerStates'], onTileClick: (tileIndex: number) => void, className?: string, tileIndex: number }) => {
    const Icon = TILE_ICONS[tile.type];
    const owner = tile.ownerId ? players.find(p => p.id === tile.ownerId) : null;
    const ownerColor = owner ? getPlayerColor(owner.id, players) : 'transparent';
    const playersOnTile = players.filter(p => playerStates[p.id]?.position === tileIndex);

    return (
        <div 
            className={cn(
                "bg-gray-100 border border-black flex flex-col justify-between relative cursor-pointer hover:bg-gray-200 transition-colors",
                className
            )}
            onClick={() => onTileClick(tileIndex)}
        >
            {/* Color Bar for properties */}
            {tile.type === 'property' && tile.color && (
                <div className="h-1/5" style={{ backgroundColor: tile.color }}></div>
            )}
            
            {/* Owner Indicator */}
            {owner && (
                 <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full border-2 border-white shadow" style={{ backgroundColor: ownerColor }}></div>
            )}

            {/* Tile Content */}
            <div className="flex-grow flex flex-col justify-center items-center text-center p-1 space-y-1">
                <p className="font-bold uppercase text-xs leading-tight">{tile.name}</p>
                {Icon && !tile.color && <Icon className="w-6 h-6 my-1" />}
                {tile.price && <p className="font-mono text-sm">{tile.price} ريال</p>}
            </div>

            {/* Players on Tile */}
            <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-1 p-1">
                {playersOnTile.map(p => (
                    <div key={p.id} className="relative group">
                        <PlayerAvatar avatarId={p.avatarId} className="w-6 h-6 rounded-full border-2" style={{ borderColor: getPlayerColor(p.id, players) }}/>
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black text-white text-xs px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            {p.name}
                        </div>
                    </div>
                ))}
            </div>
             {/* Houses/Hotel Indicator */}
             {tile.houses && tile.houses > 0 && (
                <div className="absolute bottom-0.5 left-0.5 flex gap-0.5">
                    {tile.houses <= 4 ? (
                        Array.from({length: tile.houses}).map((_, i) => <Home key={i} className="w-3 h-3 text-green-600 fill-current" />)
                    ) : (
                        <Hotel className="w-4 h-4 text-red-600 fill-current" />
                    )}
                </div>
            )}
        </div>
    );
};

export function Board({ game, onTileClick }: BoardProps) {
    const board = game.eftelasState?.board;
    const playerStates = game.eftelasState?.playerStates || {};
    const players = game.players;

    if (!board) {
        return <div className="w-full h-full bg-green-200 flex items-center justify-center"><p>جاري تحميل لوحة اللعبة...</p></div>;
    }

    const renderTile = (tileIndex: number, className?: string) => {
        const tile = board[tileIndex];
        if (!tile) return <div className={className} />;
        return <Tile tile={tile} players={players} playerStates={playerStates} onTileClick={onTileClick} className={className} tileIndex={tileIndex}/>;
    };
    
    // Board is 11x11 grid cells
    return (
        <div className="w-full h-full bg-green-200 border-4 border-black p-1 grid grid-cols-11 grid-rows-11 gap-1 aspect-square">
            {/* Corners */}
            {renderTile(20, 'col-start-1 row-start-1')} {/* Free Parking */}
            {renderTile(30, 'col-start-11 row-start-1')} {/* Go to Jail */}
            {renderTile(10, 'col-start-1 row-start-11')} {/* Jail */}
            {renderTile(0, 'col-start-11 row-start-11')} {/* Go */}

            {/* Top Row */}
            {Array.from({ length: 9 }).map((_, i) => renderTile(21 + i, `col-start-${i + 2} row-start-1`))}

            {/* Bottom Row */}
            {Array.from({ length: 9 }).map((_, i) => renderTile(9 - i, `col-start-${i + 2} row-start-11`))}

            {/* Left Column */}
            {Array.from({ length: 9 }).map((_, i) => renderTile(19 - i, `col-start-1 row-start-${i + 2}`))}

            {/* Right Column */}
            {Array.from({ length: 9 }).map((_, i) => renderTile(31 + i, `col-start-11 row-start-${i + 2}`))}

            {/* Center Area */}
            <div className="col-start-2 col-span-9 row-start-2 row-span-9 bg-green-300 flex items-center justify-center p-4">
                 <div className="text-4xl md:text-6xl font-extrabold text-green-700 tracking-wider" style={{ fontFamily: 'monospace' }}>
                    الإفلاس
                </div>
            </div>
        </div>
    );
}
