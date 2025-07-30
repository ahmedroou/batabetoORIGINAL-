import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Game, Player } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ROLES } from '@/data/mafia-roles';
import { Button } from '@/components/ui/button';
import { Loader2, Timer } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { transitionToNight } from '@/lib/actions/mafia';


interface CountdownTimerProps {
    expiryTimestamp: number;
    onExpire: () => void;
}

const CountdownTimer = ({ expiryTimestamp, onExpire }: CountdownTimerProps) => {
    const calculateTimeLeft = () => Math.round((expiryTimestamp - Date.now()) / 1000);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    const onExpireRef = useRef(onExpire);
    onExpireRef.current = onExpire;

    useEffect(() => {
        if (timeLeft <= 0) return;

        const interval = setInterval(() => {
            const newTimeLeft = calculateTimeLeft();
            if (newTimeLeft <= 0) {
                setTimeLeft(0);
                onExpireRef.current();
                clearInterval(interval);
            } else {
                setTimeLeft(newTimeLeft);
            }
        }, 1000);
        
        return () => clearInterval(interval);
    }, [timeLeft, calculateTimeLeft]);
    
    return (
        <div className="flex items-center gap-2 font-mono text-lg font-bold">
            <Timer className="w-5 h-5"/>
            <span>{timeLeft > 0 ? timeLeft : 0}</span>
        </div>
    );
};

export function RoleRevealPhase({ game, self }: { game: Game, self: Player }) {
    const [isFlipped, setIsFlipped] = useState(false);
    const { userProfile } = useAuth();
    const isHost = userProfile?.uid === game.hostId;
    
    const roleDetails = useMemo(() => self.role ? ROLES[self.role] : null, [self.role]);
    const timerEndsAt = game.mafiaState?.timerEndsAt;

    const handleTimeout = () => {
        if (isHost) {
            transitionToNight(game.id, self.id);
        }
    };

    if (!roleDetails) {
        return (
            <Card className="w-full max-w-md text-center bg-background/80 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-3xl">جاري توزيع الأدوار...</CardTitle>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-16 h-16 mx-auto animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }
    
    return (
        <div className="flex flex-col items-center gap-6">
            <div className="text-center text-white">
                <h1 className="text-4xl font-bold">اكشف عن هويتك</h1>
                <p className="text-lg text-muted-foreground">اضغط على البطاقة لمعرفة دورك السري في هذه الليلة.</p>
                {timerEndsAt && <CountdownTimer expiryTimestamp={timerEndsAt.toMillis()} onExpire={handleTimeout} />}
            </div>

            <motion.div
                className="w-80 h-[28rem] relative cursor-pointer"
                onClick={() => setIsFlipped(!isFlipped)}
                style={{ perspective: 1000 }}
            >
                {/* Back of the card */}
                <motion.div
                    className="absolute w-full h-full bg-slate-800 border-4 border-slate-600 rounded-2xl flex items-center justify-center p-4"
                    style={{ backfaceVisibility: 'hidden' }}
                    initial={false}
                    animate={{ rotateY: isFlipped ? -180 : 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <Image src="/roles/card-back.png" alt="Card Back" layout="fill" objectFit="cover" className="rounded-xl"/>
                </motion.div>

                {/* Front of the card */}
                <motion.div
                    className="absolute w-full h-full bg-slate-900 border-4 border-primary rounded-2xl flex flex-col items-center p-4 shadow-2xl shadow-primary/30"
                    style={{ backfaceVisibility: 'hidden' }}
                    initial={{ rotateY: 180 }}
                    animate={{ rotateY: isFlipped ? 0 : 180 }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="relative w-full h-48 mb-4 rounded-lg overflow-hidden">
                         <Image src={roleDetails.imagePath} alt={roleDetails.name} layout="fill" objectFit="cover"/>
                    </div>
                    <h2 className="text-3xl font-bold text-primary">{roleDetails.name}</h2>
                    <p className={`text-sm font-semibold px-3 py-1 rounded-full mt-1 mb-3 ${roleDetails.team === 'mafia' ? 'bg-red-500/20 text-red-400' : roleDetails.team === 'good' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                        فريق {roleDetails.team === 'mafia' ? 'الشر' : roleDetails.team === 'good' ? 'الخير' : 'محايد'}
                    </p>
                    <p className="text-center text-sm text-slate-300 leading-relaxed">
                       {roleDetails.description}
                    </p>
                </motion.div>
            </motion.div>

            <AnimatePresence>
            {isFlipped && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: 0.3 } }}
                    className="text-center"
                >
                    <p className="text-lg text-white font-semibold">استعد، فالليل على وشك أن يبدأ...</p>
                </motion.div>
            )}
            </AnimatePresence>

        </div>
    );
}
