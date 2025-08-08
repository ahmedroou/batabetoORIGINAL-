

"use client";

import type { Game, Player } from '@/types';
import { GameBoard } from './GameBoard';
import { ActionPanel } from './ActionPanel';

interface MonopolyGameProps {
    game: Game;
    self: Player;
}

export function MonopolyGame({ game, self }: MonopolyGameProps) {
    const isMyTurn = game.snakesAndScissorsState?.turnOrder[game.snakesAndScissorsState.currentTurnIndex] === self.id;

    return (
        <div className="w-full h-screen p-4 flex flex-col md:flex-row gap-4 bg-gray-100 dark:bg-gray-900">
            <div className="flex-grow">
                <GameBoard game={game} self={self} />
            </div>
            <div className="w-full md:w-96 shrink-0">
                <ActionPanel game={game} self={self} isMyTurn={isMyTurn} />
            </div>
        </div>
    );
}
