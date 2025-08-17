
'use client';

import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { LobbyPhase } from './phases/LobbyPhase';
import { DrawingPhase } from './phases/DrawingPhase';
import { TrappingPhase } from './phases/TrappingPhase';

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
                 return <div>Guessing Phase (To be implemented)</div>;
            case 'results':
                 return <div>Results Phase (To be implemented)</div>;
            case 'final_results':
                 return <div>Final Results Phase (To be implemented)</div>;
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
