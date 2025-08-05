"use client";

import React from 'react';
import type { Game, Player, BoardProperty } from '@/types';
import { cn } from '@/lib/utils';
import { LandPlot, Train, Factory, HelpCircle, Diamond, Bank, ParkingCircle, Gavel, ArrowBigLeft, Home, Hotel, Skull, KeyRound } from 'lucide-react';
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

const getPlayerColor = (playerId: string, players: Player[]): string => {
    const index = players.findIndex(p => p.id === playerId);
    return PLAYER_COLORS[index % PLAYER_COLORS.length] || '#78716c';
};

const Tile = ({ tile, players, playerStates, onTileClick, className, tileIndex }: { tile: BoardProperty, players: Player[], playerStates: Game['eftelasState']['playerStates'], onTileClick: (tileIndex: number) => void, className?: string, tileIndex: number }) => {
    const Icon = TILE_ICONS[tile.type];
    const owner = tile.ownerId ? players.find(p => p.id === tile.ownerId) : null;
    const ownerColor = owner ? getPlayerColor(owner.id, players) : 'transparent';
    const playersOnTile = players.filter(p => playerStates[p.id]?.position === tileIndex);

    const isCorner = ['go', 'jail', 'free-parking', 'go-to-jail'].includes(tile.type);

    return (
        <div 
            className={cn(
                "bg-cream-100 border border-black flex flex-col justify-between relative cursor-pointer hover:bg-gray-200 transition-colors shadow-sm",
                owner && `border-2`,
                className
            )}
            style={{
                 borderColor: owner ? ownerColor : 'black'
            }}
            onClick={() => onTileClick(tileIndex)}
        >
            {/* Color Bar for Properties */}
            {tile.type === 'property' && tile.color && (
                 <div className="h-1/5" style={{ backgroundColor: tile.color }}></div>
            )}
           

            {/* Tile Content */}
            <div className={cn("flex-grow flex flex-col items-center text-center p-1 space-y-1", isCorner ? 'justify-center' : 'justify-start')}>
                <p className={cn("font-bold uppercase leading-tight", isCorner ? "text-sm" : "text-[10px]")}>{tile.name}</p>
                 {Icon && (
                    <div className={cn('my-1', isCorner && 'w-10 h-10')}>
                        <Icon className={cn(isCorner ? "w-full h-full" : "w-5 h-5")} />
                    </div>
                )}
                {tile.price && <p className="font-mono text-xs">${tile.price}</p>}
            </div>

            {/* Players on Tile */}
             <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center justify-center gap-1">
                {playersOnTile.map((p, index) => (
                    <div key={p.id} className="relative group">
                        <PlayerAvatar avatarId={p.avatarId} className="w-5 h-5 md:w-6 md:h-6 rounded-full border-2" style={{ borderColor: getPlayerColor(p.id, players) }}/>
                    </div>
                ))}
            </div>

             {/* Houses/Hotel Indicator */}
             {tile.type === 'property' && tile.houses && tile.houses > 0 && (
                <div className="absolute top-1 left-1/2 -translate-x-1/2 flex gap-0.5 bg-black/20 p-0.5 rounded-full">
                    {tile.houses <= 4 ? (
                        Array.from({length: tile.houses}).map((_, i) => <Home key={i} className="w-3 h-3 text-green-400 fill-current" />)
                    ) : (
                        <Hotel className="w-4 h-4 text-red-500 fill-current" />
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

    const renderTile = (tileIndex: number, gridClasses: string) => {
        const tile = board[tileIndex];
        if (!tile) return <div className={gridClasses} />;
        return <Tile tile={tile} players={players} playerStates={playerStates} onTileClick={onTileClick} className={gridClasses} tileIndex={tileIndex}/>;
    };
    
    return (
        <div className="w-full h-full bg-green-200 border-4 border-black p-1 grid grid-cols-11 grid-rows-11 gap-1 aspect-square">
            {/* Top Row */}
            {renderTile(20, 'col-start-1 row-start-1')}
            {Array.from({ length: 9 }).map((_, i) => renderTile(21 + i, `col-start-${2 + i} row-start-1`))}
            {renderTile(30, 'col-start-11 row-start-1')}

            {/* Middle Rows */}
            {Array.from({ length: 9 }).map((_, i) => (
                <React.Fragment key={i}>
                    {renderTile(19 - i, `col-start-1 row-start-${2 + i}`)}
                    {renderTile(31 + i, `col-start-11 row-start-${2 + i}`)}
                </React.Fragment>
            ))}

            {/* Bottom Row */}
            {renderTile(10, 'col-start-1 row-start-11')}
            {Array.from({ length: 9 }).map((_, i) => renderTile(9 - i, `col-start-${2 + i} row-start-11`))}
            {renderTile(0, 'col-start-11 row-start-11')}


            {/* Center Area */}
            <div className="col-start-2 col-span-9 row-start-2 row-span-9 bg-green-300 flex items-center justify-center p-4">
                 <div className="text-4xl md:text-6xl font-extrabold text-green-700 tracking-wider rotate-[-45deg]" style={{ fontFamily: 'monospace' }}>
                    الإفلاس
                </div>
            </div>
        </div>
    );
}
