"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Game, Player } from "@/types";
import { QUIZ_SWAP_DECK_MAP } from "@/data/quiz-swap-cards";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QuizSwapCardDisplay } from "./Card";
import { AnimatePresence, motion } from "framer-motion";
import { drawFromDeck, drawFromDiscard, playCard, endTurn } from "@/lib/actions/quizswap";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, Eye } from "lucide-react";

interface GameBoardProps {
  game: Game;
  self: Player;
}

// Difficulty color map — centralized so it's easy to change
const DIFFICULTY_COLOR: Record<string, string> = {
  easy: "#28a745", // أخضر
  medium: "#ffc107", // أصفر
  hard: "#dc3545", // أحمر
};

export function QuizSwapBoard({ game, self }: GameBoardProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingActionLabel, setPendingActionLabel] = useState<string | null>(null);
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
  const [confirmTakeDiscard, setConfirmTakeDiscard] = useState(false);
  const confirmResolveRef = useRef<(v: boolean) => void | null>(null);

  const quizSwapState = game.quizSwapState;
  if (!quizSwapState) return <div role="alert">خطأ: حالة اللعبة غير موجودة.</div>;

  const { players, drawPile, discardPile, turnIndex, phase, timer } = quizSwapState;
  const selfState = players.find((p) => p.id === self.id)!;
  const opponents = players.filter((p) => p.id !== self.id);
  const currentPlayer = players[turnIndex];
  const isMyTurn = currentPlayer?.id === self.id;
  
  const isDiscardingPhase = isMyTurn && phase === 'discarding';


  // top of draw/discard is last element — consistent everywhere
  const topDrawId = drawPile.length > 0 ? drawPile[drawPile.length - 1] : null;
  const topDiscardId = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
  const topDiscardCard = topDiscardId ? QUIZ_SWAP_DECK_MAP.get(topDiscardId) : null;
  const topDrawCard = topDrawId ? QUIZ_SWAP_DECK_MAP.get(topDrawId) : null;

  // helper: show toast on error
  const withSubmission = useCallback(async <T,>(label: string, fn: () => Promise<T>) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setPendingActionLabel(label);
    try {
      const res = await fn();
      return res;
    } catch (err: any) {
      toast({ title: "خطأ", description: err?.message || String(err), variant: "destructive" });
      throw err;
    } finally {
      setIsSubmitting(false);
      setPendingActionLabel(null);
    }
  }, [isSubmitting, toast]);

  // confirm modal helper for actions that require user confirmation
  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmTakeDiscard(true);
      // modal will show message via pendingActionLabel
      setPendingActionLabel(message);
    });
  }, []);

  // wire modal accept/decline
  useEffect(() => {
    if (!confirmTakeDiscard) return;
    // no-op; resolution handled by handlers below
  }, [confirmTakeDiscard]);

  const handleConfirm = (accepted: boolean) => {
    setConfirmTakeDiscard(false);
    setPendingActionLabel(null);
    if (confirmResolveRef.current) {
      confirmResolveRef.current(accepted);
      confirmResolveRef.current = null;
    }
  };

  // Actions
  const onDrawFromDeck = () => withSubmission('سحب من الكومة', () => drawFromDeck(game.id, self.id));

  const onDrawFromDiscard = async () => {
    if (!topDiscardCard) return;
    if (topDiscardCard.kind === 'special') {
      toast({ title: 'غير مسموح', description: 'لا يمكنك سحب بطاقة خاصة من كومة الرمي.', variant: 'destructive' });
      return;
    }

    // confirm because this forces a swap (game rule)
    const ok = await confirm('سحب البطاقة المكشوفة سيطلب منك استبدالها ببطاقة من يدك — تأكيد؟');
    if (!ok) return;

    return withSubmission('سحب من كومة الرمي', () => drawFromDiscard(game.id, self.id));
  };

  const onEndTurn = () => withSubmission('إنهاء الدور', () => endTurn(game.id, self.id));

  // play a card from hand (e.g., when taking / swapping) — generic wrapper
  const onPlayCard = (cardId: string) => {
      withSubmission('لعب البطاقة', () => playCard(game.id, self.id, cardId))
      .then(() => setSelectedHandCardId(null)); // Deselect card after playing
  };


  // keyboard navigation: left/right to cycle selected card
  const selectNext = (dir: number) => {
    const hand = selfState.hand;
    if (!hand || hand.length === 0) return;
    const idx = selectedHandCardId ? hand.indexOf(selectedHandCardId) : -1;
    let next = idx + dir;
    if (next < 0) next = hand.length - 1;
    if (next >= hand.length) next = 0;
    setSelectedHandCardId(hand[next]);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') selectNext(-1);
      if (e.key === 'ArrowRight') selectNext(1);
      if (e.key === 'Enter' && selectedHandCardId && isMyTurn && !isSubmitting) {
        onPlayCard(selectedHandCardId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHandCardId, selfState?.hand, isMyTurn, isSubmitting]);

  // small utility: render count badge
  const CountBadge = ({ count }: { count: number }) => (
    <div className="absolute -top-2 -right-2 text-xs bg-black/60 px-1 rounded">
      {count}
    </div>
  );

  // Render
  return (
    <div className="w-full h-full p-4 flex flex-col items-center justify-between bg-gray-900 text-white">
      {/* Turn / timer bar */}
      <div className="w-full flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="text-sm">اللاعب الحالي: <strong>{currentPlayer?.name}</strong></div>
          <div className="text-sm">دور: {quizSwapState.round}</div>
        </div>
        <div className="flex items-center gap-2">
          {/* Timer (server-driven if available) */}
          <div aria-live="polite" className="text-sm">{isMyTurn ? 'دورك الآن' : 'انتظار'}</div>
          {typeof timer === 'number' && (
            <div className="px-2 py-1 bg-black/40 rounded text-sm">
              {timer}s
            </div>
          )}
        </div>
      </div>

      {/* Opponents' hands */}
      <div className="w-full flex justify-center gap-8">
        {opponents.map((player) => (
          <div key={player.id} className="flex flex-col items-center">
            <p className="font-bold mb-2">{player.name} {player.id === currentPlayer?.id ? '(دوره)' : ''}</p>
            <div className="flex gap-2" role="list" aria-label={`يد ${player.name}`}>
              {player.hand.map((cardId) => {
                const card = QUIZ_SWAP_DECK_MAP.get(cardId);
                return (
                  <div key={cardId} role="listitem">
                    <QuizSwapCardDisplay card={card} faceUp={false} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Middle: draw + discard + actions */}
      <div className="flex gap-8 my-6 items-center">
        <div className="flex flex-col items-center relative">
          <p className="font-semibold mb-2">كومة السحب</p>
          <div className="w-28 h-40 rounded-lg relative">
            <div className="absolute inset-0 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
              {topDrawCard ? (
                <Button variant="ghost" className="w-full h-full" onClick={onDrawFromDeck} disabled={!isMyTurn || isSubmitting || isDiscardingPhase} aria-label="اسحب من كومة السحب">
                  <QuizSwapCardDisplay card={topDrawCard} faceUp={false} />
                </Button>
              ) : (
                <div className="text-xs text-gray-500">فارغة</div>
              )}
            </div>
            <div className="absolute -bottom-2 left-2 text-sm text-gray-300">{drawPile.length}</div>
          </div>
        </div>

        <div className="flex flex-col items-center relative">
          <p className="font-semibold mb-2">كومة الرمي</p>
          <div className="w-28 h-40 rounded-lg relative">
            <div className="absolute inset-0 rounded-lg flex items-center justify-center">
              {topDiscardCard ? (
                <Button variant="ghost" className="w-full h-full" onClick={onDrawFromDiscard} disabled={!isMyTurn || isSubmitting || isDiscardingPhase} aria-label="اسحب من كومة الرمي">
                  <QuizSwapCardDisplay card={topDiscardCard} faceUp={true} />
                </Button>
              ) : (
                <div className="text-xs text-gray-500">فارغة</div>
              )}
            </div>
            <div className="absolute -bottom-2 left-2 text-sm text-gray-300">{discardPile.length}</div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          {isMyTurn ? (
            <Button onClick={onEndTurn} disabled={isSubmitting || isDiscardingPhase}>
              {isSubmitting ? (
                <Loader2 className="animate-spin" />
              ) : (
                'إنهاء الدور'
              )}
            </Button>
          ) : (
            <div className="text-sm text-gray-400">ليس دورك</div>
          )}

          {/* Pending action label */}
          {pendingActionLabel && (
            <div className="text-xs text-gray-300 mt-1">{pendingActionLabel}</div>
          )}
        </div>
      </div>

      {/* Self hand */}
      <div className="flex flex-col items-center w-full">
        <p className="font-bold mb-2">{self.name} (أنت)</p>
        <AnimatePresence>
            {isDiscardingPhase && (
                <motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}} className="mb-2 text-center bg-red-800/50 p-2 rounded-md border border-red-500/50">
                    <p className="font-bold">يدك ممتلئة!</p>
                    <p className="text-xs">يجب أن ترمي بطاقة لتكمل دورك.</p>
                </motion.div>
            )}
        </AnimatePresence>
        <div className="flex gap-3" role="list" aria-label="يدك">
          {selfState.hand.map((cardId) => {
            const card = QUIZ_SWAP_DECK_MAP.get(cardId);
            const isSelected = selectedHandCardId === cardId;
            const difficultyColor = card?.kind === 'question' ? DIFFICULTY_COLOR[card.difficulty] : undefined;

            return (
              <motion.button
                key={cardId}
                onClick={() => {
                  if (isDiscardingPhase) {
                    onPlayCard(cardId);
                  } else {
                    setSelectedHandCardId(cardId === selectedHandCardId ? null : cardId);
                  }
                }}
                onDoubleClick={() => isMyTurn && !isSubmitting && onPlayCard(cardId)}
                className={`relative p-0 rounded outline-none focus:ring-2 focus:ring-offset-2 ${isSelected ? 'ring-4 ring-white/30' : ''}`}
                aria-pressed={isSelected}
                aria-label={card?.kind === 'question' ? `بطاقة سؤال - ${card.difficulty}` : `بطاقة خاصة`}
              >
                <div style={{ borderColor: difficultyColor }} className="border-2 rounded-lg shadow-md">
                  <QuizSwapCardDisplay card={card} faceUp={false} />
                </div>

                {/* difficulty dot */}
                {card?.kind === 'question' && (
                  <div title={card.difficulty} style={{ background: difficultyColor }} className="absolute -top-2 -right-2 w-4 h-4 rounded-full border-2 border-black" />
                )}

                {/* protection / peek icons for owner */}
                {card && selfState.protectedIds?.includes(cardId) && (
                  <div className="absolute top-1 left-1"><Shield size={16} /></div>
                )}

                {card && selfState.viewedSelf?.includes(cardId) && (
                  <div className="absolute top-1 right-1"><Eye size={16} /></div>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Quick actions for selected card */}
        <div className="mt-4 flex gap-2">
          <Button onClick={() => selectedHandCardId && isMyTurn && onPlayCard(selectedHandCardId)} disabled={!selectedHandCardId || !isMyTurn || isSubmitting}>
            {isDiscardingPhase ? 'تأكيد الرمي' : 'لعب / استبدال البطاقة المحددة'}
          </Button>

          {!isDiscardingPhase && (
            <Button onClick={() => { setSelectedHandCardId(null); }} variant="ghost">إلغاء الاختيار</Button>
          )}
        </div>
      </div>

      {/* Confirm modal (simple inline) */}
      <AnimatePresence>
        {confirmTakeDiscard && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => handleConfirm(false)} />
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="relative bg-white text-black rounded-lg p-6 w-96">
              <h3 className="font-bold mb-3">تأكيد</h3>
              <p className="mb-4">{pendingActionLabel}</p>
              <div className="flex justify-end gap-2">
                <Button onClick={() => handleConfirm(false)} variant="ghost">إلغاء</Button>
                <Button onClick={() => handleConfirm(true)}>تأكيد</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default QuizSwapBoard;
