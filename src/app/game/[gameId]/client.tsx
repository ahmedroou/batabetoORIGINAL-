"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import type { Game, Player } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, LogOut, Users, Loader2, Copy } from "lucide-react";
import { KingOfGeniusGame } from "@/components/game/king-of-genius/KingOfGeniusGame";
import { TrapAnswerGame } from "@/components/game/trap-answer/TrapAnswerGame";
import { WordWarGame } from '@/components/game/word-war/WordWarGame';
import { BehindTheMaskGame } from '@/components/game/behind-the-mask/BehindTheMaskGame';
import { PrisonGame } from '@/components/game/prison/PrisonGame';
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { leaveGame } from '@/lib/actions/room'; // Removed setPlayerReady as it's not used in this version

// A simple, reusable loading component
const LoadingScreen = () => (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Loader2 className="w-16 h-16 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">جاري تحميل اللعبة...</p>
    </main>
);

// A simple, reusable error component
const ErrorScreen = ({ title, message }: { title: string; message: string }) => {
    const router = useRouter();
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4">
            <Card className="w-full max-w-md text-center p-8">
                <CardTitle className="text-2xl font-bold text-destructive">{title}</CardTitle>
                <CardDescription className="mt-2">{message}</CardDescription>
                <Button onClick={() => router.push('/')} className="mt-6">العودة للصفحة الرئيسية</Button>
            </Card>
        </main>
    );
};

export default function GameClient() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const { user } = useAuth(); // Only need user for the ID

    const gameId = params.gameId as string;
    const [game, setGame] = useState<Game | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    // **IMPROVEMENT**: We only need to store the player's ID.
    // The full player object will be derived from the `game` state, which is the single source of truth.
    const [playerId, setPlayerId] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        try {
            return sessionStorage.getItem(`player-id-${gameId}`);
        } catch {
            return null;
        }
    });

    // This is the single source of truth for the current player's data.
    const self = useMemo(() => {
        if (!game || !playerId || !Array.isArray(game.players)) return null;
        return game.players.find(p => p.id === playerId) || null;
    }, [game, playerId]);

    useEffect(() => {
        if (!gameId) {
            router.push('/');
            return;
        }
        
        // If we don't even have a player ID stored, the user doesn't belong here.
        if (!playerId) {
            toast({ title: "خطأ", description: "لا تملك صلاحية لدخول هذه الغرفة.", variant: "destructive" });
            router.push('/');
            return;
        }

        const unsub = onSnapshot(
            doc(db, "games", gameId),
            (docSnap) => {
                if (docSnap.exists()) {
                    const gameData = { id: docSnap.id, ...docSnap.data() } as Game;
                    setGame(gameData);
                    
                    // Check if the player has been removed (kicked or left)
                    const isPlayerInGame = gameData.players.some(p => p.id === playerId);
                    if (!isPlayerInGame && gameData.gameState !== 'final_results') {
                        toast({ title: "تم إخراجك من اللعبة", description: "لقد غادرت أو قام المضيف بطردك." });
                        sessionStorage.removeItem(`player-id-${gameId}`);
                        router.push('/');
                    }
                } else {
                    toast({ title: "الغرفة لم تعد موجودة", variant: "destructive" });
                    sessionStorage.removeItem(`player-id-${gameId}`);
                    router.push('/');
                }
                setIsLoading(false);
            },
            (error) => {
                console.error("Firebase snapshot error:", error);
                toast({ title: "خطأ في الاتصال", description: "لا يمكن الوصول للعبة. تحقق من اتصالك بالإنترنت.", variant: "destructive" });
                setIsLoading(false);
                router.push('/');
            }
        );

        return () => unsub();
    }, [gameId, playerId, router, toast]);

    const handleLeaveGame = useCallback(async () => {
        if (!playerId) return;
        const result = await leaveGame(gameId, playerId);
        if (result.success) {
            toast({ title: "لقد غادرت الغرفة." });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        // Navigation and cleanup will be handled by the useEffect listener detecting the player's removal.
        sessionStorage.removeItem(`player-id-${gameId}`);
        router.push('/');
    }, [gameId, playerId, router, toast]);

    const handleCopyGameId = () => {
        navigator.clipboard.writeText(gameId);
        toast({ title: "تم النسخ!", description: "تم نسخ معرف الغرفة إلى الحافظة." });
    };

    if (isLoading) {
        return <LoadingScreen />;
    }

    if (!game || !self) {
        // This screen appears if the game document is gone or the 'self' player object can't be found.
        return <ErrorScreen title="خطأ في تحميل اللعبة" message="لا يمكن العثور على بياناتك في هذه اللعبة. قد تكون الغرفة حُذفت أو تم طردك." />;
    }

    // --- RENDER LOGIC ---

    const renderLobby = () => (
        <Card className="w-full max-w-lg animate-fade-in">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">{`غرفة لعبة: ${game.gameType}`}</CardTitle>
                <CardDescription>ادعُ أصدقاءك للانضمام باستخدام معرف الغرفة</CardDescription>
                <div 
                    className="flex items-center justify-center gap-2 mt-2 p-2 bg-muted rounded-md cursor-pointer hover:bg-muted/80"
                    onClick={handleCopyGameId}
                >
                    <span className="font-mono text-lg tracking-widest">{gameId}</span>
                    <Copy className="w-4 h-4 text-muted-foreground" />
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex justify-center items-center text-muted-foreground">
                    <Users className="w-5 h-5 ml-2" />
                    <span>اللاعبون: {game.players.length}</span>
                </div>
                <div className="space-y-2">
                    {game.players.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-2 bg-background rounded-md">
                            <div className="flex items-center gap-3">
                                <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10" temporaryTitle={p.temporaryTitle} />
                                <span className="font-bold">{p.name}</span>
                                {p.id === game.hostId && <span className="text-xs font-bold text-amber-500">(المضيف)</span>}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
            <CardFooter className="flex-col gap-2">
                <Button onClick={handleLeaveGame} variant="destructive" className="w-full">
                    <LogOut className="ml-2 h-4 w-4" /> مغادرة
                </Button>
            </CardFooter>
        </Card>
    );

    const renderGame = () => {
        switch (game.gameType) {
            case 'trap-answer': return <TrapAnswerGame game={game} self={self} />;
            case 'word_war': return <WordWarGame game={game} self={self} />;
            case 'king-of-genius': return <KingOfGeniusGame game={game} player={self} self={self} isHost={game.hostId === self.id} />;
            case 'behind-the-mask': return <BehindTheMaskGame game={game} self={self} />;
            case 'prison': return <PrisonGame game={game} self={self} />;
            default: return <ErrorScreen title="خطأ في اللعبة" message={`نوع اللعبة "${game.gameType}" غير معروف.`} />;
        }
    };

    return (
        <main className={cn("flex min-h-screen flex-col items-center justify-center p-4 md:p-8 relative bg-background")}>
            <div className="absolute top-4 right-4 text-left z-10">
                <h1 className="text-2xl font-bold text-primary">بطابيطو</h1>
            </div>
            
            {/* Show leave button during active game states */}
            {game.gameState !== 'lobby' && game.gameState !== 'final_results' && (
                <div className="absolute top-4 left-4 z-50">
                    <Button variant="outline" size="sm" onClick={handleLeaveGame}>
                        <LogOut className="ml-2 h-4 w-4" /> مغادرة
                    </Button>
                </div>
            )}

            {game.gameState === 'lobby' ? renderLobby() : renderGame()}
        </main>
    );
}
