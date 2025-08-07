
"use client";

import type { Game, Player, MonopolyState } from '@/types';
import { Button } from '@/components/ui/button';
import { Dices, Landmark, Building, Hotel, XCircle } from 'lucide-react';

interface ActionPanelProps {
  game: Game;
  self: Player;
  onRollDice: () => void;
  onEndTurn: () => void;
  onManageProperties: () => void;
}

export function ActionPanel({ game, self, onRollDice, onEndTurn, onManageProperties }: ActionPanelProps) {
  const monopolyState = game.monopolyState;
  if (!monopolyState) return null;
  const isMyTurn = monopolyState.turnOrder[monopolyState.currentTurnIndex] === self.id;
  
  if (!isMyTurn) {
    return null;
  }

  const turnPhase = monopolyState.turnPhase;

  return (
    <div className="p-4 bg-gray-100 rounded-lg shadow-inner space-y-2">
      <h3 className="font-bold text-center">دورك يا {self.name}!</h3>
      
      {turnPhase === 'start' && (
        <Button onClick={onRollDice} className="w-full">
          <Dices className="mr-2" />
          ارمي النرد
        </Button>
      )}

      {turnPhase === 'dice_rolled' && (
        <p className="text-center text-sm text-gray-600">
            تحركت {monopolyState.dice[0]! + monopolyState.dice[1]!} خطوات.
        </p>
      )}

      {turnPhase === 'action' && (
        <div className="space-y-2">
           {/* Add action buttons here like buy property, pay rent, etc. */}
        </div>
      )}

      {(turnPhase === 'action' || turnPhase === 'dice_rolled') && (
         <Button onClick={onEndTurn} variant="secondary" className="w-full">
          <XCircle className="mr-2" />
          إنهاء الدور
        </Button>
      )}

      <Button onClick={onManageProperties} variant="outline" className="w-full">
        <Landmark className="mr-2" />
        إدارة الممتلكات
      </Button>
    </div>
  );
}
