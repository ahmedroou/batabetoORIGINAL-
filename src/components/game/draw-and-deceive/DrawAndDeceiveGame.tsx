
'use client';

import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { LobbyPhase } from './phases/LobbyPhase';
import { DrawingPhase } from './phases/DrawingPhase';
import { TrappingPhase } from './phases/TrappingPhase';
import { GuessingPhase } from './phases/GuessingPhase';
import { ResultsPhase } from './phases/ResultsPhase';
import { FinalResultsPhase } from './phases/FinalResultsPhase';

interface DrawAndDeceiveGameProps {
    game: Game;
    self: Player;
}

export function DrawAndDeceiveGame({ game, self }: DrawAndDeceiveGameProps) {
    const isHost = game.hostId === self.id;
    const phase = game.drawAndDeceiveState?.phase ?? 'lobby';

    const renderContent = () => {
        switch (phase) {
            case 'lobby':
                return <LobbyPhase game={game} self={self} />;
            case 'drawing':
                return <DrawingPhase game={game} self={self} />;
            case 'trapping':
                 return <TrappingPhase game={game} self={self} />;
            case 'guessing':
                 return <GuessingPhase game={game} self={self} />;
            case 'results':
                 return <ResultsPhase game={game} self={self} />;
            case 'final_results':
                 return <FinalResultsPhase game={game} self={self} />;
            default:
                return <div>Unknown phase: {phase}</div>;
        }
    };

    return (
        <div className="w-full h-screen flex items-center justify-center relative bg-gray-100 dark:bg-gray-900">
             <AnimatePresence mode="wait">
                <motion.div
                    key={phase}
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
