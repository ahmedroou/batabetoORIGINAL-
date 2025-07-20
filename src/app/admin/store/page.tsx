
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { setAvatarPrices, getAvatarPrices } from '@/lib/actions/admin';
import { ArrowLeft, Save, Loader2, CircleDollarSign } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AVATAR_IDS } from '@/data/avatars';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AvatarPrice } from '@/types';

export default function AdminStorePage() {
    const { toast } = useToast();
    const router = useRouter();
    const { userProfile, loading } = useAuth();

    const [prices, setPrices] = useState<Record<string, number>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingPrices, setIsLoadingPrices] = useState(true);

    useEffect(() => {
        if (!loading && !userProfile?.isAdmin) {
            router.push('/');
        }
    }, [userProfile, loading, router]);

    const fetchPrices = useCallback(async () => {
        setIsLoadingPrices(true);
        const result = await getAvatarPrices();
        if (result.success && result.prices) {
            const priceMap = result.prices.reduce((acc, item) => {
                acc[item.avatarId] = item.price;
                return acc;
            }, {} as Record<string, number>);
            setPrices(priceMap);
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsLoadingPrices(false);
    }, [toast]);

    useEffect(() => {
        // Fetch prices as soon as we know the user is an admin, don't wait for full profile loading
        if (userProfile?.isAdmin) {
            fetchPrices();
        }
    }, [userProfile?.isAdmin, fetchPrices]);

    const handlePriceChange = (avatarId: string, value: string) => {
        const newPrice = parseInt(value, 10);
        setPrices(prev => ({
            ...prev,
            [avatarId]: isNaN(newPrice) ? 0 : newPrice,
        }));
    };

    const handleSavePrices = async () => {
        setIsSaving(true);
        const pricesArray: AvatarPrice[] = Object.entries(prices).map(([avatarId, price]) => ({
            avatarId,
            price: price || 0
        }));

        const result = await setAvatarPrices(pricesArray);

        if (result.success) {
            toast({ title: "نجاح", description: "تم حفظ أسعار الشخصيات بنجاح." });
        } else {
            toast({ title: "خطأ في الحفظ", description: result.error, variant: "destructive" });
        }
        setIsSaving(false);
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin" />
            </div>
        );
    }
     if (!userProfile?.isAdmin) {
        return null; // or a redirect component
    }


    return (
        <main className="flex min-h-screen flex-col items-center p-4 md:p-8 bg-muted/40">
            <div className="w-full max-w-6xl space-y-8">
                <div className="relative text-center">
                    <h1 className="text-3xl font-bold">إدارة المتجر</h1>
                    <p className="text-muted-foreground">تحديد أسعار الشخصيات والألقاب.</p>
                     <Button variant="ghost" size="icon" onClick={() => router.push('/admin')} className="absolute top-0 right-0">
                        <ArrowLeft />
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>متجر الشخصيات</CardTitle>
                        <CardDescription>
                            عيّن سعرًا لكل شخصية. السعر 0 يعني أن الشخصية مجانية.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoadingPrices ? (
                             <div className="text-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                                <p className="mt-2 text-muted-foreground">جاري تحميل الأسعار...</p>
                             </div>
                        ) : (
                            <ScrollArea className="h-[60vh]">
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-1">
                                    {AVATAR_IDS.map(avatarId => (
                                        <div key={avatarId} className="space-y-2">
                                            <PlayerAvatar avatarId={avatarId} className="w-full aspect-square rounded-lg border-2 border-muted" />
                                            <div className="relative">
                                                <CircleDollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-yellow-500" />
                                                <Input
                                                    type="number"
                                                    className="pl-8 text-center"
                                                    value={prices[avatarId] || ''}
                                                    onChange={(e) => handlePriceChange(avatarId, e.target.value)}
                                                    placeholder="السعر"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleSavePrices} disabled={isSaving || isLoadingPrices} className="w-full md:w-auto">
                            {isSaving ? <Loader2 className="mr-2 animate-spin" /> : <Save className="mr-2" />}
                            {isSaving ? 'جاري الحفظ...' : 'حفظ الأسعار'}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </main>
    );
}
