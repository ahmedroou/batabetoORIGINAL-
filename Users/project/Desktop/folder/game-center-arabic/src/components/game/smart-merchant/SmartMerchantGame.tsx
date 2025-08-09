
"use client";

import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';

// Import Phase Components
import { LobbyPhase } from './LobbyPhase';
import { GameBoard } from './GameBoard';
import { ActionPanel } from './ActionPanel';
import { FinalResultsPhase } from './FinalResultsPhase';

interface SmartMerchantGameProps {
    game: Game;
    self: Player;
}

export function SmartMerchantGame({ game, self }: SmartMerchantGameProps) {
    const isMyTurn = game.smartMerchantState?.turnOrder[game.smartMerchantState.currentTurnIndex] === self.id;

    const renderContent = () => {
        switch (game.gameState) {
            case 'lobby':
                return <LobbyPhase game={game} self={self} />;
            case 'roll':
            case 'moving':
            case 'buy_or_pass':
            case 'question':
            case 'pay_rent':
            case 'end_turn':
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
            case 'final_results':
                return <FinalResultsPhase game={game} self={self} />;
            default:
                // To handle cases where gameState might not be a valid SmartMerchantGameState
                return <div>حالة غير معروفة: {game.gameState}</div>;
        }
    };

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={game.gameState}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4 }}
                className="w-full h-full flex items-center justify-center"
            >
                {renderContent()}
            </motion.div>
        </AnimatePresence>
    );
}
