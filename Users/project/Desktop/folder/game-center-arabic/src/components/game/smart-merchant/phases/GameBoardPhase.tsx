

'use client';

import type { Game, Player } from '@/types';
import { GameBoard } from './GameBoard';
import { ActionPanel } from './ActionPanel';

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

