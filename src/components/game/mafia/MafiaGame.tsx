
"use client";

import { useMemo } from 'react';
import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
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

  const renderContent = () => {
    switch (game.gameState) {
      case 'lobby':
        return <Lobby game={game} self={self} />;
      case 'role_reveal':
        return <RoleRevealPhase game={game} self={self} />;
      case 'night':
        return <NightPhase game={game} self={self} />;
      case 'discussion':
      case 'voting':
      case 'voting_results':
        return <DayPhase game={game} self={self} />;
      case 'final_results':
        return <FinalResultsPhase game={game} self={self} />;
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
