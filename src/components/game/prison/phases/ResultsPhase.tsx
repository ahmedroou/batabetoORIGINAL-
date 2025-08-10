
"use client";

import { useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { PlayerAvatar } from '../../PlayerAvatar';
import { nextRound } from '@/lib/actions/prison';
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResultsPhaseProps {
    game: Game;
    self: Player;
}

export function ResultsPhase({ game, self }: ResultsPhaseProps) {
    const { toast } = useToast();
    const isHost = game.hostId === self.id;
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleNextRound = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await nextRound(game.id, self.id);
        } catch (e: any) {
            toast({title: "خطأ", description: e.message, variant: "destructive"});
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const result = game.prisonState?.lastRoundResult;
    if (!result) return (
        <Card className="w-full max-w-lg text-center">
            <CardHeader><CardTitle>جاري تحميل النتائج...</CardTitle></CardHeader>
            <CardContent><Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" /></CardContent>
        </Card>
    );
    
    const sortedPlayers = [...game.players].sort((a,b) => (game.playerScores?.[b.id] || 0) - (game.playerScores?.[a.id] || 0));
    const playersInPrison = game.players.filter(p => p.status === 'in_prison');
    const freedPlayerId = game.players.find(p => p.name === result?.freedPlayerName)?.id;

    return (
        <Card className="w-full max-w-5xl animate-pop-in">
             <CardHeader className="text-center">
                <CardTitle>نتيجة الجولة {game.round}</CardTitle>
                <CardDescription className="text-lg font-bold p-2 bg-muted rounded-md mt-2">
                     {result.message}
                </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2 md:col-span-2">
                    <h3 className="font-bold text-center text-lg">الترتيب العام</h3>
                     {sortedPlayers.map(p => {
                         const roundData = result.points?.[p.id];
                         const prisonHistory = game.prisonState?.prisonHistory?.[p.id];
                         const wasFreed = p.id === freedPlayerId;
                        return (
                         <div key={p.id} className="relative flex flex-col p-2 rounded-md bg-muted overflow-hidden">
                            {wasFreed && (
                                 <motion.div 
                                    className="absolute top-1 right-1 z-10"
                                    initial={{ scale: 0, rotate: -45 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    transition={{ type: "spring", stiffness: 200, damping: 10, delay: 0.5 }}
                                >
                                    <KeyRound className="w-6 h-6 text-yellow-500" />
                                </motion.div>
                            )}
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8" temporaryTitle={p.temporaryTitle} />
                                    <span className="font-semibold">{p.name}</span>
                                </div>
                                <span className="font-bold text-lg text-primary">{game.playerScores?.[p.id] || 0}</span>
                            </div>
                            {roundData && roundData.breakdown && roundData.breakdown.length > 0 && (
                            <div className="text-xs flex flex-wrap gap-x-2 pl-10">
                                {roundData.breakdown.map((item, i) => (
                                    <span key={i} className={cn("font-semibold", item.points > 0 ? "text-green-600" : "text-red-600")}>
                                        ({item.points > 0 ? `+${item.points}` : item.points} {item.reason})
                                    </span>
                                ))}
                            </div>
                            )}
                         </div>
                        )
                     })}
                </div>
                 <div className="space-y-4">
                     <h3 className="font-bold text-center text-lg">السجناء</h3>
                     <div className="p-4 bg-gray-800 rounded-lg space-y-3 min-h-[200px] flex flex-col justify-center items-center">
                        {playersInPrison.length > 0 ? (
                            playersInPrison.map(p => (
                            <div key={p.id} className="relative w-full text-center bg-gray-700 p-2 rounded-md overflow-hidden">
                                <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12 mx-auto rounded-full border-2 border-gray-500" temporaryTitle={p.temporaryTitle} />
                                <p className="font-bold text-white mt-1">{p.name}</p>
                                <p className="text-xs text-gray-300">مسجون لـ {game.prisonState?.prisonHistory?.[p.id]?.inPrison} جولات</p>
                                <motion.div 
                                    className='absolute inset-0 pointer-events-none'
                                    initial={{ y: '-100%' }}
                                    animate={{ y: 0 }}
                                    transition={{ type: 'spring', stiffness: 50, damping: 10, delay: 0.5 }}
                                >
                                    <div className="w-full h-full grid grid-cols-4 gap-2 opacity-50 p-1">
                                        <div className="bg-gray-900 rounded-sm"></div>
                                        <div className="bg-gray-900 rounded-sm"></div>
                                        <div className="bg-gray-900 rounded-sm"></div>
                                        <div className="bg-gray-900 rounded-sm"></div>
                                    </div>
                                </motion.div>
                            </div>
                            ))
                        ) : (
                            <div className="text-center text-gray-400 pt-8 flex flex-col items-center gap-2">
                                <KeyRound className="w-12 h-12"/>
                                <p>لا يوجد سجناء حاليًا!</p>
                            </div>
                        )}
                     </div>
                 </div>
            </CardContent>
            <CardFooter className="flex-col gap-2">
                {isHost ? (
                    <Button onClick={handleNextRound} disabled={isSubmitting} className="w-full">
                        {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : (game.round || 0) >= (game.prisonState?.settings.rounds || 10) ? 'عرض النتائج النهائية' : 'الجولة التالية'}
                    </Button>
                ) : (
                    <p className="text-center w-full text-muted-foreground animate-pulse">
                        في انتظار المضيف لبدء الجولة التالية...
                    </p>
                )}
            </CardFooter>
        </Card>
    );
}

    