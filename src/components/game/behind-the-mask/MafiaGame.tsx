

"use client";

import type { Game, Player, PlayerRole } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { RoleRevealPhase } from './phases/RoleRevealPhase';
import { NightPhase } from './phases/NightPhase';
import { DayPhase } from './phases/DayPhase';
import { VotingPhase } from './phases/VotingPhase';
import { ResultsPhase } from './phases/ResultsPhase';

interface BehindTheMaskGameProps {
    game: Game;
    self: Player;
}

export function BehindTheMaskGame({ game, self }: BehindTheMaskGameProps) {
    const renderContent = () => {
        switch (game.mafiaState?.phase) {
            case 'role_reveal':
                return <RoleRevealPhase game={game} self={self} />;
            case 'night':
                return <NightPhase game={game} self={self} />;
            case 'day':
                 return <DayPhase game={game} self={self} />;
            case 'voting':
                 return <VotingPhase game={game} self={self} />;
             case 'final_results':
                 return <ResultsPhase game={game} self={self} />;
            default:
                return <div>حالة غير معروفة: {game.mafiaState?.phase}</div>;
        }
    };

    return (
        <div className="w-full h-screen flex items-center justify-center relative">
             <AnimatePresence mode="wait">
                <motion.div
                    key={game.mafiaState?.phase}
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
