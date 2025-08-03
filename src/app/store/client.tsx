
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getAvatarPrices } from '@/app/actions';
import { purchaseAvatar } from '@/lib/actions/user';
import type { AvatarPrice, UserProfile } from '@/types';
import { AVATAR_IDS } from '@/data/avatars';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, CircleDollarSign, Diamond, Loader2, Lock, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function StoreClient() {
    const { user, userProfile, loading, refreshUserProfile } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const [prices, setPrices] = useState<AvatarPrice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [purchaseCandidate, setPurchaseCandidate] = useState<AvatarPrice | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);
    
    useEffect(() => {
        const fetchPrices = async () => {
            setIsLoading(true);
            const result = await getAvatarPrices();
            if (result.success && result.prices) {
                setPrices(result.prices);
            }
            setIsLoading(false);
        };
        fetchPrices();
    }, []);

    const handlePurchaseConfirm = async () => {
        if (!user || !purchaseCandidate) return;
        
        setIsSubmitting(true);
        const result = await purchaseAvatar(user.uid, purchaseCandidate.avatarId);
        
        if (result.success) {
            toast({ title: "تم الشراء بنجاح!", description: "تمت إضافة الشخصية إلى مجموعتك." });
            if(refreshUserProfile) refreshUserProfile();
        } else {
            toast({ title: "فشل الشراء", description: result.error, variant: "destructive" });
        }
        
        setIsSubmitting(false);
        setPurchaseCandidate(null);
    };

    if (loading || isLoading) {
        return (
             <div className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin" />
            </div>
        )
    }

    return (
        <main className="flex min-h-screen flex-col items-center p-4 md:p-8 bg-muted/40">
            <div className="w-full max-w-5xl space-y-8">
                 <div className="relative text-center">
                    <h1 className="text-3xl font-bold">المتجر</h1>
                    <p className="text-muted-foreground">استخدم الكوينز والألماس لفتح شخصيات جديدة ومميزة.</p>
                     <Button variant="ghost" size="icon" onClick={() => router.push('/')} className="absolute top-0 right-0">
                        <ArrowLeft />
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                         <div className="flex justify-between items-center">
                            <CardTitle>شخصيات متاحة للشراء</CardTitle>
                             <div className="flex gap-4 font-bold text-lg">
                                <span className="flex items-center gap-1.5"><CircleDollarSign className="w-5 h-5 text-yellow-500"/> {userProfile?.coins || 0}</span>
                                <span className="flex items-center gap-1.5"><Diamond className="w-5 h-5 text-blue-500"/> {userProfile?.diamonds || 0}</span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                         <ScrollArea className="h-[70vh]">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-1">
                                {AVATAR_IDS.map(avatarId => {
                                    const isUnlocked = userProfile?.unlockedAvatars?.includes(avatarId);
                                    const priceInfo = prices.find(p => p.avatarId === avatarId);
                                    
                                    if (!priceInfo || priceInfo.price === 0) {
                                        return null; 
                                    }

                                    const canAfford = priceInfo.currency === 'coins' 
                                        ? (userProfile?.coins || 0) >= priceInfo.price
                                        : (userProfile?.diamonds || 0) >= priceInfo.price;

                                    return (
                                    <Card 
                                        key={avatarId} 
                                        className={cn("overflow-hidden group", !isUnlocked && "cursor-pointer hover:border-primary")}
                                        onClick={() => !isUnlocked && setPurchaseCandidate(priceInfo)}
                                    >
                                        <CardContent className="p-0">
                                             <div className="relative">
                                                <PlayerAvatar avatarId={avatarId} className="w-full aspect-square" />
                                                {isUnlocked && (
                                                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white">
                                                        <Check className="w-10 h-10"/>
                                                        <span className="font-bold text-sm mt-1">تم الشراء</span>
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                        <CardFooter className="p-2 justify-center">
                                            <div className="flex items-center gap-1 text-lg font-bold">
                                                {priceInfo.currency === 'coins' ? <CircleDollarSign className="w-5 h-5 text-yellow-500"/> : <Diamond className="w-5 h-5 text-blue-500"/>}
                                                <span>{priceInfo.price}</span>
                                            </div>
                                        </CardFooter>
                                    </Card>
                                )})}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
             <AlertDialog open={!!purchaseCandidate} onOpenChange={(open) => !open && setPurchaseCandidate(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>تأكيد الشراء</AlertDialogTitle>
                        <AlertDialogDescription>
                            هل تريد شراء هذه الشخصية مقابل <strong className={cn("font-bold", purchaseCandidate?.currency === 'coins' ? "text-yellow-500" : "text-blue-500")}>{purchaseCandidate?.price} {purchaseCandidate?.currency === 'coins' ? 'كوينز' : 'ألماس'}</strong>؟
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
    );
}

