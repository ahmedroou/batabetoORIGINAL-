
"use client";

// This is a placeholder component.
// The logic for displaying and answering questions will be implemented in the next step.

import type { Game, Player } from '@/types';

interface QuestionModalProps {
    game: Game;
    self: Player;
}

export function QuestionModal({ game, self }: QuestionModalProps) {
    // In the next step, this will show a question with multiple choice options.
    return (
        <div className="absolute z-30 p-4 bg-blue-100 rounded-lg shadow-2xl border-2 border-blue-400">
            <h2 className="text-xl font-bold">سؤال!</h2>
            <p>سيتم عرض السؤال وخياراته هنا.</p>
        </div>
    );
}
