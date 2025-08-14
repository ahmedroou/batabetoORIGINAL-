
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { MatchHistoryItem, Player } from "@/types";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
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
} from "lucide-react";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { GAME_TYPE_NAMES, GAME_ICONS } from "@/data/icons";
import { cn } from "@/lib/utils";

const ScoreboardDialog = ({
  match,
  trigger,
}: {
  match: MatchHistoryItem;
  trigger: React.ReactNode;
}) => {
  const sortedPlayers = [...match.players].sort(
    (a, b) => (match.finalScores[b.id] || 0) - (match.finalScores[a.id] || 0)
  );

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>نتائج مباراة: {GAME_TYPE_NAMES[match.gameType]}</DialogTitle>
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
              {sortedPlayers.map((player, index) => (
                <TableRow key={player.id}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell className="flex items-center gap-2">
                    <PlayerAvatar avatarId={player.avatarId} className="w-8 h-8" />
                    {player.name}
                  </TableCell>
                  <TableCell>{match.finalScores[player.id] || 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function MatchHistoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [history, setHistory] = useState<MatchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const fetchHistory = async () => {
      try {
        const historyRef = collection(db, `users/${user.uid}/matchHistory`);
        const q = query(historyRef, orderBy("createdAt", "desc"), limit(20));
        const snapshot = await getDocs(q);
        const matches = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            } as MatchHistoryItem)
        );
        setHistory(matches);
      } catch (error) {
        console.error("Error fetching match history:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [user, loading, router]);

  if (isLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <main className="min-h-screen w-full bg-gray-900 bg-gradient-to-tr from-black via-gray-900 to-purple-900/50 text-white font-sans p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <h1 className="text-4xl font-extrabold flex items-center gap-3">
              <History className="w-10 h-10 text-primary" />
              سجل المباريات
            </h1>
            <p className="text-muted-foreground mt-1">آخر 20 مباراة لعبتها.</p>
          </motion.div>
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft />
          </Button>
        </header>

        {history.length === 0 ? (
          <Card className="text-center py-20 bg-gray-800/50 border-purple-500/30">
            <CardContent>
              <Trophy className="w-24 h-24 mx-auto text-gray-600" />
              <p className="mt-4 text-xl font-semibold">لم تلعب أي مباراة بعد</p>
              <p className="text-muted-foreground">اذهب والعب بعض الألعاب لتظهر هنا!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {history.map((match, index) => {
              const GameIcon = GAME_ICONS[match.gameType] || Trophy;
              return (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <ScoreboardDialog
                    match={match}
                    trigger={
                      <button className="w-full text-right">
                        <Card className="hover:bg-gray-800/70 transition-colors cursor-pointer border-gray-700 bg-gray-800/40">
                          <CardContent className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <GameIcon className="w-10 h-10 text-primary" />
                              <div>
                                <p className="font-bold text-lg">
                                  {GAME_TYPE_NAMES[match.gameType]}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {format(match.createdAt.toDate(), "d MMMM yyyy, h:mm a", { locale: ar })}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">عرض النتائج</span>
                              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                            </div>
                          </CardContent>
                        </Card>
                      </button>
                    }
                  />
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
