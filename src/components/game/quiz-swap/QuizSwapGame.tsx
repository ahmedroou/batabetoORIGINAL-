
'use client';

import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { QuizSwapLobby } from './Lobby';
import { QuizSwapBoard } from './GameBoard';
import { FinalResults } from './FinalResults';

interface QuizSwapGameProps {
    game: Game;
    self: Player;
}

export function QuizSwapGame({ game, self }: QuizSwapGameProps) {
    const renderContent = () => {
        switch (game.gameState) {
            case 'lobby':
                return <QuizSwapLobby game={game} self={self} />;
            case 'peek':
            case 'playing':
                return <QuizSwapBoard game={game} self={self} />;
            case 'final_results':
                 return <FinalResults game={game} self={self} />;
            default:
                return (
                    <div>
                        <h1>Unknown Game State</h1>
                        <p>Current state: {game.gameState}</p>
                    </div>
                );
        }
    };

    return (
        <div className="w-full h-screen flex items-center justify-center relative bg-gray-100 dark:bg-gray-900">
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
        </div>
    );
}
