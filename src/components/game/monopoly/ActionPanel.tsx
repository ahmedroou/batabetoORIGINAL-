
"use client";

import type { Game, Player, MonopolyState } from '@/types';
import { Button } from '@/components/ui/button';
import { Dices, Landmark, Building, Hotel, XCircle, Bank, ArrowRightLeft, Gavel } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buyProperty } from '@/lib/actions/monopoly';
import Dice, { DiceHandle } from './Dice';
import { useRef } from 'react';

interface ActionPanelProps {
  game: Game;
  self: Player;
  onRollDice: () => void;
  onEndTurn: () => void;
  onManageProperties: () => void;
}

export function ActionPanel({ game, self, onRollDice, onEndTurn, onManageProperties }: ActionPanelProps) {
  const monopolyState = game.monopolyState;
  const { toast } = useToast();
  const diceRef = useRef<DiceHandle>(null);
  
  if (!monopolyState) return null;

  const isMyTurn = monopolyState.turnOrder[monopolyState.currentTurnIndex] === self.id;
  
  if (!isMyTurn) {
    return (
        <div className="p-4 bg-gray-100 rounded-lg shadow-inner space-y-2 text-center h-full flex flex-col justify-center">
            <h3 className="font-bold text-lg animate-pulse">انتظر دورك...</h3>
        </div>
    );
  }

  const turnPhase = monopolyState.turnPhase;
  const currentTurnPlayer = game.players.find(p => p.id === self.id);
  if (!currentTurnPlayer) return null;
  
  const playerData = monopolyState.playerData[self.id];
  if (!playerData) return null;

  const currentPosition = playerData.position || 0;
  const currentTile = monopolyState.board[currentPosition];
  const isOwnable = currentTile?.type === 'property' || currentTile?.type === 'railroad' || currentTile?.type === 'utility';
  const owner = isOwnable ? Object.entries(monopolyState.playerData).find(([pid, data]) => data.properties?.includes(currentPosition))?.[0] : undefined;


  const handleBuyProperty = async () => {
    try {
      await buyProperty(game.id, self.id);
      toast({ title: "تم الشراء بنجاح!", description: `لقد اشتريت ${currentTile?.name}.` });
    } catch (error: any) {
      toast({ title: "خطأ في الشراء", description: error.message, variant: 'destructive' });
    }
  };
  
  const handleDiceRoll = () => {
      onRollDice();
  }

  return (
    <div className="p-4 bg-gray-100 rounded-lg shadow-inner space-y-4 h-full flex flex-col">
      <h3 className="font-bold text-center text-lg">دورك يا {currentTurnPlayer?.name}!</h3>
      
      <div className="flex justify-center items-center h-32">
        <Dice ref={diceRef} initialValue1={monopolyState.dice[0]} initialValue2={monopolyState.dice[1]} />
      </div>

      <div className="flex-grow space-y-2">
        {turnPhase === 'start' && (
          <Button onClick={handleDiceRoll} className="w-full">
            <Dices className="mr-2" />
            {playerData.inJail ? "ارمِ للخروج من السجن" : "ارمي النرد"}
          </Button>
        )}

        {turnPhase === 'action' && isOwnable && !owner && currentTile.price && playerData.money >= currentTile.price && (
          <Button onClick={handleBuyProperty} className="w-full bg-green-600 hover:bg-green-700">
            شراء "{currentTile.name}" مقابل ${currentTile.price}
          </Button>
        )}
      </div>

       <p className="text-center text-sm text-gray-600 h-10 overflow-y-auto">{monopolyState.lastActivity}</p>

      <div className="mt-auto space-y-2">
        <Button onClick={onManageProperties} variant="outline" className="w-full">
          <Landmark className="mr-2" />
          إدارة الممتلكات
        </Button>

        {turnPhase !== 'start' && !playerData.doublesCount && (
          <Button onClick={onEndTurn} variant="secondary" className="w-full">
            <XCircle className="mr-2" />
            إنهاء الدور
          </Button>
        )}
      </div>
    </div>
  );
}
