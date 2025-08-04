
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { TimerIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as prisonActions from '@/lib/actions/prison';

interface CountdownTimerProps {
    gameId: string;
    expiryTimestamp: number;
    selfId: string;
    isHost: boolean;
}

export const CountdownTimer = ({ gameId, expiryTimestamp, selfId, isHost }: CountdownTimerProps) => {
    const calculateTimeLeft = useCallback(() => Math.round(Math.max(0, expiryTimestamp - Date.now()) / 1000), [expiryTimestamp]);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft);
    
    const onExpire = useCallback(() => {
        if (isHost) {
            prisonActions.handleTimeout(gameId, selfId);
        }
    }, [isHost, gameId, selfId]);

    const onExpireRef = useRef(onExpire);
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
            isLowTime ? 'bg-red-500 text-white shadow-lg animate-pulse' : 'bg-muted')}>
            <TimerIcon className="h-6 w-6" />
            <div className="text-lg font-bold font-mono">
               {String(timeLeft).padStart(2, '0')}
            </div>
        </div>
    );
};
