
"use client";

import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '../PlayerAvatar';
import { CastleBoard } from './CastleBoard';
import { movePlayer, startTheCastleGame, buildWall, endTurn, placeTrap, placeBomb } from '@/lib/actions/the-castle';
import { Swords, Shield, Building, Forward, Hammer, SkipForward, Trophy, Users, Clock, Loader2, VenetianMask, BombIcon, LocateFixed, KeyRound } from 'lucide-react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import React from 'react';

const CountdownTimer = ({ expiryTimestamp, onExpire }: { expiryTimestamp: number; onExpire: () => void }) => {
    const calculateTimeLeft = React.useCallback(() => Math.round(Math.max(0, expiryTimestamp - Date.now()) / 1000), [expiryTimestamp]);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    
    const onExpireRef = React.useRef(onExpire);
    onExpireRef.current = onExpire;

    useEffect(() => {
        if (!expiryTimestamp) return;

        const timer = setInterval(() => {
            const remaining = calculateTimeLeft();
            setTimeLeft(remaining);
            if (remaining <= 0) {
                clearInterval(timer);
                onExpireRef.current();
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [expiryTimestamp, calculateTimeLeft]);

    if (!expiryTimestamp || timeLeft <= 0) return null;

    const isLowTime = timeLeft <= 10;

    return (
        <div className={cn("flex items-center gap-2 p-2 rounded-full transition-all duration-300", 
            isLowTime ? 'bg-red-500 text-white shadow-lg' : 'bg-gray-700 text-white')}>
            <Clock className="h-6 w-6" />
            <div className="text-lg font-bold font-mono">
               {String(timeLeft).padStart(2, '0')}
            </div>
        </div>
    );
};


const TeamCard = ({ title, players, team, turn, selfId, castleState }: { title: string, players: Player[], team: 'red' | 'blue', turn: string, selfId: string, castleState: Game['theCastleState'] }) => {
    const isTurn = players.some(p => p.id === turn);
    const bgColor = team === 'red' ? 'bg-red-900/50 border-red-700' : 'bg-blue-900/50 border-blue-700';
    const textColor = team === 'red' ? 'text-red-300' : 'text-blue-300';

    const hasRedKey = players.some(p => castleState?.playersState[p.id]?.hasRedKey);
    const hasBlueKey = players.some(p => castleState?.playersState[p.id]?.hasBlueKey);

    return (
        <Card className={cn("transition-all duration-500 w-full", bgColor, isTurn ? 'shadow-2xl shadow-primary/20 ring-2 ring-primary' : '')}>
            <CardHeader className="p-2 text-center">
                <CardTitle className={cn("text-center text-lg", textColor)}>{title}</CardTitle>
            </CardHeader>
            <CardContent className="p-2 flex items-center justify-center gap-2 flex-wrap">
                {players.map(p => {
                    const isPlayerTurn = p.id === turn;
                    const isSelf = p.id === selfId;
                    const playerState = castleState?.playersState[p.id];
                    return (
                        <div key={p.id} className={cn("p-1.5 rounded-md bg-gray-800/50 flex items-center gap-2 text-white", isPlayerTurn && 'ring-2 ring-yellow-400')}>
                           <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8" />
                            <div>
                                <p className="font-bold text-sm">{p.name} {isSelf && '(أنت)'}</p>
                                 {playerState && <p className="text-xs text-gray-400 font-semibold">حركات: {playerState.movesLeft}</p>}
                            </div>
                        </div>
                    )
                })}
            </CardContent>
            <CardFooter className="p-2 flex justify-center gap-4">
                 {team === 'blue' && (
                    <div className={cn("flex items-center gap-1.5 p-1 px-2 rounded-md", hasRedKey ? "bg-red-500 text-white" : "bg-gray-600 text-gray-300")}>
                        <KeyRound className="w-5 h-5"/>
                        <span className="text-xs font-bold">مفتاح أحمر</span>
                    </div>
                )}
                 {team === 'red' && (
                    <div className={cn("flex items-center gap-1.5 p-1 px-2 rounded-md", hasBlueKey ? "bg-blue-500 text-white" : "bg-gray-600 text-gray-300")}>
                        <KeyRound className="w-5 h-5"/>
                        <span className="text-xs font-bold">مفتاح أزرق</span>
                    </div>
                )}
            </CardFooter>
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

    const handleAction = async (action: () => Promise<any>, options?: { errorMessage?: string; }) => {
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
    const playerOnTurn = game.players.find(p=>p.id === playerOnTurnId);
    const isMyTurn = self.id === playerOnTurnId;

    if (game.gameState === 'ended') {
        const winnerColor = game.gameResult?.winner === 'red' ? 'text-red-500' : 'text-blue-500';
        return (
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <Trophy className="w-20 h-20 mx-auto text-yellow-400"/>
                        <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                        <CardDescription className={cn("text-2xl font-bold", winnerColor)}>
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
        <div className="w-full h-full flex flex-col items-center justify-between bg-gray-900 text-white p-2 gap-2">
            <div className="stars"></div>
            <div className="twinkling"></div>

             <div className='w-full flex justify-center z-10'>
                <Card className="p-2 bg-gray-800/80 backdrop-blur-sm border-gray-600 text-center shadow-md">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-center px-4">
                            <h4 className="font-bold text-sm text-primary">الدور على</h4>
                            <p className="text-xl font-bold">{playerOnTurn?.name || '...'}</p>
                        </div>
                         {game.theCastleState?.turnEndsAt && (
                           <CountdownTimer 
                                expiryTimestamp={game.theCastleState.turnEndsAt.toMillis()}
                                onExpire={isHost ? handleEndTurn : () => {}}
                            />
                        )}
                         {isMyTurn && selfState && (
                            <div className="flex flex-col items-center px-4">
                                <h4 className="font-bold text-sm">حركاتك المتبقية</h4>
                                <p className="text-3xl font-bold font-mono text-primary">{selfState.movesLeft}</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
            
            <TeamCard team="blue" players={teamBlue} turn={playerOnTurnId || ''} selfId={self.id} castleState={game.theCastleState} />

            <div className="flex-grow w-full mx-auto flex items-center justify-center py-2">
                 <CastleBoard game={game} self={self} onTileClick={handleTileClick} buildMode={buildMode} />
            </div>
            
            <TeamCard team="red" players={teamRed} turn={playerOnTurnId || ''} selfId={self.id} castleState={game.theCastleState} />
           
            <div className="w-full flex-shrink-0 mt-auto h-[60px] z-10">
                <AnimatePresence>
                {isMyTurn && (
                    <motion.div 
                        className="w-full max-w-3xl mx-auto flex justify-center flex-wrap gap-2 p-3 rounded-lg bg-gray-800/80 backdrop-blur-sm shadow-lg border border-gray-600"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                         <Button onClick={() => setBuildMode(prev => prev === 'wall' ? null : 'wall')} variant={buildMode === 'wall' ? "default" : "outline"} disabled={isSubmitting || !selfState || selfState.movesLeft < 1} className="shadow-md">
                            <Hammer className="ml-2"/> بناء جدار (1)
                        </Button>
                         <Button onClick={() => setBuildMode(prev => prev === 'trap' ? null : 'trap')} variant={buildMode === 'trap' ? "default" : "outline"} disabled={isSubmitting || !selfState || (selfState.trapsLeft || 0) < 1 || selfState.movesLeft < 1} className="shadow-md">
                             <VenetianMask className="ml-2"/> نصب فخ (1)
                         </Button>
                         <Button onClick={() => setBuildMode(prev => prev === 'bomb' ? null : 'bomb')} variant={buildMode === 'bomb' ? "default" : "outline"} disabled={isSubmitting || !selfState || selfState.movesLeft < 3} className="shadow-md">
                            <BombIcon className="ml-2"/> زرع قنبلة (3)
                         </Button>
                          <Button onClick={() => setBuildMode(prev => prev === 'long_range_wall' ? null : 'long_range_wall')} variant={buildMode === 'long_range_wall' ? "default" : "outline"} disabled={isSubmitting || !selfState || selfState.movesLeft < 3} className="shadow-md">
                            <LocateFixed className="ml-2" /> جدار بعيد (3)
                         </Button>
                         <Button onClick={handleEndTurn} variant="secondary" disabled={isSubmitting} className="shadow-md">
                            <SkipForward className="ml-2"/> إنهاء الدور
                        </Button>
                    </motion.div>
                )}
                </AnimatePresence>
            </div>
        </div>
    );
}
