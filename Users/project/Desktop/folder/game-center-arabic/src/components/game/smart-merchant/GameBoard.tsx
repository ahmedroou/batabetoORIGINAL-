
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
        const tileWidthPercentage = 100 / 7; // 7 tiles per side including corners

        let positionStyle: React.CSSProperties = {};

        if (index >= 0 && index < 7) { // Top row
            positionStyle = { top: 0, left: `${index * tileWidthPercentage}%`, width: `${tileWidthPercentage}%`, height: `${tileWidthPercentage}%` };
        } else if (index >= 7 && index < 12) { // Right col
            positionStyle = { top: `${(index - 6) * tileWidthPercentage}%`, right: 0, width: `${tileWidthPercentage}%`, height: `${tileWidthPercentage}%` };
        } else if (index >= 12 && index < 18) { // Bottom row
            positionStyle = { bottom: 0, right: `${(index - 11) * tileWidthPercentage}%`, width: `${tileWidthPercentage}%`, height: `${tileWidthPercentage}%` };
        } else { // Left col
            positionStyle = { bottom: `${(index - 17) * tileWidthPercentage}%`, left: 0, width: `${tileWidthPercentage}%`, height: `${tileWidthPercentage}%` };
        }

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
                    <div key={tile.id} className="board-tile" style={tile.positionStyle}>
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
