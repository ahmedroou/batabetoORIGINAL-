"use client";

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { createGameRoom } from '@/lib/actions/room';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GAME_ICONS } from '@/data/icons';
import type { Game } from '@/types';
import { Star, Loader2, Heart, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// -----------------------------
// Fancy inline SVG icons (Black/Gold theme)
// These are self-contained, scalable and give a premium look.
// -----------------------------
function GoldTrophy({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="g1" x1="0" x2="1">
          <stop offset="0" stopColor="#FFD166" />
          <stop offset="1" stopColor="#FFB703" />
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#glow)">
        <path d="M8 3h8v2a3 3 0 0 1-3 3h-2A3 3 0 0 1 8 5V3z" fill="url(#g1)" />
        <path d="M7 7a5 5 0 0 0-5 5v1a3 3 0 0 0 3 3h1v2h8v-2h1a3 3 0 0 0 3-3v-1a5 5 0 0 0-5-5H7z" fill="#B8860B" opacity="0.95" />
        <rect x="9" y="17" width="6" height="1.6" rx="0.4" fill="#F4E27A" />
      </g>
    </svg>
  );
}

function GoldCoin({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <defs>
        <radialGradient id="c1" cx="0.3" cy="0.2" r="1">
          <stop offset="0" stopColor="#FFF7CC" />
          <stop offset="1" stopColor="#FFC857" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="9" fill="url(#c1)" stroke="#B57E00" strokeWidth="0.8" />
      <text x="12" y="15" fontSize="9" fontWeight="700" textAnchor="middle" fill="#7A4900">¢</text>
    </svg>
  );
}

function GoldStar({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="s1" x1="0" x2="1">
          <stop offset="0" stopColor="#FFEAA7" />
          <stop offset="1" stopColor="#FFD166" />
        </linearGradient>
      </defs>
      <path d="M12 2l2.6 6.7L21 10l-5 3.7L17.2 21 12 17.8 6.8 21 8 13.7 3 10l6.4-1.3L12 2z" fill="url(#s1)" stroke="#A36A00" strokeWidth="0.4" />
    </svg>
  );
}

// -----------------------------
// Prize row component — elegant, compact and responsive
// -----------------------------
function PrizeRow({ rank, points, coins }: { rank: string; points: number; coins: number }) {
  return (
    <div className="flex items-center gap-3 text-xs md:text-sm justify-center md:justify-start text-white/90">
      <div className="flex items-center gap-2">
        <GoldTrophy className="w-5 h-5" />
        <span className="font-semibold">{rank}</span>
      </div>

      <div className="flex items-center gap-2 text-yellow-50/95">
        <GoldStar className="w-4 h-4" />
        <span className="opacity-95">{points}</span>
      </div>

      {coins > 0 && (
        <div className="flex items-center gap-2">
          <GoldCoin className="w-4 h-4" />
          <span className="opacity-95">{coins}</span>
        </div>
      )}
    </div>
  );
}


const gameCardsData = [
    {
      type: 'trap-answer',
      title: 'الجواب المفخخ',
      description: 'لعبة الذكاء والخداع. اصنع فخًا للاعبين الآخرين أو كن أنت الضحية!',
      prizes: [
        { rank: '1st', points: 3, coins: 2 },
        { rank: '2nd', points: 2, coins: 1 },
        { rank: '3rd', points: 1, coins: 0 },
      ],
      accent: {
        from: 'from-fuchsia-500/40',
        to: 'to-transparent',
      },
      defaultTag: "خداع",
    },
    {
      type: 'king-of-genius',
      title: 'ساحة العباقرة',
      description: 'تحديات العقل والسرعة. أثبت أنك الأذكى في ساحة الألعاب المصغرة.',
       prizes: [
        { rank: '1st', points: 3, coins: 2 },
        { rank: '2nd', points: 2, coins: 1 },
        { rank: '3rd', points: 1, coins: 0 },
      ],
      accent: {
        from: 'from-amber-400/40',
        to: 'to-transparent',
      },
      defaultTag: "ذكاء",
    },
    {
      type: 'behind-the-mask',
      title: 'خلف القناع',
      description: 'لعبة الأدوار الخفية والمافيا. هل ستكشف القاتل أم ستكون الضحية؟',
       prizes: [
        { rank: '1st', points: 3, coins: 2 },
        { rank: '2nd', points: 2, coins: 1 },
        { rank: '3rd', points: 1, coins: 0 },
      ],
      accent: {
        from: 'from-rose-500/40',
        to: 'to-transparent',
      },
       defaultTag: "غموض",
    },
    {
      type: 'prison',
      title: 'السجن',
      description: 'اختبر معرفتك في مزادات علنية ومغلقة. إجاباتك هي مفتاح حريتك!',
       prizes: [
        { rank: '1st', points: 3, coins: 2 },
        { rank: '2nd', points: 2, coins: 1 },
        { rank: '3rd', points: 1, coins: 0 },
      ],
      accent: {
        from: 'from-sky-500/40',
        to: 'to-transparent',
      },
       defaultTag: "معرفة",
    },
    {
      type: 'word_war',
      title: 'حرب الكلمات',
      description: 'تلميح من كلمة واحدة يربط كلمات فريقك. هل سيفهم فريقك قصدك؟',
       prizes: [
        { rank: '1st', points: 3, coins: 2 },
        { rank: '2nd', points: 2, coins: 1 },
        { rank: '3rd', points: 1, coins: 0 },
      ],
      accent: {
        from: 'from-emerald-500/40',
        to: 'to-transparent',
      },
      defaultTag: "فطنة",
    },
    {
      type: 'educated-merchant',
      title: 'التاجر المتعلم',
      description: 'أجب عن الأسئلة لتشتري العقارات وتزيد ثروتك. لعبة استراتيجية وثقافة!',
       prizes: [
        { rank: '1st', points: 4, coins: 3 },
        { rank: '2nd', points: 2, coins: 1 },
        { rank: '3rd', points: 1, coins: 1 },
      ],
      accent: {
        from: 'from-lime-500/40',
        to: 'to-transparent',
      },
       defaultTag: "استراتيجية",
    },
];


// -----------------------------
// Main improved GameGrid component
// - Premium black/gold/white theme
// - Accessible interactive cards (keyboard + focus)
// - Fancy SVG prizes + hover animations
// - Stable rendering & clear loading states per-card
// -----------------------------

type LoadingState =
  | `create-${Game['gameType']}`
  | null;

interface GameGridProps {
  favoriteGame: string | null;
  popularGame: string | null;
}

export default function GameGrid({ favoriteGame, popularGame }: GameGridProps) {
  const [isLoading, setIsLoading] = useState<LoadingState>(null);
  const { toast } = useToast();
  const router = useRouter();
  const { user, userProfile } = useAuth();

  const handleCreate = useCallback(
    async (gameType: Game['gameType'], title?: string) => {
      if (!user || !userProfile?.avatarId) {
        toast({ title: 'الرجاء اختيار شخصية من ملفك الشخصي أولاً', variant: 'destructive', duration: 3000 });
        return;
      }

      const loadingKey = `create-${gameType}` as LoadingState;
      setIsLoading(loadingKey);

      try {
        const result = await createGameRoom(user.uid, gameType, userProfile.avatarId);
        if (result.error) {
          toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
          setIsLoading(null);
          return;
        }

        if (result.gameId && result.player) {
          sessionStorage.setItem(`player-id-${result.gameId}`, result.player.id);
          router.push(`/game/${result.gameId}`);
        }
      } catch (err: any) {
        toast({ title: 'حدث خطأ غير متوقع', description: err?.message ?? String(err), variant: 'destructive' });
        setIsLoading(null);
      }
    },
    [user, userProfile, router, toast]
  );

  // UI: heading + grid
  return (
    <TooltipProvider>
      <div className="space-y-8 pt-8" dir="rtl">
        <div className="text-center">
          <h2 className="bg-clip-text text-transparent bg-gradient-to-r from-white/90 to-amber-300 text-3xl md:text-4xl font-extrabold tracking-tight">
            اختر لعبتك
          </h2>
          <p className="mt-1 text-white/70">إنشئ غرفة راقية، دعُ أصدقاءك، وابدأ التحدّي الآن.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
          {gameCardsData.map((game, i) => {
            const Icon = (GAME_ICONS as any)[game.type] || Star;
            const loadingThis = isLoading === (`create-${game.type}`);
            const isFavorite = game.type === favoriteGame;
            const isPopular = game.type === popularGame;

            const tag = isFavorite ? { text: 'مفضلة', Icon: Heart } : isPopular ? { text: 'مشهورة', Icon: TrendingUp } : game.defaultTag ? { text: game.defaultTag, Icon: Star } : null;

            return (
              <motion.article
                key={game.type}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.36, delay: i * 0.04 }}
                className="group relative overflow-hidden rounded-2xl border border-transparent bg-gradient-to-b from-[#070707]/80 to-[#0f0f0f]/88 shadow-lg"
                aria-labelledby={`game-${game.type}-title`}
              >
                {/* Decorative glow */}
                <div aria-hidden className={`pointer-events-none absolute -inset-1 opacity-30 blur-2xl ${game.accent.from} ${game.accent.via ?? ''} ${game.accent.to}`} />
                <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/6" />

                <Card className="relative h-full border-none bg-transparent shadow-none flex flex-col z-10">
                  <CardHeader className="relative text-center pt-6">
                    {tag && (
                      <span className="absolute start-3 top-3 select-none inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-amber-200 border border-amber-700/20 shadow-sm backdrop-blur">
                        <tag.Icon className="w-3 h-3 text-amber-300" />
                        {tag.text}
                      </span>
                    )}

                    <div className="mx-auto mb-2 grid h-20 w-20 place-items-center rounded-3xl border border-white/10 bg-gradient-to-b from-[#0b0b0b] to-[#1a1a1a] shadow-inner transform transition-transform group-hover:scale-105">
                      <Icon className="h-10 w-10 text-amber-300" />
                    </div>

                    <CardTitle id={`game-${game.type}-title`} className="text-xl font-bold tracking-tight text-white">
                      {game.title}
                    </CardTitle>
                    <CardDescription className="mx-auto max-w-[32ch] leading-relaxed text-white/70">{game.description}</CardDescription>
                  </CardHeader>

                  <CardContent className="flex-grow">
                    <div className="border-t border-white/6 my-3" />
                    <div className="space-y-2 text-center md:text-start">
                      <h4 className="text-sm font-bold text-amber-200 flex items-center justify-center md:justify-start gap-2"><GoldTrophy className="w-4 h-4"/> الجوائز</h4>

                      <div className="grid gap-2 mt-2">
                        {game.prizes.map((p, idx) => (
                          <div key={idx} className="flex items-center justify-center md:justify-start">
                            <PrizeRow rank={p.rank} points={p.points} coins={p.coins} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="relative mt-auto pt-4">
                    <Button
                      className="w-full rounded-xl bg-gradient-to-r from-amber-400/90 to-yellow-300/90 text-black shadow-[0_10px_30px_rgba(255,185,0,0.08)] hover:scale-[0.997] focus:outline-none"
                      onClick={() => handleCreate(game.type, game.title)}
                      disabled={!!isLoading}
                      aria-busy={loadingThis}
                      aria-label={`إنشاء غرفة ${game.title}`}
                    >
                      {loadingThis ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-black" />
                          جاري الإنشاء…
                        </span>
                      ) : (
                        'أنشئ غرفة'
                      )}
                    </Button>
                  </CardFooter>

                  {/* Focusable overlay to allow keyboard activation on whole card */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`اختيار ${game.title}`}
                    onClick={() => !isLoading && handleCreate(game.type, game.title)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !isLoading) {
                        e.preventDefault();
                        handleCreate(game.type, game.title);
                      }
                    }}
                    className="absolute inset-0 z-0 bg-transparent"
                  />
                </Card>

                <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 translate-y-10 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100" />
              </motion.article>
            );
          })}
        </div>
      </div>

      {/* Local keyframes */}
      <style jsx>{`
        @keyframes floaty { 0% { transform: translateY(0) } 50% { transform: translateY(-4px) } 100% { transform: translateY(0) } }
      `}</style>
    </TooltipProvider>
  );
}
