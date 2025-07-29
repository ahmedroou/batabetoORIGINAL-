
"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import * as roomActions from '@/lib/actions/room';
import { AnimatePresence, motion } from 'framer-motion';

// Phase Components
import { Lobby } from './phases/Lobby';
import { RoleRevealPhase } from './phases/RoleRevealPhase';
import { NightPhase } from './phases/NightPhase';
import { DayPhase } from './phases/DayPhase';
import { FinalResultsPhase } from './phases/FinalResultsPhase';

interface MafiaGameProps {
  game: Game;
  self: Player;
}

export function MafiaGame({ game, self }: MafiaGameProps) {
  const isHost = game.hostId === self.id;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLeaveGame = useCallback(async () => {
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
    const phaseProps = { game, self, isHost, isSubmitting, setIsSubmitting, handleLeaveGame };
    
    switch (game.gameState) {
      case 'lobby':
        return <Lobby {...phaseProps} />;
      case 'role_reveal':
        return <RoleRevealPhase {...phaseProps} />;
      case 'night':
        return <NightPhase {...phaseProps} />;
      case 'discussion':
      case 'voting':
      case 'voting_results':
        return <DayPhase {...phaseProps} />;
      case 'final_results':
        return <FinalResultsPhase {...phaseProps} />;
      default:
        return <div>حالة غير معروفة: {game.gameState}</div>;
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={game.gameState}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="w-full h-full flex items-center justify-center"
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
