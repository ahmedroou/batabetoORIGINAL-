
'use client';

import React, { useState } from 'react';
import type { Game, Player, DrawAndDeceiveRoundResult } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '../../PlayerAvatar';
import { handleTimeout } from '@/lib/actions/draw-and-deceive';
import { Loader2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface ResultsPhaseProps {
    game: Game;
    self: Player;
}

export function ResultsPhase({ game, self }: ResultsPhaseProps) {
    const { toast } = useToast();
    const isHost = game.hostId === self.id;
    const [isSubmitting, setIsSubmitting] = useState(false);

    const state = game.drawAndDeceiveState!;
    const results = state.lastRoundResults!;
    const artist = game.players.find(p => p.id === state.artistId)!;

    const handleNext = async () => {
        setIsSubmitting(true);
        try {
            await handleTimeout(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card className="w-full max-w-3xl">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">نتائج الجولة</CardTitle>
                <CardDescription>
                    الكلمة الأصلية كانت: <strong className="text-primary">{state.wordToDraw}</strong> | الوصف الصحيح: <strong className="text-primary">{state.correctAnswer}</strong>
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {state.drawingDataUrl && (
                    <div className="relative aspect-video w-full max-w-sm mx-auto rounded-lg overflow-hidden border">
                         <Image
                            src={state.drawingDataUrl}
                            alt="Drawing by the artist"
                            fill
                            className="object-contain bg-white"
                        />
                    </div>
                )}
                <ScrollArea className="h-72">
                    <div className="space-y-3 p-1">
                    {results.answers.map((item, index) => (
                        <motion.div key={index} initial={{opacity:0, y:10}} animate={{opacity:1, y:0, transition: {delay: index * 0.1}}}>
                            <Card className={cn("p-3", item.isCorrect && "bg-green-500/10 border-green-500/50")}>
                                <div className="flex justify-between items-center">
                                    <p className="font-bold text-lg">{item.answer}</p>
                                    <div className="text-xs">
                                        {item.isCorrect ? (
                                            <span className="font-bold text-green-600">الجواب الصحيح (بواسطة {artist.name})</span>
                                        ) : (
                                            <span className="text-muted-foreground">فخ بواسطة: {item.authorIds.map(id => game.players.find(p => p.id === id)?.name).join(', ')}</span>
                                        )}
                                    </div>
                                </div>
                                {item.guesserIds.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t">
                                        <p className="text-xs font-bold self-center">الذين صوتوا:</p>
                                        {item.guesserIds.map(id => {
                                            const guesser = game.players.find(p => p.id === id);
                                            return guesser && (
                                                <div key={id} className="flex items-center gap-1.5 text-xs bg-muted px-2 py-1 rounded-full">
                                                    <PlayerAvatar avatarId={guesser.avatarId} className="w-4 h-4"/>
                                                    <span>{guesser.name}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </Card>
                        </motion.div>
                    ))}
                    </div>
                </ScrollArea>
                <Card className="p-2">
                    <CardHeader><CardTitle className="text-base">ملخص النقاط</CardTitle></CardHeader>
                    <CardContent className="text-xs space-y-1">
                        {Object.entries(results.scores).map(([playerId, scoreData]) => {
                            const player = game.players.find(p => p.id === playerId);
                            return (
                                <div key={playerId} className="flex justify-between">
                                    <span>{player?.name}:</span>
                                    <div className="flex gap-2">
                                        {scoreData.breakdown.map((bd, i) => (
                                            <span key={i} className={bd.points > 0 ? 'text-green-500' : 'text-red-500'}>
                                                ({bd.points > 0 ? `+${bd.points}`: bd.points} {bd.reason})
                                            </span>
                                        ))}
                                        <span className="font-bold">= {scoreData.points}</span>
                                    </div>
                                </div>
                            )
                        })}
                    </CardContent>
                </Card>
            </CardContent>
            <CardFooter>
                 {isHost ? (
                    <Button onClick={handleNext} disabled={isSubmitting} className="w-full">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : <><ArrowRight className="mr-2" /> {state.round >= state.settings.rounds ? "عرض النتائج النهائية" : "الجولة التالية"}</>}
                    </Button>
                ) : (
                    <p className="text-center w-full text-muted-foreground animate-pulse">في انتظار المضيف...</p>
                )}
            </CardFooter>
        </Card>
    );
}
