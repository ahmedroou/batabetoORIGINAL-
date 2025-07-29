
import React from 'react';
import type { Player } from '@/types';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DoctorCardProps {
    self: Player;
    alivePlayers: Player[];
    hasActed: boolean;
    handleAction: (targetId: string) => void;
}

export function DoctorCard({ self, alivePlayers, hasActed, handleAction }: DoctorCardProps) {
    if (hasActed) {
        return <p className="text-center text-green-400 font-bold">لقد قمت بحماية هدفك. انتظر الصباح.</p>;
    }

    return (
        <div className="space-y-4">
            <p className="font-bold text-center text-gray-300">اختر لاعبًا لحمايته من القتل هذه الليلة (يمكنك حماية نفسك).</p>
            <ScrollArea className="h-48">
                <div className="grid grid-cols-2 gap-2">
                    {alivePlayers.map(p => (
                        <Button key={p.id} variant="outline" className="h-auto flex-col gap-2 p-2 bg-gray-800 text-white hover:bg-gray-700" onClick={() => handleAction(p.id)}>
                            <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12"/>
                            <span>{p.name}</span>
                        </Button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
