
"use client";

import type { Game, Player, MonopolyState, MonopolyTile } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';

interface PlayerHUDProps {
  player: Player;
  playerData: MonopolyState['playerData'][string];
  isCurrentTurn: boolean;
}

export function PlayerHUD({ player, playerData, isCurrentTurn }: PlayerHUDProps) {
  return (
    <div className={cn("p-2 rounded-lg shadow-md border-2", isCurrentTurn ? 'border-primary bg-primary/10' : 'border-gray-200 bg-white')}>
      <div className="flex items-center gap-2">
        <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" />
        <div>
          <h3 className="text-base font-bold">{player.name}</h3>
          <p className="text-sm font-semibold text-green-600">${playerData.money}</p>
        </div>
      </div>
      {playerData.inJail && <p className="text-xs text-red-500 font-bold text-center mt-1">في السجن</p>}
    </div>
  );
}
