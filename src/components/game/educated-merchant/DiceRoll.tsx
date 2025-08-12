
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dices, Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { Game, Player } from '@/types';
import { rollDice } from '@/lib/actions/educated-merchant';
import { motion } from 'framer-motion';


interface DiceRollProps {
    game: Game;
    self: Player;
}

export function DiceRoll({ game, self }: DiceRollProps) {
    const [isRolling, setIsRolling] = useState(false);
    
    const turnOrder = game.educatedMerchantState?.turnOrder || [];
    const currentTurnPlayerId = turnOrder[game.educatedMerchantState?.currentTurnIndex || 0];
    const isMyTurn = self.id === currentTurnPlayerId;
    const lastRoll = game.educatedMerchantState?.lastDiceRoll;

    const handleRoll = async () => {
        setIsRolling(true);
        try {
            await rollDice(game.id, self.id);
        } catch (error: any) {
            console.error("Error rolling dice:", error);
            // The isRolling state will be reset by the game state change,
            // but we can set it back here as a fallback in case of an error that doesn't change state.
            setIsRolling(false);
        }
    };

    if (lastRoll) {
        return (
             <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
                <Card className="text-center bg-slate-800 border-primary text-white">
                     <CardHeader>
                        <CardTitle>نتيجة النرد</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <div className="text-7xl font-bold text-yellow-400">
                           {lastRoll}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        )
    }

    return (
        <Card className="text-center">
            <CardHeader>
                <CardTitle>
                    دور {isMyTurn ? "أنت" : game.players.find(p => p.id === currentTurnPlayerId)?.name}
                </CardTitle>
                <CardDescription>
                    {isMyTurn ? "اضغط لرمي النرد!" : "في انتظار اللاعب لرمي النرد."}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Dices className="w-24 h-24 mx-auto text-primary" />
            </CardContent>
            <CardContent>
                <Button onClick={handleRoll} disabled={!isMyTurn || isRolling} className="w-full" size="lg">
                    {isRolling ? <Loader2 className="animate-spin" /> : "ارمِ النرد"}
                </Button>
            </CardContent>
        </Card>
    );
}
