
"use client";

import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '../PlayerAvatar';
import { CastleBoard } from './CastleBoard';
import { movePlayer, startTheCastleGame } from '@/app/actions';
import { Swords, Shield, Building, Forward } from 'lucide-react';

interface TheCastleGameProps {
  game: Game;
  self: Player;
}

export function TheCastleGame({ game, self }: TheCastleGameProps) {
    const { toast } = useToast();
    const isHost = game.hostId === self.id;

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
            await movePlayer(game.id, self.id, { x, y });
        } catch (error: any) {
             toast({ title: "خطأ في الحركة", description: error.message, variant: "destructive" });
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

    return (
        <div className="flex flex-col items-center gap-4">
            <Card className="w-full max-w-3xl">
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
                     <div className="flex flex-col items-center gap-1">
                         <h4 className="font-bold">أدواتك</h4>
                         <div className="flex gap-2">
                             <Button size="icon" variant="outline"><Swords /></Button>
                             <Button size="icon" variant="outline"><Shield /></Button>
                             <Button size="icon" variant="outline"><Forward /></Button>
                         </div>
                     </div>
                </CardContent>
            </Card>

            <CastleBoard game={game} self={self} onTileClick={handleTileClick} />
        </div>
    );
}
