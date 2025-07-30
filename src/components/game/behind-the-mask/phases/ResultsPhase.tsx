
"use client";

import type { Game, Player } from '@/types';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Trophy } from 'lucide-react';

interface ResultsPhaseProps {
    game: Game;
    self: Player;
}

export function ResultsPhase({ game, self }: ResultsPhaseProps) {
    const router = useRouter();
    const gameResult = game.gameResult;

    if (!gameResult) {
        return <div>جاري تحميل النتائج...</div>;
    }

    return (
        <div className="w-full max-w-lg text-center p-8 bg-white rounded-lg shadow-2xl">
            <Trophy className="w-24 h-24 text-yellow-400 mx-auto mb-4" />
            <h1 className="text-4xl font-bold">انتهت اللعبة!</h1>
            <h2 className="text-2xl font-semibold mt-2">
                {gameResult.message}
            </h2>
            <p className="text-xl mt-4">
                الفائز هو: <span className="font-bold text-primary">{gameResult.winner === 'good' ? 'فريق الخير' : 'فريق الشر'}</span>
            </p>
            <Button onClick={() => router.push('/')} className="mt-8">
                العب مرة أخرى
            </Button>
        </div>
    );
}
