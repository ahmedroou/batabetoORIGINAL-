

"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Loader2, CircleDollarSign, Trash2, PlusCircle, ShieldCheck, Trophy, Crown, Gem, Shield, Star, Award, Building, Edit, Diamond, Lock, Unlock, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AVATAR_IDS } from '@/data/avatars';
import { PUNISHMENT_AVATAR_IDS } from '@/data/punishment-avatars';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AvatarPrice, SocialRank, UserProfile } from '@/types';
import { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getAvatarPrices, setAvatarPrices, setSocialRanks, setDefaultAvatar, getDefaultAvatar, addPermissionToRank, removePermissionFromRank, setPunishmentAvatarPrices, getPunishmentAvatarPrices, getTopUsers } from '@/lib/actions/admin';
import { getRanks } from '@/lib/actions/user';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ALL_PERMISSIONS } from '@/data/permissions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


const rankIconMap: Record<string, LucideIcon> = {
    Shield, ShieldCheck, Award, Gem, Crown, Star
};

export default function AdminStoreClient() {
    const { toast } = useToast();
    const router = useRouter();
    const { userProfile, loading } = useAuth();

    // Avatars State
    const [prices, setPrices] = useState<Record<string, Omit<AvatarPrice, 'avatarId'>>>({});
    const [punishmentPrices, setPunishmentPrices] = useState<Record<string, Omit<AvatarPrice, 'avatarId'>>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [defaultAvatarId, setDefaultAvatarId] = useState<string>('Avatar00.png');

    // Ranks State
    const [ranks, setRanks] = useState<SocialRank[]>([]);
    const [isSavingRanks, setIsSavingRanks] = useState(false);
    const [selectedRankForPermissions, setSelectedRankForPermissions] = useState<SocialRank | null>(null);
    const [isUpdatingPermission, setIsUpdatingPermission] = useState(false);
    
    // Top Users State
    const [topCoinsUsers, setTopCoinsUsers] = useState<UserProfile[]>([]);
    const [topPointsUsers, setTopPointsUsers] = useState<UserProfile[]>([]);

    useEffect(() => {
        if (!loading && !userProfile?.isAdmin) {
            router.push('/');
        }
    }, [userProfile, loading, router]);

    const fetchPageData = useCallback(async () => {
        if (!userProfile?.uid) return;
        setIsLoadingData(true);

        const [pricesResult, punishmentPricesResult, ranksResult, topCoinsResult, topPointsResult, defaultAvatarResult] = await Promise.all([
            getAvatarPrices(),
            getPunishmentAvatarPrices(),
            getRanks(),
            getTopUsers(userProfile.uid, 'coins', 5),
            getTopUsers(userProfile.uid,'leaderboardPoints', 5),
            getDefaultAvatar(),
        ]);

        if (pricesResult.success && pricesResult.prices) {
            const priceMap = pricesResult.prices.reduce((acc, item) => {
                acc[item.avatarId] = { price: item.price, currency: item.currency || 'coins' };
                return acc;
            }, {} as Record<string, Omit<AvatarPrice, 'avatarId'>>);
            setPrices(priceMap);
        } else {
            toast({ title: "خطأ", description: pricesResult.error, variant: "destructive" });
        }
        
        if (punishmentPricesResult.success && punishmentPricesResult.prices) {
             const priceMap = punishmentPricesResult.prices.reduce((acc, item) => {
                acc[item.avatarId] = { price: item.price, currency: item.currency || 'coins' };
                return acc;
            }, {} as Record<string, Omit<AvatarPrice, 'avatarId'>>);
            setPunishmentPrices(priceMap);
        } else {
            toast({ title: "خطأ", description: punishmentPricesResult.error, variant: "destructive" });
        }
        
        if (defaultAvatarResult.success && defaultAvatarResult.avatarId) {
            setDefaultAvatarId(defaultAvatarResult.avatarId);
        }

        setRanks(ranksResult.sort((a,b) => a.threshold - b.threshold));
        if(ranksResult.length > 0) {
            setSelectedRankForPermissions(ranksResult[0]);
        }
        
        setTopCoinsUsers(topCoinsResult);
        setTopPointsUsers(topPointsResult);
        setIsLoadingData(false);

    }, [toast, userProfile?.uid]);

    useEffect(() => {
        if (userProfile?.isAdmin) {
            fetchPageData();
        }
    }, [userProfile?.isAdmin, fetchPageData]);
    
     useEffect(() => {
        if(selectedRankForPermissions) {
            const updatedSelectedRank = ranks.find(r => r.name === selectedRankForPermissions.name && r.threshold === selectedRankForPermissions.threshold);
            if(updatedSelectedRank) {
                setSelectedRankForPermissions(updatedSelectedRank);
            } else if (ranks.length > 0) {
                 setSelectedRankForPermissions(ranks[0]);
            } else {
                setSelectedRankForPermissions(null);
            }
        }
    }, [ranks, selectedRankForPermissions]);


    const handlePriceChange = (avatarId: string, type: 'regular' | 'punishment', field: 'price' | 'currency', value: string | number) => {
        const setter = type === 'regular' ? setPrices : setPunishmentPrices;
        setter(prev => ({
            ...prev,
            [avatarId]: {
                price: field === 'price' ? (isNaN(value as number) ? 0 : Number(value)) : (prev[avatarId]?.price || 0),
                currency: field === 'currency' ? (value as 'coins' | 'diamonds') : (prev[avatarId]?.currency || 'coins'),
            },
        }));
    };


    const handleSavePrices = async (type: 'regular' | 'punishment') => {
        if (!userProfile?.uid) return;
        setIsSaving(true);
        const pricesToSave = type === 'regular' ? prices : punishmentPrices;
        const pricesArray: AvatarPrice[] = Object.entries(pricesToSave).map(([avatarId, { price, currency }]) => ({
            avatarId,
            price: price || 0,
            currency: currency || 'coins',
        }));
        
        const action = type === 'regular' ? setAvatarPrices : setPunishmentAvatarPrices;
        const result = await action(userProfile.uid, pricesArray);

        if (result.success) {
            toast({ title: "نجاح", description: `تم حفظ أسعار ${type === 'regular' ? 'الشخصيات' : 'العقوبات'} بنجاح.` });
        } else {
            toast({ title: "خطأ في الحفظ", description: result.error, variant: "destructive" });
        }
        setIsSaving(false);
    };

    const handleSetDefaultAvatar = async (avatarId: string) => {
        if (!userProfile?.uid) return;
        const result = await setDefaultAvatar(userProfile.uid, avatarId);
        if (result.success) {
            toast({ title: "نجاح", description: `تم تعيين ${avatarId} كشخصية افتراضية.` });
            setDefaultAvatarId(avatarId);
            handlePriceChange(avatarId, 'regular', 'price', 0);
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
    }


    const handleRankChange = (index: number, field: keyof SocialRank, value: string | number) => {
        const newRanks = [...ranks];
        (newRanks[index] as any)[field] = value;
        setRanks(newRanks);
    };

    const handleAddRank = () => {
        const lastRankThreshold = ranks.length > 0 ? ranks[ranks.length - 1].threshold : 0;
        setRanks([...ranks, { threshold: lastRankThreshold + 100, name: 'لقب جديد', icon: 'Star', permissions: [] }]);
    };
    
    const handleRemoveRank = (index: number) => {
        if(ranks.length <= 1) {
            toast({title: "لا يمكن حذف آخر لقب متبقٍ", variant: "destructive"});
            return;
        }
        setRanks(ranks.filter((_, i) => i !== index));
    };
    
    const handleSaveRanks = async () => {
        if (!userProfile?.uid) return;
        setIsSavingRanks(true);
        const sortedRanks = [...ranks].sort((a,b) => a.threshold - b.threshold);
        const result = await setSocialRanks(userProfile.uid, sortedRanks);
        if (result.success) {
            toast({ title: "نجاح", description: "تم حفظ الألقاب الاجتماعية بنجاح." });
             setRanks(sortedRanks);
        } else {
             toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsSavingRanks(false);
    };

    const handlePermissionToggle = async (permissionId: string) => {
        if (!selectedRankForPermissions || !userProfile?.uid) return;
        setIsUpdatingPermission(true);
        
        const hasPermission = selectedRankForPermissions.permissions?.includes(permissionId);
        const action = hasPermission ? removePermissionFromRank : addPermissionToRank;

        const result = await action(userProfile.uid, selectedRankForPermissions.name, permissionId);

        if (result.success) {
            await fetchPageData(); // Re-fetch all data to ensure sync
        } else {
             toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        
        setIsUpdatingPermission(false);
    };
    
    const renderAvatarGrid = (type: 'regular' | 'punishment') => {
        const currentPrices = type === 'regular' ? prices : punishmentPrices;
        const avatarList = type === 'regular' ? AVATAR_IDS : PUNISHMENT_AVATAR_IDS;

        return (
            <CardContent>
                {isLoadingData ? (
                    <div className="text-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                        <p className="mt-2 text-muted-foreground">جاري تحميل البيانات...</p>
                    </div>
                ) : (
                    <>
                        <ScrollArea className="h-[60vh]">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-1">
                                {avatarList.map(avatarId => {
                                    const isDefault = avatarId === defaultAvatarId;
                                    const itemPrice = currentPrices[avatarId] || { price: 0, currency: 'coins' };
                                    return (
                                    <div key={avatarId} className="space-y-2">
                                        <div className="relative">
                                            <PlayerAvatar avatarId={avatarId} className="w-full aspect-square rounded-lg border-2 border-muted" />
                                            {type === 'regular' && (
                                                <div className="absolute top-1 right-1 flex flex-col gap-1">
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className={cn("h-7 w-7 rounded-full bg-black/30 text-white hover:bg-black/50", isDefault && "text-yellow-400")}
                                                        onClick={() => handleSetDefaultAvatar(avatarId)}
                                                        aria-label="Set as default"
                                                    >
                                                        <Star className={cn("h-5 w-5", isDefault && "fill-current")} />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-1">
                                            <Input
                                                type="number"
                                                className="pl-1 text-center flex-grow"
                                                value={(type === 'regular' && isDefault) ? '0' : itemPrice.price}
                                                onChange={(e) => handlePriceChange(avatarId, type, 'price', e.target.value)}
                                                placeholder="السعر"
                                                disabled={type === 'regular' && isDefault}
                                            />
                                                <Select
                                                value={itemPrice.currency}
                                                onValueChange={(value: 'coins' | 'diamonds') => handlePriceChange(avatarId, type, 'currency', value)}
                                                disabled={type === 'regular' && isDefault}
                                            >
                                                <SelectTrigger className="w-16 px-2">
                                                    <SelectValue>
                                                        {itemPrice.currency === 'coins' ? <CircleDollarSign className="w-4 h-4 text-yellow-500" /> : <Diamond className="w-4 h-4 text-blue-400" />}
                                                    </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="coins"><CircleDollarSign className="w-4 h-4 text-yellow-500" /></SelectItem>
                                                    <SelectItem value="diamonds"><Diamond className="w-4 h-4 text-blue-400" /></SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                )})}
                            </div>
                        </ScrollArea>
                        <CardFooter className="pt-6">
                            <Button onClick={() => handleSavePrices(type)} disabled={isSaving || isLoadingData} className="w-full md:w-auto">
                                {isSaving ? <Loader2 className="mr-2 animate-spin" /> : <Save className="mr-2" />}
                                {isSaving ? 'جاري الحفظ...' : `حفظ أسعار ${type === 'regular' ? 'الشخصيات' : 'العقوبات'}`}
                            </Button>
                        </CardFooter>
                    </>
                )}
            </CardContent>
        );
    }

    const renderTopUsersList = (users: UserProfile[], field: 'coins' | 'leaderboardPoints') => {
        if (isLoadingData) {
            return (
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
            )
        }
        if (users.length === 0) {
            return <p className="text-muted-foreground text-center">لا يوجد لاعبون لعرضهم.</p>
        }
        return (
            <div className="space-y-2">
                {users.map((user, index) => (
                    <div key={user.uid} className="flex items-center justify-between p-2 bg-muted rounded-md">
                        <div className="flex items-center gap-2">
                            <span className="font-bold w-5">{index + 1}.</span>
                            <PlayerAvatar avatarId={user.avatarId} className="w-8 h-8" />
                            <span className="font-semibold">{user.name}</span>
                        </div>
                        <span className="font-bold text-primary">
                            {user[field]} {field === 'coins' ? 'كوينز' : 'نقطة'}
                        </span>
                    </div>
                ))}
            </div>
        )
    };


    if (loading || isLoadingData) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin" />
            </div>
        );
    }
     if (!userProfile?.isAdmin) {
        return null;
    }


    return (
        <main className="flex min-h-screen flex-col items-center p-4 md:p-8 bg-muted/40">
            <div className="w-full max-w-7xl space-y-8">
                <div className="relative text-center">
                    <h1 className="text-3xl font-bold">إدارة المتجر والألقاب</h1>
                    <p className="text-muted-foreground">تحديد أسعار الشخصيات، تعديل الألقاب، وعرض لوائح الصدارة.</p>
                     <Button variant="ghost" size="icon" onClick={() => router.push('/admin')} className="absolute top-0 right-0">
                        <ArrowLeft />
                    </Button>
                </div>
                 <Tabs defaultValue="avatars" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="avatars">إدارة الشخصيات</TabsTrigger>
                        <TabsTrigger value="ranks">إدارة الألقاب والصلاحيات</TabsTrigger>
                    </TabsList>
                    <TabsContent value="avatars">
                         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
                            <div className="lg:col-span-2 space-y-6">
                                <Tabs defaultValue="regular_store">
                                    <CardHeader>
                                        <CardTitle>متجر الشخصيات</CardTitle>
                                        <CardDescription>
                                            عيّن سعرًا ونوع عملة لكل شخصية في المتجر العادي ومتجر العقوبات.
                                        </CardDescription>
                                        <TabsList>
                                            <TabsTrigger value="regular_store">المتجر العادي</TabsTrigger>
                                            <TabsTrigger value="punishment_store">متجر العقوبات</TabsTrigger>
                                        </TabsList>
                                    </CardHeader>
                                    <TabsContent value="regular_store">{renderAvatarGrid('regular')}</TabsContent>
                                    <TabsContent value="punishment_store">{renderAvatarGrid('punishment')}</TabsContent>
                                </Tabs>
                            </div>
                            <div className="lg:col-span-1 space-y-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2"><Trophy /> أقوى اللاعبين</CardTitle>
                                        <CardDescription>أعلى 5 لاعبين من حيث نقاط الصدارة.</CardDescription>
                                    </CardHeader>
                                    <CardContent>{renderTopUsersList(topPointsUsers, 'leaderboardPoints')}</CardContent>
                                </Card>
                                 <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2"><CircleDollarSign className="text-yellow-500"/> أغنى اللاعبين</CardTitle>
                                        <CardDescription>أعلى 5 لاعبين من حيث الكوينز.</CardDescription>
                                    </CardHeader>
                                    <CardContent>{renderTopUsersList(topCoinsUsers, 'coins')}</CardContent>
                                </Card>
                            </div>
                        </div>
                    </TabsContent>
                     <TabsContent value="ranks">
                       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
                            <Card className="lg:col-span-2">
                                <CardHeader>
                                    <CardTitle>إدارة الألقاب الاجتماعية</CardTitle>
                                    <CardDescription>
                                        تحكم بالألقاب التي يحصل عليها اللاعبون بناءً على نقاط الصدارة.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {ranks.map((rank, index) => {
                                            const RankIcon = rankIconMap[rank.icon] || Star;
                                            return (
                                            <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                                <Input type="number" className="w-24" value={rank.threshold} onChange={(e) => handleRankChange(index, 'threshold', parseInt(e.target.value, 10) || 0)} placeholder="النقاط" />
                                                <Input className="flex-grow" value={rank.name} onChange={(e) => handleRankChange(index, 'name', e.target.value)} placeholder="اسم اللقب" />
                                                <Select value={rank.icon} onValueChange={(value) => handleRankChange(index, 'icon', value)}>
                                                    <SelectTrigger className="w-28">
                                                        <SelectValue>
                                                            <div className="flex items-center gap-2"> <RankIcon className="w-4 h-4" /> <span>{rank.icon}</span> </div>
                                                        </SelectValue>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {Object.keys(rankIconMap).map(iconName => {
                                                            const IconComponent = rankIconMap[iconName];
                                                            return ( <SelectItem key={iconName} value={iconName}><div className="flex items-center gap-2"><IconComponent className="w-4 h-4" /><span>{iconName}</span></div></SelectItem> )
                                                        })}
                                                    </SelectContent>
                                                </Select>
                                                <Button size="icon" variant="destructive" onClick={() => handleRemoveRank(index)}><Trash2/></Button>
                                            </div>
                                        )})}
                                        <Button variant="outline" className="w-full" onClick={handleAddRank}><PlusCircle/>إضافة لقب جديد</Button>
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <Button onClick={handleSaveRanks} disabled={isSavingRanks} className="w-full md:w-auto">
                                        {isSavingRanks ? <Loader2 className="mr-2 animate-spin" /> : <Save className="mr-2" />}
                                        {isSavingRanks ? 'جاري الحفظ...' : 'حفظ تغييرات الألقاب'}
                                    </Button>
                                </CardFooter>
                            </Card>
                             <Card className="lg:col-span-1">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2"><Settings/> إدارة صلاحيات الألقاب</CardTitle>
                                    <CardDescription>اختر لقبًا من القائمة لتحديد الصلاحيات الممنوحة له.</CardDescription>
                                </CardHeader>
                                <CardContent className="grid grid-cols-1 gap-4">
                                    <div>
                                        <Label>اختر اللقب</Label>
                                        <div className="space-y-2 mt-2">
                                            {ranks.map(rank => (
                                                <Button key={rank.name} variant={selectedRankForPermissions?.name === rank.name ? "default" : "outline"} className="w-full justify-start" onClick={() => setSelectedRankForPermissions(rank)}> {rank.name} </Button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <Label>قائمة الصلاحيات المتاحة</Label>
                                        <ScrollArea className="h-[40vh] border rounded-md p-4 mt-2">
                                            <div className="space-y-3">
                                                {selectedRankForPermissions ? ALL_PERMISSIONS.map(permission => {
                                                    const hasPermission = selectedRankForPermissions.permissions?.includes(permission.id);
                                                    return (
                                                        <div key={permission.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                                                            <div><p className="font-bold">{permission.name}</p><p className="text-xs text-muted-foreground">{permission.description}</p></div>
                                                            <Button size="icon" variant={hasPermission ? 'secondary' : 'default'} onClick={() => handlePermissionToggle(permission.id)} disabled={isUpdatingPermission}>
                                                                {isUpdatingPermission ? <Loader2 className="animate-spin" /> : hasPermission ? <Unlock /> : <Lock />}
                                                            </Button>
                                                        </div>
                                                    )
                                                }) : <p className="text-center text-muted-foreground">الرجاء اختيار لقب أولاً.</p>}
                                            </div>
                                        </ScrollArea>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </main>
    );
}
