
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
    return (
        <div className="p-4 bg-gray-100 rounded-lg shadow-inner space-y-2 text-center">
            <h3 className="font-bold">انتظر دورك...</h3>
        </div>
    );
  }

  const turnPhase = monopolyState.turnPhase;
  const currentTurnPlayer = game.players.find(p => p.id === monopolyState.turnOrder[monopolyState.currentTurnIndex]);

  return (
    <div className="p-4 bg-gray-100 rounded-lg shadow-inner space-y-2">
      <h3 className="font-bold text-center">دورك يا {currentTurnPlayer?.name}!</h3>
      
      {turnPhase === 'start' && (
        <Button onClick={onRollDice} className="w-full">
          <Dices className="mr-2" />
          ارمي النرد
        </Button>
      )}

      {turnPhase === 'dice_rolled' && (
        <div className="text-center p-2 bg-blue-100 rounded-md">
            <p className="text-sm text-gray-600">
                لقد رميت <span className="font-bold">{monopolyState.dice[0]! + monopolyState.dice[1]!}</span>.
            </p>
             <p className="text-sm text-gray-600">
                اضغط على "إنهاء الدور".
            </p>
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
