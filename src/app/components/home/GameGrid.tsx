
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { createGameRoom } from "@/lib/actions/room";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GAME_ICONS } from '@/data/icons';
import type { Game } from '@/types';
import { Star } from "lucide-react";

type LoadingState = "create-king-of-genius" | "create-trap-answer" | "create-behind-the-mask" | "create-word_war" | "create-prison" | "create-educated-merchant" | null;

const gameCards = [
    { type: 'king-of-genius', title: 'ساحة العباقرة', description: 'تحديات ذكاء وسرعة بديهة بين فريقين.' },
    { type: 'word_war', title: 'حرب الكلمات', description: 'لمّح لفريقك لكشف كلماتكم قبل الخصم.' },
    { type: 'trap-answer', title: 'الجواب المفخخ', description: 'اكتب جوابًا خاطئًا ومقنعًا لخداع الآخرين.' },
    { type: 'behind-the-mask', title: 'خلف القناع', description: 'اكشف هوية القاتل قبل أن يقضي عليكم جميعًا.' },
    { type: 'prison', title: 'السجن', description: 'اجمع أكبر عدد من الإجابات الصحيحة لتفوز بالمزاد أو تخاطر بالعقوبة.' },
    { type: 'educated-merchant', title: 'التاجر المتعلم', description: 'اشترِ العقارات، أجب على الأسئلة، وأفلس خصومك.' },
];

export default function GameGrid() {
    const [isLoading, setIsLoading] = useState<LoadingState>(null);
    const { toast } = useToast();
    const router = useRouter();
    const { user, userProfile } = useAuth();

    const handleCreate = async (gameType: Game['gameType']) => {
        if (!user || !userProfile?.avatarId) {
            toast({ title: "الرجاء اختيار شخصية من ملفك الشخصي أولاً", variant: "destructive", duration: 3000 });
            return;
        }
        
        setIsLoading(`create-${gameType}`);

        const result = await createGameRoom(user.uid, gameType, userProfile.avatarId);
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
            setIsLoading(null);
        } else if(result.gameId && result.player) {
            sessionStorage.setItem(`player-id-${result.gameId}`, result.player.id);
            router.push(`/game/${result.gameId}`);
        }
    };

    return (
        <div className="space-y-6 pt-8">
            <div className="text-center">
                <h2 className="text-3xl font-bold">اختر لعبتك</h2>
                <p className="text-muted-foreground">اختر لعبة لإنشاء غرفتك الخاصة ودعوة أصدقائك.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                {gameCards.map(game => {
                    const Icon = GAME_ICONS[game.type as keyof typeof GAME_ICONS] || Star;
                    const type = game.type as Game['gameType'];
                    return (
                        <Card key={game.type} className="hover:shadow-lg hover:border-primary transition-all duration-300 flex flex-col">
                            <CardHeader className="text-center">
                                <Icon className="w-12 h-12 text-primary mx-auto mb-2" />
                                <CardTitle>{game.title}</CardTitle>
                                <CardDescription>{game.description}</CardDescription>
                            </CardHeader>
                            <CardFooter className="mt-auto">
                                <Button className="w-full" onClick={() => handleCreate(type)} disabled={!!isLoading}>
                                    {isLoading === `create-${game.type}` ? 'جاري الإنشاء...' : 'أنشئ غرفة'}
                                </Button>
                            </CardFooter>
                        </Card>
                    )
                })}
            </div>
        </div>
    );
}
