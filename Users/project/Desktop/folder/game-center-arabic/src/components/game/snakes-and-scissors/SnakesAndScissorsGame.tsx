
'use client';

import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { FinalResultsPhase } from '@/components/game/prison/phases/FinalResultsPhase';
import { LobbyPhase } from '@/components/game/prison/phases/LobbyPhase';
import { MonopolyGame } from '@/components/game/monopoly/MonopolyGame';

interface SnakesAndScissorsGameProps {
    game: Game;
    self: Player;
}

export function SnakesAndScissorsGame({ game, self }: SnakesAndScissorsGameProps) {
    const renderContent = () => {
        switch (game.gameState) {
            case 'lobby':
                return <LobbyPhase game={game} self={self} />;
            case 'movement':
            case 'moving':
            case 'buy_or_pass':
            case 'question':
            case 'pay_rent':
            case 'end_turn':
                return <MonopolyGame game={game} self={self} />;
            case 'final_results':
                return <FinalResultsPhase game={game} self={self} />;
            default:
                return <p>Current game state: {game.gameState}</p>;
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
