

"use client";

import type { Game, Player } from '@/types';
import { GameBoard } from './GameBoard';
import { ActionPanel } from './ActionPanel';
import { FinalResultsPhase } from './FinalResultsPhase';
import { LobbyPhase } from './LobbyPhase';

interface SmartMerchantGameProps {
    game: Game;
    self: Player;
}

export function SmartMerchantGame({ game, self }: SmartMerchantGameProps) {
    const isMyTurn = game.smartMerchantState?.turnOrder[game.smartMerchantState.currentTurnIndex] === self.id;

    if (game.gameState === 'lobby') {
        return <LobbyPhase game={game} self={self} isHost={game.hostId === self.id} />;
    }
    
    if (game.gameState === 'final_results') {
        return <FinalResultsPhase game={game} self={self} />;
    }

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
