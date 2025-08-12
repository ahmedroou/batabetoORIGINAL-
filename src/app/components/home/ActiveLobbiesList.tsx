
"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import type { Game } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { collection, query, where, orderBy, Timestamp, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { GAME_ICONS, GAME_TYPE_NAMES } from "@/data/icons";
import { Users, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActiveLobbiesListProps {
    onJoin: (id: string) => void;
}

export default function ActiveLobbiesList({ onJoin }: ActiveLobbiesListProps) {
    const { toast } = useToast();
    const [activeLobbies, setActiveLobbies] = useState<Game[]>([]);
    const [isLoadingLobbies, setIsLoadingLobbies] = useState(true);

    useEffect(() => {
        const q = query(
            collection(db, 'games'), 
            where('gameState', '==', 'lobby'),
            where('expiresAt', '>', Timestamp.now()),
            orderBy('expiresAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const lobbies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Game));
            setActiveLobbies(lobbies);
            setIsLoadingLobbies(false);
        }, (error: any) => {
            console.error("Error fetching active lobbies:", error);
            toast({
                title: "خطأ في الاتصال باللعبة",
                description: `حدث خطأ في جلب الغرف. قد تحتاج إلى إنشاء فهرس مركب في Firestore. الخطأ: ${error.message}`,
                variant: "destructive"
            });
            setIsLoadingLobbies(false);
        });

        return () => unsubscribe();
    }, [toast]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users /> الغرف النشطة</CardTitle>
                <CardDescription>انضم إلى أي غرفة متاحة أو أنشئ غرفتك الخاصة.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[200px] pr-4">
                    <div className="space-y-3">
                        {isLoadingLobbies ? (
                            [...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
                        ) : activeLobbies.length === 0 ? (
                            <div className="text-center py-10 text-muted-foreground">
                                <p>لا توجد غرف نشطة حاليًا.</p>
                                <p>كن أول من ينشئ غرفة جديدة!</p>
                            </div>
                        ) : (
                            activeLobbies.map(lobby => {
                                const GameIcon = GAME_ICONS[lobby.gameType] || Star;
                                return (
                                    <div key={lobby.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <GameIcon className="w-10 h-10 text-primary" />
                                            <div>
                                                <p className="font-bold">{lobby.isDuel ? `مبارزة: ${lobby.players.map(p => p.name).join(' ضد ')}` : (GAME_TYPE_NAMES[lobby.gameType] || 'لعبة غير معروفة')}</p>
                                                <p className="text-sm text-muted-foreground">المضيف: {lobby.players[0]?.name}</p>
                                            </div>
                                        </div>
                                         <div className="flex items-center gap-4">
                                            <div className="text-center">
                                                <Users className="mx-auto" />
                                                <span className="text-sm font-bold">{lobby.players.length}/8</span>
                                            </div>
                                            <Button onClick={() => onJoin(lobby.id)} size="sm">
                                                انضمام
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
