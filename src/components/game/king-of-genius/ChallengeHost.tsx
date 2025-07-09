
'use client';

import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CodeBreaker } from './challenges/CodeBreaker';
import { QuickMath } from './challenges/QuickMath';
import { PathOfSurvival } from './challenges/PathOfSurvival';
import { VisualMemory } from './challenges/VisualMemory';


interface ChallengeHostProps {
  game: Game;
  player: Player;
  self: Player;
  challenge: GeniusChallenge;
}

export function ChallengeHost({ game, player, self, challenge }: ChallengeHostProps) {
  switch (challenge.id) {
    case 'code_breaker':
      return <CodeBreaker game={game} player={player} self={self} challenge={challenge} />;
    
    case 'quick_math':
      return <QuickMath game={game} player={player} self={self} challenge={challenge} />;

    case 'path_of_survival':
      return <PathOfSurvival game={game} player={player} self={self} challenge={challenge} />;
      
    case 'visual_memory':
      return <VisualMemory game={game} player={player} self={self} challenge={challenge} />;

    default:
      return (
        <Card className="w-full max-w-md bg-white">
          <CardHeader>
            <CardTitle>تحدي غير معروف</CardTitle>
            <CardDescription>
              لا يمكن تحميل هذا التحدي. قد يكون هناك خطأ في إعدادات اللعبة.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>معرف التحدي: {challenge.id}</p>
          </CardContent>
        </Card>
      );
  }
}
