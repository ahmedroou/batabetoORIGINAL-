
"use client";

import React from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy } from 'lucide-react';

interface FinalResultsPhaseProps {
    game: Game;
    handleLeaveGame: () => void;
}

export function FinalResultsPhase({ game, handleLeaveGame }: FinalResultsPhaseProps) {
    const { winner, message } = game.gameResult || {};

    const winnerText = winner === 'good' ? "فريق الخير" : "المافيا";

    return (
        <Card className="w-full max-w-md text-center">
            <CardHeader>
                <Trophy className="w-24 h-24 mx-auto text-yellow-400" />
                <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                <CardDescription className="text-2xl font-bold mt-2">
                    الفائز هو: {winnerText}!
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-lg text-muted-foreground">{message}</p>
            </CardContent>
            <CardFooter>
                <Button onClick={handleLeaveGame} className="w-full">
                    العودة إلى اللوبي
                </Button>
            </CardFooter>
        </Card>
    );
}
