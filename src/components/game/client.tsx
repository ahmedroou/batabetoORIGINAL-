
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import type { Game, Player } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, LogOut, Users, Crown, Gamepad2, Timer } from 'lucide-react';
import { KingOfGeniusGame } from '@/components/game/king-of-genius/KingOfGeniusGame';
import { TrapAnswerGame } from '@/components/game/trap-answer/TrapAnswerGame';
import WordWarGame from '@/components/game/word-war/WordWarGame';
import { BehindTheMaskGame } from '@/components/game/behind-the-mask/BehindTheMaskGame';
import { PrisonGame } from '@/components/game/prison/PrisonGame';
import { EducatedMerchantGame } from '@/components/game/educated-merchant/EducatedMerchantGame';
import { DrawAndDeceiveGame } from '@/components/game/draw-and-deceive/DrawAndDeceiveGame';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { leaveGame } from '@/lib/actions/room';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { setAwayStatus } from '@/lib/actions/trap-answer';
import { motion, AnimatePresence } from 'framer-motion';
import { GAME_TYPE_NAMES } from '@/data/icons';

// ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
// ⚙️ Theme Map (ألوان وخلفيات حسب نوع اللعبة)
// ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
const THEME: Record<NonNullable<Game['gameType']> | 'default', {
  bg: string; // خلفية رئيسية
  ring: string; // توهّج الإطار
  chip: string; // شارات الحالة
  title: string; // لون العنوان
}> = {
  'king-of-genius': {
    bg: 'from-amber-900/60 via-orange-900/40 to-slate-900/70',
    ring: 'ring-amber-500/40',
    chip: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
    title: 'text-amber-200',
  },
  'trap-answer': {
    bg: 'from-fuchsia-900/60 via-purple-900/40 to-slate-900/70',
    ring: 'ring-fuchsia-500/40',
    chip: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/30',
    title: 'text-fuchsia-200',
  },
  'behind-the-mask': {
    bg: 'from-rose-900/60 via-indigo-900/40 to-slate-900/70',
    ring: 'ring-rose-500/40',
    chip: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
    title: 'text-rose-200',
  },
  'word_war': {
    bg: 'from-emerald-900/60 via-teal-900/40 to-slate-900/70',
    ring: 'ring-emerald-500/40',
    chip: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
    title: 'text-emerald-200',
  },
  'prison': {
    bg: 'from-sky-900/60 via-blue-900/40 to-slate-900/70',
    ring: 'ring-sky-500/40',
    chip: 'bg-sky-500/15 text-sky-200 border-sky-400/30',
    title: 'text-sky-200',
  },
  'educated-merchant': {
    bg: 'from-lime-900/60 via-green-900/40 to-slate-900/70',
    ring: 'ring-lime-500/40',
    chip: 'bg-lime-500/15 text-lime-200 border-lime-400/30',
    title: 'text-lime-200',
  },
  'draw-and-deceive': {
    bg: 'from-cyan-900/60 via-sky-900/40 to-slate-900/70',
    ring: 'ring-cyan-500/40',
    chip: 'bg-cyan-500/15 text-cyan-200 border-cyan-400/30',
    title: 'text-cyan-200',
  },
  default: {
    bg: 'from-violet-900/60 via-slate-900/50 to-black',
    ring: 'ring-violet-500/40',
    chip: 'bg-violet-500/15 text-violet-200 border-violet-400/30',
    title: 'text-violet-200',
  },
};

// شارات حالة اللعبة بالعربية
const stateLabel: Record<NonNullable<Game['gameState']>, string> = {
  lobby: 'الانتظار',
  active: 'جارية',
  final_results: 'النتائج',
  // King of Genius
  team_selection: 'توزيع الفرق',
  challenge_intro: 'مقدمة التحدي',
  challenge_active: 'التحدي قائم',
  challenge_results: 'نتائج الجولة',
  // Trap Answer
  'category-selection': 'اختيار القسم',
  'answer-submission': 'تقديم الإجابات',
  guessing: 'مرحلة التخمين',
  'round-results': 'نتائج الجولة',
  // Behind the Mask
  role_reveal: 'كشف الأدوار',
  night: 'الليل',
  day: 'النهار',
  voting: 'التصويت',
  execution: 'الإعدام',
  // Word War
  preparation: 'التجهيز',
  guide_turn: 'دور المرشد',
  guesser_turn: 'دور المخمن',
  board_reveal: 'كشف اللوحة',
  // Prison
  instructions: 'التعليمات',
  open_auction: 'مزاد مفتوح',
  closed_auction_bidding: 'مزايدة مغلقة',
  closed_auction_answering: 'إجابة المزاد',
  judging: 'الحكم',
  rejudging: 'إعادة الحكم',
  results: 'النتائج',
  // Educated Merchant
  rolling: 'رمي النرد',
  movement: 'تحرك',
  property_action: 'قرار الملكية',
  question: 'سؤال',
  turn_end: 'نهاية الدور',
  // Draw and Deceive
  drawing: 'الرسم',
  trapping: 'وضع الفخاخ',
  // `guessing` is shared
  // `results` is shared
};


// ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
// ✨ خلفية زخرفية تفاعلية
// ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
function GameBackdrop({ tone = 'default' as keyof typeof THEME }) {
  const t = THEME[tone] ?? THEME.default;
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Gradient base */}
      <div className={cn('absolute inset-0 bg-gradient-to-br', t.bg)} />
      {/* Glow orbs */}
      <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/5 blur-3xl animate-pulse" />
      <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl animate-pulse [animation-delay:400ms]" />
      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-[0.07]" style={{
        backgroundImage:
          'radial-gradient(circle at 1px 1px, rgba(255,255,255,.35) 1px, transparent 0)',
        backgroundSize: '24px 24px',
      }} />
    </div>
  );
}

// ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
// 📌 شريط علوي للمعلومات (لا يغيّر المنطق)
// ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
function GameTopBar({
  game,
  self,
  onLeave,
}: { game: Game; self: Player; onLeave: () => void }) {
  const t = THEME[game.gameType ?? 'default'] ?? THEME.default;
  const showLeave = game.gameState !== 'lobby' && game.gameState !== 'final_results';
  const isHost = game.hostId === self.id;
  return (
    <div className="pointer-events-none fixed top-0 left-0 right-0 z-40">
      <div className="mx-auto mt-3 w-[min(1100px,95vw)]">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className={cn(
            'pointer-events-auto backdrop-blur-xl bg-background/40 border rounded-2xl shadow-xl px-3 sm:px-4 py-2 sm:py-3',
            'border-white/10',
            'relative',
            'ring-1',
            t.ring,
          )}
        >
          <div className="flex items-center justify-between gap-3">
            {/* Left actions */}
            <div className="flex items-center gap-2">
              {showLeave && (
                <Button variant="outline" size="sm" onClick={onLeave} className="group">
                  <LogOut className="ml-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                  مغادرة
                </Button>
              )}
            </div>

            {/* Center info */}
            <div className="flex items-center gap-2 sm:gap-3 text-center">
              <Gamepad2 className={cn('h-4 w-4 sm:h-5 sm:w-5', t.title)} />
              <h1 className={cn('text-sm sm:text-base font-semibold', t.title)}>
                {GAME_TYPE_NAMES[game.gameType as keyof typeof GAME_TYPE_NAMES] ?? 'لعبة'}
              </h1>
              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] sm:text-xs', t.chip)}>
                <Timer className="h-3.5 w-3.5" /> {stateLabel[game.gameState] ?? '...'}
              </span>
              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] sm:text-xs', t.chip)}>
                <Users className="h-3.5 w-3.5" /> {Array.isArray(game.players) ? game.players.length : 0}
              </span>
              {isHost && (
                <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] sm:text-xs', t.chip)}>
                  <Crown className="h-3.5 w-3.5" /> المضيف
                </span>
              )}
            </div>

            {/* Right spacer */}
            <div className="w-20" />
          </div>

          {/* Bottom gradient border sheen */}
          <div className="pointer-events-none absolute inset-x-4 -bottom-px h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </motion.div>
      </div>
    </div>
  );
}

// ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
// ⏳ شاشة التحميل (جمالية فقط)
// ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
function LoadingScreen() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <GameBackdrop />
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-background/40 px-8 py-10 backdrop-blur-xl shadow-2xl">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">جاري تحميل اللعبة...</p>
        </div>
      </motion.div>
      {/* Ambient lights */}
      <div className="pointer-events-none absolute -z-10 h-[60vmax] w-[60vmax] rounded-full bg-primary/10 blur-3xl" />
    </main>
  );
}

// ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
// 🧩 المكوّن الرئيسي (منطق مطابق للأصل + تحسين مظهر)
// ــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــــ
export default function GameClient() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const isVisible = usePageVisibility();

  const [game, setGame] = useState<Game | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ⚠️ نفس منطق جلب selfId من الـ sessionStorage (بدون تعديل)
  const selfId = useMemo(() => {
    if (typeof window !== 'undefined') {
      try {
        return sessionStorage.getItem(`player-id-${gameId}`);
      } catch (e) {
        console.error('Session storage is not available.');
        return null;
      }
    }
    return null;
  }, [gameId]);

  // 🔊 الاستماع إلى تغيّرات اللعبة من Firestore (المنطق كما هو)
  useEffect(() => {
    if (!gameId) {
      router.push('/');
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'games', gameId),
      (docSnap) => {
        setIsLoading(false);
        if (docSnap.exists()) {
          const gameData = { id: docSnap.id, ...docSnap.data() } as Game;
          setGame(gameData);

          const isPlayerInGame = Array.isArray(gameData.players) && gameData.players.some((p) => p.id === selfId);
          if (selfId && !isPlayerInGame && gameData.gameState !== 'final_results') {
            sessionStorage.removeItem(`player-id-${gameId}`);
            toast({ title: 'لقد غادرت اللعبة أو تم طردك' });
            router.push('/');
          }
        } else {
          toast({ title: 'الغرفة لم تعد موجودة', variant: 'destructive' });
          sessionStorage.removeItem(`player-id-${gameId}`);
          router.push('/');
        }
      },
      (error) => {
        console.error('Firebase snapshot error', error);
        toast({ title: 'خطأ في الاتصال', description: 'تحقق من اتصالك بالإنترنت', variant: 'destructive' });
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [gameId, router, toast, selfId]);

  // 🚥 حالة التواجد (AFK) — بدون تعديل في المنطق
  useEffect(() => {
    if (selfId && game?.gameType === 'trap-answer') {
      setAwayStatus(game.id, selfId, !isVisible);
    }
  }, [isVisible, game?.id, game?.gameType, selfId]);

  // 🚪 مغادرة اللعبة — نفس الدالة مع تحسين واجهة الاستخدام فقط
  const handleLeaveGame = useCallback(async () => {
    if (!selfId) return;
    const result = await leaveGame(gameId, selfId);
    if (result.success) {
      sessionStorage.removeItem(`player-id-${gameId}`);
      router.push('/');
      toast({ title: 'لقد غادرت الغرفة.' });
    } else {
      toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
    }
  }, [gameId, selfId, router, toast]);

  const self = useMemo(() => {
    if (game && Array.isArray(game.players) && selfId) {
      return game.players.find((p) => p.id === selfId) || null;
    }
    return null;
  }, [game, selfId]);

  // ⏳ شاشة التحميل المحسّنة
  if (isLoading) {
    return <LoadingScreen />;
  }

  // 🧯 أخطاء التحميل (واجهة أجمل، نفس السلوك)
  if (!game || !self) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center p-4">
        <GameBackdrop />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="w-full max-w-md border-white/10 bg-background/50 backdrop-blur-xl">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-destructive">خطأ في تحميل اللعبة</CardTitle>
              <CardDescription className="mt-2">قد تكون الغرفة محذوفة أو تم طردك. حاول الانضمام مرة أخرى.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button onClick={() => router.push('/')}>العودة للصفحة الرئيسية</Button>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    );
  }

  // 🧠 عرض محتوى اللعبة (بدون تغيير المنطق)
  const renderGameContent = () => {
    switch (game.gameType) {
      case 'trap-answer':
        return <TrapAnswerGame game={game} self={self} />;
      case 'word_war':
        return <WordWarGame game={game} self={self} />;
      case 'king-of-genius':
        return <KingOfGeniusGame game={game} player={self} self={self} isHost={game.hostId === self.id} />;
      case 'behind-the-mask':
        return <BehindTheMaskGame game={game} self={self} />;
      case 'prison':
        return <PrisonGame game={game} self={self} />;
      case 'educated-merchant':
        return <EducatedMerchantGame game={game} self={self} />;
      case 'draw-and-deceive':
        return <DrawAndDeceiveGame game={game} self={self} />;
      default:
        return <p>حالة غير معروفة للعبة "{game.gameType}"</p>;
    }
  };

  const tone = (game.gameType && game.gameType in THEME) ? game.gameType as keyof typeof THEME : 'default';

  return (
    <main className={cn('relative flex min-h-screen flex-col items-center justify-center p-2 md:p-4')}> 
      <GameBackdrop tone={tone} />

      {/* شريط علوي للمعلومات و زر المغادرة */}
      <GameTopBar game={game} self={self} onLeave={handleLeaveGame} />

      {/* حاوية محتوى اللعبة (زجاجية + حواف متوهّجة) */}
      <div className="mt-20 mb-6 w-[min(1200px,98vw)]">
        <AnimatePresence mode="wait">
          <motion.div
            key={game.id}
            initial={{ opacity: 0, y: 14, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className={cn(
              'relative rounded-3xl border bg-background/40 backdrop-blur-xl shadow-2xl',
              'border-white/10',
              'ring-1',
              THEME[tone].ring,
            )}
          >
            {/* sheen line */}
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
            <div className="p-2 sm:p-3 md:p-4 lg:p-6">
              {renderGameContent()}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}
