
"use client";

import type { Game, Player } from '@/types';

interface DayPhaseProps {
    game: Game;
    self: Player;
}

export function DayPhase({ game, self }: DayPhaseProps) {
    // This will be expanded later with discussion and event displays.
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-blue-100 text-gray-800">
            <h1 className="text-4xl font-bold">أشرقت الشمس...</h1>
            <p className="text-xl text-muted-foreground mt-2">حان وقت النقاش والتصويت.</p>
            {/* TODO: Add event log and chat components here */}
        </div>
    );
}
