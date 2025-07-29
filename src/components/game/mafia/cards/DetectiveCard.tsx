
import React from 'react';
import type { Player, MafiaRole } from '@/types';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DetectiveCardProps {
    self: Player;
    alivePlayers: Player[];
    hasActed: boolean;
    handleAction: (targetId: string) => void;
}

export function DetectiveCard({ self, alivePlayers, hasActed, handleAction }: DetectiveCardProps) {
    if (hasActed) {
        return <p className="text-center text-green-400 font-bold">لقد قمت بالتحقيق. انتظر الصباح.</p>;
    }

    return (
        <div className="space-y-4">
            <p className="font-bold text-center">اختر لاعبًا للكشف عن فريقه (خير أم مافيا).</p>
            <ScrollArea className="h-48">
                <div className="grid grid-cols-2 gap-2">
                    {alivePlayers.filter(p => p.id !== self.id).map(p => (
                        <Button key={p.id} variant="outline" className="h-auto flex-col gap-2 p-2" onClick={() => handleAction(p.id)}>
                            <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12"/>
                            <span>{p.name}</span>
                        </Button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
