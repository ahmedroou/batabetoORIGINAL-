
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LogIn, Users } from "lucide-react";
import { joinGameRoom } from "@/lib/actions/room";
import ActiveLobbiesList from "./ActiveLobbiesList";
import type { Game } from '@/types';

interface LobbySectionProps {
    onLobbiesUpdate: (lobbies: Game[]) => void;
}

export default function LobbySection({ onLobbiesUpdate }: LobbySectionProps) {
    const [gameId, setGameId] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const { user, userProfile } = useAuth();
    const { toast } = useToast();
    const router = useRouter();

    const handleJoin = async (id: string) => {
        if (!user || !userProfile?.avatarId) {
             toast({ title: "الرجاء اختيار شخصية من ملفك الشخصي أولاً", variant: "destructive", duration: 3000 });
            return;
        }
        if (!id.trim()) {
            toast({ title: "الرجاء إدخال رمز الغرفة", variant: "destructive"});
            return;
        }
        setIsLoading(true);
        const result = await joinGameRoom(id, user.uid, userProfile.avatarId);
         if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
            setIsLoading(false);
        } else if(result.gameId && result.player) {
            sessionStorage.setItem(`player-id-${result.gameId}`, result.player.id);
            router.push(`/game/${result.gameId}`);
        }
    };
    
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><LogIn /> الانضمام السريع</CardTitle>
                    <CardDescription>لديك رمز غرفة؟ أدخله هنا للانضمام مباشرة.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex w-full max-w-sm mx-auto items-center space-x-2 space-x-reverse">
                        <Input 
                            type="text" 
                            placeholder="ABC123" 
                            value={gameId} 
                            onChange={(e) => setGameId(e.target.value.toUpperCase())}
                            className="text-center tracking-widest font-mono"
                        />
                        <Button onClick={() => handleJoin(gameId)} disabled={isLoading}>
                            {isLoading ? '...' : 'انضم'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
            <ActiveLobbiesList onJoin={handleJoin} onLobbiesUpdate={onLobbiesUpdate} />
        </div>
    );
}
