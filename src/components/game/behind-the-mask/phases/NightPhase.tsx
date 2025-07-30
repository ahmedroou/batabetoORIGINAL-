
"use client";

import type { Game, Player } from '@/types';

interface NightPhaseProps {
    game: Game;
    self: Player;
}

export function NightPhase({ game, self }: NightPhaseProps) {
    // This will be expanded later with role-specific action cards.
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white">
            <h1 className="text-4xl font-bold">حل الظلام...</h1>
            <p className="text-xl text-muted-foreground mt-2">استخدم قدرتك الآن.</p>
            {/* TODO: Add role-specific action components here */}
        </div>
    );
}
