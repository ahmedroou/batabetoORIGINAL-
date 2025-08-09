
'use client';

import type { Game, Player, BoardProperty } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import './GameBoard.css';

interface GameBoardProps {
    game: Game;
    self: Player;
}

export function GameBoard({ game, self }: GameBoardProps) {
    const board = game.smartMerchantState?.board || [];
    const players = game.players;

    const boardPositions = board.map((tile, index) => {
        const playersOnTile = players.filter(p => p.position === index);

        const size = 100 / 6; // 6 tiles per side (excluding corners)
        let positionStyle: React.CSSProperties = {};

        if (index >= 0 && index < 6) { // Top row
            positionStyle = { top: 0, left: `${index * size}%`, width: `${size}%`, height: '16.66%' };
        } else if (index >= 6 && index < 12) { // Right col
            positionStyle = { top: `${(index - 5) * size}%`, left: '83.33%', width: '16.66%', height: `${size}%` };
        } else if (index >= 12 && index < 18) { // Bottom row
            positionStyle = { bottom: 0, left: `${(17 - index) * size}%`, width: `${size}%`, height: '16.66%' };
        } else { // Left col
            positionStyle = { bottom: `${(23 - index) * size}%`, left: 0, width: '16.66%', height: `${size}%` };
        }
        if (index === 0) positionStyle = { top: 0, left: 0, width: '16.66%', height: '16.66%' };
        if (index === 6) positionStyle = { top: 0, left: '83.33%', width: '16.66%', height: '16.66%' };
        if (index === 12) positionStyle = { top: '83.33%', left: '83.33%', width: '16.66%', height: '16.66%' };
        if (index === 18) positionStyle = { top: '83.33%', left: 0, width: '16.66%', height: '16.66%' };


        return {
            ...tile,
            playersOnTile,
            positionStyle,
        };
    });

    return (
        <div className="game-board-container">
            <div className="game-board">
                {boardPositions.map(tile => (
                    <div key={tile.id} className={`board-tile`} style={tile.positionStyle}>
                        <div className="tile-content" style={{ backgroundColor: tile.ownerId ? game.players.find(p=>p.id === tile.ownerId)?.team === 'A' ? 'lightblue' : 'lightpink' : tile.color || 'white' }}>
                            <div className="tile-name">{tile.name}</div>
                            {tile.type === 'property' && <div className="tile-price">{tile.price}</div>}
                             <div className="player-tokens">
                                {tile.playersOnTile.map(p => <PlayerAvatar key={p.id} avatarId={p.avatarId} className="w-8 h-8"/>)}
                            </div>
                        </div>
                    </div>
                ))}
                <div className="board-center">
                    <h2 className="text-2xl font-bold">التاجر الذكي</h2>
                </div>
            </div>
        </div>
    );
}

    