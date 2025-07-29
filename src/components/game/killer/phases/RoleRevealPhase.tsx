
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Player, PlayerRole } from '@/types';
import { ROLE_CARD_IMAGES } from '@/data/roles';
import * as killerActions from "@/lib/actions/killer";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import Image from "next/image";
import { Timestamp } from 'firebase/firestore';

const roleDetails: Record<PlayerRole, { title: string; color: string; description: string }> = {
    killer: { title: "أنت القاتل", color: "text-red-500", description: "مهمتك هي القضاء على فريق الخير دون أن يتم كشفك." },
    spy: { title: "أنت الجاسوس", color: "text-red-600", description: "أنت مع المافيا. اكشف هويات الآخرين لمساعدة القاتل." },
    detective: { title: "أنت المحقق", color: "text-blue-500", description: "مهمتك هي كشف أدوار أعضاء المافيا وتوجيه فريق الخير." },
    doctor: { title: "أنت الطبيب", color: "text-green-500", description: "مهمتك هي حماية اللاعبين من هجمات القاتل." },
    soldier: { title: "أنت الجندي", color: "text-orange-500", description: "لديك مناعة ضد كشف الجاسوس. إذا حاول كشفك، سينكشف هو!" },
    impersonator: { title: "أنت المنتحل", color: "text-purple-500", description: "اختر دورًا لتنتحله كل ليلة وتضلل الجاسوس." },
    civilian: { title: "أنت مدني", color: "text-gray-500", description: "مهمتك هي العمل مع الآخرين لكشف القاتل والتصويت لطرده." },
    suicide_bomber: { title: "أنت الانتحاري", color: "text-yellow-600", description: "اختر لاعبًا كل ليلة. إذا قتلك هذا اللاعب، سيموت معك!" },
    contestant: { title: "أنت متسابق", color: "text-gray-500", description: "هذا دور احتياطي." },
};

interface RoleRevealPhaseProps {
    self: Player;
    discussionEndsAt?: Timestamp;
    isHost: boolean;
    gameId: string;
}

export function RoleRevealPhase({ self, discussionEndsAt, isHost, gameId }: RoleRevealPhaseProps) {
    const [timeLeft, setTimeLeft] = useState(5);
    const details = roleDetails[self.role!];
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const actionCalled = useRef(false);

    const handleProgressToNight = useCallback(async () => {
        if (!isHost || actionCalled.current) return;
        actionCalled.current = true;
        try {
            await killerActions.handleTimeout(self.id);
        } catch (e: any) {
            console.error("Failed to progress to night:", e);
            actionCalled.current = false; // Allow retry if failed
        }
    }, [isHost, self.id]);

    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);

        let phaseEndTime: number | undefined;
        if (discussionEndsAt) {
            phaseEndTime = discussionEndsAt instanceof Timestamp 
                ? discussionEndsAt.toMillis() 
                : new Date(discussionEndsAt as any).getTime();
        }

        if (phaseEndTime) {
            const updateTimer = () => {
                const remaining = Math.round((phaseEndTime! - Date.now()) / 1000);
                setTimeLeft(Math.max(0, remaining));

                if (remaining <= 0) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    handleProgressToNight();
                }
            };
            timerRef.current = setInterval(updateTimer, 1000);
            updateTimer();
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [discussionEndsAt, handleProgressToNight]);

    return (
        <Card className="w-full max-w-md animate-pop-in text-center overflow-hidden">
            <CardHeader className="p-6">
                <motion.div 
                    initial={{ scale: 0, rotate: -180 }} 
                    animate={{ scale: 1, rotate: 0 }} 
                    transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.2 }}
                >
                    <Image src={ROLE_CARD_IMAGES[self.role!]} alt={self.role!} width={120} height={120} className="mx-auto drop-shadow-lg" />
                </motion.div>
                <CardTitle className={`text-3xl font-bold ${details.color} mt-4`}>{details.title}</CardTitle>
                <CardDescription className="text-base mt-2">{details.description}</CardDescription>
            </CardHeader>
            <CardFooter className="flex-col gap-2 bg-muted/50 p-4">
                <p className="w-full text-center text-muted-foreground">
                    {`الانتقال إلى الليل خلال: ${timeLeft} ثانية...`}
                </p>
                <div className="w-full bg-border h-1 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-primary"
                        initial={{ width: "100%" }}
                        animate={{ width: "0%" }}
                        transition={{ duration: timeLeft, ease: "linear" }}
                    />
                </div>
            </CardFooter>
        </Card>
    );
}
