
import React from 'react';
import type { Player } from '@/types';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ExplosiveCardProps {
    self: Player;
    alivePlayers: Player[];
    hasActed: boolean;
    handleAction: (targetId: string) => void;
}

export function ExplosiveCard({ self, alivePlayers, hasActed, handleAction }: ExplosiveCardProps) {
    if (hasActed) {
        return <p className="text-center text-green-400 font-bold">لقد زرعت فخك. انتظر الصباح.</p>;
    }

    return (
        <div className="space-y-4">
            <p className="font-bold text-center text-gray-300">اختر لاعبًا لتفجيره معك إذا تم قتلك هذه الليلة.</p>
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
