
"use client";

import { useState, useEffect, useRef } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { Gavel } from 'lucide-react';
import * as prisonActions from '@/lib/actions/prison';

const InstructionsCountdown = ({ isHost, gameId, selfId }: { isHost: boolean; gameId: string; selfId: string }) => {
    const [countdown, setCountdown] = useState(7);
    const actionCalled = useRef(false);

    useEffect(() => {
        if (countdown <= 0 && isHost && !actionCalled.current) {
            actionCalled.current = true;
            prisonActions.proceedFromInstructions(gameId, selfId);
        }
    }, [countdown, isHost, gameId, selfId]);

    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown(prev => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
         <div className="relative w-32 h-32 mx-auto mt-4">
            <motion.div
                initial={{ pathLength: 1 }}
                animate={{ pathLength: 0 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0"
            >
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="45" stroke="hsl(var(--muted))" strokeWidth="10" fill="transparent" />
                    <motion.circle cx="50" cy="50" r="45" stroke="hsl(var(--primary))" strokeWidth="10" fill="transparent"
                        strokeDasharray="282.74"
                        initial={{ pathLength: 1 }}
                        animate={{ pathLength: 0 }}
                        transition={{ duration: 7, ease: "linear" }}
                    />
                </svg>
            </motion.div>
            <div className="absolute inset-0 flex items-center justify-center text-5xl font-bold font-mono text-foreground">
                {countdown}
            </div>
        </div>
    );
};

interface InstructionsPhaseProps {
    game: Game;
    self: Player;
    isHost: boolean;
}

export function InstructionsPhase({ game, self, isHost }: InstructionsPhaseProps) {
    const rules = [
        { title: "المزاد المفتوح", description: "اكتب أكبر عدد ممكن من الإجابات الصحيحة. الفائز هو صاحب أكثر الإجابات، والخاسر هو صاحب أقل عدد." },
        { title: "المزاد المغلق", description: "زايد بعدد الإجابات التي يمكنك تقديمها. الفائز بالمزاد يجب أن يقدم إجاباته، وإذا فشل، يدخل السجن." },
        { title: "السجن", description: "البقاء في السجن يخصم منك النقاط. الفشل في المزاد وأنت في السجن يعني عقوبة مضاعفة." }
    ];

    return (
        <Card className="w-full max-w-lg animate-pop-in bg-gray-900 text-white border-gray-700 shadow-2xl shadow-primary/20">
            <CardHeader className="text-center">
                <Gavel className="w-20 h-20 text-primary mx-auto animate-pulse" />
                <CardTitle className="text-4xl font-extrabold mt-2">مرحباً بكم في السجن!</CardTitle>
                <CardDescription className="text-base text-gray-300">استعدوا للمزايدة والمحاكمة... ستبدأ اللعبة بعد قليل.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {rules.map((rule, index) => (
                    <motion.div
                        key={index}
                        className="p-3 bg-gray-800/70 rounded-lg border border-gray-600"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.2, duration: 0.5 }}
                    >
                        <h3 className="font-bold text-lg text-primary">{rule.title}</h3>
                        <p className="text-sm text-gray-400">{rule.description}</p>
                    </motion.div>
                ))}
                <InstructionsCountdown isHost={isHost} gameId={game.id} selfId={self.id} />
            </CardContent>
        </Card>
    );
}
