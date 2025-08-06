
"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import type { DuelChallenge } from '@/types';
import { respondToDuelChallenge } from '@/lib/actions/user';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Swords, Check, X, Coins } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export default function SocietyDuels() {
    const { userProfile } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const [duelChallenges, setDuelChallenges] = useState<DuelChallenge[]>([]);
    const [isResponding, setIsResponding] = useState<string | null>(null);

    useEffect(() => {
        if (userProfile?.duelChallenges) {
            setDuelChallenges(userProfile.duelChallenges);
        }
    }, [userProfile?.duelChallenges]);

    const handleResponse = async (challenge: DuelChallenge, response: 'accepted' | 'rejected') => {
        if (!userProfile) return;
        setIsResponding(challenge.id);
        const result = await respondToDuelChallenge(userProfile.uid, challenge, response);

        if (result.success) {
            toast({ title: `تم ${response === 'accepted' ? 'قبول' : 'رفض'} التحدي` });
            if (response === 'accepted' && result.gameId) {
                // Navigate to the newly created duel room
                router.push(`/game/${result.gameId}`);
            }
        } else {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
        }
        setIsResponding(null);
    };

    return (
        <Card className="bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm shadow-lg shadow-purple-900/20">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-purple-300 flex items-center justify-center gap-3">
                    <Swords />
                    المبارزات
                </CardTitle>
                <CardDescription className="text-gray-400">
                    قائمة بتحديات المبارزة المرسلة إليك. قبول التحدي سينقلك إلى غرفة اللعبة مباشرة.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {duelChallenges.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                        <p className="text-lg">لا توجد لديك تحديات مبارزة حاليًا.</p>
                        <p>ربما حان الوقت لتحدي أحدهم بنفسك!</p>
                    </div>
                ) : (
                    <AnimatePresence>
                        {duelChallenges.map((challenge) => (
                            <motion.div
                                key={challenge.id}
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -50, transition: { duration: 0.3 } }}
                                className="p-4 bg-gray-900/70 border border-gray-700 rounded-lg"
                            >
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <PlayerAvatar avatarId={'Avatar01.png'} className="w-12 h-12" />
                                        <div>
                                            <p className="font-bold text-lg">{challenge.fromName}</p>
                                            <p className="text-sm text-gray-400 flex items-center gap-1">
                                                <Coins className="w-4 h-4 text-yellow-400"/>
                                                الرهان: <span className="font-bold">{challenge.betAmount}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button 
                                            size="icon" 
                                            className="bg-green-600 hover:bg-green-700" 
                                            onClick={() => handleResponse(challenge, 'accepted')}
                                            disabled={!!isResponding}
                                        >
                                            {isResponding === challenge.id ? <Loader2 className="animate-spin" /> : <Check />}
                                        </Button>
                                        <Button 
                                            size="icon" 
                                            variant="destructive" 
                                            onClick={() => handleResponse(challenge, 'rejected')}
                                            disabled={!!isResponding}
                                        >
                                            {isResponding === challenge.id ? <Loader2 className="animate-spin" /> : <X />}
                                        </Button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </CardContent>
        </Card>
    );
}
