
"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { ExecutionAnimationOverlay } from './ExecutionAnimationOverlay';

// Import Phase Components
import { LobbyPhase } from './phases/LobbyPhase';
import { InstructionsPhase } from './phases/InstructionsPhase';
import { OpenAuctionPhase } from './phases/OpenAuctionPhase';
import { ClosedAuctionBiddingPhase } from './phases/ClosedAuctionBiddingPhase';
import { ClosedAuctionAnsweringPhase } from './phases/ClosedAuctionAnsweringPhase';
import { JudgingPhase } from './phases/JudgingPhase';
import { ResultsPhase } from './phases/ResultsPhase';
import { FinalResultsPhase } from './phases/FinalResultsPhase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PrisonGameProps {
    game: Game;
    self: Player;
}

export function PrisonGame({ game, self }: PrisonGameProps) {
    const isHost = game.hostId === self.id;

    // Animation states for execution/release overlays
    const [animState, setAnimState] = useState<{ type: 'execution' | 'release' | null, data: any }>({ type: null, data: null });
    // Tracks the round for which an animation was last shown to prevent re-triggering
    const [animationShownForRound, setAnimationShownForRound] = useState(0);

    const lastResult = game.prisonState?.lastRoundResult;
    useEffect(() => {
        if (game.round && game.round > animationShownForRound && lastResult) {
            if (lastResult?.executedPlayerName) {
                setAnimState({ type: 'execution', data: { name: lastResult.executedPlayerName, avatarId: lastResult.executedPlayerAvatarId } });
                setAnimationShownForRound(game.round);
            } else if (lastResult?.freedPlayerName) {
                setAnimationShownForRound(game.round);
            }
        }
    }, [lastResult, game.round, animationShownForRound]);

    const renderContent = () => {
        // Prioritize animations
        if (animState.type === 'execution') {
            return <ExecutionAnimationOverlay playerName={animState.data.name} playerAvatarId={animState.data.avatarId} onAnimationEnd={() => {
                 setAnimState({ type: null, data: null });
            }} />
        }
        
        // Render game phase screens
        switch (game.gameState) {
            case 'lobby': 
                return <LobbyPhase game={game} self={self} />;
            case 'instructions': 
                return <InstructionsPhase game={game} self={self} isHost={isHost} />;
            case 'open_auction': 
                return <OpenAuctionPhase game={game} self={self} />;
            case 'closed_auction_bidding': 
                return <ClosedAuctionBiddingPhase game={game} self={self} />;
            case 'closed_auction_answering': 
                return <ClosedAuctionAnsweringPhase game={game} self={self} />;
            case 'judging':
            case 'rejudging':
                return <JudgingPhase game={game} self={self} />;
            case 'results': 
                return <ResultsPhase game={game} self={self} />;
            case 'final_results': 
                return <FinalResultsPhase game={game} self={self} />;
            default: return (
                <Card>
                    <CardHeader>
                        <CardTitle>حالة غير معروفة</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>حالة اللعبة الحالية هي: {game.gameState}. هذا لا ينبغي أن يحدث.</p>
                    </CardContent>
                </Card>
            );
        }
    }

    return (
        <>
            <AnimatePresence mode="wait">
                <motion.div
                    key={game.gameState + (game.round || 0) + (animState.type || '')} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="w-full flex items-center justify-center p-4"
                >
                    {renderContent()}
                </motion.div>
            </AnimatePresence>
        </>
    );
}
