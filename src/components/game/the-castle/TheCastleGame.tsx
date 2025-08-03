
"use client";

import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '../PlayerAvatar';
import { CastleBoard } from './CastleBoard';
import { movePlayer, startTheCastleGame, buildWall, endTurn } from '@/lib/actions/the-castle';
import { Swords, Shield, Building, Forward, Hammer, SkipForward, Trophy } from 'lucide-react';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface TheCastleGameProps {
  game: Game;
  self: Player;
}

export function TheCastleGame({ game, self }: TheCastleGameProps) {
    const { toast } = useToast();
    const isHost = game.hostId === self.id;
    const [buildMode, setBuildMode] = useState(false);

    const handleStartGame = async () => {
        if (!isHost) return;
        try {
            await startTheCastleGame(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        }
    };

    const handleTileClick = async (x: number, y: number) => {
        try {
            if (buildMode) {
                await buildWall(game.id, self.id, { x, y });
                setBuildMode(false); // Exit build mode after building
            } else {
                await movePlayer(game.id, self.id, { x, y });
            }
        } catch (error: any) {
             toast({ title: "حركة غير صالحة", description: error.message, variant: "destructive" });
        }
    }
    
    const handleEndTurn = async () => {
        try {
            await endTurn(game.id, self.id);
        } catch (error: any) {
             toast({ title: "خطأ", description: error.message, variant: "destructive" });
        }
    }
    
    if (game.gameState === 'lobby') {
        return (
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>لوبي لعبة القلعة</CardTitle>
                    <CardDescription>في انتظار اللاعبين... يمكن للمضيف بدء اللعبة.</CardDescription>
                </CardHeader>
                <CardFooter>
                    {isHost && (
                        <Button onClick={handleStartGame} className="w-full">
                            بدء اللعبة
                        </Button>
                    )}
                </CardFooter>
            </Card>
        );
    }
    
    const selfState = game.theCastleState?.playersState[self.id];
    const playerOnTurnId = game.theCastleState?.turn;
    const playerOnTurn = game.players.find(p => p.id === playerOnTurnId);
    const isMyTurn = self.id === playerOnTurnId;

    if (game.gameState === 'ended') {
        const winnerColor = game.gameResult?.winner === 'red' ? 'text-red-500' : 'text-blue-500';
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
            >
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <Trophy className="w-20 h-20 mx-auto text-yellow-400"/>
                        <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                        <CardDescription className={`text-2xl font-bold ${winnerColor}`}>
                            {game.gameResult?.message}
                        </CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button onClick={() => window.location.reload()} className="w-full">العب مرة أخرى</Button>
                    </CardFooter>
                </Card>
            </motion.div>
        )
    }


    return (
        <div className="flex flex-col lg:flex-row items-center justify-center gap-6 p-4">
            <CastleBoard game={game} self={self} onTileClick={handleTileClick} buildMode={buildMode} />
            <div className="w-full lg:w-64 flex flex-col gap-4">
                <Card className="w-full">
                    <CardHeader className="text-center p-3">
                        <CardTitle className="flex items-center justify-center gap-2">
                            <Building /> لعبة القلعة
                        </CardTitle>
                         {playerOnTurn && (
                             <CardDescription className="text-lg">
                                الدور على: <span className={playerOnTurn.team === 'red' ? 'text-red-500 font-bold' : 'text-blue-500 font-bold'}>{playerOnTurn.name}</span>
                             </CardDescription>
                         )}
                    </CardHeader>
                    <CardContent className="flex justify-around items-center text-center">
                        <div className="flex flex-col items-center gap-1">
                            <h4 className="font-bold">فريقك</h4>
                            <div className={`w-10 h-10 rounded-full ${self.team === 'red' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                        </div>
                         {selfState && (
                            <div className="flex flex-col items-center gap-1">
                                <h4 className="font-bold">الحركات المتبقية</h4>
                                <p className="text-3xl font-bold font-mono">{selfState.movesLeft}</p>
                            </div>
                         )}
                    </CardContent>
                </Card>
                <AnimatePresence>
                {isMyTurn && (
                    <motion.div 
                        className="w-full flex flex-col gap-2"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                         <h3 className="text-center font-bold">أفعالك</h3>
                         <Button onClick={() => setBuildMode(!buildMode)} variant={buildMode ? "destructive" : "outline"} disabled={selfState?.movesLeft === 0}>
                            <Hammer className="ml-2"/> {buildMode ? "إلغاء وضع البناء" : "بناء جدار (1 حركة)"}
                        </Button>
                         <Button onClick={handleEndTurn} variant="secondary">
                            <SkipForward className="ml-2"/> إنهاء الدور
                        </Button>
                    </motion.div>
                )}
                </AnimatePresence>
            </div>
        </div>
    );
}
