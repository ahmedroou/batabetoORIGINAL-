

"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lock, Check, CircleDollarSign, Diamond, ShoppingCart } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AVATAR_IDS } from '@/data/avatars';
import { PUNISHMENT_AVATAR_IDS } from '@/data/punishment-avatars';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AvatarPrice } from '@/types';
import { getAvatarPrices, getPunishmentAvatarPrices } from '@/lib/actions/admin';
import { purchaseAvatar, purchasePunishmentAvatar } from '@/lib/actions/user';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


export default function StoreClient() {
    const { toast } = useToast();
    const router = useRouter();
    const { userProfile, loading, refreshUserProfile } = useAuth();

    // Avatars State
    const [prices, setPrices] = useState<Record<string, Omit<AvatarPrice, 'avatarId'>>>({});
    const [punishmentPrices, setPunishmentPrices] = useState<Record<string, Omit<AvatarPrice, 'avatarId'>>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [purchaseCandidate, setPurchaseCandidate] = useState<{avatar: AvatarPrice, type: 'regular' | 'punishment'} | null>(null);

    const fetchPageData = useCallback(async () => {
        setIsLoadingData(true);
        const [pricesResult, punishmentPricesResult] = await Promise.all([
            getAvatarPrices(),
            getPunishmentAvatarPrices(),
        ]);

        if (pricesResult.success && pricesResult.prices) {
            const priceMap = pricesResult.prices.reduce((acc, item) => {
                acc[item.avatarId] = { price: item.price, currency: item.currency || 'coins' };
                return acc;
            }, {} as Record<string, Omit<AvatarPrice, 'avatarId'>>);
            setPrices(priceMap);
        }
        
        if (punishmentPricesResult.success && punishmentPricesResult.prices) {
             const priceMap = punishmentPricesResult.prices.reduce((acc, item) => {
                acc[item.avatarId] = { price: item.price, currency: item.currency || 'coins' };
                return acc;
            }, {} as Record<string, Omit<AvatarPrice, 'avatarId'>>);
            setPunishmentPrices(priceMap);
        }
        setIsLoadingData(false);
    }, []);

    useEffect(() => {
        fetchPageData();
    }, [fetchPageData]);
    
    if (!userProfile) {
        if (!loading) router.push('/login');
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin" />
            </div>
        );
    }
    
    const handlePurchaseConfirm = async () => {
        if (!userProfile || !purchaseCandidate) return;
        
        setIsSubmitting(true);
        const { avatar, type } = purchaseCandidate;
        const result = type === 'regular' 
            ? await purchaseAvatar(userProfile.uid, avatar.avatarId)
            : await purchasePunishmentAvatar(userProfile.uid, avatar.avatarId);
        
        if (result.success) {
            toast({ title: "تم الشراء بنجاح!", description: "تمت إضافة الشخصية إلى مجموعتك." });
            if(refreshUserProfile) refreshUserProfile();
        } else {
            toast({ title: "فشل الشراء", description: result.error, variant: "destructive" });
        }
        
        setIsSubmitting(false);
        setPurchaseCandidate(null);
    };

    const handleAvatarClick = (avatarId: string, type: 'regular' | 'punishment') => {
        if (!userProfile) return;
        
        const isUnlocked = type === 'regular' 
            ? userProfile.unlockedAvatars.includes(avatarId)
            : userProfile.unlockedPunishmentAvatars?.includes(avatarId);
            
        if (isUnlocked) {
            toast({ title: "مملوكة بالفعل", description: "أنت تملك هذه الشخصية بالفعل."});
            return;
        }

        const priceInfo = type === 'regular'
            ? prices[avatarId]
            : punishmentPrices[avatarId];
        
        if (priceInfo && priceInfo.price > 0) {
            setPurchaseCandidate({ avatar: { avatarId, ...priceInfo }, type });
        } else if (priceInfo && priceInfo.price === 0) {
             toast({ title: "شخصية مجانية", description: "هذه الشخصية مجانية ومتاحة للجميع."});
        }
    };
    
    const renderAvatarGrid = (type: 'regular' | 'punishment') => {
        const currentPrices = type === 'regular' ? prices : punishmentPrices;
        const avatarList = type === 'regular' ? AVATAR_IDS : PUNISHMENT_AVATAR_IDS;
        const unlockedList = type === 'regular' ? userProfile.unlockedAvatars : (userProfile.unlockedPunishmentAvatars || []);

        return (
            <CardContent>
                {isLoadingData ? (
                    <div className="text-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                    </div>
                ) : (
                    <ScrollArea className="h-[60vh]">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-1">
                            {avatarList.map(avatarId => {
                                const isUnlocked = unlockedList.includes(avatarId);
                                const itemPrice = currentPrices[avatarId];
                                const price = itemPrice?.price ?? -1;

                                return (
                                <div key={avatarId} className="space-y-2 cursor-pointer group relative" onClick={() => handleAvatarClick(avatarId, type)}>
                                    <PlayerAvatar avatarId={avatarId} className={cn("w-full aspect-square rounded-lg border-2 border-muted group-hover:border-primary transition-all", isUnlocked && "border-green-500")} />
                                    {isUnlocked ? (
                                        <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full p-1 shadow-lg">
                                            <Check className="w-4 h-4" />
                                        </div>
                                    ) : (price >= 0 &&
                                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 text-sm bg-black/50 text-white px-2 py-1 rounded-full font-bold">
                                            {itemPrice?.currency === 'diamonds' ? <Diamond className="w-4 h-4 text-blue-300"/> : <CircleDollarSign className="w-4 h-4 text-yellow-400"/>}
                                            <span>{price}</span>
                                        </div>
                                    )}
                                    {!isUnlocked && price < 0 && (
                                         <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center text-white">
                                            <Lock className="w-8 h-8"/>
                                        </div>
                                    )}
                                </div>
                            )})}
                        </div>
                    </ScrollArea>
                )}
            </CardContent>
        );
    }
    
    return (
        <main className="min-h-screen w-full bg-gray-900 bg-gradient-to-tr from-black via-gray-900 to-purple-900/50 text-white font-sans">
             <div className="fixed inset-0 stars z-0"></div>
             <div className="fixed inset-0 twinkling z-0"></div>
             <div className="relative z-10 container mx-auto px-4 py-8">
                <header className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold text-purple-300 tracking-wider flex items-center justify-center gap-4">
                       <ShoppingCart/> متجر الشخصيات
                    </h1>
                     <p className="text-lg text-gray-400 mt-2">قم بشراء شخصيات جديدة لتتباهى بها في الألعاب!</p>
                </header>
                
                 <Tabs defaultValue="regular_store" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-black/30 backdrop-blur-sm border border-purple-500/30 text-purple-300">
                        <TabsTrigger value="regular_store">المتجر العادي</TabsTrigger>
                        <TabsTrigger value="punishment_store">متجر العقوبات</TabsTrigger>
                    </TabsList>
                    <TabsContent value="regular_store" className="mt-4">{renderAvatarGrid('regular')}</TabsContent>
                    <TabsContent value="punishment_store" className="mt-4">{renderAvatarGrid('punishment')}</TabsContent>
                </Tabs>
            </div>
            
            <AlertDialog open={!!purchaseCandidate} onOpenChange={(open) => !open && setPurchaseCandidate(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>تأكيد الشراء</AlertDialogTitle>
                        <AlertDialogDescription>
                            هل تريد شراء هذه الشخصية مقابل <strong className={cn("font-bold", purchaseCandidate?.avatar.currency === 'coins' ? "text-yellow-500" : "text-blue-500")}>{purchaseCandidate?.avatar.price || 0} {purchaseCandidate?.avatar.currency === 'coins' ? 'كوينز' : 'ألماس'}</strong>؟
                            سيتم خصم المبلغ من رصيدك.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                        <AlertDialogAction onClick={handlePurchaseConfirm} disabled={isSubmitting}>
                            {isSubmitting ? 'جاري الشراء...' : 'شراء'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    )
}
