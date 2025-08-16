"use client";

import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { LobbyPhase } from './phases/LobbyPhase';
import { RoleRevealPhase } from './phases/RoleRevealPhase';
import { NightPhase } from './phases/NightPhase';
import { DayPhaseAlt } from './phases/DayPhaseAlt';
import { ResultsPhase } from './phases/ResultsPhase';
import { ExecutionAnimationOverlay } from './ExecutionAnimationOverlay';
import { useEffect, useMemo, useRef, useState } from 'react';
import { transitionToNight } from '@/lib/actions/behind-the-mask';
import { Card, CardContent } from '@/components/ui/card';

interface BehindTheMaskGameProps {
    game: Game;
    self: Player;
}

export function BehindTheMaskGame({ game, self }: BehindTheMaskGameProps) {
    const [showExecution, setShowExecution] = useState(false);
    const [executedPlayerData, setExecutedPlayerData] = useState<{ name: string; avatarId: string; temporaryTitle?: string } | null>(null);

    const phase = game.mafiaState?.phase;
    const isHost = game.hostId === self.id;
    const transitionOnce = useRef(false);

    // Stable key for nice cross-fade between phases
    const phaseKey = useMemo(() => `${game.id}-${phase || game.gameState}`,[game.id, phase, game.gameState]);

    useEffect(() => {
        if (phase === 'execution') {
            setExecutedPlayerData(game.mafiaState?.lastExecutedPlayer ?? null);
            setShowExecution(true);
            // allow next transition when entering execution again
            transitionOnce.current = false;
        } else {
            setShowExecution(false);
        }
    }, [phase, game.mafiaState?.lastExecutedPlayer]);

    const handleAnimationEnd = async () => {
        setShowExecution(false);
        // prevent race if phase already advanced by server
        if (phase !== 'execution') return;
        if (!isHost) return;
        if (transitionOnce.current) return;
        transitionOnce.current = true;
        try {
            await transitionToNight(game.id, self.id);
        } catch (e) {
            // avoid loops; server/state sync will correct view
            transitionOnce.current = true;
            // console.error('Failed to transition to night after execution', e);
        }
    };

    const renderContent = () => {
        if (!game.mafiaState) {
            return (
                <Card className="text-center p-8">
                    <CardContent>
                        <h2 className="text-2xl font-bold animate-pulse">...جاري التحميل</h2>
                    </CardContent>
                </Card>
            );
        }

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

        switch (phase) {
            case 'role_reveal':
                return <RoleRevealPhase game={game} self={self} />;
            case 'night':
                return <NightPhase game={game} self={self} />;
            case 'day':
                return <DayPhaseAlt game={game} self={self} />;
            case 'final_results':
                return <ResultsPhase game={game} self={self} />;
            case 'execution':
                return (
                    <Card className="text-center p-8 bg-gray-900/80 text-white border-slate-700">
                        <CardContent>
                            <h2 className="text-2xl font-bold animate-pulse">يتم تنفيذ الحكم...</h2>
                            {!isHost && <p className="opacity-70 mt-2">في انتظار المضيف للانتقال إلى الليل.</p>}
                        </CardContent>
                    </Card>
                );
            default:
                return (
                    <Card className="text-center p-8">
                        <CardContent>
                            <h2 className="text-2xl font-bold">حالة غير معروفة</h2>
                            <p className="text-muted-foreground mt-2">{String(phase || game.gameState)}</p>
                        </CardContent>
                    </Card>
                );
        }
    };

    return (
        <div className="w-full h-screen flex items-center justify-center relative">
            <AnimatePresence mode="wait">
                <motion.div
                    key={phaseKey}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.35 }}
                    className="w-full h-full flex items-center justify-center"
                >
                    {renderContent()}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
