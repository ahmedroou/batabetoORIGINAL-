
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { TimerIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { handleTimeout as handleEducatedMerchantTimeout } from '@/lib/actions/educated-merchant';
import { handleTimeout as handlePrisonTimeout } from '@/lib/actions/prison';
import { handleTimeout as handleTrapAnswerTimeout } from '@/lib/actions/trap-answer';
import type { Game } from '@/types';

interface CountdownTimerProps {
    gameId: string;
    gameType: Game['gameType'];
    expiryTimestamp: number;
    selfId: string;
    isHost: boolean;
}

/**
 * A shared component to display a countdown and trigger a server-side timeout action.
 * It now uses a "tick" function for Trap Answer to ensure any player can advance the game.
 * @param {object} props - Component props.
 * @param {number} props.expiryTimestamp - The timestamp (in milliseconds) when the timer should expire.
 */
export const CountdownTimer = ({ gameId, gameType, expiryTimestamp, selfId, isHost }: CountdownTimerProps) => {
    const calculateTimeLeft = useCallback(() => expiryTimestamp ? Math.round(Math.max(0, expiryTimestamp - Date.now()) / 1000) : 0, [expiryTimestamp]);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    
    const timeoutProcessed = useRef(false);

    useEffect(() => {
        if (!expiryTimestamp) return;

        const timer = setInterval(() => {
            const remaining = calculateTimeLeft();
            setTimeLeft(remaining);
            
            if (remaining <= 0 && !timeoutProcessed.current) {
                 timeoutProcessed.current = true;
                 clearInterval(timer);
                 // Any active player can nudge the game state forward.
                 switch (gameType) {
                    case 'trap-answer':
                        // This action is now idempotent and can be called by any client.
                        handleTrapAnswerTimeout(gameId, selfId);
                        break;
                    case 'educated-merchant':
                        // This game's timeout logic is still host-driven in its current form
                        if (isHost) handleEducatedMerchantTimeout(gameId, selfId);
                        break;
                    case 'prison':
                         // This game's timeout logic is host-driven
                        if (isHost) handlePrisonTimeout(gameId, selfId);
                        break;
                    // Add other game types that use timeouts here
                 }
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [expiryTimestamp, isHost, gameId, selfId, gameType, calculateTimeLeft]);

    if (!expiryTimestamp || timeLeft <= 0) return null;

    const isLowTime = timeLeft <= 5;

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
