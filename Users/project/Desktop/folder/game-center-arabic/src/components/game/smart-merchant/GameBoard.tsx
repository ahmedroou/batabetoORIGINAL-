
'use client';

import type { Game, Player, BoardProperty } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import './GameBoard.css';
import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';

interface GameBoardProps {
    game: Game;
    self: Player;
}

export function GameBoard({ game, self }: GameBoardProps) {
    const board = game.smartMerchantState?.board || [];
    const players = game.players;
    const movement = game.smartMerchantState?.movementState;

    const tilePositions = useMemo(() => {
        return board.map((_, index) => {
            const tileWidthPercentage = 100 / 7;
            let x = 0, y = 0;
            const tileCenterOffset = tileWidthPercentage / 2;

            if (index >= 0 && index < 7) { // Top row
                x = index * tileWidthPercentage + tileCenterOffset;
                y = tileCenterOffset;
            } else if (index >= 7 && index < 12) { // Right col
                x = 100 - tileCenterOffset;
                y = (index - 6) * tileWidthPercentage + tileCenterOffset;
            } else if (index >= 12 && index < 18) { // Bottom row
                x = 100 - ((index - 11) * tileWidthPercentage + tileCenterOffset);
                y = 100 - tileCenterOffset;
            } else { // Left col
                x = tileCenterOffset;
                y = 100 - ((index - 17) * tileWidthPercentage + tileCenterOffset);
            }
            return { x, y };
        });
    }, [board]);

    const boardPositions = useMemo(() => {
        return board.map((tile, index) => {
            const playersOnTile = players.filter(p => p.position === index && p.id !== movement?.playerId);
            const tileWidthPercentage = 100 / 7;

            let positionStyle: React.CSSProperties = {
                width: `${tileWidthPercentage}%`,
                height: `${tileWidthPercentage}%`,
            };

            if (index >= 0 && index < 7) { // Top row
                positionStyle.top = 0;
                positionStyle.left = `${index * tileWidthPercentage}%`;
            } else if (index >= 7 && index < 12) { // Right col
                positionStyle.top = `${(index - 6) * tileWidthPercentage}%`;
                positionStyle.right = 0;
            } else if (index >= 12 && index < 18) { // Bottom row
                positionStyle.bottom = 0;
                positionStyle.right = `${(index - 11) * tileWidthPercentage}%`;
            } else { // Left col
                positionStyle.bottom = `${(index - 17) * tileWidthPercentage}%`;
                positionStyle.left = 0;
            }

            return {
                ...tile,
                playersOnTile,
                positionStyle,
            };
        });
    }, [board, players, movement]);

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
                <AnimatePresence>
                    {players.map((p, i) => {
                         if (p.status === 'bankrupt') return null;
                        const pos = tilePositions[p.position];
                        if (!pos) return null;
                        
                        return (
                            <motion.div
                                key={p.id}
                                layoutId={p.id}
                                initial={{ x: `${tilePositions[0].x}%`, y: `${tilePositions[0].y}%` }}
                                animate={{ x: `${pos.x}%`, y: `${pos.y}%` }}
                                transition={{ type: 'spring', stiffness: 200, damping: 20, delay: i * 0.1 }}
                                style={{
                                    position: 'absolute',
                                    top: '-16px', 
                                    left: '-16px',
                                }}
                                className="z-10"
                            >
                                <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 border-2 border-white rounded-full shadow-lg"/>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
                <div className="board-center">
                    <h2 className="text-2xl font-bold">التاجر الذكي</h2>
                </div>
            </div>
        </div>
    );
}
