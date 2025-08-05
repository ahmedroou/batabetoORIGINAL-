
"use client";

import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { LobbyPhase } from './LobbyPhase';
import { PlayingPhase } from './PlayingPhase';
import { FinalResultsPhase } from './FinalResultsPhase';

interface EftelasGameProps {
    game: Game;
    self: Player;
}

export function EftelasGame({ game, self }: EftelasGameProps) {
    const isHost = game.hostId === self.id;

    const renderContent = () => {
        switch (game.gameState) {
            case 'lobby':
                return <LobbyPhase game={game} self={self} isHost={isHost} />;
            case 'playing':
                 return <PlayingPhase game={game} self={self} />;
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
