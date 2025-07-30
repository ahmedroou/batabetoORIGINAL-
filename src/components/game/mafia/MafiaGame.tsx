import React from 'react';
import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { Lobby } from './phases/Lobby';
import { RoleRevealPhase } from './phases/RoleRevealPhase';
import { NightPhase } from './phases/NightPhase';
import { DayPhase } from './phases/DayPhase';
import { VotingPhase } from './phases/VotingPhase';
import { ResultsPhase } from './phases/ResultsPhase';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface MafiaGameProps {
  game: Game;
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

export function MafiaGame({ game, self }: MafiaGameProps) {
    const isHost = game.hostId === self.id;

    const renderContent = () => {
        switch (game.gameState) {
            case 'lobby':
                return <Lobby game={game} self={self} isHost={isHost} />;
            case 'role_reveal':
                return <RoleRevealPhase game={game} self={self} />;
            case 'night':
                return <NightPhase game={game} self={self} />;
            case 'day':
                return <DayPhase game={game} self={self} />;
            case 'voting':
                 return <VotingPhase game={game} self={self} />;
            case 'final_results':
                return <ResultsPhase game={game} self={self} />;
            default:
                return <LoadingState text={`حالة غير معروفة: ${game.gameState}`} />;
        }
    };
    
    if (!self) {
        return <LoadingState text="جاري تحميل بيانات اللاعب..." />;
    }


    return (
        <div className="w-full flex items-center justify-center">
            <AnimatePresence mode="wait">
                <motion.div
                    key={game.gameState}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="w-full flex items-center justify-center"
                >
                    {renderContent()}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
