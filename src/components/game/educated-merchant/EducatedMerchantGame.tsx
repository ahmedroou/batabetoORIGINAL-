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

interface EducatedMerchantGameProps {
  game: Game;
  self: Player;
  // parent is responsible for providing a realtime-updated `game` object
  // these handlers are optional - component will call API routes if not provided
  onRefresh?: () => Promise<void>;
}

// Inner component to hold the main game view and its hooks
const EducatedMerchantGameView = ({ game, self, onRefresh }: EducatedMerchantGameProps) => {
    const es = game.educatedMerchantState!;
    const [loadingAction, setLoadingAction] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const activePlayerId = es.turnOrder?.[es.currentTurnIndex] || "";
    const isMyTurn = activePlayerId === self.id;

    const canRoll = game.gameState === 'rolling' && isMyTurn;
    const showDiceRoll = (game.gameState === 'rolling' || game.gameState === 'movement') && (es.lastDiceRoll != null || canRoll);
    const showPropertyInteraction = game.gameState === 'property_action' && isMyTurn;
    const showQuestion = game.gameState === 'question' && es.currentQuestion;

    const callApi = useCallback(async (path: string, body?: any) => {
        setError(null);
        setLoadingAction(true);
        try {
            const res = await fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || data?.message || 'خطأ في الخادم');
            if (onRefresh) await onRefresh();
            return { ok: true, data };
        } catch (err: any) {
            setError(err.message || String(err));
            return { ok: false, error: err.message || String(err) };
        } finally {
            setLoadingAction(false);
        }
    }, [onRefresh]);

    const handleBuy = useCallback(async (propId?: number) => {
        if (!isMyTurn) return;
        await callApi('/api/game/buy', { gameId: game.id, playerId: self.id });
    }, [callApi, game.id, isMyTurn, self.id]);

    const handleSkip = useCallback(async () => {
        if (!isMyTurn) return;
        await callApi('/api/game/skip', { gameId: game.id, playerId: self.id });
    }, [callApi, game.id, isMyTurn, self.id]);

    useEffect(() => {
        if (game.gameState !== 'question' || !es?.timerEndsAt) return;
        const endsAt = (typeof es.timerEndsAt === 'number') ? es.timerEndsAt : (new Date(es.timerEndsAt as any)).getTime();
        const msLeft = endsAt - Date.now();
        if (msLeft <= 0) {
            (async () => { await callApi('/api/game/resolveExpired', { gameId: game.id }); })();
            return;
        }
        const t = setTimeout(() => { callApi('/api/game/resolveExpired', { gameId: game.id }); }, msLeft + 100);
        return () => clearTimeout(t);
    }, [es?.timerEndsAt, es?.currentQuestion, game.gameState, callApi, game.id]);
    
    const boardProps = useMemo(() => ({
        players: game.players,
        properties: es.board || [],
        className: 'w-full h-full',
    }), [game.players, es.board]);

    return (
        <div className="w-full h-screen flex flex-col md:flex-row p-2 gap-4 bg-gray-50 dark:bg-gray-900">
            <div className="flex-grow flex items-stretch justify-center relative min-h-0">
                <GameBoard {...boardProps} />

                <AnimatePresence>
                    {showDiceRoll && (
                        <motion.div key="dice-roll" className="absolute z-30" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
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
                            <PropertyCard game={game} self={self} onBuy={() => handleBuy()} onSkip={() => handleSkip()} />
                        </motion.div>
                    )}

                    {showQuestion && es.currentQuestion && (
                        <QuestionModal key="question" game={game} self={self} />
                    )}
                </AnimatePresence>

                {error && (
                    <div className="absolute left-4 bottom-4 bg-red-600 text-white px-3 py-2 rounded">{error}</div>
                )}
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
