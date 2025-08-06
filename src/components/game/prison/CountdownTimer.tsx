
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

/**
 * A shared component to display a countdown and trigger a callback when time expires.
 * @param {object} props - Component props.
 * @param {number} props.expiryTimestamp - The timestamp (in milliseconds) when the timer should expire.
 * @param {function} props.onExpire - Callback function to be called when the timer expires.
 */
export const CountdownTimer = ({ gameId, expiryTimestamp, selfId, isHost }: CountdownTimerProps) => {
    const calculateTimeLeft = useCallback(() => expiryTimestamp ? Math.round(Math.max(0, expiryTimestamp - Date.now()) / 1000) : 0, [expiryTimestamp]);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    
    // Using a ref for the onExpire callback to avoid re-running the effect when the callback changes.
    const onExpireRef = useRef(() => {
        if (isHost) {
            prisonActions.handleTimeout(gameId, selfId);
        }
    });
    // Keep the ref's current function up-to-date with the latest props.
    useEffect(() => {
        onExpireRef.current = () => {
             if (isHost) {
                prisonActions.handleTimeout(gameId, selfId);
            }
        };
    }, [isHost, gameId, selfId]);

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
