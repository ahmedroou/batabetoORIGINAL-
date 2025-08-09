
"use client";

import type { Game, Player } from '@/types';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Trophy, Shield, VenetianMask, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ROLES } from '@/data/mafia-roles';
import { PlayerAvatar } from '../../PlayerAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    
    const winnerDisplay = gameResult.winner === 'good' ? 'فريق الخير' : gameResult.winner === 'mafia' ? 'فريق الشر' : 'تعادل';
    const winnerColor = gameResult.winner === 'good' ? 'text-blue-500' : 'text-red-500';
    const WinnerIcon = gameResult.winner === 'good' ? Shield : VenetianMask;


    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: 'spring' }}
            className="w-full max-w-lg"
        >
            <Card className="text-center bg-white/90 backdrop-blur-sm border-gray-200 shadow-2xl">
                <CardHeader>
                    <Trophy className="w-24 h-24 text-yellow-400 mx-auto animate-pulse" />
                    <CardTitle className="text-5xl font-extrabold">انتهت اللعبة!</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className='flex items-center justify-center gap-3'>
                        <WinnerIcon className={cn("w-12 h-12", winnerColor)} />
                        <h2 className={cn("text-4xl font-bold", winnerColor)}>
                            {winnerDisplay}
                        </h2>
                     </div>
                    <p className="text-lg text-muted-foreground">{gameResult.message}</p>

                    <div className="pt-4 text-left">
                        <h3 className="font-bold text-lg mb-2 text-center">الأدوار النهائية</h3>
                        <ScrollArea className="h-64 border bg-muted/50 rounded-lg p-2">
                             <div className="space-y-2">
                                {game.players.map((player, index) => {
                                    const roleDetails = player.role ? ROLES[player.role] : null;
                                    return (
                                    <motion.div 
                                        key={player.id} 
                                        className="flex items-center justify-between p-2 bg-background rounded-md shadow-sm"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.1 }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" temporaryTitle={player.temporaryTitle}/>
                                            <div>
                                                <p className="font-bold">{player.name}</p>
                                                {player.status !== 'alive' && <p className="text-xs text-red-500 font-semibold">(تم القضاء عليه)</p>}
                                            </div>
                                        </div>
                                        <div className="text-sm font-semibold text-primary">
                                            {roleDetails ? roleDetails.name : 'دور غير معروف'}
                                        </div>
                                    </motion.div>
                                )})}
                            </div>
                        </ScrollArea>
                    </div>

                </CardContent>
                <CardFooter>
                    <Button onClick={() => router.push('/')} className="w-full" size="lg">
                        العب مرة أخرى
                    </Button>
                </CardFooter>
            </Card>
        </motion.div>
    );
}
