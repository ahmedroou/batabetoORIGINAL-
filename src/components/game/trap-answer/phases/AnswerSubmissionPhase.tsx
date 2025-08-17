

'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import type { Game, Player, EmojiReaction, EmojiReactionType, TrapQuestion } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { submitTrapAnswer } from '@/lib/actions/trap-answer';
import { Loader2, EyeOff, Send, Image as ImageIcon } from 'lucide-react';
import { CountdownTimer } from '@/components/game/CountdownTimer';
import Image from 'next/image';

const hasOwn = (obj: unknown, key: string) =>
  !!obj && Object.prototype.hasOwnProperty.call(obj as Record<string, unknown>, key);

const StableAnswerInput = memo(function StableAnswerInput({
  gameId,
  disabled,
  submitting,
  onSubmit,
}: {
  gameId: string;
  disabled?: boolean;
  submitting?: boolean;
  onSubmit: (text: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState<string>('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const caretRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`trap-input-${gameId}`);
      if (saved) setValue(saved);
    } catch {}
  }, [gameId]);

  const rememberCaret = () => {
    const el = taRef.current;
    if (!el) return;
    try {
      caretRef.current = el.selectionStart ?? el.value.length;
    } catch {
      caretRef.current = el.value.length;
    }
  };

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {}
  }, []);

  const handleBlur = () => {
    const el = taRef.current;
    if (!el) return;
    setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body) {
        el.focus({ preventScroll: true });
        const pos = caretRef.current ?? el.value.length;
        try {
          el.setSelectionRange(pos, pos);
        } catch {}
      }
    }, 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    rememberCaret();
    try {
      sessionStorage.setItem(`trap-input-${gameId}`, e.target.value);
    } catch {}
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    rememberCaret();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && value.trim()) {
      e.preventDefault();
      void onSubmit(value.trim());
    }
  };

  const doSubmit = () => {
    if (!value.trim()) return;
    void onSubmit(value.trim());
  };

  return (
    <div className="space-y-4">
      <Textarea
        ref={taRef}
        placeholder="اكتب إجابتك هنا..."
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        rows={4}
        disabled={disabled || submitting}
      />
      <Button onClick={doSubmit} disabled={disabled || submitting || !value.trim()} className="w-full">
        <Send className="mr-2" /> {submitting ? 'جاري الإرسال...' : 'إرسال الجواب'}
      </Button>
    </div>
  );
});
StableAnswerInput.displayName = 'StableAnswerInput';

const QuestionDisplay = ({ question }: { question: TrapQuestion }) => {
  if (question.type === 'image' && question.imageUrl) {
    return (
      <div className="mb-4">
        <p className="text-xl font-bold pt-2 mb-2">{question.question || 'ماذا في الصورة؟'}</p>
        <div className="relative aspect-video w-full max-w-md mx-auto rounded-lg overflow-hidden border">
          <Image
            src={question.imageUrl}
            alt={question.question || 'Question Image'}
            fill
            className="object-contain"
          />
        </div>
      </div>
    );
  }

  return (
    <CardDescription className="text-2xl font-bold pt-2">
      {question.question ?? '—'}
    </CardDescription>
  );
};


export function AnswerSubmissionPhase({ game, self }: { game: Game, self: Player }) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);

    const hasSubmitted = useMemo(() => hasOwn(game.trapAnswerState?.playerAnswers || {}, self.id), [game.trapAnswerState?.playerAnswers, self.id]);
    const pendingPlayers = useMemo(() => {
        const answers = game.trapAnswerState?.playerAnswers || {};
        return (game.players || []).filter(p => p.status !== 'left' && !hasOwn(answers, p.id));
    }, [game.players, game.trapAnswerState?.playerAnswers]);

    const awayPlayerIds = useMemo(() => game.trapAnswerState?.awayPlayerIds || [], [game.trapAnswerState?.awayPlayerIds]);
    const currentQuestion = game.trapAnswerState?.currentQuestion;

    const handleSubmitAnswer = useCallback(
        async (text: string) => {
            if (hasOwn(game.trapAnswerState?.playerAnswers, self.id)) return;
            if (!text.trim()) {
                toast({ title: 'الرجاء إدخال إجابة', variant: 'destructive' });
                return;
            }
            setLoading(true);
            try {
                const result = await submitTrapAnswer(game.id, self.id, text.trim());
                if ((result as any)?.error) {
                    toast({ title: 'خطأ', description: (result as any).error, variant: 'destructive' });
                } else {
                    try { sessionStorage.removeItem(`trap-input-${game.id}`); } catch { }
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'تعذّر إرسال الإجابة';
                toast({ title: 'خطأ فادح', description: message, variant: 'destructive' });
            } finally {
                setLoading(false);
            }
        },
        [game.id, self.id, toast, game.trapAnswerState?.playerAnswers]
    );

    return (
        <Card className="w-full max-w-lg relative">
            {game.trapAnswerState?.roundEndTime && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                    <CountdownTimer
                        gameId={game.id}
                        gameType="trap-answer"
                        expiryTimestamp={game.trapAnswerState.roundEndTime.toMillis()}
                        selfId={self.id}
                        isHost={game.hostId === self.id}
                    />
                </div>
            )}
            <CardHeader className="text-center pt-20">
                <CardTitle>السؤال</CardTitle>
                 {currentQuestion ? (
                    <QuestionDisplay question={currentQuestion} />
                ) : (
                    <CardDescription className="text-2xl font-bold pt-2">—</CardDescription>
                )}
            </CardHeader>
            <CardContent>
                {hasSubmitted ? (
                    <div className="text-center p-4 rounded-lg bg-green-100 text-green-800 space-y-4" aria-live="polite">
                        <p className="font-semibold">تم إرسال إجابتك! في انتظار بقية اللاعبين...</p>
                        <div className="space-y-2">
                            {pendingPlayers.map((p) => {
                                const isAway = awayPlayerIds.includes(p.id);
                                return (
                                    <div key={p.id} className="flex items-center justify-center gap-2 text-sm text-yellow-800">
                                        <PlayerAvatar avatarId={p.avatarId} className="w-6 h-6" temporaryTitle={p.temporaryTitle} />
                                        <span>في انتظار {p.name}...</span>
                                        {isAway ? <EyeOff className="w-4 h-4 text-red-500" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <StableAnswerInput
                        gameId={game.id}
                        submitting={loading}
                        onSubmit={handleSubmitAnswer}
                    />
                )}
            </CardContent>
        </Card>
    );
}

    
