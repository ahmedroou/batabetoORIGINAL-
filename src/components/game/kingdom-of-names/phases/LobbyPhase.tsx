'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '../../PlayerAvatar';
import { leaveGame } from '@/lib/actions/room';
import { startGame } from '@/lib/actions/kingdom-of-names';
import { Copy, Check, LogOut, ArrowRight, Loader2 } from 'lucide-react';

interface LobbyPhaseProps {
  game: Game;
  self: Player;
}

export default function LobbyPhase({ game, self }: LobbyPhaseProps) {
  const { toast } = useToast();
  const router = useRouter();
  const isHost = game.hostId === self.id;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  // Only consider players that didn't leave
  const activePlayers = useMemo(() => game.players.filter((p) => p.status !== 'left'), [game.players]);

  useEffect(() => {
    // defensive: reset copying state if game changes
    setIsCopying(false);
  }, [game.id]);

  const handleLeaveGame = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await leaveGame(game.id, self.id);
      if (result?.success) {
        try { sessionStorage.removeItem(`player-id-${game.id}`); } catch {}
        toast({ title: 'لقد غادرت الغرفة.' });
        router.push('/');
      } else {
        toast({ title: 'خطأ', description: result?.error || 'فشل في مغادرة الغرفة', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'خطأ', description: err?.message || 'حدث خطأ غير متوقع', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }, [game.id, self.id, isSubmitting, router, toast]);

  const handleStartGame = useCallback(async () => {
    if (!isHost || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await startGame(game.id, self.id);
    } catch (e: any) {
      toast({ title: 'خطأ في بدء اللعبة', description: e?.message || 'فشل بدء اللعبة', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }, [game.id, self.id, isHost, isSubmitting, toast]);

  const copyGameId = useCallback(async () => {
    if (isCopying) return;
    setIsCopying(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      // Prefer full invitation link when possible — adjust path if your router differs
      const invite = origin ? `${origin}/join/${game.id}` : game.id;
      await navigator.clipboard.writeText(invite);
      toast({ title: 'تم نسخ رابط الدعوة', description: invite });
    } catch (err) {
      try {
        await navigator.clipboard.writeText(game.id);
        toast({ title: 'تم نسخ رمز الغرفة' });
      } catch {
        toast({ title: 'فشل النسخ', description: 'لا يمكن الوصول للحافظة', variant: 'destructive' });
      }
    } finally {
      // keep check icon for short moment so user sees success
      setTimeout(() => setIsCopying(false), 1400);
    }
  }, [game.id, setIsCopying, toast]);

  return (
    <Card className="w-full max-w-lg" role="region" aria-label="لوبي مملكة الأسماء">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">لوبي مملكة الأسماء</CardTitle>
        <CardDescription>ادعُ أصدقاءك. اللعبة تحتاج لاعبين اثنين على الأقل.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-2 items-start">
          <Input
            value={game.id}
            readOnly
            className="text-center tracking-widest font-mono text-lg h-12 flex-grow"
            aria-label="رمز الغرفة"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button onClick={copyGameId} size="lg" variant="secondary" className="px-4" aria-label="نسخ رابط الغرفة">
            {isCopying ? <Check aria-hidden /> : <Copy aria-hidden />}
          </Button>
        </div>

        <div className="space-y-2">
          <h3 className="font-bold text-center">اللاعبون ({activePlayers.length})</h3>
          <div className="rounded-md border p-3 space-y-2 bg-muted/50 min-h-[120px]">
            {activePlayers.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center">لا يوجد لاعبين بعد</div>
            ) : (
              activePlayers.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full shadow-md" temporaryTitle={p.temporaryTitle} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-lg">{p.name}</p>
                      {p.id === game.hostId && (
                        <span className="text-xs px-2 py-0.5 rounded bg-indigo-600 text-white">مضيف</span>
                      )}
                    </div>
                    {p.status === 'idle' && <div className="text-xs text-zinc-500">في الانتظار</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex-col gap-2">
        {isHost ? (
          <Button
            onClick={handleStartGame}
            disabled={isSubmitting || activePlayers.length < 2}
            className="w-full"
            size="lg"
            aria-disabled={isSubmitting || activePlayers.length < 2}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> جارٍ البدء…
              </>
            ) : (
              <>
                <ArrowRight className="mr-2 h-4 w-4" />
                {activePlayers.length < 2 ? `تحتاج لاعبًا آخر على الأقل` : 'ابدأ اللعبة'}
              </>
            )}
          </Button>
        ) : (
          <div className="w-full">
            <div className="text-center text-muted-foreground p-3 bg-muted/50 rounded-md">في انتظار المضيف لبدء اللعبة...</div>
          </div>
        )}

        <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting} aria-disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />} {isSubmitting ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
        </Button>
      </CardFooter>
    </Card>
  );
}
