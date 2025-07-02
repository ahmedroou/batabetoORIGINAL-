
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGameRoom, joinGameRoom } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { DoorOpen, PlusCircle, Users, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const FunkyFace = ({ className }: { className?: string }) => (
    <svg
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        fill="currentColor"
    >
        <path d="M100,20A80,80,0,1,1,20,100,80,80,0,0,1,100,20Zm0,140a60,60,0,1,0-60-60A60,60,0,0,0,100,160Z" opacity="0.1"></path>
        <path d="M100,30A70,70,0,1,1,30,100,70.08,70.08,0,0,1,100,30Zm-2.5,120.4a58.42,58.42,0,0,0,5,0c18.6-3,33.4-15.5,39.9-32.9a8,8,0,0,0-15-5.8,45.42,45.42,0,0,1-50.1,0,8,8,0,0,0-15,5.8C64.1,134.9,78.9,147.4,97.5,150.4Z" opacity="0.2"></path>
        <path d="M100,40A60,60,0,1,1,40,100,60.07,60.07,0,0,1,100,40ZM72,84a12,12,0,1,0,12,12A12,12,0,0,0,72,84Zm56,0a12,12,0,1,0,12,12A12,12,0,0,0,128,84Z"></path>
        <path d="M100,40a60.07,60.07,0,0,0-60,60,60,60,0,0,0,120,0A60.07,60.07,0,0,0,100,40Zm28,44a12,12,0,1,1,12-12A12,12,0,0,1,128,84Zm-56,0a12,12,0,1,1,12-12A12,12,0,0,1,72,84Z" opacity="0.4"></path>
        <path d="M136.6,111.5c-4.9,13.2-16.1,23.3-30.8,26.4a8,8,0,0,1-7.6-15.5c8.3-1.8,15.1-7,18.8-13.8a8,8,0,1,1,15,5.9Z"></path>
    </svg>
);

export default function Home() {
    const [playerName, setPlayerName] = useState("");
    const [gameId, setGameId] = useState("");
    const [isLoading, setIsLoading] = useState<"create" | "join" | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        // NOTE: This is a simple mock for prototyping.
        // In a real app, this should be handled by a proper authentication system.
        const isAdminFromStorage = localStorage.getItem('isAdmin') === 'true';
        setIsAdmin(isAdminFromStorage);
    }, []);

    const handleCreate = async () => {
        setIsLoading("create");
        const result = await createGameRoom(playerName);
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
            setIsLoading(null);
        } else if(result.gameId && result.player) {
            sessionStorage.setItem(`player-${result.gameId}`, JSON.stringify(result.player));
            router.push(`/game/${result.gameId}`);
        }
    };
    
    const handleJoin = async () => {
        setIsLoading("join");
        const result = await joinGameRoom(gameId, playerName);
         if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
            setIsLoading(null);
        } else if(result.gameId && result.player) {
            sessionStorage.setItem(`player-${result.gameId}`, JSON.stringify(result.player));
            router.push(`/game/${result.gameId}`);
        }
    };


    return (
        <div className="relative min-h-screen">
            {isAdmin && (
                <div className="absolute top-4 left-4 z-10">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Link href="/admin">
                                    <Button variant="ghost" size="icon">
                                        <ShieldCheck className="h-6 w-6 text-primary" />
                                    </Button>
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>لوحة تحكم الأدمن</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            )}
            <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 bg-background animate-fade-in">
                <div className="text-center mb-8">
                    <FunkyFace className="w-32 h-32 text-primary mx-auto animate-pulse-glow" />
                    <h1 className="text-5xl font-bold text-primary mt-4">غوص عميق</h1>
                    <p className="text-xl text-muted-foreground mt-2">لعبة الصداقة</p>
                </div>

                <Card className="w-full max-w-md animate-bounce-in">
                    <CardHeader className="text-center">
                        <CardTitle className="flex items-center justify-center gap-2 text-2xl"><Users /> مرحبًا بك!</CardTitle>
                        <CardDescription>ابدأ لعبة جديدة أو انضم إلى أصدقائك.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="player-name">اسمك</Label>
                            <Input
                                id="player-name"
                                placeholder="اكتب اسمك هنا..."
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                className="text-center text-lg h-12"
                            />
                        </div>
                        
                        <div className="space-y-4">
                            <Button
                                onClick={handleCreate}
                                disabled={!playerName.trim() || !!isLoading}
                                className="w-full"
                                size="lg"
                            >
                                <PlusCircle /> {isLoading === 'create' ? 'جاري الإنشاء...' : 'إنشاء لعبة جديدة'}
                            </Button>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-2 text-muted-foreground">أو</span>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Input
                                    placeholder="أدخل معرف الغرفة"
                                    value={gameId}
                                    onChange={(e) => setGameId(e.target.value.toUpperCase())}
                                    className="text-center tracking-widest font-mono h-12 text-lg"
                                    maxLength={6}
                                    disabled={!playerName.trim() || !!isLoading}
                                />
                                <Button
                                    onClick={handleJoin}
                                    disabled={!playerName.trim() || !gameId.trim() || !!isLoading}
                                    className="px-6"
                                    size="lg"
                                    variant="secondary"
                                >
                                    <DoorOpen /> {isLoading === 'join' ? '...' : 'انضمام'}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </main>
            <footer className="absolute bottom-4 text-center w-full">
            </footer>
        </div>
    );
}
