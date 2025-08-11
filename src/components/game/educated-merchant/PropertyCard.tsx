
"use client";

// This is a placeholder component.
// The logic for buying or skipping a property will be implemented in the next step.

import type { Game, Player } from '@/types';

interface PropertyCardProps {
    game: Game;
    self: Player;
}

export function PropertyCard({ game, self }: PropertyCardProps) {
    // In the next step, this will show property details and buy/skip buttons.
    return (
        <div className="absolute z-20 p-4 bg-white rounded-lg shadow-xl">
            <h2 className="text-xl font-bold">تفاعل مع العقار</h2>
            <p>سيتم تنفيذ منطق الشراء والتخطي هنا.</p>
        </div>
    );
}
