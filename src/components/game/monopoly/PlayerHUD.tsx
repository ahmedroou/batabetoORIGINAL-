
"use client";

import type { Game, Player, MonopolyState, MonopolyTile } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';

interface PlayerHUDProps {
  player: Player;
  playerData: MonopolyState['playerData'][string];
  isCurrentTurn: boolean;
}

export function PlayerHUD({ player, playerData, isCurrentTurn }: PlayerHUDProps) {
  return (
    <div className={`p-4 rounded-lg shadow-md border-2 ${isCurrentTurn ? 'border-primary' : 'border-gray-200'}`}>
      <div className="flex items-center gap-4">
        <PlayerAvatar avatarId={player.avatarId} className="w-16 h-16" />
        <div>
          <h3 className="text-xl font-bold">{player.name}</h3>
          <p className="text-lg font-semibold text-green-600">${playerData.money}</p>
        </div>
      </div>
      <div className="mt-2 text-sm">
        <p>الموقع: {playerData.position}</p>
        <p>الممتلكات: {playerData.properties.length}</p>
        {playerData.inJail && <p className="text-red-500 font-bold">في السجن ({playerData.jailTurns} دورات)</p>}
      </div>
    </div>
  );
}
