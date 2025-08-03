
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { TimerIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as prisonActions from '@/lib/actions/prison';
import { useAuth } from '@/hooks/useAuth';

interface CountdownTimerProps {
    gameId: string;
    expiryTimestamp: number;
}

export const CountdownTimer = ({ gameId, expiryTimestamp }: CountdownTimerProps) => {
    const { self } = useAuth(); // Assuming useAuth provides the current user/player
    const [timeLeft, setTimeLeft] = useState(() => Math.round(Math.max(0, expiryTimestamp - Date.now()) / 1000));
    const handleTimeoutCalled = useRef(false);

    const onExpire = useCallback(() => {
        if (!handleTimeoutCalled.current && self) {
            handleTimeoutCalled.current = true;
            prisonActions.handleTimeout(gameId, self.id);
        }
    }, [gameId, self]);

    useEffect(() => {
        if (!expiryTimestamp) return;

        const timer = setInterval(() => {
            const remaining = Math.round(Math.max(0, expiryTimestamp - Date.now()) / 1000);
            setTimeLeft(remaining);
            if (remaining <= 0) {
                clearInterval(timer);
                onExpire();
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [expiryTimestamp, onExpire]);

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
