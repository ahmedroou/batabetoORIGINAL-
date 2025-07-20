
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2, ArrowLeft, Users, CircleDollarSign, Trophy, Plus, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AvatarPrice, SocialRank } from '@/types';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { AVATAR_IDS } from '@/data/avatars';
import { setAvatarPrices, getAvatarPrices, setSocialRanks, getSocialRanks } from '@/app/actions';

export default function AdminStorePage() {
    const { toast } = useToast();
    const router = useRouter();
    const { user, userProfile, loading } = useAuth();

    // States for Avatar Store
    const [avatarPrices, setAvatarPrices] = useState<Record<string, number>>({});
    const [isLoadingPrices, setIsLoadingPrices] = useState(true);
    const [isSavingPrices, setIsSavingPrices] = useState(false);

    // States for Social Ranks
    const [socialRanks, setSocialRanks] = useState<SocialRank[]>([]);
    const [isLoadingRanks, setIsLoadingRanks] = useState(true);
    const [isSavingRanks, setIsSavingRanks] = useState(false);

    useEffect(() => {
        if (!loading && !userProfile?.isAdmin) {
            router.push('/');
        }
    }, [userProfile, loading, router]);

    const fetchAdminData = useCallback(async () => {
        setIsLoadingPrices(true);
        setIsLoadingRanks(true);
        
        const pricesResult = await getAvatarPrices();
        if (pricesResult.success && pricesResult.prices) {
            const pricesMap = pricesResult.prices.reduce((acc, item) => {
                acc[item.id] = item.price;
                return acc;
            }, {} as Record<string, number>);
            setAvatarPrices(pricesMap);
        } else if (pricesResult.error) {
            toast({ title: "خطأ", description: pricesResult.error, variant: "destructive" });
        }
        setIsLoadingPrices(false);

        const ranksResult = await getSocialRanks();
        if (ranksResult.success && ranksResult.ranks) {
            setSocialRanks(ranksResult.ranks.sort((a,b) => a.threshold - b.threshold));
        } else if (ranksResult.error) {
            toast({ title: "خطأ", description: ranksResult.error, variant: "destructive" });
        }
        setIsLoadingRanks(false);
    }, [toast]);

    useEffect(() => {
        if(userProfile?.isAdmin) {
          fetchAdminData();
        }
    }, [userProfile?.isAdmin, fetchAdminData]);

    const handleSavePrices = async () => {
        setIsSavingPrices(true);
        const pricesArray: AvatarPrice[] = Object.entries(avatarPrices)
          .map(([id, price]) => ({
            id,
            price: Number.isNaN(price) || price === null ? 0 : Number(price),
          }))
          // Ensure default avatar is always free and owned
          .filter(p => p.id !== 'Avatar00.png'); 

        pricesArray.push({ id: 'Avatar00.png', price: 0 });

        const result = await setAvatarPrices(pricesArray);
        if (result.success) {
            toast({ title: "تم حفظ أسعار الشخصيات بنجاح!" });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsSavingPrices(false);
    };

    const handlePriceChange = (id: string, value: string) => {
        const price = parseInt(value, 10);
        setAvatarPrices(prev => ({
            ...prev,
            [id]: Number.isNaN(price) ? 0 : price,
        }));
    };

    const handleRankChange = (index: number, field: 'name' | 'threshold' | 'icon', value: string | number) => {
        const newRanks = [...socialRanks];
        const rankToUpdate = { ...newRanks[index] };
        if(field === 'name') rankToUpdate.name = String(value);
        if(field === 'threshold') rankToUpdate.threshold = Number(value);
        if(field === 'icon') rankToUpdate.icon = String(value) as any;
        newRanks[index] = rankToUpdate;
        setSocialRanks(newRanks);
    };

    const handleAddRank = () => {
        const lastThreshold = socialRanks[socialRanks.length - 1]?.threshold || 0;
        setSocialRanks([...socialRanks, { name: 'لقب جديد', threshold: lastThreshold + 100, icon: 'Shield' }]);
    };
    
    const handleRemoveRank = (index: number) => {
        if (socialRanks.length > 1) {
            const newRanks = socialRanks.filter((_, i) => i !== index);
            setSocialRanks(newRanks);
        } else {
            toast({title: "لا يمكن حذف آخر لقب", variant: "destructive"});
        }
    };

    const handleSaveRanks = async () => {
        setIsSavingRanks(true);
        const result = await setSocialRanks(socialRanks);
        if (result.success) {
            toast({title: "تم حفظ الألقاب بنجاح"});
        } else {
            toast({title: "خطأ في الحفظ", description: result.error, variant: "destructive"});
        }
        setIsSavingRanks(false);
    }

    if (loading || !userProfile?.isAdmin) {
        return null;
    }
    
    return (
        <main className="flex min-h-screen flex-col items-center p-4 bg-muted/40">
            <div className="w-full max-w-4xl space-y-8 py-8">
                 <div className="text-center">
                    <h1 className="text-3xl font-bold">إدارة المتجر والألقاب</h1>
                    <p className="text-muted-foreground">تحديد أسعار الأفاتارات وإدارة نظام الألقاب.</p>
                     <Button variant="ghost" size="icon" onClick={() => router.push('/admin')} className="absolute top-8 right-8">
                        <ArrowLeft />
                    </Button>
                </div>

                <Tabs defaultValue="avatars" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="avatars">متجر الشخصيات</TabsTrigger>
                        <TabsTrigger value="ranks">إدارة الألقاب</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="avatars">
                         <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Users /> متجر الشخصيات</CardTitle>
                                <CardDescription>حدد أسعار الشخصيات بالكوينز. السعر 0 يجعلها مجانية. الأفاتار الافتراضي (Avatar00) دائمًا مجاني.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isLoadingPrices ? <Loader2 className="animate-spin" /> : (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {AVATAR_IDS.map(avatarId => (
                                            <div key={avatarId} className="space-y-2 p-2 border rounded-lg">
                                                <PlayerAvatar avatarId={avatarId} className="w-24 h-24 mx-auto"/>
                                                <div className="flex items-center gap-2">
                                                   <CircleDollarSign className="w-4 h-4 text-yellow-500" />
                                                   <Input 
                                                        type="number"
                                                        placeholder="السعر"
                                                        value={avatarId === 'Avatar00.png' ? '0' : avatarPrices[avatarId] || ''}
                                                        onChange={(e) => handlePriceChange(avatarId, e.target.value)}
                                                        disabled={avatarId === 'Avatar00.png'}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter>
                                <Button onClick={handleSavePrices} disabled={isSavingPrices} className="w-full">
                                    <Save className="mr-2"/>
                                    {isSavingPrices ? "جاري الحفظ..." : "حفظ الأسعار"}
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    <TabsContent value="ranks">
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Trophy /> إدارة الألقاب</CardTitle>
                                <CardDescription>حدد الألقاب ونقاط الصدارة المطلوبة للحصول عليها.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isLoadingRanks ? <Loader2 className="animate-spin" /> : (
                                   <div className='space-y-2'>
                                        {socialRanks.map((rank, index) => (
                                            <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                               <Input 
                                                   value={rank.name}
                                                   onChange={e => handleRankChange(index, 'name', e.target.value)}
                                                   placeholder="اسم اللقب"
                                                   className="flex-grow"
                                               />
                                               <Input 
                                                   type="number"
                                                   value={rank.threshold}
                                                   onChange={e => handleRankChange(index, 'threshold', e.target.value)}
                                                   placeholder="النقاط المطلوبة"
                                                   className="w-32"
                                               />
                                                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleRemoveRank(index)}>
                                                    <X className="w-4 h-4"/>
                                                </Button>
                                            </div>
                                        ))}
                                        <Button variant="outline" onClick={handleAddRank} className="w-full">
                                            <Plus className="mr-2"/> إضافة لقب جديد
                                        </Button>
                                   </div>
                                )}
                            </CardContent>
                             <CardFooter>
                                <Button onClick={handleSaveRanks} disabled={isSavingRanks} className="w-full">
                                    <Save className="mr-2"/>
                                    {isSavingRanks ? "جاري الحفظ..." : "حفظ الألقاب"}
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </main>
    );
}
