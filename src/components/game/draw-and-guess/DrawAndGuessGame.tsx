"use client";

import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';

// Phase Components
import { LobbyPhase } from './phases/LobbyPhase';
import { CategorySelectionPhase } from './phases/CategorySelectionPhase';
import { DrawingPhase } from './phases/DrawingPhase';
import { GuessingPhase } from './phases/GuessingPhase';
import { RoundResultsPhase } from './phases/RoundResultsPhase';
import { FinalResultsPhase } from './phases/FinalResultsPhase';


interface DrawAndGuessGameProps {
    game: Game;
    self: Player;
}

export function DrawAndGuessGame({ game, self }: DrawAndGuessGameProps) {
    const isHost = game.hostId === self.id;

    const renderContent = () => {
        switch (game.gameState) {
            case 'lobby':
                return <LobbyPhase game={game} self={self} isHost={isHost} />;
            case 'category_selection':
                return <CategorySelectionPhase game={game} self={self} />;
            case 'drawing':
                return <DrawingPhase game={game} self={self} />;
            case 'guessing':
                 return <GuessingPhase game={game} self={self} />;
            case 'round_results':
                return <RoundResultsPhase game={game} self={self} isHost={isHost} />;
            case 'final_results':
                 return <FinalResultsPhase game={game} self={self} />;
            default:
                return (
                    <div className="text-center">
                        <h1 className="text-xl font-bold">حالة لعبة غير معروفة</h1>
                        <p>{game.gameState}</p>
                    </div>
                );
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