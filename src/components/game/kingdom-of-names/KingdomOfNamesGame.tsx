'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import type { Game, Player } from '@/types';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2, Play, SkipForward, Users, Clock, Trophy, AlertCircle } from 'lucide-react';
import { LobbyPhase } from './phases/LobbyPhase';

// ------------------------------
// Dynamic phase imports (code split)
// ------------------------------
const PhaseSkeleton: React.FC<{ label?: string }> = ({ label = 'جارٍ التحميل…' }) => (
  <div className="w-full h-56 flex items-center justify-center">
    <div className="flex items-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  </div>
);

const PlayingPhase = dynamic(() => import('./phases/PlayingPhase').then((m) => (m.PlayingPhase ?? m.default)), { ssr: false, loading: () => <PhaseSkeleton label="تحميل شاشة اللعب…" /> });
const VotingPhase = dynamic(() => import('./phases/VotingPhase').then((m) => (m.VotingPhase ?? m.default)), { ssr: false, loading: () => <PhaseSkeleton label="تحميل شاشة التصويت…" /> });
const ResultsPhase = dynamic(() => import('./phases/ResultsPhase').then((m) => (m.ResultsPhase ?? m.default)), { ssr: false, loading: () => <PhaseSkeleton label="تحميل النتائج…" /> });
const FinalResultsPhase = dynamic(() => import('./phases/FinalResultsPhase').then((m) => (m.FinalResultsPhase ?? m.default)), { ssr: false, loading: () => <PhaseSkeleton label="تحميل النتائج النهائية…" /> });

// ------------------------------
// Types
// ------------------------------
type PhaseKey = 'lobby' | 'playing' | 'voting' | 'results' | 'final_results';
const PHASE_COMPONENTS: Record<PhaseKey, React.ComponentType<{ game: Game; self: Player }>> = {
  lobby: LobbyPhase,
  playing: PlayingPhase as any,
  voting: VotingPhase as any,
  results: ResultsPhase as any,
  final_results: FinalResultsPhase as any,
};

const KNOWN_PHASES = Object.keys(PHASE_COMPONENTS) as PhaseKey[];
const isKnownPhase = (p: any): p is PhaseKey => KNOWN_PHASES.includes(p);

// ------------------------------
// Utils (handle different Timestamp shapes)
// ------------------------------
function getMillisFromMaybeTs(ts: any): number | null {
  if (!ts) return null;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return (ts.seconds * 1000) + Math.floor((ts.nanoseconds ?? 0) / 1e6);
  return null;
}

function clamp(n: number, a = 0, b = 1) {
  return Math.max(a, Math.min(b, n));
}

// ------------------------------
// Small presentational subcomponents
// ------------------------------
function UnknownPhase({ phase }: { phase: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center text-sm text-rose-700">
      <AlertCircle className="mx-auto mb-2 h-6 w-6" />
      <div>مرحلة غير معروفة: <span className="font-mono">{phase}</span></div>
      <div className="mt-2 text-xs text-rose-600">تأكد من خوادم اللعبة أو حالة الغرفة — هذه رسالة توضيحية للمطوّر.</div>
    </div>
  );
}

function PlayerBadge({ player, isSelf }: { player: Player; isSelf?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-50">
      <div className="h-10 w-10 rounded-full bg-zinc-200 overflow-hidden flex items-center justify-center text-sm font-semibold">{/* placeholder avatar */}
        <span className="text-zinc-700">{player.name?.slice(0,1) ?? '?'}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium truncate">{player.name}</div>
          {isSelf && <div className="text-xs text-zinc-500">(أنت)</div>}
        </div>
        <div className="text-xs text-zinc-500">{player.status === 'alive' ? 'مشارك' : 'مغادر'}</div>
      </div>
      <div className="text-sm font-semibold">{player.score ?? 0} pts</div>
    </div>
  );
}

// ------------------------------
// Component
// ------------------------------
interface KingdomOfNamesGameProps {
  game: Game;
  self: Player;
  // optional callbacks: integrate with your server actions (safe to ignore)
  onStart?: (gameId: string) => Promise<void>;
  onNextRound?: (gameId: string) => Promise<void>;
  onProcessResults?: (gameId: string) => Promise<void>;
}

export default function KingdomOfNamesGame({ game, self, onStart, onNextRound, onProcessResults }: KingdomOfNamesGameProps) {
  const prefersReducedMotion = useReducedMotion();
  const isHost = game.hostId === self.id;

  // Resolve phase safely
  const rawPhase = (game as any)?.kingdomOfNamesState?.phase ?? game.gameState;
  const phase: PhaseKey = isKnownPhase(rawPhase) ? rawPhase : (game.gameState === 'lobby' ? 'lobby' : 'lobby');

  // Timer
  const timerEndsAtRaw = (game as any)?.kingdomOfNamesState?.timerEndsAt ?? null;
  const timerEndsAtMs = getMillisFromMaybeTs(timerEndsAtRaw);
  const roundTimeSeconds = (game as any)?.kingdomOfNamesState?.settings?.roundTime ?? 60;

  const [nowMs, setNowMs] = React.useState(Date.now());
  React.useEffect(() => {
    if (!timerEndsAtMs) return; // nothing to track
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timerEndsAtMs]);

  const remainingSeconds = timerEndsAtMs ? Math.max(0, Math.ceil((timerEndsAtMs - nowMs) / 1000)) : null;
  const progress = remainingSeconds == null ? 0 : clamp(1 - remainingSeconds / (roundTimeSeconds || 60), 0, 1);

  // Players
  const players = (game.players || []) as Player[];
  const activeCount = players.filter(p => p.status === 'alive').length;

  // Content component
  const Content = PHASE_COMPONENTS[phase] ?? (() => <UnknownPhase phase={String(rawPhase)} />);

  // Host action helpers
  const callHost = async (fn?: (id: string) => Promise<void>) => {
    if (!isHost) return; // no-op
    if (fn) {
      try { await fn(game.id); } catch (e) { console.error(e); }
    } else {
      // Fallback: show warning to devs in console
      console.warn('Host action invoked but no handler provided. Provide onStart/onNextRound/onProcessResults props.');
    }
  };

  return (
    <main className="w-full max-w-6xl mx-auto p-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Game header & controls */}
        <section className="col-span-1 bg-white/60 dark:bg-zinc-900/50 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-yellow-400 flex items-center justify-center text-3xl font-extrabold text-white shadow-lg">
              {(game as any)?.kingdomOfNamesState?.letter || '?'}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">مملكة الأسماء</h3>
                  <div className="text-sm text-zinc-500">جولة {(game as any)?.kingdomOfNamesState?.round ?? 0} من {(game as any)?.kingdomOfNamesState?.settings?.rounds ?? 7}</div>
                </div>
                <div className="text-sm text-zinc-600 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>{activeCount}/{players.length}</span>
                </div>
              </div>

              {/* Timer */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                  <div className="flex items-center gap-2"><Clock className="h-4 w-4" /> <span>الوقت المتبقي</span></div>
                  <div className="font-medium">{remainingSeconds == null ? '—' : `${remainingSeconds}s`}</div>
                </div>
                <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div className="h-2 bg-amber-400" style={{ width: `${progress * 100}%`, transition: prefersReducedMotion ? 'none' : 'width 400ms ease' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Host Controls */}
          {isHost && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => callHost(onStart)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-white text-sm shadow hover:bg-amber-600"
                title="ابدأ اللعبة (يجب تنفيذ onStart server-side)"
              >
                <Play className="h-4 w-4" /> بدء
              </button>

              <button
                onClick={() => callHost(onProcessResults)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-100 text-zinc-800 text-sm shadow hover:bg-zinc-200"
                title="حساب النتائج الآن (host)">
                <Trophy className="h-4 w-4 text-amber-500" /> حساب النتائج
              </button>

              <button
                onClick={() => callHost(onNextRound)}
                className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 text-zinc-800 text-sm border"
                title="الانتقال للجولة التالية (يجب تنفيذ onNextRound server-side)">
                <SkipForward className="h-4 w-4" /> الجولة التالية
              </button>
            </div>
          )}

        </section>

        {/* Middle: Phase content */}
        <section className="col-span-1 lg:col-span-2 bg-white/60 dark:bg-zinc-900/50 rounded-2xl p-4 shadow-sm">
          <AnimatePresence mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28 }}
            >
              {/* render the active phase component */}
              <Content game={game} self={self} />
            </motion.div>
          </AnimatePresence>
        </section>

        {/* Right: Players & scoreboard */}
        <aside className="col-span-1 bg-white/60 dark:bg-zinc-900/50 rounded-2xl p-4 shadow-sm">
          <h4 className="text-sm font-semibold mb-3">قائمة اللاعبين</h4>
          <div className="space-y-2 max-h-72 overflow-auto">
            {players.map((p) => (
              <PlayerBadge key={p.id} player={p} isSelf={p.id === self.id} />
            ))}
          </div>

          <div className="mt-4 border-t pt-4">
            <div className="text-xs text-zinc-500">نقاط اللاعبين</div>
            <div className="mt-2 space-y-2">
              {players
                .slice()
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .map((p) => (
                  <div key={`score-${p.id}`} className="flex items-center justify-between text-sm">
                    <div className="truncate pr-2">{p.name}</div>
                    <div className="font-semibold">{p.score ?? 0}</div>
                  </div>
                ))}
            </div>
          </div>

        </aside>
      </div>
    </main>
  );
}
