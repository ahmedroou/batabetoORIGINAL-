
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

const RollingNumber = ({ number }: { number: number }) => {
    return (
        <div className="h-20 overflow-hidden rounded-lg bg-gray-900/50 p-2 border-2 border-primary/30">
            <motion.div
              initial={{ y: 0 }}
              animate={{ y: -(number - 1) * 80 }} 
              transition={{ duration: 0.8, ease: "circOut" }}
              className="font-mono text-6xl font-bold text-yellow-300"
            >
              {[1, 2, 3, 4, 5].map(n => (
                <div key={n} style={{ height: 80 }} className="flex items-center justify-center">
                    {n}
                </div>
              ))}
            </motion.div>
        </div>
    );
};


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
            // The state will update automatically via listener, no need to setIsRolling(false) here
        } catch (error: any) {
            console.error("Error rolling dice:", error);
            setIsRolling(false);
        }
    };

    if (lastRoll) {
        return (
             <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
                <Card className="text-center bg-slate-800 border-primary text-white shadow-lg">
                     <CardHeader className='pb-2'>
                        <CardTitle className="text-primary">نتيجة النرد</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <RollingNumber number={lastRoll} />
                    </CardContent>
                </Card>
            </motion.div>
        )
    }

    return (
        <Card className="text-center bg-slate-800 text-white border-slate-700 shadow-lg">
            <CardHeader>
                <CardTitle>
                    دور {isMyTurn ? "أنت" : game.players.find(p => p.id === currentTurnPlayerId)?.name}
                </CardTitle>
                <CardDescription className="text-slate-400">
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
