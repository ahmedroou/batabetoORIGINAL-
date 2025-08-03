
"use client";

import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '../PlayerAvatar';
import { CastleBoard } from './CastleBoard';
import { movePlayer, startTheCastleGame, buildWall, endTurn, placeTrap, placeBomb } from '@/lib/actions/the-castle';
import { Swords, Shield, Building, Forward, Hammer, SkipForward, Trophy, Users, Clock, Loader2, VenetianMask, BombIcon, LocateFixed } from 'lucide-react';
import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';


const TeamCard = ({ title, players, team, turn, selfId }: { title: string, players: Player[], team: 'red' | 'blue', turn: string, selfId: string }) => {
    const isTurn = players.some(p => p.id === turn);
    const bgColor = team === 'red' ? 'bg-red-900/50 border-red-500/50' : 'bg-blue-900/50 border-blue-500/50';
    const textColor = team === 'red' ? 'text-red-300' : 'text-blue-300';
    const roleText = team === 'red' ? 'الدفاع' : 'الهجوم';

    return (
        <Card className={cn("transition-all duration-500", bgColor, isTurn ? 'shadow-2xl shadow-primary/40 ring-2 ring-primary' : '')}>
            <CardHeader className="p-3 text-center">
                <CardTitle className={cn("text-center text-xl", textColor)}>{title}</CardTitle>
                <CardDescription className={cn("font-bold", textColor)}>{roleText}</CardDescription>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
                {players.map(p => {
                    const isPlayerTurn = p.id === turn;
                    const isSelf = p.id === selfId;
                    return (
                        <div key={p.id} className={cn("p-2 rounded-md bg-black/30 flex items-center gap-2", isPlayerTurn && 'ring-2 ring-yellow-400')}>
                           <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" />
                           <p className="font-bold text-white">{p.name} {isSelf && '(أنت)'}</p>
                        </div>
                    )
                })}
            </CardContent>
        </Card>
    )
}


interface TheCastleGameProps {
  game: Game;
  self: Player;
}

export function TheCastleGame({ game, self }: TheCastleGameProps) {
    const { toast } = useToast();
    const isHost = game.hostId === self.id;
    const [buildMode, setBuildMode] = useState<'wall' | 'trap' | 'bomb' | 'long_range_wall' | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAction = async (action: () => Promise<any>, options?: { loadingMessage?: string; errorMessage?: string; }) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await action();
        } catch (error: any) {
            toast({ title: options?.errorMessage || "حركة غير صالحة", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleTileClick = (x: number, y: number) => {
        if (buildMode === 'wall') {
            handleAction(() => buildWall(game.id, self.id, { x, y }), { errorMessage: "لا يمكن البناء هنا" });
        } else if (buildMode === 'long_range_wall') {
            handleAction(() => buildWall(game.id, self.id, { x, y }, true), { errorMessage: "لا يمكن البناء هنا" });
        } else if (buildMode === 'trap') {
            handleAction(() => placeTrap(game.id, self.id, { x, y }), { errorMessage: "لا يمكن وضع الفخ هنا" });
        } else if (buildMode === 'bomb') {
            handleAction(() => placeBomb(game.id, self.id, { x, y }), { errorMessage: "لا يمكن زرع القنبلة هنا" });
        } else {
            handleAction(() => movePlayer(game.id, self.id, { x, y }));
        }
        setBuildMode(null); // Exit build mode after action
    }
    
    const handleEndTurn = () => handleAction(() => endTurn(game.id, self.id));
    const handleStartGame = () => handleAction(() => startTheCastleGame(game.id, self.id), { errorMessage: "فشل بدء اللعبة" });

    if (game.gameState === 'lobby') {
        return (
            <Card className="w-full max-w-md animate-bounce-in">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">لوبي لعبة القلعة</CardTitle>
                    <CardDescription>في انتظار اللاعبين... يمكن للمضيف بدء اللعبة.</CardDescription>
                </CardHeader>
                 <CardContent>
                    <div className="flex justify-center flex-wrap gap-4">
                        {game.players.map(p => (
                            <div key={p.id} className="flex flex-col items-center gap-1">
                                <PlayerAvatar avatarId={p.avatarId} className="w-16 h-16"/>
                                <span className="font-bold">{p.name}</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
                <CardFooter>
                    {isHost && (
                        <Button onClick={handleStartGame} className="w-full" disabled={isSubmitting || game.players.length < 2}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : (game.players.length < 2 ? 'تحتاج لاعبين على الأقل' : 'بدء اللعبة')}
                        </Button>
                    )}
                </CardFooter>
            </Card>
        );
    }
    
    const selfState = game.theCastleState?.playersState[self.id];
    const playerOnTurnId = game.theCastleState?.turn;
    const isMyTurn = self.id === playerOnTurnId;

    if (game.gameState === 'ended') {
        const winnerColor = game.gameResult?.winner === 'red' ? 'text-red-500' : 'text-blue-500';
        return (
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
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

    const teamRed = game.players.filter(p => p.team === 'red');
    const teamBlue = game.players.filter(p => p.team === 'blue');

    return (
        <div className="flex flex-col xl:flex-row items-center justify-center gap-4 p-4 w-full h-full">
            <TeamCard team="blue" players={teamBlue} turn={playerOnTurnId || ''} selfId={self.id} />
            
            <div className="flex flex-col items-center gap-4 w-full xl:w-auto">
                <Card className="p-2 bg-gray-900/50 border-gray-700 text-white text-center">
                    <div className="flex items-center gap-4">
                        {isMyTurn && selfState && (
                            <div className="flex flex-col items-center px-4">
                                <h4 className="font-bold text-sm">حركاتك</h4>
                                <p className="text-3xl font-bold font-mono text-yellow-300">{selfState.movesLeft}</p>
                            </div>
                        )}
                         <div className="flex flex-col items-center px-4">
                            <h4 className="font-bold text-sm text-primary">الدور على</h4>
                            <p className="text-lg font-bold">{game.players.find(p=>p.id === playerOnTurnId)?.name}</p>
                         </div>
                    </div>
                </Card>
                <CastleBoard game={game} self={self} onTileClick={handleTileClick} buildMode={buildMode} />
                <AnimatePresence>
                {isMyTurn && (
                    <motion.div 
                        className="w-full flex justify-center flex-wrap gap-2"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                         <Button onClick={() => setBuildMode(prev => prev === 'wall' ? null : 'wall')} variant={buildMode === 'wall' ? "destructive" : "outline"} disabled={isSubmitting || !selfState || selfState.movesLeft < 1}>
                            <Hammer className="ml-2"/> بناء جدار (1)
                        </Button>
                         <Button onClick={() => setBuildMode(prev => prev === 'trap' ? null : 'trap')} variant={buildMode === 'trap' ? "destructive" : "outline"} disabled={isSubmitting || !selfState || selfState.movesLeft < 1 || (selfState.trapsLeft || 0) < 1}>
                             <VenetianMask className="ml-2"/> نصب فخ (1)
                         </Button>
                         <Button onClick={() => setBuildMode(prev => prev === 'bomb' ? null : 'bomb')} variant={buildMode === 'bomb' ? "destructive" : "outline"} disabled={isSubmitting || !selfState || selfState.movesLeft < 2}>
                            <BombIcon className="ml-2"/> زرع قنبلة (2)
                         </Button>
                          <Button onClick={() => setBuildMode(prev => prev === 'long_range_wall' ? null : 'long_range_wall')} variant={buildMode === 'long_range_wall' ? "destructive" : "outline"} disabled={isSubmitting || !selfState || selfState.movesLeft < 3}>
                            <LocateFixed className="ml-2" /> جدار بعيد (3)
                         </Button>
                         <Button onClick={handleEndTurn} variant="secondary" disabled={isSubmitting}>
                            <SkipForward className="ml-2"/> إنهاء الدور
                        </Button>
                    </motion.div>
                )}
                </AnimatePresence>
            </div>
            
             <TeamCard team="red" players={teamRed} turn={playerOnTurnId || ''} selfId={self.id} />
        </div>
    );
}
