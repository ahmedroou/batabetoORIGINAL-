
"use client";

import React from 'react';
import type { Game, Player, BoardProperty } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Banknote, Building, Gavel } from 'lucide-react';
import './GameBoard.css';

interface GameBoardProps {
    game: Game;
    self: Player;
}

const BOARD_SIZE = 24;
const SIDE_LENGTH = 7; // (BOARD_SIZE / 4) + 1

const getTilePositionAndRotation = (index: number) => {
    let top = 0, left = 0, rotation = 0;
    const offset = 14.28; // ~100 / 7

    if (index < SIDE_LENGTH) { // Top row
        top = 0;
        left = index * offset;
        if (index === SIDE_LENGTH - 1) rotation = 45; // Top-right corner
    } else if (index < (SIDE_LENGTH - 1) * 2 + 1) { // Right col
        top = (index - (SIDE_LENGTH - 1)) * offset;
        left = 100 - offset;
        rotation = 90;
        if (index === (SIDE_LENGTH - 1) * 2) rotation += 45; // Bottom-right corner
    } else if (index < (SIDE_LENGTH - 1) * 3 + 1) { // Bottom row
        top = 100 - offset;
        left = (1 - (index - (SIDE_LENGTH - 1) * 2) / (SIDE_LENGTH - 1)) * 100;
        rotation = 180;
        if (index === (SIDE_LENGTH - 1) * 3) rotation += 45; // Bottom-left corner
    } else { // Left col
        top = (1 - (index - (SIDE_LENGTH - 1) * 3) / (SIDE_LENGTH - 1)) * 100;
        left = 0;
        rotation = 270;
        if (index === 0) rotation = -45; // Top-left corner (handled in first if, but good to be explicit)
    }

    return { top: `${top}%`, left: `${left}%`, rotation };
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
        <div className={cn("board-tile", owner && 'owned')}>
             <div className="tile-number">{index + 1}</div>
             <div className="tile-content">
                <div className={cn("tile-header", property.type === 'fine' ? 'bg-red-700' : (owner?.team || 'bg-gray-500'))}></div>
                <div className="tile-body">
                    <div className="tile-icon">
                       {property.type === 'fine' ? <Gavel /> : <Building />}
                    </div>
                    <div className="tile-name">{property.name}</div>
                    <div className="tile-price">
                       <Banknote className="w-3 h-3" /> {property.price}
                    </div>
                </div>
            </div>
             <div className="player-pieces">
                {playersOnTile.map((p, i) => (
                    <PlayerAvatar 
                        key={p.id} 
                        avatarId={p.avatarId} 
                        className="player-piece" 
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
