
'use client';

import type { Game, Player, BoardProperty } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';
import { ActionPanel } from './ActionPanel';


const GameBoardCSS = `
.game-board-container {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.game-board {
    position: relative;
    width: 90vmin;
    height: 90vmin;
    max-width: 700px;
    max-height: 700px;
    background-color: #c8e6c9;
    border: 5px solid #388e3c;
    border-radius: 1rem;
}

.board-tile {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid #999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.tile-content {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 2px;
    text-align: center;
}

.tile-name {
    font-size: 0.6em;
    font-weight: bold;
}

.tile-price {
    font-size: 0.7em;
    font-weight: bold;
    color: #333;
}

.player-tokens {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 2px;
}

.board-center {
    position: absolute;
    top: 14.28%; /* 100 / 7 */
    left: 14.28%;
    width: 71.44%; /* 100 - (2 * 14.28) */
    height: 71.44%;
    background-color: #a5d6a7;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #66bb6a;
    border-radius: 0.5rem;
}
`;


function GameBoard({ game, self }: { game: Game; self: Player; }) {
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
             <style>{GameBoardCSS}</style>
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


interface GameBoardPhaseProps {
    game: Game;
    self: Player;
}

export function GameBoardPhase({ game, self }: GameBoardPhaseProps) {
    const isMyTurn = game.smartMerchantState?.turnOrder[game.smartMerchantState.currentTurnIndex] === self.id;

    return (
        <div className="w-full h-screen p-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-100 dark:bg-gray-900">
            <div className="md:col-span-2 flex items-center justify-center">
                <GameBoard game={game} self={self} />
            </div>
            <div className="md:col-span-1">
                <ActionPanel game={game} self={self} isMyTurn={isMyTurn} />
            </div>
        </div>
    );
}
