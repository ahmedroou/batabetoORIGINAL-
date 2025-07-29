
"use client";

import React, from 'react';
import { useRouter } from 'next/navigation';
import type { Game, Player } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import * as roomActions from '@/lib/actions/room';
import { AnimatePresence, motion } from 'framer-motion';

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

// Phase Components
import { Lobby } from './phases/Lobby';
import { RoleRevealPhase } from './phases/RoleRevealPhase';
import { NightPhase } from './phases/NightPhase';
import { DayPhase } from './phases/DayPhase';
import { FinalResultsPhase } from './phases/FinalResultsPhase';


const LoadingState = ({ text }: { text: string }) => (
    <Card className="w-full max-w-md text-center">
        <CardHeader><CardTitle>{text}</CardTitle></CardHeader>
        <CardContent><Loader2 className="w-12 h-12 mx-auto animate-spin" /></CardContent>
    </Card>
);


interface MafiaGameProps {
  game: Game;
  self: Player;
}

export function MafiaGame({ game, self }: MafiaGameProps) {
  const isHost = game.hostId === self.id;
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const router = useRouter();
  const { toast } = useAuth();

  const handleLeaveGame = React.useCallback(async () => {
    setIsSubmitting(true);
    const result = await roomActions.leaveGame(game.id, self.id);
    if (result.success) {
      sessionStorage.removeItem(`player-${game.id}`);
      router.push('/');
      toast({ title: "لقد غادرت الغرفة." })
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
  }, [game.id, self.id, router, toast]);

  const renderContent = () => {
    switch (game.gameState) {
      case 'lobby':
        return <Lobby game={game} self={self} isHost={isHost} isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting} handleLeaveGame={handleLeaveGame} />;
      case 'role_reveal':
        return <RoleRevealPhase game={game} self={self} isHost={isHost} />;
      case 'night':
        return <NightPhase game={game} self={self} isHost={isHost} setIsSubmitting={setIsSubmitting} />;
      case 'discussion':
      case 'voting':
      case 'voting_results':
        return <DayPhase game={game} self={self} isHost={isHost} isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting} />;
      case 'final_results':
        return <FinalResultsPhase game={game} handleLeaveGame={handleLeaveGame} />;
      default:
         return <LoadingState text={`حالة غير معروفة: ${game.gameState}`} />;
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div key={game.gameState} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5, ease: 'easeInOut' }} className="w-full h-full flex items-center justify-center">
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
