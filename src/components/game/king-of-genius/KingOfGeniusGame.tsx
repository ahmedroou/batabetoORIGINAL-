
'use client';

import { useState, useEffect } from 'react';
import type { Game, Player } from '@/types';
import { TeamSelection } from './TeamSelection';
import { ChallengeIntro } from './ChallengeIntro';
import { ChallengeHost } from './ChallengeHost';
import { RoundResults } from './RoundResults';
import { GENIUS_CHALLENGE_MAP } from '@/data/genius-challenges';

interface KingOfGeniusGameProps {
  game: Game;
  player: Player;
  self: Player;
  isHost: boolean;
}

export function KingOfGeniusGame({ game, player, self, isHost }: KingOfGeniusGameProps) {
    const [view, setView] = useState(game.gameState);
    
    useEffect(() => {
        if(game.gameState === 'challenge_intro') {
            setView('challenge_intro');
        } else {
            setView(game.gameState);
        }
    }, [game.gameState]);
    
    const renderContent = () => {
        const challengeId = game.challengeOrder?.[game.currentChallengeIndex || 0];
        const currentChallenge = challengeId ? GENIUS_CHALLENGE_MAP.get(challengeId) : null;
        
        switch (view) {
          case 'team_selection':
            return <TeamSelection game={game} self={self} isHost={isHost} />;
          
          case 'challenge_intro':
            if (!currentChallenge) return <div>Loading challenge...</div>;
            return <ChallengeIntro game={game} challenge={currentChallenge} onComplete={() => setView('challenge_active')} />;
            
          case 'challenge_active':
            if (!currentChallenge) return <div>Loading challenge...</div>;
            return <ChallengeHost game={game} player={player} self={self} challenge={currentChallenge} />;

          case 'challenge_results':
             if (!currentChallenge) return <div>Loading results...</div>;
             return <RoundResults game={game} self={self} isHost={isHost} challenge={currentChallenge} />;
            
          case 'final_results':
            const winner = (game.teamScores?.A || 0) > (game.teamScores?.B || 0) ? 'الفريق الأزرق' : 'الفريق الأحمر';
            return <div><h1>انتهت اللعبة!</h1><p>الفائز هو {winner}</p></div>;

          default:
            return <TeamSelection game={game} self={self} isHost={isHost} />;
        }
      };

  return <div className="w-full flex items-center justify-center">{renderContent()}</div>;
}
