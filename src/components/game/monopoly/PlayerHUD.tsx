
"use client";

import type { Game, Player, MonopolyState, MonopolyTile } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Landmark, ScrollArea } from 'lucide-react';
import { useState } from 'react';

interface PlayerHUDProps {
  player: Player;
  playerData: MonopolyState['playerData'][string];
  isCurrentTurn: boolean;
}

const ManagePropertiesModal = ({ isOpen, onClose, player, playerData, board }: { isOpen: boolean, onClose: () => void, player: Player, playerData: MonopolyState['playerData'][string], board: MonopolyTile[] }) => {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>ممتلكات {player.name}</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-64">
                    <div className="space-y-2">
                        {playerData.properties.map(propIndex => {
                            const prop = board[propIndex];
                            return (
                                <div key={propIndex} className="p-2 border rounded-md">
                                    <h4 className="font-bold">{prop?.name}</h4>
                                    {/* Add more details and management options here */}
                                </div>
                            )
                        })}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}

export function PlayerHUD({ player, playerData, isCurrentTurn }: PlayerHUDProps) {
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  
  if (!playerData) {
      return (
          <div className={cn("p-2 rounded-lg shadow-md border-2 border-gray-200 bg-gray-100 opacity-50")}>
            <p>{player.name} (غادر)</p>
          </div>
      );
  }

  return (
    <>
    <div className={cn("p-2 rounded-lg shadow-md border-2 cursor-pointer", isCurrentTurn ? 'border-primary bg-primary/10' : 'border-gray-200 bg-white')} onClick={() => setIsManageModalOpen(true)}>
      <div className="flex items-center gap-2">
        <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" />
        <div>
          <h3 className="text-base font-bold">{player.name}</h3>
          <p className="text-sm font-semibold text-green-600">${playerData.money}</p>
        </div>
        <div className="flex-grow text-right">
            <span className="text-xs font-semibold text-gray-500 flex items-center justify-end gap-1">
                <Landmark className="w-4 h-4" /> {playerData.properties.length}
            </span>
        </div>
      </div>
      {playerData.inJail && <p className="text-xs text-red-500 font-bold text-center mt-1">في السجن</p>}
    </div>
    {/* <ManagePropertiesModal isOpen={isManageModalOpen} onClose={() => setIsManageModalOpen(false)} player={player} playerData={playerData} board={[]} /> */}
    </>
  );
}
