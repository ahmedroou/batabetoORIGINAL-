
"use client";

import type { Game, Player, PlayerRole } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { LobbyPhase } from './phases/LobbyPhase';
import { RoleRevealPhase } from './phases/RoleRevealPhase';
import { NightPhase } from './phases/NightPhase';
import { DayPhaseAlt } from './phases/DayPhaseAlt';
import { ResultsPhase } from './phases/ResultsPhase';
import { ExecutionAnimationOverlay } from './ExecutionAnimationOverlay';
import { useState, useEffect } from 'react';
import { transitionToNight } from '@/lib/actions/behind-the-mask';
import { Card, CardContent } from '@/components/ui/card';

interface BehindTheMaskGameProps {
    game: Game;
    self: Player;
}

export function BehindTheMaskGame({ game, self }: BehindTheMaskGameProps) {
    const [showExecution, setShowExecution] = useState(false);
    const [executedPlayerData, setExecutedPlayerData] = useState<{ name: string; avatarId: string; temporaryTitle?: string; } | null>(null);

    useEffect(() => {
        const lastExecuted = game.mafiaState?.lastExecutedPlayer;
        if (game.mafiaState?.phase === 'execution') {
            setExecutedPlayerData(lastExecuted || null); // Can be null if no one was executed
            setShowExecution(true);
        } else {
            setShowExecution(false);
        }
    }, [game.mafiaState?.phase, game.mafiaState?.lastExecutedPlayer]);

    const handleAnimationEnd = () => {
        setShowExecution(false);
        // Host triggers the transition to the next phase after animation
        if (game.hostId === self.id) {
            transitionToNight(game.id, self.id);
        }
    };

    const renderContent = () => {
        if (showExecution) {
             return (
                <ExecutionAnimationOverlay
                    player={executedPlayerData}
                    onAnimationEnd={handleAnimationEnd}
                />
             );
        }

        if (game.gameState === 'lobby') {
            return <LobbyPhase game={game} self={self} />;
        }

        // Fallback to mafiaState phase for backward compatibility or complex states
        switch (game.mafiaState?.phase) {
            case 'role_reveal':
                return <RoleRevealPhase game={game} self={self} />;
            case 'night':
                return <NightPhase game={game} self={self} />;
            case 'day':
                return <DayPhaseAlt game={game} self={self} />;
            case 'final_results':
                return <ResultsPhase game={game} self={self} />;
            case 'execution': // While animation is not showing, show waiting screen
                return (
                    <Card className="text-center p-8 bg-gray-900/80 text-white border-slate-700">
                        <CardContent>
                            <h2 className="text-2xl font-bold animate-pulse">في انتظار بدء الليلة التالية...</h2>
                        </CardContent>
                    </Card>
                );
            default:
                return <div>حالة غير معروفة: {game.mafiaState?.phase || game.gameState}</div>;
        }
    };

    return (
        <div className="w-full h-screen flex items-center justify-center relative">
             <AnimatePresence mode="wait">
                <motion.div
                    key={game.mafiaState?.phase || game.gameState}
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
