
"use client";

import type { Game, Player, MonopolyState, MonopolyTile } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Home, Hotel, Landmark, Gavel } from 'lucide-react';
import * as monopolyActions from '@/lib/actions/monopoly';
import { useToast } from '@/hooks/use-toast';

interface ManagePropertiesModalProps {
    isOpen: boolean;
    onClose: () => void;
    game: Game;
    player: Player;
}

const ManagePropertiesModal = ({ 
    isOpen, 
    onClose, 
    game, 
    player,
}: ManagePropertiesModalProps) => {
    const { toast } = useToast();
    if (!game.monopolyState) return null;

    const board = game.monopolyState.board;
    const playerData = game.monopolyState.playerData[player.id];

    if (!playerData) return null;

    const propertiesByGroup = playerData.properties?.reduce((acc, propIndex) => {
        const prop = board[propIndex];
        if (prop && prop.color) {
            if (!acc[prop.color]) {
                acc[prop.color] = [];
            }
            acc[prop.color].push(propIndex);
        }
        return acc;
    }, {} as Record<string, number[]>) || {};

    const handleImprove = async (propertyIndex: number) => {
        try {
            await monopolyActions.improveProperty(game.id, player.id, propertyIndex);
            toast({ title: "تم بناء منزل بنجاح!" });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>ممتلكات {player.name}</DialogTitle>
                    <DialogDescription>عرض وتحسين الممتلكات الخاصة بك.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-96">
                    <div className="space-y-4 pr-2">
                        {Object.entries(propertiesByGroup).map(([color, properties]) => {
                             const allInGroup = board.filter(p => p.color === color).length;
                             const hasAllInGroup = properties.length === allInGroup;

                             return (
                                <div key={color} className="p-3 rounded-lg border-2" style={{ borderColor: color }}>
                                    <h3 className="font-bold text-lg" style={{ color: color }}>مجموعة {color}</h3>
                                    {!hasAllInGroup && <p className="text-xs text-muted-foreground">يجب أن تمتلك كل المجموعة للبناء.</p>}
                                    <div className="space-y-2 mt-2">
                                        {properties.map(propIndex => {
                                            const prop = board[propIndex]!;
                                            const houses = playerData.propertyLevels?.[propIndex] || 0;

                                            return (
                                                <div key={propIndex} className="flex justify-between items-center p-2 bg-muted rounded-md">
                                                    <div>
                                                        <h4 className="font-bold">{prop.name}</h4>
                                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                            {Array(houses).fill(0).map((_, i) => <Home key={i} className="w-4 h-4 text-green-500" />)}
                                                        </div>
                                                    </div>
                                                     {hasAllInGroup && houses < 5 && (
                                                        <Button size="sm" onClick={() => handleImprove(propIndex)} disabled={playerData.money < (prop.houseCost || 9999)}>
                                                            بناء ({prop.houseCost}$)
                                                        </Button>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                             )
                        })}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}

interface PlayerHUDProps {
  playerData: Game['monopolyState']['playerData'][string];
  player: Player;
  isCurrentTurn: boolean;
  game: Game;
}

export function PlayerHUD({ playerData, player, isCurrentTurn, game }: PlayerHUDProps) {
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
                <Landmark className="w-4 h-4" /> {playerData.properties?.length || 0}
            </span>
        </div>
      </div>
      {playerData.inJail && 
        <div className="text-xs text-red-500 font-bold text-center mt-1 flex items-center justify-center gap-1">
            <Gavel className="w-4 h-4"/>
            <span>في السجن ({playerData.jailTurns})</span>
        </div>
      }
    </div>
    <ManagePropertiesModal 
        isOpen={isManageModalOpen} 
        onClose={() => setIsManageModalOpen(false)} 
        player={player}
        game={game}
    />
    </>
  );
}
