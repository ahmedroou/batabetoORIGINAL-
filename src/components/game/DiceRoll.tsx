
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dices, Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { Game, Player } from '@/types';
import { rollDice } from '@/lib/actions/educated-merchant';
import { motion } from 'framer-motion';

// --- Additional imports (allowed additions only) ---
import { useEffect, useRef, useCallback } from 'react';

interface DiceRollProps {
    game: Game;
    self: Player;
}

/**
 * A rolling number visual that animates a column of numbers and lands on the target.
 * - Supports a fallback max of 6 (so a classic d6 will always look correct)
 * - Uses framer-motion for smooth animated sliding
 */
const RollingNumber = ({ number, isAnimating = false }: { number: number; isAnimating?: boolean }) => {
    // ensure we always render at least 6 faces so animation doesn't look odd
    const maxFace = Math.max(6, number);
    const faces = Array.from({ length: maxFace }, (_, i) => i + 1);
    const faceHeight = 80; // px — used consistently in styles and animation math

    return (
        <div
            className="h-20 overflow-hidden rounded-lg bg-gray-900/50 p-2 border-2 border-primary/30"
            role="img"
            aria-label={`نتيجة النرد: ${number}`}
        >
            <motion.div
                initial={{ y: 0 }}
                animate={{ y: -(number - 1) * faceHeight }}
                transition={{ duration: isAnimating ? 0.8 : 0.45, ease: 'circOut' }}
                className="font-mono text-6xl font-bold text-yellow-300"
            >
                {faces.map((n) => (
                    <div key={n} style={{ height: faceHeight }} className="flex items-center justify-center">
                        {n}
                    </div>
                ))}
            </motion.div>
        </div>
    );
};

export function DiceRoll({ game, self }: DiceRollProps) {
    const [isRolling, setIsRolling] = useState(false);
    const [optimisticNumber, setOptimisticNumber] = useState<number | null>(null);
    const rollTimeoutRef = useRef<number | null>(null);
    const historyRef = useRef<number[]>([]);

    const turnOrder = game.educatedMerchantState?.turnOrder || [];
    const currentTurnPlayerId = turnOrder[game.educatedMerchantState?.currentTurnIndex || 0];
    const isMyTurn = self.id === currentTurnPlayerId;
    const lastRoll = game.educatedMerchantState?.lastDiceRoll;

    // When the authoritative lastRoll arrives from the server, clear optimistic number
    useEffect(() => {
        if (typeof lastRoll === 'number') {
            setOptimisticNumber(null);
            // update local history (non-authoritative — UI only)
            historyRef.current = [lastRoll, ...historyRef.current].slice(0, 5);
            // clear any pending timeouts
            if (rollTimeoutRef.current) {
                window.clearTimeout(rollTimeoutRef.current);
                rollTimeoutRef.current = null;
            }
            setIsRolling(false);
        }
    }, [lastRoll]);

    // cleanup on unmount
    useEffect(() => {
        return () => {
            if (rollTimeoutRef.current) window.clearTimeout(rollTimeoutRef.current);
        };
    }, []);

    const handleRoll = useCallback(async () => {
        if (!isMyTurn || isRolling) return;
        setIsRolling(true);

        // generate an optimistic rolling animation number sequence
        const animationLengthMs = 1200; // length of local animation before awaiting server
        const randomIntermediate = Math.floor(Math.random() * 5) + 1; // 1..6
        setOptimisticNumber(randomIntermediate);

        // Keep the animation going locally until server responds (but avoid infinite spin)
        rollTimeoutRef.current = window.setTimeout(() => {
            // after the animation we keep the last optimistic number until server updates
            rollTimeoutRef.current = null;
        }, animationLengthMs + 300);

        try {
            // call the existing game action — we intentionally await it so errors bubble up
            await rollDice(game.id, self.id);

            // Do NOT set lastRoll here — the authoritative value comes from `game` prop.
            // We just keep the rolling animation until the server sends the updated game state.
        } catch (error: any) {
            console.error('Error rolling dice:', error);
            // if server call failed, show an accessible error and let user try again
            // Reset optimistic UI
            setOptimisticNumber(null);
            setIsRolling(false);
            // you can also add a toast or visual error state here in the future
        }
    }, [isMyTurn, isRolling, game.id, self.id]);

    // keyboard accessibility: Enter or Space triggers roll when button focused
    const handleKeyPressOnCard = useCallback(
        (e: React.KeyboardEvent) => {
            if ((e.key === 'Enter' || e.key === ' ') && isMyTurn && !isRolling) {
                e.preventDefault();
                void handleRoll();
            }
        },
        [handleRoll, isMyTurn, isRolling]
    );

    // Decide which number to show: authoritative lastRoll (from game) takes precedence
    const displayedNumber = typeof lastRoll === 'number' ? lastRoll : optimisticNumber;

    // small helper to render a compact history component
    const RollHistory = () => (
        <div className="mt-3 text-sm text-slate-300">
            <div className="font-medium text-slate-100 mb-1">سجل الرميات (محلي):</div>
            <div className="flex gap-2">
                {historyRef.current.length === 0 ? (
                    <div className="text-slate-400">لا يوجد سجل بعد</div>
                ) : (
                    historyRef.current.map((r, idx) => (
                        <div key={idx} className="w-8 h-8 rounded bg-gray-800/60 flex items-center justify-center border border-primary/20">
                            {r}
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    if (typeof displayedNumber === 'number') {
        return (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
                <Card className="text-center bg-slate-800 border-primary text-white shadow-lg" tabIndex={0} onKeyDown={handleKeyPressOnCard} aria-live="polite">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-primary">نتيجة النرد</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <RollingNumber number={displayedNumber} isAnimating={isRolling} />
                        <div className="mt-3 text-slate-300">{isRolling ? 'جارٍ التحقق من الخادم...' : 'نتيجة مؤكدة من الخادم'}</div>
                        <RollHistory />
                    </CardContent>
                </Card>
            </motion.div>
        );
    }

    return (
        <Card className="text-center bg-slate-800 text-white border-slate-700 shadow-lg" tabIndex={0} onKeyDown={handleKeyPressOnCard} aria-live="polite">
            <CardHeader>
                <CardTitle>
                    دور {isMyTurn ? 'أنت' : game.players.find((p) => p.id === currentTurnPlayerId)?.name}
                </CardTitle>
                <CardDescription className="text-slate-400">
                    {isMyTurn ? 'اضغط لرمي النرد! (أو اضغط Enter)' : 'في انتظار اللاعب لرمي النرد.'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {/* decorative dice icon */}
                <Dices className="w-24 h-24 mx-auto text-primary" aria-hidden />
            </CardContent>
            <CardContent>
                <Button
                    onClick={handleRoll}
                    disabled={!isMyTurn || isRolling}
                    className="w-full"
                    size="lg"
                    aria-disabled={!isMyTurn || isRolling}
                    aria-label={isMyTurn ? (isRolling ? 'جارٍ رمي النرد' : 'ارمِ النرد') : 'ليس دورك'}
                >
                    {isRolling ? <Loader2 className="animate-spin" /> : 'ارمِ النرد'}
                </Button>

                {/* helpful hint about optimistic animation */}
                <div className="mt-2 text-xs text-slate-400">يتم تشغيل رسم متحرك محلي أثناء انتظار نتيجة الخادم.</div>
            </CardContent>
        </Card>
    );
}
