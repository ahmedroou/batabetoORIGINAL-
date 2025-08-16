      
'use client';

import React, { useMemo, useEffect } from 'react';
import type { Game, Player, EmojiReaction, EmojiReactionType } from '@/types';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Trophy, Award, EyeOff, AlertTriangle, Loader2 } from 'lucide-react';
import { distributeEndOfGameAwards } from '@/lib/actions/admin/users';
import { motion } from 'framer-motion';

const isDefined = <T,>(v: T | undefined | null): v is T => v !== undefined && v !== null;

export function FinalResultsPhase({ game, self }: { game: Game; self: Player }) {
    const router = useRouter();
    const [finalizing, setFinalizing] = React.useState(true);

    const isHost = game.hostId === self.id;

    useEffect(() => {
        const finalize = async () => {
            if (isHost && !game.gameResult?.finalAwards) {
                try {
                    await distributeEndOfGameAwards(game.id);
                    // The onSnapshot listener in the client will automatically update the game state.
                } catch (e) {
                    console.error("Failed to finalize game awards:", e);
                }
            }
            setFinalizing(false);
        };
        finalize();
    }, [game.id, isHost, game.gameResult?.finalAwards]);


    const sortedPlayers = [...(game.players ?? [])]
        .map((p) => ({ ...p, score: game.playerScores?.[p.id] ?? 0 }))
        .sort((a, b) => b.score - a.score);

    let rank = 0;
    let lastScore = Infinity;

    const rankedPlayers = sortedPlayers.map((p, index) => {
        if (p.score !== lastScore) {
            rank = index + 1;
        }
        lastScore = p.score;
        return { ...p, rank } as Player & { score: number; rank: number };
    });

    const winner = rankedPlayers[0];
    const finalAwards = game.gameResult?.finalAwards ?? {};
    const { cunningDeceiver, deceivedFool, afkStats } = finalAwards;

    const afkPlayers = Object.entries(afkStats ?? {})
        .map(([playerId, count]) => {
            const pl = game.players.find((pp) => pp.id === playerId);
            return pl ? { player: pl, afkCount: count as number } : null;
        })
        .filter(isDefined)
        .sort((a, b) => b.afkCount - a.afkCount)
        .slice(0, 3);

    return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-2xl"
        >
        <Card>
            <CardHeader className="text-center">
                <Trophy className="w-24 h-24 mx-auto text-yellow-400" />
                <CardTitle className="text-4xl">انتهت اللعبة!</CardTitle>
                {winner && <CardDescription className="text-2xl font-bold">الفائز هو {winner.name}!</CardDescription>}
                 {finalizing && (
                    <div className="flex justify-center items-center gap-2 text-muted-foreground animate-pulse">
                        <Loader2 className="w-4 h-4 animate-spin"/>
                        <span>جاري توزيع الجوائز النهائية...</span>
                    </div>
                )}
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                    <div className="p-3 rounded-lg bg-red-100 border border-red-300">
                        <h3 className="font-bold text-red-800 flex items-center justify-center gap-2">
                            <Award /> المخادع المكار
                        </h3>
                        {cunningDeceiver ? (
                            <>
                                <PlayerAvatar avatarId={cunningDeceiver.avatarId} className="w-16 h-16 mx-auto my-2" />
                                <p className="font-bold text-lg">{cunningDeceiver.name}</p>
                                <p className="text-sm text-muted-foreground">أوقع لاعبين في فخه {cunningDeceiver.count} مرة</p>
                            </>
                        ) : (
                            <div className="py-8">
                                <p className="text-muted-foreground">لا يوجد فائز بهذا اللقب</p>
                            </div>
                        )}
                    </div>
                    <div className="p-3 rounded-lg bg-blue-100 border border-blue-300">
                        <h3 className="font-bold text-blue-800 flex items-center justify-center gap-2">
                            <EyeOff /> الأبله المخدوع
                        </h3>
                        {deceivedFool ? (
                            <>
                                <PlayerAvatar avatarId={deceivedFool.avatarId} className="w-16 h-16 mx-auto my-2" />
                                <p className="font-bold text-lg">{deceivedFool.name}</p>
                                <p className="text-sm text-muted-foreground">وقع في الفخ {deceivedFool.count} مرات</p>
                            </>
                        ) : (
                            <div className="py-8">
                                <p className="text-muted-foreground">لا يوجد فائز بهذا اللقب</p>
                            </div>
                        )}
                    </div>
                </div>

                {afkPlayers.length > 0 && (
                    <div className="p-3 rounded-lg bg-yellow-100 border border-yellow-300 mt-4">
                        <h3 className="font-bold text-yellow-800 flex items-center justify-center gap-2">
                            <AlertTriangle /> غشاشين محتملين
                        </h3>
                        <div className="space-y-1 mt-2">
                            {afkPlayers.map(({ player, afkCount }) => (
                                <div key={player.id} className="flex justify-between items-center text-sm p-1 bg-yellow-50 rounded-md">
                                    <div className="flex items-center gap-2">
                                        <PlayerAvatar avatarId={player.avatarId!} className="w-6 h-6" />
                                        <span>{player.name}</span>
                                    </div>
                                    <span className="font-bold">{afkCount} مرات</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="space-y-2 pt-4">
                    <h3 className="font-bold text-center">الترتيب النهائي</h3>
                    {rankedPlayers.length === 0 && (
                        <div className="p-3 text-center rounded-md bg-muted">لا يوجد لاعبون لعرض النتائج.</div>
                    )}
                    {rankedPlayers.map((p) => (
                        <div key={p.id} className="flex justify-between items-center p-3 bg-muted rounded-lg text-lg">
                            <div className="flex items-center gap-2 font-bold">
                                <span>{p.rank}.</span>
                                <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8" temporaryTitle={p.temporaryTitle} />
                                <span>{p.name}</span>
                            </div>
                            <span className="font-bold text-primary">{p.score} نقطة</span>
                        </div>
                    ))}
                </div>
            </CardContent>
            <CardFooter>
                <Button onClick={() => router.push('/')} className="w-full">
                    العب مرة أخرى
                </Button>
            </CardFooter>
        </Card>
        </motion.div>
    );
}
