
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { MatchHistoryItem, Player } from "@/types";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { motion } from "framer-motion";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  History,
  Loader2,
  ArrowLeft,
  Trophy,
  ChevronLeft,
  Medal,
  PartyPopper,
  Crown,
  Filter,
  RefreshCw,
  Download,
  Share2,
  Info,
  ClipboardCopy,
} from "lucide-react";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { GAME_TYPE_NAMES, GAME_ICONS } from "@/data/icons";
import { cn } from "@/lib/utils";

// ===== Helpers =====
const PAGE_SIZE = 20 as const;
const nf = new Intl.NumberFormat("ar-EG");
const fmtDate = (d: Date | number) =>
  format(typeof d === "number" ? new Date(d) : d, "d MMMM yyyy, h:mm a", { locale: ar });

function safeToDate(input: any): Date {
  // Firestore Timestamp has toDate(); fallback to Date or epoch
  try {
    if (input?.toDate) return input.toDate();
    if (typeof input === "number") return new Date(input);
    if (typeof input === "string") return new Date(input);
    return new Date();
  } catch {
    return new Date();
  }
}

function getUserRankInMatch(match: MatchHistoryItem, userId: string | undefined) {
  if (!userId) return { myRank: undefined, myScore: undefined, top: undefined };
  const entries = Object.entries(match.finalScores || {}) as [string, number][];
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const myIndex = sorted.findIndex(([pid]) => pid === userId);
  const myScore = match.finalScores?.[userId];
  const top = sorted[0] ? { playerId: sorted[0][0], score: sorted[0][1] } : undefined;
  return { myRank: myIndex >= 0 ? myIndex + 1 : undefined, myScore, top };
}

// ===== Cute medal by rank =====
function RankChip({ rank }: { rank?: number }) {
  if (!rank) return null;
  const palette = {
    1: "bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-200 dark:border-yellow-700/40",
    2: "bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-900/20 dark:text-slate-200 dark:border-slate-700/40",
    3: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-700/40",
  } as const;
  const Icon = rank === 1 ? Crown : Medal;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold",
        palette[(rank as 1 | 2 | 3) in [1, 2, 3] ? (rank as 1 | 2 | 3) : 3] || "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-900/20 dark:text-violet-100 dark:border-violet-700/40"
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{rank === 1 ? "الأول" : rank === 2 ? "الثاني" : rank === 3 ? "الثالث" : `#${rank}`}</span>
    </span>
  );
}

// ===== Dialog: Scoreboard =====
const ScoreboardDialog = ({
  match,
  trigger,
  currentUserId,
  kingOfGamesId,
}: {
  match: MatchHistoryItem;
  trigger: React.ReactNode;
  currentUserId?: string;
  kingOfGamesId: string | null;
}) => {
  const sortedPlayers = [...match.players].sort(
    (a, b) => (match.finalScores?.[b.id] || 0) - (match.finalScores?.[a.id] || 0)
  );
  const { myRank } = getUserRankInMatch(match, currentUserId);

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href + `#match-${match.id}` : "";
    const title = `نتائج ${GAME_TYPE_NAMES[match.gameType]} — ${fmtDate(safeToDate(match.createdAt))}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        alert("تم نسخ رابط المباراة");
      }
    } catch { /* ignore */ }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(match.id);
      alert("تم نسخ معرف المباراة");
    } catch {}
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>
              نتائج مباراة: {GAME_TYPE_NAMES[match.gameType]}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={share} aria-label="مشاركة">
                <Share2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={copyId} aria-label="نسخ المعرف">
                <ClipboardCopy className="w-4 h-4" />
              </Button>
            </div>
          </DialogTitle>
          <CardDescription className="mt-1 flex items-center gap-2 text-xs">
            <Info className="w-3.5 h-3.5" />
            <span>
              أُقيمت في {fmtDate(safeToDate(match.createdAt))} • عدد اللاعبين: {match.players?.length || 0}
            </span>
          </CardDescription>
        </DialogHeader>
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">#</TableHead>
                <TableHead className="text-right">اللاعب</TableHead>
                <TableHead className="text-right">النقاط</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPlayers.map((player, index) => {
                const score = match.finalScores?.[player.id] || 0;
                const isMe = currentUserId && player.id === currentUserId;
                const isKing = player.id === kingOfGamesId;
                return (
                  <TableRow key={player.id} className={cn(isMe && "bg-violet-50/70 dark:bg-violet-900/10")}
                    id={index === 0 ? `match-${match.id}` : undefined}
                  >
                    <TableCell className="font-medium rtl:text-right ltr:text-left">
                      <RankChip rank={index + 1} />
                    </TableCell>
                    <TableCell className="flex items-center gap-2">
                      <PlayerAvatar avatarId={player.avatarId} className="w-8 h-8" />
                      <span className={cn("truncate", isMe && "font-bold text-violet-900 dark:text-violet-100", isKing && "king-of-games-name")}>{player.name}</span>
                      {isMe && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-900 border border-violet-300 dark:bg-violet-900/30 dark:text-violet-100 dark:border-violet-700/40">
                          أنا
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{nf.format(score)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {typeof myRank === "number" && myRank === 1 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-violet-900 dark:text-violet-100">
            <PartyPopper className="w-4 h-4" /> مبروك! حققت المركز الأول 🎉
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ===== Main Page =====
export default function MatchHistoryPage() {
  const { user, loading, kingOfGamesId } = useAuth();
  const router = useRouter();

  const [history, setHistory] = useState<MatchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [gameFilter, setGameFilter] = useState<string>("all");
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [isMoreLoading, setIsMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Persist filter in localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mh:gameFilter");
      if (saved) setGameFilter(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("mh:gameFilter", gameFilter); } catch {}
  }, [gameFilter]);

  // Auth guard + initial fetch (+realtime for first page)
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    setIsLoading(true);
    setError(null);

    const baseRef = collection(db, `users/${user.uid}/matchHistory`);
    const qBase = query(baseRef, orderBy("createdAt", "desc"), limit(PAGE_SIZE));

    // Realtime for first page
    const unsub = onSnapshot(qBase, (snap) => {
      const items = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })) as MatchHistoryItem[];
      setHistory(items);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMore(snap.size === PAGE_SIZE);
      setIsLoading(false);
    }, (e) => {
      console.error(e);
      setError("تعذر تحميل السجل. حاول مجددًا.");
      setIsLoading(false);
    });

    return () => unsub();
  }, [user, loading, router]);

  const loadMore = useCallback(async () => {
    if (!user || !hasMore || isMoreLoading || !lastDocRef.current) return;
    setIsMoreLoading(true);
    try {
      const baseRef = collection(db, `users/${user.uid}/matchHistory`);
      const qMore = query(baseRef, orderBy("createdAt", "desc"), startAfter(lastDocRef.current), limit(PAGE_SIZE));
      const snap = await getDocs(qMore);
      const items = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })) as MatchHistoryItem[];
      setHistory((prev) => [...prev, ...items]);
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? lastDocRef.current;
      setHasMore(snap.size === PAGE_SIZE);
    } catch (e) {
      console.error(e);
      setError("تعذر تحميل المزيد من النتائج.");
    } finally {
      setIsMoreLoading(false);
    }
  }, [user, hasMore, isMoreLoading]);

  const refresh = useCallback(() => {
    // Triggered by realtime anyway, but allows user feedback
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 350);
  }, []);

  const filtered = useMemo(() => {
    if (gameFilter === "all") return history;
    return history.filter((m) => m.gameType === gameFilter);
  }, [history, gameFilter]);

  // Summary stats
  const summary = useMemo(() => {
    if (history.length === 0 || !user?.uid) return null;
    const counts: Record<string, number> = {};
    let rankSum = 0; let rankCount = 0; let bestRank = Infinity;
    history.forEach((m) => {
      counts[m.gameType] = (counts[m.gameType] || 0) + 1;
      const { myRank } = getUserRankInMatch(m, user.uid);
      if (myRank) {
        rankSum += myRank; rankCount += 1; bestRank = Math.min(bestRank, myRank);
      }
    });
    const favorite = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const avgRank = rankCount ? (rankSum / rankCount) : undefined;
    const lastPlayed = safeToDate(history[0]?.createdAt);
    return { favorite, avgRank, bestRank: isFinite(bestRank) ? bestRank : undefined, lastPlayed };
  }, [history, user?.uid]);

  const exportCSV = useCallback(() => {
    const rows = [
      ["id", "gameType", "date", "playerCount", "myScore", "myRank", "topPlayer", "topScore"],
      ...filtered.map((m) => {
        const { myScore, myRank, top } = getUserRankInMatch(m, user?.uid);
        const topName = m.players.find((p) => p.id === top?.playerId)?.name || "";
        return [
          m.id,
          GAME_TYPE_NAMES[m.gameType] || m.gameType,
          fmtDate(safeToDate(m.createdAt)),
          String(m.players?.length || 0),
          myScore != null ? String(myScore) : "",
          myRank != null ? String(myRank) : "",
          topName,
          top?.score != null ? String(top.score) : "",
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "match-history.csv"; a.click();
    URL.revokeObjectURL(url);
  }, [filtered, user?.uid]);

  if (isLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-slate-900 dark:bg-gray-950 dark:text-white">
        <Loader2 className="h-10 w-10 animate-spin" />
      </div>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen w-full bg-gradient-to-tr from-white via-violet-50 to-white text-slate-900 dark:from-gray-950 dark:via-[#0b0614] dark:to-gray-950 dark:text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}>
            <h1 className="text-3xl md:text-4xl font-extrabold flex items-center gap-3">
              <History className="w-8 h-8 md:w-10 md:h-10 text-violet-700 dark:text-violet-300" />
              سجل المباريات
            </h1>
            <p className="text-sm text-slate-600 dark:text-violet-200/70 mt-1">آخر {PAGE_SIZE} مباراة (مع إمكانية تحميل المزيد).</p>
          </motion.div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.push("/")} aria-label="رجوع إلى الرئيسية">
              <ArrowLeft />
            </Button>
            <Button variant="outline" size="icon" onClick={refresh} aria-label="تحديث">
              <RefreshCw />
            </Button>
            <Button variant="outline" size="icon" onClick={exportCSV} aria-label="تصدير CSV">
              <Download />
            </Button>
          </div>
        </header>

        {/* Filters + Summary */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">تصفية حسب نوع اللعبة</CardTitle>
              <CardDescription>اختر نوعًا لعرض مبارياته فقط.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant={gameFilter === "all" ? "default" : "outline"}
                className={cn(gameFilter === "all" ? "bg-violet-700 hover:bg-violet-800 text-white" : "")}
                onClick={() => setGameFilter("all")}
              >
                الكل
              </Button>
              {Array.from(new Set(history.map((m) => m.gameType))).map((gt) => {
                const Icon = GAME_ICONS[gt] || Trophy;
                return (
                  <Button
                    key={gt}
                    variant={gameFilter === gt ? "default" : "outline"}
                    className={cn("inline-flex items-center gap-2", gameFilter === gt ? "bg-violet-700 hover:bg-violet-800 text-white" : "")}
                    onClick={() => setGameFilter(gt)}
                  >
                    <Icon className="w-4 h-4" /> {GAME_TYPE_NAMES[gt] || gt}
                  </Button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="self-start">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                ملخص لطيف <PartyPopper className="w-4 h-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary ? (
                <ul className="text-sm space-y-1">
                  <li>
                    <span className="text-slate-500 dark:text-violet-200/70">اللعبة المفضلة: </span>
                    <strong>{GAME_TYPE_NAMES[summary.favorite as keyof typeof GAME_TYPE_NAMES] || summary.favorite}</strong>
                  </li>
                  {summary.avgRank && (
                    <li>
                      <span className="text-slate-500 dark:text-violet-200/70">متوسط المركز: </span>
                      <strong>#{summary.avgRank.toFixed(1)}</strong>
                    </li>
                  )}
                  {summary.bestRank && (
                    <li>
                      <span className="text-slate-500 dark:text-violet-200/70">أفضل مركز: </span>
                      <strong><RankChip rank={summary.bestRank} /></strong>
                    </li>
                  )}
                  <li>
                    <span className="text-slate-500 dark:text-violet-200/70">آخر مباراة: </span>
                    <strong>{summary.lastPlayed ? fmtDate(summary.lastPlayed) : '—'}</strong>
                  </li>
                </ul>
              ) : (
                <p className="text-sm text-slate-500 dark:text-violet-200/70">لا بيانات كافية بعد.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Error */}
        {error && (
          <Card className="border-red-300/50 bg-red-50 dark:bg-red-900/10">
            <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </CardContent>
          </Card>
        )}

        {/* Content */}
        {filtered.length === 0 ? (
          <Card className="text-center py-16 bg-white/70 border-violet-200/60 dark:bg-gray-900/40 dark:border-violet-700/30">
            <CardContent>
              <Trophy className="w-20 h-20 mx-auto text-violet-300 dark:text-violet-600" />
              <p className="mt-4 text-lg font-semibold">لا توجد مباريات مطابقة للتصفية</p>
              <p className="text-sm text-slate-600 dark:text-violet-200/70">جرّب إزالة التصفية أو العب مباراة جديدة ❤️</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((match, index) => {
              const GameIcon = GAME_ICONS[match.gameType] || Trophy;
              const { myRank, myScore, top } = getUserRankInMatch(match, user?.uid);
              const topPlayerName = match.players?.find((p) => p.id === top?.playerId)?.name;
              
              const isTeamGame = match.gameType === 'word_war' || match.gameType === 'king-of-genius' || match.gameType === 'behind-the-mask';
              const myPlayer = match.players?.find(p => p.id === user?.uid);
              const myTeamWon = isTeamGame && myPlayer?.team && myPlayer.team === match.winner;

              return (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3) }}
                >
                  <ScoreboardDialog
                    currentUserId={user?.uid}
                    kingOfGamesId={kingOfGamesId}
                    match={match}
                    trigger={
                      <button className="w-full text-right">
                        <Card className="hover:bg-violet-50/60 dark:hover:bg-white/5 transition-colors cursor-pointer border-violet-200/60 dark:border-violet-700/30 bg-white/60 dark:bg-gray-900/40">
                          <CardContent className="p-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-0">
                              <GameIcon className="w-9 h-9 text-violet-700 dark:text-violet-300 shrink-0" />
                              <div className="min-w-0">
                                <p className="font-bold text-base md:text-lg truncate">
                                  {GAME_TYPE_NAMES[match.gameType]}
                                </p>
                                <p className="text-xs md:text-sm text-slate-600 dark:text-violet-200/70 truncate">
                                  {fmtDate(safeToDate(match.createdAt))}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {isTeamGame ? (
                                myTeamWon ? <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">منتصر</Badge> :
                                <Badge variant="destructive">مهزوم</Badge>
                              ) : (
                                typeof myRank === "number" && <RankChip rank={myRank} />
                              )}
                              <div className="hidden md:flex items-center gap-1 text-xs text-slate-600 dark:text-violet-200/70">
                                <span>أعلى لاعب:</span>
                                <strong className="truncate max-w-[120px]">{topPlayerName || "—"}</strong>
                              </div>
                              <div className="flex items-center gap-1 text-xs">
                                <span className="text-slate-600 dark:text-violet-200/70">نقاطي:</span>
                                <strong>{myScore != null ? nf.format(myScore) : "—"}</strong>
                              </div>
                              <ChevronLeft className="w-5 h-5 text-slate-500 dark:text-violet-300/70" />
                            </div>
                          </CardContent>
                        </Card>
                      </button>
                    }
                  />
                </motion.div>
              );
            })}

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  disabled={isMoreLoading}
                  onClick={loadMore}
                  className="border-violet-200 dark:border-violet-700/40"
                >
                  {isMoreLoading ? (
                    <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> يتم التحميل…</span>
                  ) : (
                    <>تحميل المزيد</>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
