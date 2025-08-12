// .
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Game, Player } from "@/types";
import { GameBoard } from "./GameBoard";
import { PlayerHUD } from "./PlayerHUD";
import { DiceRoll } from "./DiceRoll";
import { PropertyCard } from "./PropertyCard";
import { QuestionModal } from "./QuestionModal";
import { FinalResults } from "./FinalResults";
import { Lobby } from "./Lobby";
import { motion, AnimatePresence } from "framer-motion";
import { resolveExpiredQuestion } from '@/lib/actions/educated-merchant';

interface EducatedMerchantGameProps {
  game: Game;
  self: Player;
  // parent is responsible for providing a realtime-updated `game` object
  // these handlers are optional - component will call API routes if not provided
  onRefresh?: () => Promise<void>;
}

// Inner component to hold the main game view and its hooks
const EducatedMerchantGameView = ({ game, self }: EducatedMerchantGameProps) => {
    const es = game.educatedMerchantState!;

    const activePlayerId = es.turnOrder?.[es.currentTurnIndex] || "";
    const isMyTurn = activePlayerId === self.id;

    const canRoll = game.gameState === 'rolling' && isMyTurn;
    const showDiceRoll = (game.gameState === 'rolling' || game.gameState === 'movement') && (es.lastDiceRoll != null || canRoll);
    const showPropertyInteraction = game.gameState === 'property_action' && isMyTurn;
    const showQuestion = game.gameState === 'question' && es.currentQuestion;

    useEffect(() => {
        if (game.gameState !== 'question' || !es?.timerEndsAt) return;
        
        const endsAt = (typeof es.timerEndsAt === 'number') ? es.timerEndsAt : new Date((es.timerEndsAt as any)?.toDate() || es.timerEndsAt).getTime();
        
        const msLeft = endsAt - Date.now();
        if (msLeft <= 0) {
            (async () => { await resolveExpiredQuestion(game.id); })();
            return;
        }
        const t = setTimeout(() => { resolveExpiredQuestion(game.id); }, msLeft + 100);
        return () => clearTimeout(t);
    }, [es?.timerEndsAt, es?.currentQuestion, game.gameState, game.id]);
    
    const boardProps = useMemo(() => ({
        players: game.players,
        properties: es.board || [],
        className: 'w-full h-full',
        round: game.round,
        maxRounds: es.settings?.maxRounds,
        turnOrder: es.turnOrder,
        currentPlayerId: activePlayerId,
    }), [game.players, es.board, game.round, es.settings, es.turnOrder, activePlayerId]);

    return (
        <div className="w-full h-screen flex flex-col md:flex-row p-2 gap-4 bg-gray-50 dark:bg-gray-900">
            <div className="flex-grow flex items-stretch justify-center relative min-h-0">
                <GameBoard {...boardProps} />

                <AnimatePresence>
                    {showDiceRoll && (
                        <motion.div key="dice-roll" className="absolute inset-0 z-30 flex items-center justify-center" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
                            <DiceRoll
                                gameId={game.id}
                                selfId={self.id}
                                isMyTurnToRoll={canRoll}
                                diceResult={es.lastDiceRoll ?? null}
                            />
                        </motion.div>
                    )}

                    {showPropertyInteraction && (
                        <motion.div key="property-card" className="absolute z-40" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
                            <PropertyCard game={game} self={self} />
                        </motion.div>
                    )}

                    {showQuestion && es.currentQuestion && (
                        <QuestionModal key="question" game={game} self={self} />
                    )}
                </AnimatePresence>
            </div>

            <div className="w-full md:w-[360px] shrink-0">
                <PlayerHUD players={game.players} balances={game.playerScores || {}} board={es.board || []} currentTurnPlayerId={activePlayerId} activityLog={es.activityLog || []} />
            </div>
        </div>
    );
}

export function EducatedMerchantGame({ game, self, onRefresh }: EducatedMerchantGameProps) {
    const es = game.educatedMerchantState;

    // Render based on game state, ensuring hooks are not called conditionally.
    if (!es || !es.board?.length || game.gameState === "lobby") {
        return <Lobby game={game} self={self} />;
    }

    if (game.gameState === "final_results") {
        return <FinalResults game={game} />;
    }

    // Pass props to the main game view which contains all the hooks.
    return <EducatedMerchantGameView game={game} self={self} onRefresh={onRefresh} />;
}
