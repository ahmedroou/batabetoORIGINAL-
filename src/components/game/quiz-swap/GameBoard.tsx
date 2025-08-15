
'use client';

import type { Game, Player, QuizSwapCard, QuizSwapPlayerState } from '@/types';
import { QUIZ_SWAP_DECK_MAP } from '@/data/quiz-swap-cards';
import { Card, CardContent } from '@/components/ui/card';
import { QuizSwapCardDisplay } from './Card';
import { AnimatePresence, motion } from 'framer-motion';

interface GameBoardProps {
    game: Game;
    self: Player;
}

export function QuizSwapBoard({ game, self }: GameBoardProps) {
    const quizSwapState = game.quizSwapState;

    if (!quizSwapState) {
        return <div>خطأ: حالة اللعبة غير موجودة.</div>;
    }

    const { players, drawPile, discardPile, turnIndex, phase } = quizSwapState;
    const selfState = players.find(p => p.id === self.id) as QuizSwapPlayerState | undefined;
    const opponents = players.filter(p => p.id !== self.id);

    return (
        <div className="w-full h-full p-4 flex flex-col items-center justify-between bg-gray-800 text-white">
            {/* Opponents' hands at the top */}
            <div className="flex justify-center gap-8">
                {opponents.map(player => (
                    <div key={player.id} className="flex flex-col items-center">
                        <p className="font-bold mb-2">{player.name}</p>
                        <div className="flex gap-2">
                            {player.hand.map(cardId => (
                                <QuizSwapCardDisplay key={cardId} card={QUIZ_SWAP_DECK_MAP.get(cardId)} faceUp={false} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Deck and Discard Pile in the middle */}
            <div className="flex gap-8 my-8">
                <div className="flex flex-col items-center">
                    <p className="font-semibold mb-2">كومة السحب</p>
                    <div className="w-24 h-36 border-2 border-dashed border-gray-500 rounded-lg flex items-center justify-center">
                       {drawPile.length > 0 && <QuizSwapCardDisplay card={QUIZ_SWAP_DECK_MAP.get(drawPile[0])} faceUp={false} />}
                        <span className="absolute text-sm text-gray-400">{drawPile.length}</span>
                    </div>
                </div>
                 <div className="flex flex-col items-center">
                    <p className="font-semibold mb-2">كومة الرمي</p>
                     <div className="w-24 h-36">
                        {discardPile.length > 0 && <QuizSwapCardDisplay card={QUIZ_SWAP_DECK_MAP.get(discardPile[discardPile.length - 1])} faceUp={true} />}
                    </div>
                </div>
            </div>

            {/* Self hand at the bottom */}
            <div className="flex flex-col items-center">
                 <p className="font-bold mb-2">{self.name} (أنت)</p>
                <div className="flex gap-2">
                    {selfState?.hand.map(cardId => (
                        <QuizSwapCardDisplay key={cardId} card={QUIZ_SWAP_DECK_MAP.get(cardId)} faceUp={false} />
                    ))}
                </div>
            </div>
        </div>
    );
}

