

"use client";

import { useMemo, useState, useEffect } from "react";
import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from "framer-motion";

// Import the new phase components
import { RoleRevealPhase } from './phases/RoleRevealPhase';
import { NightPhase } from './phases/NightPhase';
import { DayPhase } from './phases/DayPhase';
import { VotingResultsPhase } from './phases/VotingResultsPhase';
import { GameEndPhase } from './phases/GameEndPhase';
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KillAnimationOverlay } from './KillAnimationOverlay';

interface KillerGameProps {
    game: Game;
    player: Player;
    self: Player;
}

const LoadingState = ({ text }: { text: string }) => (
  <Card className="w-full max-w-md text-center bg-white/90 backdrop-blur-sm">
    <CardHeader>
      <CardTitle className="text-2xl text-primary">{text}</CardTitle>
    </CardHeader>
    <CardContent>
      <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
    </CardContent>
  </Card>
);


export function KillerGame({ game, player, self }: KillerGameProps) {
    const isHost = useMemo(() => game.hostId === self.id, [game.hostId, self.id]);
    const [animationState, setAnimationState] = useState<{ type: 'kill' | null, data?: any }>({ type: null });

    useEffect(() => {
        if (game.gameState === 'discussion' && game.nightResults?.killedPlayerId) {
            setAnimationState({ type: 'kill', data: game.nightResults });
        }
    }, [game.gameState, game.nightResults]);

    const renderContent = () => {
        if (animationState.type === 'kill' && animationState.data) {
            return (
                <KillAnimationOverlay
                    method={animationState.data.killMethod || "طعن بالسكين"}
                    onAnimationEnd={() => setAnimationState({ type: null })}
                />
            );
        }
        
        switch(game.gameState) {
            case 'lobby': 
                return <LoadingState text="في انتظار بدء اللعبة..." />;
            case 'role_reveal': 
                return <RoleRevealPhase self={self} discussionEndsAt={game.discussionEndsAt} isHost={isHost} gameId={game.id} />;
            case 'night': 
                return <NightPhase game={game} self={self} isHost={isHost} />;
            case 'discussion':
            case 'tie_breaker_voting': // Both use the same component
                return <DayPhase game={game} self={self} />;
            case 'voting_results': 
                return <VotingResultsPhase game={game} isHost={isHost} />;
            case 'ended':
            case 'final_results':
                return <GameEndPhase gameResult={game.gameResult} />;
            default: 
                return <LoadingState text={`حالة غير معروفة: ${game.gameState}`} />;
        }
    };
    
    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={game.gameState + (animationState.type || '')}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.35, ease: "easeInOut" }}
                className="w-full flex items-center justify-center"
            >
                {renderContent()}
            </motion.div>
        </AnimatePresence>
    );
}
