
import React from 'react';
import type { Player, MafiaRole } from '@/types';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface KillerCardProps {
    self: Player;
    alivePlayers: Player[];
    hasActed: boolean;
    handleAction: (killTarget: string) => void;
}

export function KillerCard({ self, alivePlayers, hasActed, handleAction }: KillerCardProps) {
    if (hasActed) {
        return <p className="text-center text-green-400 font-bold">لقد اخترت ضحيتك. انتظر الصباح.</p>;
    }

    return (
        <div className="space-y-4">
            <p className="font-bold text-center text-red-300">اختر ضحيتك لهذه الليلة.</p>
            <ScrollArea className="h-48">
                <div className="grid grid-cols-2 gap-2">
                    {alivePlayers.filter(p => p.id !== self.id).map(p => (
                        <Button key={p.id} variant="destructive" className="h-auto flex-col gap-2 p-2" onClick={() => handleAction(p.id)}>
                            <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12"/>
                            <span>{p.name}</span>
                        </Button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
