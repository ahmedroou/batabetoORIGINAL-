
'use client';

import { useState, useEffect } from 'react';
import type { Game, Player } from '@/types';
import { TeamSelection } from './TeamSelection';
import { ChallengeIntro } from './ChallengeIntro';
import { ChallengeHost } from './ChallengeHost';
import { RoundResults } from './RoundResults';
import { GENIUS_CHALLENGE_MAP } from '@/data/genius-challenges';
import { FinalResults } from './FinalResults';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface KingOfGeniusGameProps {
  game: Game;
  player: Player;
  self: Player;
  isHost: boolean;
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
            if (!currentChallenge) return <LoadingState text="جاري تحميل التحدي..." />;
            return <ChallengeIntro game={game} challenge={currentChallenge} onComplete={() => setView('challenge_active')} />;
            
          case 'challenge_active':
            if (!currentChallenge) return <LoadingState text="جاري تحميل التحدي..." />;
            return <ChallengeHost game={game} player={player} self={self} challenge={currentChallenge} />;

          case 'challenge_results':
             if (!currentChallenge) return <LoadingState text="جاري عرض النتائج..." />;
             return <RoundResults game={game} self={self} isHost={isHost} challenge={currentChallenge} />;
            
          case 'final_results':
            const finalWinner = game.gameResult?.winner || ((game.teamScores?.A || 0) > (game.teamScores?.B || 0) ? 'الفريق الأزرق' : ((game.teamScores?.B || 0) > (game.teamScores?.A || 0) ? 'الفريق الأحمر' : 'تعادل'));
            const finalMessage = game.gameResult?.message || "انتهت المواجهة!";
            return <FinalResults winner={finalWinner as any} message={finalMessage} />;

          default:
            return <TeamSelection game={game} self={self} isHost={isHost} />;
        }
      };

  return (
      <div className="w-full flex items-center justify-center">
        <AnimatePresence mode="wait">
            <motion.div
                key={view}
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
