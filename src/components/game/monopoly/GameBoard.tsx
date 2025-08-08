

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

const SIDE_LENGTH = 7; // e.g., for a 24-tile board (7x7 grid perimeter)

const getTilePosition = (index: number) => {
    const edgeIndex = index % (SIDE_LENGTH - 1);
    const side = Math.floor(index / (SIDE_LENGTH - 1));
    const offset = 100 / (SIDE_LENGTH - 1); // Percentage offset for each tile

    switch (side) {
        case 0: // Top row
            return { top: '0%', left: `${edgeIndex * offset}%` };
        case 1: // Right column
            return { top: `${edgeIndex * offset}%`, left: `${100 - offset}%` };
        case 2: // Bottom row
            return { top: `${100 - offset}%`, left: `${100 - (edgeIndex + 1) * offset}%` };
        case 3: // Left column
            return { top: `${100 - (edgeIndex + 1) * offset}%`, left: '0%' };
        default:
            return { top: '0%', left: '0%' };
    }
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
