

"use client";

import React from 'react';
import type { Game, Player, BoardProperty } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Banknote, Building, Gavel, Flag } from 'lucide-react';
import './GameBoard.css';

interface GameBoardProps {
    game: Game;
    self: Player;
}

const SIDE_LENGTH = 7; // 7x7 grid, so 6 tiles per side
const TILE_COUNT = (SIDE_LENGTH - 1) * 4; // 24 tiles
const TILE_SIZE_PERCENT = 100 / SIDE_LENGTH;

const getTilePosition = (index: number) => {
    let top, left;

    if (index < SIDE_LENGTH) { // Top row (0-6)
        top = '0%';
        left = `${index * TILE_SIZE_PERCENT}%`;
    } else if (index < SIDE_LENGTH + SIDE_LENGTH - 1) { // Right column (7-12)
        top = `${(index - (SIDE_LENGTH - 1)) * TILE_SIZE_PERCENT}%`;
        left = `${100 - TILE_SIZE_PERCENT}%`;
    } else if (index < SIDE_LENGTH + (SIDE_LENGTH - 1) * 2) { // Bottom row (13-18)
        top = `${100 - TILE_SIZE_PERCENT}%`;
        left = `${100 - ((index - (SIDE_LENGTH - 1) * 2 + 1) * TILE_SIZE_PERCENT)}%`;
    } else { // Left column (19-23)
        top = `${100 - ((index - (SIDE_LENGTH - 1) * 3 + 1) * TILE_SIZE_PERCENT)}%`;
        left = '0%';
    }
    
    return {
        top,
        left,
        width: `${TILE_SIZE_PERCENT}%`,
        height: `${TILE_SIZE_PERCENT}%`,
    };
};

const Tile = ({ property, index, players }: { property: BoardProperty, index: number, players: Player[] }) => {
    const playersOnTile = players.filter(p => p.position === index);
    const owner = players.find(p => p.id === property.ownerId);

    const getPositionStyles = (playerIndex: number) => {
        const positions = [
            { top: '10%', left: '10%' },
            { top: '10%', right: '10%' },
            { bottom: '10%', left: '10%' },
            { bottom: '10%', right: '10%' },
        ];
        return positions[playerIndex % 4];
    };

    return (
        <div className="board-tile" style={getTilePosition(index)}>
             <div className="tile-number">{index + 1}</div>
             <div className="tile-content">
                <div className="tile-header" style={{backgroundColor: property.color || (owner?.team === 'A' ? '#3b82f6' : owner?.team === 'B' ? '#ec4899' : '#6b7280')}}></div>
                <div className="tile-body">
                    <div className="tile-icon">
                       {property.type === 'start' ? <Flag /> : property.type === 'fine' ? <Gavel /> : <Building />}
                    </div>
                    <div className="tile-name">{property.name}</div>
                     {property.type === 'property' && (
                        <div className="tile-price">
                           <Banknote className="w-3 h-3" /> {property.price}
                        </div>
                    )}
                </div>
            </div>
             <div className="player-pieces">
                {playersOnTile.map((p, i) => (
                    <PlayerAvatar 
                        key={p.id} 
                        avatarId={p.avatarId} 
                        className="player-piece border-white dark:border-gray-950" 
                        style={getPositionStyles(i)}
                        temporaryTitle={p.temporaryTitle}
                    />
                ))}
            </div>
        </div>
    );
};


export const GameBoard: React.FC<GameBoardProps> = ({ game, self }) => {
    const board = game.snakesAndScissorsState?.board || [];
    const players = game.players.filter(p => p.status !== 'bankrupt');

    return (
        <div className="game-board-container">
            <div className="game-board">
                {board.map((property, index) => (
                     <Tile key={property.id} property={property} index={index} players={players} />
                ))}
                 <div className="board-center">
                    <h2 className="board-title">بنك الحظ</h2>
                </div>
            </div>
        </div>
    );
};
