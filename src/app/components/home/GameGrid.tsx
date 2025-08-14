'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { createGameRoom } from '@/lib/actions/room';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GAME_ICONS } from '@/data/icons';
import type { Game } from '@/types';
import { Star, Loader2, Heart, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

type LoadingState =
  | 'create-king-of-genius'
  | 'create-trap-answer'
  | 'create-behind-the-mask'
  | 'create-word_war'
  | 'create-prison'
  | 'create-educated-merchant'
  | null;

const gameCardsData: Array<{
  type: Game['gameType'];
  title: string;
  description: string;
  defaultTag?: 'جديد';
  accent: { from: string; via?: string; to: string };
}> = [
  { type: 'king-of-genius', title: 'ساحة العباقرة', description: 'تحديات ذكاء وسرعة بديهة بين فريقين.', accent: { from: 'from-fuchsia-500/25', to: 'to-violet-500/25' } },
  { type: 'word_war', title: 'حرب الكلمات', description: 'لمّح لفريقك لكشف كلماتكم قبل الخصم.', accent: { from: 'from-emerald-500/25', to: 'to-teal-500/25' } },
  { type: 'trap-answer', title: 'الجواب المفخخ', description: 'اكتب جوابًا خاطئًا ومقنعًا لخداع الآخرين.', accent: { from: 'from-amber-500/25', to: 'to-orange-500/25' } },
  { type: 'behind-the-mask', title: 'خلف القناع', description: 'اكشف هوية القاتل قبل أن يقضي عليكم جميعًا.', defaultTag: 'جديد', accent: { from: 'from-rose-500/25', to: 'to-red-500/25' } },
  { type: 'prison', title: 'السجن', description: 'اجمع أكبر عدد من الإجابات الصحيحة لتفوز بالمزاد أو تخاطر بالعقوبة.', accent: { from: 'from-cyan-500/25', to: 'to-sky-500/25' } },
  { type: 'educated-merchant', title: 'التاجر المتعلم', description: 'اشترِ العقارات، أجب على الأسئلة، وأفلس خصومك.', accent: { from: 'from-purple-500/25', to: 'to-indigo-500/25' } },
];

interface GameGridProps {
    favoriteGame: string | null;
    popularGame: string | null;
}

export default function GameGrid({ favoriteGame, popularGame }: GameGridProps) {
  const [isLoading, setIsLoading] = useState<LoadingState>(null);
  const { toast } = useToast();
  const router = useRouter();
  const { user, userProfile } = useAuth();

  const handleCreate = async (gameType: Game['gameType']) => {
    if (!user || !userProfile?.avatarId) {
      toast({ title: 'الرجاء اختيار شخصية من ملفك الشخصي أولاً', variant: 'destructive', duration: 3000 });
      return;
    }

    setIsLoading(`create-${gameType}` as LoadingState);

    const result = await createGameRoom(user.uid, gameType, userProfile.avatarId);
    if (result.error) {
      toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
      setIsLoading(null);
    } else if (result.gameId && result.player) {
      sessionStorage.setItem(`player-id-${result.gameId}`, result.player.id);
      router.push(`/game/${result.gameId}`);
    }
  };

  return (
    <div className="space-y-8 pt-8" dir="rtl">
      <div className="text-center">
        <h2 className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary text-3xl md:text-4xl font-extrabold tracking-tight">
          اختر لعبتك
        </h2>
        <p className="mt-1 text-muted-foreground">اختر لعبة لإنشاء غرفتك الخاصة ودعوة أصدقائك.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
        {gameCardsData.map((game, i) => {
          const Icon = (GAME_ICONS as any)[game.type] || Star;
          const loadingThis = isLoading === (`create-${game.type}` as LoadingState);
          
          const isFavorite = game.type === favoriteGame;
          const isPopular = game.type === popularGame;
          let tag = game.defaultTag;
          let TagIcon = Star;
          if (isFavorite) {
            tag = 'مفضلة';
            TagIcon = Heart;
          }
          if (isPopular) {
            tag = 'مشهورة';
            TagIcon = TrendingUp;
          }

          return (
            <motion.article
              key={game.type}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              className="group relative overflow-hidden rounded-2xl border bg-card/70 shadow-sm backdrop-blur transition-all hover:shadow-xl"
            >
              <div aria-hidden className={`pointer-events-none absolute -inset-1 opacity-70 blur-2xl bg-gradient-to-br ${game.accent.from} ${game.accent.via ?? ''} ${game.accent.to}`} />
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />

              <Card className="relative h-full border-none bg-transparent shadow-none">
                <CardHeader className="relative text-center">
                  {tag && (
                    <span className="absolute start-3 top-3 select-none rounded-full border border-white/10 bg-background/70 px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur inline-flex items-center gap-1">
                      <TagIcon className="w-3 h-3" /> {tag}
                    </span>
                  )}
                  <div className="mx-auto mb-2 grid h-16 w-16 place-items-center rounded-2xl border border-white/15 bg-gradient-to-b from-background/70 to-background/40 shadow-inner">
                    <Icon className="h-10 w-10 text-primary transition-transform duration-300 group-hover:scale-105" />
                  </div>
                  <CardTitle className="text-xl font-bold tracking-tight">{game.title}</CardTitle>
                  <CardDescription className="mx-auto max-w-[28ch] leading-relaxed">
                    {game.description}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="relative mt-auto">
                  <Button
                    className="w-full rounded-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg transition-transform hover:opacity-90 focus-visible:translate-y-[1px]"
                    onClick={() => handleCreate(game.type)}
                    disabled={!!isLoading}
                    aria-busy={loadingThis}
                    aria-label={`إنشاء غرفة ${game.title}`}
                  >
                    {loadingThis ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جاري الإنشاء…
                      </span>
                    ) : (
                      'أنشئ غرفة'
                    )}
                  </Button>
                </CardFooter>
                <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 translate-y-10 bg-gradient-to-t from-black/10 to-transparent opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100" />
              </Card>
              <button
                className="absolute inset-0 -z-10 cursor-pointer"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!isLoading) handleCreate(game.type);
                  }
                }}
                aria-label={`فتح ${game.title}`}
              />
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}
