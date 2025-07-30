
"use client";

import type { Game, Player } from '@/types';

interface VotingPhaseProps {
    game: Game;
    self: Player;
}

export function VotingPhase({ game, self }: VotingPhaseProps) {
    // This will be expanded later with the voting UI.
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-red-100 text-gray-800">
            <h1 className="text-4xl font-bold">مرحلة التصويت</h1>
            <p className="text-xl text-muted-foreground mt-2">اختر من تعتقد أنه من الأشرار لإعدامه.</p>
            {/* TODO: Add player voting grid here */}
        </div>
    );
}
