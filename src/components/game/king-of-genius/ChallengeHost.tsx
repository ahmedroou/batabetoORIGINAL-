
'use client';

import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { QuickMath } from './challenges/QuickMath';
import { PathOfSurvival } from './challenges/PathOfSurvival';


interface ChallengeHostProps {
  game: Game;
  player: Player;
  self: Player;
  challenge: GeniusChallenge;
}

export function ChallengeHost({ game, player, self, challenge }: ChallengeHostProps) {
  switch (challenge.id) {
    case 'quick_math':
      return <QuickMath game={game} player={player} self={self} challenge={challenge} />;

    case 'path_of_survival':
      return <PathOfSurvival game={game} player={player} self={self} challenge={challenge} />;
      
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
