'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { submitVotes, handleTimeout } from '@/lib/actions/kingdom-of-names';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayerAvatar } from '../../PlayerAvatar';
import { ThumbsUp, ThumbsDown, Send, Loader2 } from 'lucide-react';
import { CountdownTimer } from '../../CountdownTimer';

interface VotingPhaseProps {
  game: Game;
  self: Player;
}

// Arabic normalization helpers (lighter-weight client version)
const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;
function normalizeArabic(text?: string) {
  if (!text) return '';
  return text
    .replace(TATWEEL, '')
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim()
    .toLowerCase();
}
function startsWithLetter(word?: string, letter?: string) {
  if (!word || !letter) return false;
  const w = normalizeArabic(word);
  const l = normalizeArabic(letter);
  if (!w.length || !l.length) return false;
  return w[0] === l[0];
}

export default function VotingPhase({ game, self }: VotingPhaseProps) {
  const { toast } = useToast();
  const state = game.kingdomOfNamesState;
  const allSubmissions = state?.playerAnswers || {};

  const [votes, setVotes] = useState<Record<string, 'correct' | 'incorrect'>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedLocally, setSubmittedLocally] = useState(false);
  const isHost = game.hostId === self.id;

  // Initialize local votes from server snapshot when available
  useEffect(() => {
    const serverVotes = state?.votes?.[self.id] || {};
    // Merge server votes with local votes, giving precedence to server state
    // but preserving any new local votes not yet on the server.
    setVotes(prev => ({ ...prev, ...serverVotes }));
    const serverHasVote = !!state?.votes?.[self.id] && Object.keys(state.votes[self.id]).length > 0;
    setSubmittedLocally(serverHasVote);
  }, [state?.votes, self.id]);

  const activePlayers = useMemo(() => game.players.filter((p) => p.status !== 'left'), [game.players]);

  // flatten votable items for rendering and logic
  const votableItems = useMemo(() => {
    const items: {
      key: string;
      playerId: string;
      playerName: string;
      avatarId?: string;
      category: string;
      answer?: string;
      autoExcluded: boolean;
    }[] = [];

    const letter = state?.letter || '';

    for (const [playerId, answers] of Object.entries(allSubmissions)) {
      if (playerId === self.id) continue; // do not vote on yourself
      const player = game.players.find((p) => p.id === playerId);
      const entries = Object.entries(answers || {});
      for (const [category, answer] of entries) {
        const key = `${playerId}-${category}`;
        const empty = !answer || answer.trim() === '';
        const autoExcluded = empty || !startsWithLetter(answer, letter);
        items.push({
          key,
          playerId,
          playerName: player?.name || 'لاعب',
          avatarId: player?.avatarId,
          category,
          answer: answer || '',
          autoExcluded,
        });
      }
    }
    return items;
  }, [allSubmissions, game.players, state?.letter, self.id]);

  const totalToVote = votableItems.filter((i) => !i.autoExcluded).length;
  const votedCount = Object.keys(votes).filter((k) => {
    // count only votes on items that remain votable (non-autoExcluded)
    return !votableItems.find((it) => it.key === k && it.autoExcluded);
  }).length;

  const playersVotedCount = Object.keys(state?.votes || {}).length;

  const handleVote = useCallback((key: string, choice: 'correct' | 'incorrect') => {
    setVotes((prev) => ({ ...prev, [key]: choice }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    // avoid submitting no-op
    if (votedCount === 0) {
      toast({ title: 'لم تقم بالتصويت', description: 'يرجى اختيار على الأقل تصويت واحد قبل الإرسال.' });
      return;
    }
    setIsSubmitting(true);
    try {
      await submitVotes(game.id, self.id, votes);
      toast({ title: 'تم تسجيل تصويتك!' });
      setSubmittedLocally(true);
    } catch (err: any) {
      toast({ title: 'خطأ', description: err?.message || 'فشل إرسال التصويت', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }, [game.id, self.id, votes, votedCount, toast, isSubmitting]);

  const handleForceEnd = useCallback(async () => {
    if (!isHost) return;
    setIsSubmitting(true);
    try {
      await handleTimeout(game.id, game.hostId);
      toast({ title: 'تم إنهاء التصويت' });
    } catch (err: any) {
      toast({ title: 'خطأ', description: err?.message || 'فشل إنهاء التصويت', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }, [game.id, game.hostId, isHost, toast]);

  const userHasSubmitted = Boolean(submittedLocally || (state?.votes && Boolean(state.votes[self.id])));

  // If the user already submitted via server snapshot, show a friendly waiting state but include summary
  if (userHasSubmitted) {
    return (
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>شكراً لتصويتك!</CardTitle>
          <CardDescription>في انتظار بقية اللاعبين ({playersVotedCount}/{activePlayers.length}) ...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 items-center">
            <Loader2 className="w-16 h-16 animate-spin text-primary" />
            <div className="w-full text-left max-w-md">
              <h4 className="font-semibold">ملخص تصويتك</h4>
              <div className="mt-2 space-y-2">
                {Object.entries(votes).length === 0 ? (
                  <div className="text-sm text-zinc-500">لم تقم بتصويت يظهر في هذه الجلسة.</div>
                ) : (
                  Object.entries(votes).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm">
                      <div className="truncate">{k}</div>
                      <div className="font-medium">{v === 'correct' ? 'صحيحة' : 'خاطئة'}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-4xl relative">
      {state?.timerEndsAt && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <CountdownTimer
            gameId={game.id}
            gameType="kingdom-of-names"
            expiryTimestamp={state.timerEndsAt.toMillis()}
            selfId={self.id}
            isHost={isHost}
          />
        </div>
      )}

      <CardHeader className="text-center pt-20">
        <CardTitle className="text-3xl">مرحلة التصويت</CardTitle>
        <CardDescription>صوّت على صحة إجابات اللاعبين الآخرين. الإجابات التي لا تبدأ بالحرف المطلوب مُستبعدة تلقائياً.</CardDescription>
        <div className="mt-3 text-sm text-zinc-600">تم التصويت: <strong>{votedCount}</strong> من <strong>{totalToVote}</strong></div>
        <div className="mt-1 text-xs text-zinc-500">لا يمكنك التصويت على إجاباتك الخاصة.</div>
      </CardHeader>

      <CardContent>
        <ScrollArea className="h-[60vh]">
          <div className="space-y-6 pr-4">
            {votableItems.length === 0 && (
              <div className="text-center text-zinc-500 p-6">لا توجد إجابات للتصويت عليها.</div>
            )}

            {votableItems.map((it) => {
              const current = votes[it.key];
              return (
                <div key={it.key} className="p-4 rounded-lg bg-muted flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex items-center gap-3 md:flex-1">
                    <PlayerAvatar avatarId={it.avatarId} className="w-10 h-10" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{it.playerName}</div>
                        <div className="text-xs text-zinc-500">· {it.category}</div>
                      </div>
                      <div className="mt-1 text-sm font-mono truncate">{it.answer || '(فارغ)'}</div>
                      {it.autoExcluded && (
                        <div className="mt-1 text-xs text-red-500">مستبعدة — لا تبدأ بالحرف المطلوب أو فارغة</div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={current === 'correct' ? 'default' : 'outline'}
                      onClick={() => handleVote(it.key, 'correct')}
                      disabled={it.autoExcluded || isSubmitting}
                      aria-label={`صحيح ${it.playerName} ${it.category}`}
                    >
                      <ThumbsUp className="w-4 h-4 ml-1" /> صحيحة
                    </Button>

                    <Button
                      size="sm"
                      variant={current === 'incorrect' ? 'destructive' : 'outline'}
                      onClick={() => handleVote(it.key, 'incorrect')}
                      disabled={it.autoExcluded || isSubmitting}
                      aria-label={`خاطئ ${it.playerName} ${it.category}`}
                    >
                      <ThumbsDown className="w-4 h-4 ml-1" /> خاطئة
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>

      <CardFooter className="flex flex-col gap-3">
        <div className="flex gap-3 w-full">
          <Button className="flex-1" onClick={handleSubmit} disabled={isSubmitting || votedCount === 0}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> جاري الإرسال...
              </>
            ) : (
              <>
                <Send className="mr-2" /> إرسال تصويتي ({votedCount}/{totalToVote})
              </>
            )}
          </Button>

          {isHost && (
            <Button variant="outline" onClick={handleForceEnd} disabled={isSubmitting}>
              إنهاء التصويت الآن
            </Button>
          )}
        </div>

        <div className="text-xs text-zinc-500 text-center">يمكن للاعبين التصويت بحرية. الأصوات التي تُشير إلى خطأ من قِبل صاحب الإجابة تحسب كمرفوضة تلقائياً.</div>
      </CardFooter>
    </Card>
  );
}
