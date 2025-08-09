

"use client";

import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';

// Import Phase Components
import { LobbyPhase } from './phases/LobbyPhase';
import { GameBoardPhase } from './phases/GameBoardPhase';
import { FinalResultsPhase } from './phases/FinalResultsPhase';

interface SmartMerchantGameProps {
    game: Game;
    self: Player;
}

export function SmartMerchantGame({ game, self }: SmartMerchantGameProps) {
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
                 return <GameBoardPhase game={game} self={self} />;
            case 'final_results':
                return <FinalResultsPhase game={game} self={self} />;
            default:
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
