
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
        const isCorner = index % 6 === 0;
        const className = isCorner ? 'corner' : 'side';
        const playersOnTile = players.filter(p => p.position === index);

        let positionStyle: React.CSSProperties = {};
        const size = 16.66; // approx 100/6 for sides
        const cornerSize = 12.5; // for corners

        if (index >= 0 && index <= 5) { // Top row
            positionStyle = { top: 0, right: `${index * size}%`, width: `${size}%`, height: `${cornerSize}%` };
        } else if (index > 5 && index <= 11) { // Right col
            positionStyle = { top: `${(index - 5) * size}%`, right: `calc(100% - ${cornerSize}%)`, width: `${cornerSize}%`, height: `${size}%` };
        } else if (index > 11 && index <= 17) { // Bottom row
            positionStyle = { bottom: 0, right: `${(17 - index) * size}%`, width: `${size}%`, height: `${cornerSize}%` };
        } else { // Left col
            positionStyle = { bottom: `${(23 - index) * size}%`, left: 0, width: `${cornerSize}%`, height: `${size}%` };
        }

        return {
            ...tile,
            className,
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
