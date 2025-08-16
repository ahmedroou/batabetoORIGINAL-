
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { createGameRoom } from '@/lib/actions/room';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GAME_ICONS } from '@/data/icons';
import type { Game } from '@/types';
import { Star, Loader2, Heart, TrendingUp, Trophy, Coins, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type LoadingState =
  | 'create-king-of-genius'
  | 'create-trap-answer'
  | 'create-behind-the-mask'
  | 'create-word_war'
  | 'create-prison'
  | 'create-educated-merchant'
  | 'create-quiz-swap'
  | null;

const gameCardsData: Array<{
  type: Game['gameType'];
  title: string;
  description: string;
  defaultTag?: 'جديد';
  accent: { from: string; via?: string; to: string };
  prizes: { rank: string; points: number; coins: number }[];
}> = [
  {
    type: 'king-of-genius',
    title: 'ساحة العباقرة',
    description: 'تحديات ذكاء وسرعة بديهة بين فريقين.',
    accent: { from: 'from-fuchsia-500/25', to: 'to-violet-500/25' },
    prizes: [{ rank: 'الفريق الفائز', points: 3, coins: 2 }],
  },
  {
    type: 'word_war',
    title: 'حرب الكلمات',
    description: 'لمّح لفريقك لكشف كلماتكم قبل الخصم.',
    accent: { from: 'from-emerald-500/25', to: 'to-teal-500/25' },
    prizes: [{ rank: 'الفريق الفائز', points: 3, coins: 2 }],
  },
  {
    type: 'trap-answer',
    title: 'الجواب المفخخ',
    description: 'اكتب جوابًا خاطئًا ومقنعًا لخداع الآخرين.',
    accent: { from: 'from-amber-500/25', to: 'to-orange-500/25' },
    prizes: [
      { rank: 'المركز الأول', points: 3, coins: 2 },
      { rank: 'المركز الثاني', points: 2, coins: 1 },
      { rank: 'المركز الثالث', points: 1, coins: 0 },
    ],
  },
  {
    type: 'behind-the-mask',
    title: 'خلف القناع',
    description: 'اكشف هوية القاتل قبل أن يقضي عليكم جميعًا.',
    defaultTag: 'جديد',
    accent: { from: 'from-rose-500/25', to: 'to-red-500/25' },
    prizes: [{ rank: 'الفريق الفائز', points: 3, coins: 2 }],
  },
  {
    type: 'prison',
    title: 'السجن',
    description: 'اجمع أكبر عدد من الإجابات الصحيحة لتفوز بالمزاد أو تخاطر بالعقوبة.',
    accent: { from: 'from-cyan-500/25', to: 'to-sky-500/25' },
    prizes: [
      { rank: 'المركز الأول', points: 3, coins: 2 },
      { rank: 'المركز الثاني', points: 2, coins: 1 },
      { rank: 'المركز الثالث', points: 1, coins: 0 },
    ],
  },
  {
    type: 'educated-merchant',
    title: 'التاجر المتعلم',
    description: 'اشترِ العقارات، أجب على الأسئلة، وأفلس خصومك.',
    accent: { from: 'from-purple-500/25', to: 'to-indigo-500/25' },
    prizes: [
      { rank: 'المركز الأول', points: 4, coins: 3 },
      { rank: 'المركز الثاني', points: 2, coins: 1 },
      { rank: 'المركز الثالث', points: 1, coins: 1 },
    ],
  },
  {
    type: 'quiz-swap',
    title: 'تبديل الأسئلة',
    description: 'جمع أسهل 4 أسئلة للفوز بالنقاط الأعلى.',
    accent: { from: 'from-teal-500/25', to: 'to-cyan-500/25' },
    prizes: [
      { rank: 'المركز الأول', points: 3, coins: 2 },
      { rank: 'المركز الثاني', points: 2, coins: 1 },
      { rank: 'المركز الثالث', points: 1, coins: 0 },
    ],
  },
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
  
  const handleCardClick = (e: React.MouseEvent, gameType: Game['gameType']) => {
    const el = e.target as HTMLElement;
    // Prevent card click from triggering if a button inside it was clicked
    if (el.closest('button, a, [role="button"], [data-interactive="true"]')) return;
    if (!isLoading) handleCreate(gameType);
  };

  return (
    <div className="space-y-6 pt-6" dir="rtl">
      <div className="text-center">
        <h2 className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary text-2xl md:text-3xl font-extrabold tracking-tight">
          اختر لعبتك
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">اختر لعبة لإنشاء غرفتك الخاصة ودعوة أصدقائك.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {gameCardsData.map((game, i) => {
          const Icon = (GAME_ICONS as any)[game.type] || HelpCircle;
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
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              onClick={(e) => handleCardClick(e, game.type)}
              className="group relative overflow-hidden rounded-xl border bg-card/80 shadow-sm backdrop-blur-sm transition-all hover:shadow-lg cursor-pointer"
            >
              <div aria-hidden="true" className={`pointer-events-none absolute -inset-1 opacity-60 blur-2xl bg-gradient-to-br ${game.accent.from} ${game.accent.via ?? ''} ${game.accent.to}`} />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10" />

              <Card className="relative h-full border-none bg-transparent shadow-none">
                <CardContent className="p-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-12 w-12 place-items-center rounded-xl border border-white/15 bg-gradient-to-b from-background/70 to-background/40 shadow-inner flex-shrink-0">
                      <Icon className="h-6 w-6 text-primary transition-transform duration-300 group-hover:scale-105" />
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm md:text-base font-bold tracking-tight">{game.title}</CardTitle>
                        {tag && (
                          <span className="select-none rounded-full border border-white/10 bg-background/70 px-1.5 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur inline-flex items-center gap-1">
                            <TagIcon className="w-3 h-3" /> {tag}
                          </span>
                        )}
                      </div>
                      <CardDescription className="leading-relaxed text-xs truncate">
                        {game.description}
                      </CardDescription>
                      <Popover>
                        <PopoverTrigger asChild>
                           <Button data-interactive="true" variant="link" size="sm" className="h-auto p-0 mt-0.5 inline-flex items-center gap-1 text-muted-foreground hover:text-primary text-xs">
                            <Trophy className="w-3 h-3" />
                            <span>الجوائز</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="center">
                          <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-violet-900/30 via-background/60 to-violet-900/30 p-3 text-sm text-foreground shadow-lg backdrop-blur">
                            <h4 className="font-bold text-center mb-2 text-sm">الجوائز</h4>
                            <div className="space-y-1.5">
                              {game.prizes.map((prize, pIdx) => (
                                <div key={pIdx} className="flex items-center justify-between gap-3 rounded-md bg-black/20 p-2">
                                  <span className="font-semibold text-xs">{prize.rank}:</span>
                                  <div className="flex items-center gap-3 text-xs">
                                    <span className="inline-flex items-center gap-1.5"><Star className="w-4 h-4 text-primary"/> {prize.points}</span>
                                    {prize.coins > 0 && <span className="inline-flex items-center gap-1.5"><Coins className="w-4 h-4"/> {prize.coins}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <Button
                      data-interactive="true"
                      className="rounded-lg bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-md transition-transform hover:opacity-90 focus-visible:translate-y-[1px] h-10 px-4 text-sm"
                      onClick={() => handleCreate(game.type)}
                      disabled={!!isLoading}
                      aria-busy={loadingThis}
                      aria-label={`إنشاء غرفة ${game.title}`}
                    >
                      {loadingThis ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'أنشئ'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}
