
"use client";

import { useState, useEffect } from 'react';
import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { ROLES } from '@/data/mafia-roles';
import { Button } from '@/components/ui/button';
import { transitionToNight } from '@/lib/actions/behind-the-mask';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface RoleRevealPhaseProps {
    game: Game;
    self: Player;
}

const COUNTDOWN_SECONDS = 15;

export function RoleRevealPhase({ game, self }: RoleRevealPhaseProps) {
    const { user } = useAuth();
    const [isFlipped, setIsFlipped] = useState(false);
    const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const roleDetails = self.role ? ROLES[self.role] : null;
    const isHost = game.hostId === self.id;
    const timerEnded = countdown <= 0;

    useEffect(() => {
        if (!isFlipped || timerEnded) return; // Only run timer after card is flipped and not ended
        const timer = setInterval(() => {
            setCountdown(prev => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, [isFlipped, timerEnded]);

    const handleStartNight = async () => {
        if (!isHost || !user) return;
        setIsSubmitting(true);
        try {
            await transitionToNight(game.id, user.uid);
        } catch (error: any) {
            console.error("Failed to start night:", error);
            setIsSubmitting(false); // Only set to false on error, success will unmount component
        }
    };

    if (!roleDetails) {
        return <div>جاري تحميل دورك...</div>;
    }

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white">
            <AnimatePresence>
                {!isFlipped ? (
                    <motion.div
                        key="instruction"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="text-center"
                    >
                        <h1 className="text-4xl font-bold">اكشف عن هويتك السرية</h1>
                        <p className="text-xl text-muted-foreground mt-2">اضغط على البطاقة لمعرفة دورك</p>
                    </motion.div>
                ) : (
                    <motion.div
                        key="description"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-center"
                    >
                        <h1 className="text-4xl font-bold">{roleDetails.name}</h1>
                        <p className="text-xl text-muted-foreground mt-2">{roleDetails.description}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                className="perspective-1000 my-8"
                onClick={() => setIsFlipped(true)}
            >
                <motion.div
                    className="relative w-80 h-[500px] transform-style-3d cursor-pointer"
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ duration: 0.6 }}
                >
                    {/* Card Back */}
                    <div className="absolute w-full h-full backface-hidden bg-gray-800 rounded-xl border-2 border-primary shadow-lg flex items-center justify-center">
                        <h2 className="text-3xl font-bold text-primary">خلف القناع</h2>
                    </div>
                    {/* Card Front - Video */}
                    <video
                        key={roleDetails.id}
                        src={`/roles/${roleDetails.id}.mp4`}
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="absolute w-full h-full backface-hidden rotate-y-180 object-cover rounded-xl border-2 border-yellow-400 shadow-2xl"
                    >
                        متصفحك لا يدعم عرض الفيديو.
                    </video>
                </motion.div>
            </motion.div>

            {isFlipped && (
                <div className="text-center">
                     <p className="text-2xl font-mono">
                        {timerEnded ? "اكتملت الاستعدادات!" : `الوقت المتبقي: ${countdown}`}
                    </p>
                    {timerEnded && isHost && (
                        <Button onClick={handleStartNight} disabled={isSubmitting} className="mt-4">
                            {isSubmitting ? <Loader2 className="animate-spin" /> : "بدء الليل"}
                        </Button>
                    )}
                     {timerEnded && !isHost && (
                        <p className="mt-4 text-lg animate-pulse">في انتظار المضيف لبدء الليل...</p>
                    )}
                </div>
            )}
        </div>
    );
}
