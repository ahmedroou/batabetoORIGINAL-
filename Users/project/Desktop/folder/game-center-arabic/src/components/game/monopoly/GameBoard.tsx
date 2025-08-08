

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

const getTilePosition = (index: number) => {
    const tilePercentage = 100 / SIDE_LENGTH;
    let top, left, right, bottom;

    if (index >= 0 && index < SIDE_LENGTH) { // Top row (including corners)
        top = '0%';
        left = `${index * tilePercentage}%`;
    } else if (index >= SIDE_LENGTH && index < SIDE_LENGTH + (SIDE_LENGTH - 2)) { // Right column (excluding corners)
        top = `${(index - (SIDE_LENGTH - 1)) * tilePercentage}%`;
        left = `${100 - tilePercentage}%`;
    } else if (index >= SIDE_LENGTH + (SIDE_LENGTH - 2) && index < TILE_COUNT - (SIDE_LENGTH - 2)) { // Bottom row (including corners)
        top = `${100 - tilePercentage}%`;
        left = `${100 - ((index - (SIDE_LENGTH - 1) - (SIDE_LENGTH - 2)) * tilePercentage)}%`;
    } else { // Left column (excluding corners)
        top = `${100 - ((index - (SIDE_LENGTH - 1) * 2 - (SIDE_LENGTH - 2)) * tilePercentage)}%`;
        left = '0%';
    }
    
     if (index < SIDE_LENGTH -1) { // Top Row
        top = '0%';
        left = `${(index) * tilePercentage}%`;
    } else if (index < SIDE_LENGTH -1 + SIDE_LENGTH -1) { // Right Col
        top = `${(index - (SIDE_LENGTH -1)) * tilePercentage}%`;
        left = `${100-tilePercentage}%`;
    } else if (index < SIDE_LENGTH -1 + SIDE_LENGTH -1 + SIDE_LENGTH - 1) { // Bottom Row
        top = `${100-tilePercentage}%`;
        left = `${100 - ((index - (SIDE_LENGTH-1)*2)+1) * tilePercentage}%`;
    } else { // Left Col
        top = `${100 - ((index - (SIDE_LENGTH-1)*3)+1) * tilePercentage}%`;
        left = `0%`;
    }


    return { 
        top, 
        left,
        width: `${tilePercentage}%`,
        height: `${tilePercentage}%`
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
