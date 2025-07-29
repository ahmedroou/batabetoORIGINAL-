"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Game, Player, MafiaRole, Role, NightResult } from '@/types';
import * as mafiaActions from '@/lib/actions/mafia';
import { MAFIA_ROLES } from '@/data/mafia-roles';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sun, Vote, Users, Skull } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { AnimatePresence, motion } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface DayPhaseProps {
    game: Game;
    self: Player;
    isHost: boolean;
    isSubmitting: boolean;
    setIsSubmitting: (isSubmitting: boolean) => void;
}

export function DayPhase({ game, self, isHost, isSubmitting, setIsSubmitting }: DayPhaseProps) {
    const { toast } = useToast();
    const [timeLeft, setTimeLeft] = useState(180);
    const [selectedVote, setSelectedVote] = useState<string | null>(null);
    const eventsContainerRef = useRef<HTMLDivElement>(null);

    const investigationResult = game.mafiaState?.investigationResult;
    const spyResult = game.mafiaState?.spyResult;
    const lastVotedOut = game.mafiaState?.lastVotedOut;
    const votes = game.mafiaState?.votes || {};

    const alivePlayers = useMemo(() => game.players.filter(p => p.status === 'alive'), [game.players]);
    const hasVoted = useMemo(() => votes[self.id] !== undefined, [votes, self.id]);

    useEffect(() => {
        if (!game.mafiaState?.timerEndsAt) return;
        
        const endTime = game.mafiaState.timerEndsAt.toMillis();
        
        const timer = setInterval(() => {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);
            if (remaining === 0 && isHost) {
                mafiaActions.hostProgressNextPhase(self.id);
                clearInterval(timer);
            }
        }, 1000);
        
        return () => clearInterval(timer);
    }, [isHost, self.id, game.mafiaState?.timerEndsAt, game.gameState]);
    
    useEffect(() => {
        if (eventsContainerRef.current) {
            eventsContainerRef.current.scrollTop = eventsContainerRef.current.scrollHeight;
        }
    }, [game.mafiaState?.events]);

    const handleVote = async () => {
        if (selectedVote === null) {
            toast({ title: "الرجاء اختيار لاعب للتصويت", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            await mafiaActions.submitVote(game.id, self.id, selectedVote === "no_one" ? null : selectedVote);
            toast({ title: "تم تسجيل تصويتك" });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const renderDiscussion = () => {
        return (
            <>
                <CardHeader className="text-center">
                    <Sun className="w-16 h-16 mx-auto text-yellow-400" />
                    <CardTitle className="text-3xl">النهار</CardTitle>
                    <CardDescription className="text-gray-600">حان وقت النقاش. حاولوا كشف القاتل قبل فوات الأوان!</CardDescription>
                    <div className="text-2xl font-bold font-mono text-primary">{timeLeft}</div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg h-64 overflow-y-auto" ref={eventsContainerRef}>
                        <h4 className="font-bold mb-2">أحداث الليلة الماضية:</h4>
                        <ul className="space-y-2 text-sm">
                            {game.mafiaState?.events?.map((event, index) => (
                                <motion.li key={index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.2 }}>
                                    {event.message}
                                </motion.li>
                            ))}
                        </ul>
                         {self.role === 'detective' && investigationResult && (
                            <p className="mt-2 p-2 bg-blue-100 text-blue-800 rounded">
                                نتيجتك: {game.players.find(p => p.id === investigationResult.playerId)?.name} هو من فريق {investigationResult.team === 'good' ? 'الخير' : 'المافيا'}.
                            </p>
                        )}
                        {self.role === 'spy' && spyResult && (
                             <p className="mt-2 p-2 bg-purple-100 text-purple-800 rounded">
                                تقريرك: {game.players.find(p => p.id === spyResult.playerId)?.name} يظهر بدور '{MAFIA_ROLES.find(r => r.id === spyResult.role)?.name}'.
                            </p>
                        )}
                    </div>
                </CardContent>
                 {isHost && (
                     <CardFooter>
                        <Button onClick={() => mafiaActions.hostProgressNextPhase(self.id)} className="w-full">
                            الانتقال لمرحلة التصويت
                        </Button>
                    </CardFooter>
                )}
            </>
        );
    }
    
    const renderVoting = () => {
        const votesByPlayer: Record<string, string[]> = {};
        Object.entries(votes).forEach(([voterId, targetId]) => {
            if (targetId) {
                if (!votesByPlayer[targetId]) {
                    votesByPlayer[targetId] = [];
                }
                votesByPlayer[targetId].push(voterId);
            }
        });

        return (
              <>
                  <CardHeader className="text-center">
                      <Vote className="w-16 h-16 mx-auto text-primary" />
                      <CardTitle className="text-3xl">التصويت</CardTitle>
                      <CardDescription className="text-gray-600">صوتوا للاعب الذي تشكون بأنه القاتل.</CardDescription>
                       <div className="text-2xl font-bold font-mono text-primary">{timeLeft}</div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      <ScrollArea className="h-72">
                          <div className="grid grid-cols-2 gap-4 p-1">
                              {alivePlayers.map(p => (
                                  <div key={p.id}>
                                      <motion.div
                                          onClick={() => !hasVoted && setSelectedVote(p.id)}
                                          className={cn(
                                              "p-2 rounded-lg border-2 cursor-pointer text-center",
                                              selectedVote === p.id ? "border-primary bg-primary/10" : "border-transparent bg-muted",
                                              hasVoted && "cursor-not-allowed opacity-60"
                                          )}
                                          whileTap={{ scale: hasVoted ? 1 : 0.95 }}
                                      >
                                          <PlayerAvatar avatarId={p.avatarId} className="w-16 h-16 mx-auto" />
                                          <p className="font-bold mt-2">{p.name}</p>
                                      </motion.div>
                                      {votesByPlayer[p.id] && (
                                          <div className="flex justify-center flex-wrap gap-1 mt-1">
                                              {votesByPlayer[p.id].map(voterId => (
                                                  <PlayerAvatar key={voterId} avatarId={game.players.find(pl => pl.id === voterId)?.avatarId || ''} className="w-5 h-5" />
                                              ))}
                                          </div>
                                      )}
                                  </div>
                              ))}
                          </div>
                      </ScrollArea>
                  </CardContent>
                  <CardFooter>
                      {hasVoted ? (
                          <p className="text-center w-full text-green-600 font-bold">تم التصويت بنجاح. في انتظار الآخرين...</p>
                      ) : (
                          <Button onClick={handleVote} disabled={isSubmitting || selectedVote === null} className="w-full">
                              تأكيد التصويت
                          </Button>
                      )}
                  </CardFooter>
              </>
        );
    }
    
     const renderVotingResults = () => {
        const votedOutPlayer = lastVotedOut?.playerId ? game.players.find(p => p.id === lastVotedOut.playerId) : null;
        return (
             <>
                <CardHeader className="text-center">
                    <Users className="w-16 h-16 mx-auto text-gray-500" />
                    <CardTitle className="text-3xl">نتيجة التصويت</CardTitle>
                </CardHeader>
                 <CardContent className="text-center space-y-4">
                    {votedOutPlayer ? (
                        <div className="flex flex-col items-center gap-2">
                            <Skull className="w-12 h-12 text-destructive" />
                            <p className="text-xl">لقد قررت المدينة التضحية بـ:</p>
                            <PlayerAvatar avatarId={votedOutPlayer.avatarId} className="w-24 h-24" />
                            <p className="text-2xl font-bold">{votedOutPlayer.name}</p>
                            <p className="text-lg text-muted-foreground">(كان {MAFIA_ROLES.find(r => r.id === votedOutPlayer.role)?.name})</p>
                        </div>
                    ) : (
                        <p className="text-xl text-muted-foreground">
                            {lastVotedOut?.tie ? "تعادل في الأصوات! لم يتم إقصاء أحد." : "لم يصوت أحد! لقد نجا الجميع هذه المرة."}
                        </p>
                    )}
                 </CardContent>
                 {isHost && (
                     <CardFooter>
                        <Button onClick={() => mafiaActions.hostProgressNextPhase(self.id)} className="w-full">
                            الانتقال إلى الليل
                        </Button>
                    </CardFooter>
                )}
            </>
        );
     }


    return (
        <Card className="w-full max-w-lg bg-white border-gray-200">
            {game.gameState === 'discussion' && renderDiscussion()}
            {game.gameState === 'voting' && renderVoting()}
            {game.gameState === 'voting_results' && renderVotingResults()}
        </Card>
    );
}