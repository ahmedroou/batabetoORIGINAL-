
'use client';

import type { Game, Player, GeniusChallenge } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { CodeBreaker } from './challenges/CodeBreaker';

interface ChallengeHostProps {
  game: Game;
  player: Player;
  self: Player;
  challenge: GeniusChallenge;
}

const challengeComponents: Record<string, React.FC<any>> = {
  code_breaker: CodeBreaker,
};

export function ChallengeHost({ game, player, self, challenge }: ChallengeHostProps) {
  const ChallengeComponent = challengeComponents[challenge.id];

  if (!ChallengeComponent) {
    return <div>Challenge not found: {challenge.id}</div>;
  }

  return (
      <div className="w-full flex items-center justify-center">
        <ChallengeComponent game={game} player={player} self={self} challenge={challenge} />
      </div>
  );
}
