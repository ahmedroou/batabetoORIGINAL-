
'use client';

import type { Game, Player, QuizSwapCard, QuizSwapPlayerState } from '@/types';
import { QUIZ_SWAP_DECK_MAP } from '@/data/quiz-swap-cards';
import { Button } from '@/components/ui/button';
import { QuizSwapCardDisplay } from './Card';
import { AnimatePresence, motion } from 'framer-motion';
import { drawFromDeck, drawFromDiscard, playCard, endTurn } from '@/lib/actions/quizswap';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '../PlayerAvatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';


interface GameBoardProps {
    game: Game;
    self: Player;
}

export function QuizSwapBoard({ game, self }: GameBoardProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState<string | boolean>(false);
    const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
    const [targetPlayerId, setTargetPlayerId] = useState<string | null>(null);
    
    const quizSwapState = game.quizSwapState;
    if (!quizSwapState) return <div>خطأ: حالة اللعبة غير موجودة.</div>;

    const { players, drawPile, discardPile, turnIndex, phase } = quizSwapState;
    const selfState = players.find(p => p.id === self.id);
    const opponents = players.filter(p => p.id !== self.id);
    const currentPlayer = players[turnIndex];
    const isMyTurn = currentPlayer?.id === self.id;
    
    const topDiscardCard = discardPile.length > 0 ? QUIZ_SWAP_DECK_MAP.get(discardPile[discardPile.length - 1]) : null;

    const handleAction = async (action: () => Promise<any>, actionKey: string) => {
        if (isSubmitting) return;
        setIsSubmitting(actionKey);
        try {
            await action();
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
            setSelectedHandCardId(null);
            setTargetPlayerId(null);
        }
    };
    
    const onDrawFromDeck = () => handleAction(() => drawFromDeck(game.id, self.id), 'drawDeck');
    const onDrawFromDiscard = () => {
        if(topDiscardCard?.kind === 'special') {
             toast({ title: "غير مسموح", description: "لا يمكنك سحب بطاقة خاصة من كومة الرمي.", variant: "destructive" });
             return;
        }
        handleAction(() => drawFromDiscard(game.id, self.id), 'drawDiscard');
    };
    const onEndTurn = () => handleAction(() => endTurn(game.id, self.id), 'endTurn');
    
    const onSelectHandCard = (cardId: string) => {
        if (!isMyTurn || phase !== 'playing') return;
        const card = QUIZ_SWAP_DECK_MAP.get(cardId);
        if (!card) return;

        if (card.kind === 'special') {
            const needsTarget = ['PeekOpponent', 'SwapWithOpponent', 'Burden', 'Expose'].includes(card.effect);
            if (needsTarget) {
                setSelectedHandCardId(cardId); // Open target selection modal
            } else {
                // Play immediately
                handleAction(() => playCard(game.id, self.id, cardId), `play-${cardId}`);
            }
        } else {
            // It's a question card, just select it to discard
            setSelectedHandCardId(cardId);
        }
    };

    const onPlaySelectedCard = (targetId?: string) => {
        if (!selectedHandCardId) return;
        handleAction(() => playCard(game.id, self.id, selectedHandCardId, targetId), `play-${selectedHandCardId}`);
    };


    return (
        <>
        <div className="w-full h-full p-4 flex flex-col items-center justify-between bg-gray-800 text-white">
            {/* Opponents' hands at the top */}
            <div className="flex justify-center gap-8">
                {opponents.map(player => (
                    <div key={player.id} className="flex flex-col items-center">
                        <p className="font-bold mb-2">{player.name} {player.id === currentPlayer?.id ? '(دوره)' : ''}</p>
                        <div className="flex gap-2">
                            {player.hand.map(cardId => (
                                <QuizSwapCardDisplay key={cardId} card={QUIZ_SWAP_DECK_MAP.get(cardId)} faceUp={false} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Deck and Discard Pile in the middle */}
            <div className="flex gap-8 my-8 items-center">
                <div className="flex flex-col items-center">
                    <p className="font-semibold mb-2">كومة السحب ({drawPile.length})</p>
                    <div className="w-24 h-36 border-2 border-dashed border-gray-500 rounded-lg flex items-center justify-center">
                       {drawPile.length > 0 && phase === 'playing' && isMyTurn &&
                        <Button variant="ghost" className="w-full h-full" onClick={onDrawFromDeck} disabled={!!isSubmitting}>
                           <QuizSwapCardDisplay card={QUIZ_SWAP_DECK_MAP.get(drawPile[0])} faceUp={false} />
                        </Button>
                       }
                    </div>
                </div>
                 <div className="flex flex-col items-center">
                    <p className="font-semibold mb-2">كومة الرمي</p>
                     <div className="w-24 h-36">
                        {topDiscardCard && 
                        <Button variant="ghost" className="w-full h-full" onClick={onDrawFromDiscard} disabled={!isMyTurn || !!isSubmitting || phase !== 'playing'}>
                           <QuizSwapCardDisplay card={topDiscardCard} faceUp={true} />
                        </Button>
                        }
                    </div>
                </div>
                 {isMyTurn && phase === 'playing' && (
                     <Button onClick={onEndTurn} disabled={!!isSubmitting}>
                        {isSubmitting === 'endTurn' ? <Loader2 className="animate-spin" /> : 'إنهاء الدور'}
                     </Button>
                 )}
            </div>

            {/* Self hand at the bottom */}
            <div className="flex flex-col items-center bg-gray-900/50 p-4 rounded-lg">
                 <p className="font-bold mb-2">{self.name} (أنت) {isMyTurn ? '(دورك)' : ''}</p>
                <div className="flex gap-2">
                    {selfState?.hand.map(cardId => (
                        <button key={cardId} onClick={() => onSelectHandCard(cardId)} disabled={!isMyTurn || phase !== 'playing' || !!isSubmitting} className={cn(selectedHandCardId === cardId && "ring-2 ring-yellow-400 rounded-lg")}>
                           <QuizSwapCardDisplay card={QUIZ_SWAP_DECK_MAP.get(cardId)} faceUp={true} />
                        </button>
                    ))}
                </div>
            </div>
        </div>
        
        <Dialog open={!!selectedHandCardId && QUIZ_SWAP_DECK_MAP.get(selectedHandCardId)?.kind === 'special' && ['PeekOpponent', 'SwapWithOpponent', 'Burden', 'Expose'].includes(QUIZ_SWAP_DECK_MAP.get(selectedHandCardId)!.effect)} onOpenChange={() => setSelectedHandCardId(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>اختر لاعبًا مستهدفًا</DialogTitle>
                    <DialogDescription>اختر اللاعب الذي تريد تطبيق تأثير البطاقة عليه.</DialogDescription>
                </DialogHeader>
                <div className="flex justify-center gap-4 py-4">
                    {opponents.map(opp => (
                         <Button key={opp.id} variant={targetPlayerId === opp.id ? "default" : "outline"} onClick={() => setTargetPlayerId(opp.id)} className="flex flex-col h-24 w-20">
                            <PlayerAvatar avatarId={opp.avatarId} className="w-12 h-12 mb-1"/>
                            <span>{opp.name}</span>
                         </Button>
                    ))}
                </div>
                <Button onClick={() => onPlaySelectedCard(targetPlayerId!)} disabled={!targetPlayerId || !!isSubmitting}>
                    {isSubmitting ? <Loader2 className="animate-spin" /> : "تأكيد"}
                </Button>
            </DialogContent>
        </Dialog>
        </>
    );
}
