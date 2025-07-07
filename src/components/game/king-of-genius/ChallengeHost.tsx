
'use client';

import type { Game, Player, GeniusChallenge } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { CodeBreaker } from './challenges/CodeBreaker';
import { FalseMemory } from './challenges/FalseMemory';
import { FindTheMistake } from './challenges/FindTheMistake';
import { CipherShift } from './challenges/CipherShift';
import { PathOfSurvival } from './challenges/PathOfSurvival';

interface ChallengeHostProps {
  game: Game;
  player: Player;
  self: Player;
  challenge: GeniusChallenge;
}

const challengeComponents: Record<string, React.FC<any>> = {
  code_breaker: CodeBreaker,
  false_memory: FalseMemory,
  find_the_mistake: FindTheMistake,
  cipher_shift: CipherShift,
  path_of_survival: PathOfSurvival,
};

export function ChallengeHost({ game, player, self, challenge }: ChallengeHostProps) {
  const ChallengeComponent = challengeComponents[challenge.id];

  if (!ChallengeComponent) {
    return <div>Challenge not found: {challenge.id}</div>;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={challenge.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.5 }}
        className="w-full"
      >
        <ChallengeComponent game={game} player={player} self={self} challenge={challenge} />
      </motion.div>
    </AnimatePresence>
  );
}
