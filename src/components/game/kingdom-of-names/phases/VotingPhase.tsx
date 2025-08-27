
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { submitVotes, handleTimeout } from '@/lib/actions/kingdom-of-names';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayerAvatar } from '../../PlayerAvatar';
import { ThumbsDown, Send, Loader2 } from 'lucide-react';
import { CountdownTimer } from '../../CountdownTimer';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface VotingPhaseProps {
  game: Game;
  self: Player;
}

// Arabic normalization helpers (lightweight client version)
const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670-\u06ED]/g;
const TATWEEL = /\u0640/g;
function normalizeArabic(text?: string) {
  if (!text) return '';
  return text
    .replace(TATWEEL, '')
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[يى]/g, 'ي')
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

  // FIX: State now derives from the server truth `state.votes`.
  // The local state only tracks the user's *current* selections before they are submitted.
  const [incorrectVotes, setIncorrectVotes] = useState<Record<string, 'incorrect'>>(() => state?.votes?.[self.id] || {});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // FIX: The source of truth for "has submitted" is now directly from the game object.
  // We also use a local "optimistic" state to immediately lock the UI after submission.
  const hasSubmittedOnServer = useMemo(() => {
      return !!state?.votes?.[self.id] && Object.keys(state.votes[self.id]).length > 0;
  }, [state?.votes, self.id]);
  const [submittedLocally, setSubmittedLocally] = useState(hasSubmittedOnServer);

  const isHost = game.hostId === self.id;

  // Sync local state if server state changes (e.g., rejoining a game).
  useEffect(() => {
    const serverVotes = state?.votes?.[self.id] || {};
    setIncorrectVotes(serverVotes);
    if (!!state?.votes?.[self.id] && Object.keys(serverVotes).length > 0) {
      setSubmittedLocally(true);
    }
  }, [state?.votes, self.id]);

  const activePlayers = useMemo(() => game.players.filter((p) => p.status !== 'left'), [game.players]);
  const otherPlayers = useMemo(() => activePlayers.filter(p => p.id !== self.id), [activePlayers, self.id]);

  const toggleVote = useCallback((key: string) => {
    if (submittedLocally) return; // Don't allow changes after submission
    setIncorrectVotes((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = 'incorrect';
      }
      return next;
    });
  }, [submittedLocally]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting || submittedLocally) return;
    setIsSubmitting(true);
    try {
      // Only send the items marked as incorrect
      await submitVotes(game.id, self.id, incorrectVotes);
      toast({ title: 'تم تسجيل تصويتك!' });
      setSubmittedLocally(true); // Lock UI immediately
    } catch (err: any) {
      toast({ title: 'خطأ', description: err?.message || 'فشل إرسال التصويت', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }, [game.id, self.id, incorrectVotes, toast, isSubmitting, submittedLocally]);

  if (submittedLocally) {
    return (
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>شكراً لتصويتك!</CardTitle>
          <CardDescription>في انتظار بقية اللاعبين...</CardDescription>
        </CardHeader>
        <CardContent>
          <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-5xl">
      <Card className="relative">
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
          <CardDescription>
            كل الإجابات صحيحة تلقائيًا. اضغط فقط على الإجابات التي تعتقد أنها خاطئة.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <ScrollArea className="h-[65vh]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-2">
              {otherPlayers.map((player) => {
                const playerAnswers = allSubmissions[player.id] || {};
                return (
                  <div key={player.id} className="p-3 bg-muted/50 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 border-b pb-2">
                      <PlayerAvatar avatarId={player.avatarId} className="w-9 h-9" />
                      <span className="font-bold">{player.name}</span>
                    </div>
                    {Object.entries(playerAnswers).map(([category, answer]) => {
                      const key = `${player.id}-${category}`;
                      const isAutoExcluded = !answer || !startsWithLetter(answer, state?.letter);
                      const isVotedIncorrect = incorrectVotes[key] === 'incorrect';

                      return (
                        <div key={key} className="flex items-center justify-between gap-2 text-sm p-2 rounded-md bg-background">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-muted-foreground">{category}</div>
                            <div className="font-semibold truncate" title={answer as string}>{answer || '(فارغ)'}</div>
                          </div>
                          <Button
                            size="icon"
                            variant={isVotedIncorrect ? 'destructive' : 'outline'}
                            className="w-9 h-9 shrink-0"
                            onClick={() => toggleVote(key)}
                            disabled={isAutoExcluded || isSubmitting}
                            aria-label={`تصويت خاطئ لـ ${answer}`}
                          >
                            <ThumbsDown className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>

        <CardFooter className="sticky bottom-0 bg-background/80 backdrop-blur border-t pt-4">
          <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full" size="lg">
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2" />
            )}
            تأكيد تصويتي
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
