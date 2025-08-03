
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Loader2, CircleDollarSign, Trash2, PlusCircle, ShieldCheck, Trophy, Crown, Gem, Shield, Star, Award, Building, Edit } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AVATAR_IDS } from '@/data/avatars';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AvatarPrice, SocialRank, UserProfile, StoreItem } from '@/types';
import { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getAvatarPrices, setAvatarPrices, getSocialRanks, setSocialRanks, getTopUsers, setDefaultAvatar, getDefaultAvatar, getStoreItems, addOrUpdateStoreItem, deleteStoreItem } from '@/app/actions';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { iconMap, ALL_ICONS } from '@/data/icons';


const rankIconMap: Record<string, LucideIcon> = {
    Shield, ShieldCheck, Award, Gem, Crown, Star
};

type ItemFormData = Omit<StoreItem, 'id'> & { id?: string };


export default function AdminStoreClient() {
    const { toast } = useToast();
    const router = useRouter();
    const { userProfile, loading } = useAuth();

    // Avatars State
    const [prices, setPrices] = useState<Record<string, number>>({});
    const [isSavingPrices, setIsSavingPrices] = useState(false);
    const [isLoadingPrices, setIsLoadingPrices] = useState(true);
    const [defaultAvatarId, setDefaultAvatarId] = useState<string>('Avatar00.png');

    // Ranks State
    const [ranks, setRanks] = useState<SocialRank[]>([]);
    const [isSavingRanks, setIsSavingRanks] = useState(false);
    const [isLoadingRanks, setIsLoadingRanks] = useState(true);
    
    // Top Users State
    const [topCoinsUsers, setTopCoinsUsers] = useState<UserProfile[]>([]);
    const [topPointsUsers, setTopPointsUsers] = useState<UserProfile[]>([]);
    const [isLoadingTopUsers, setIsLoadingTopUsers] = useState(true);

    // City Store State
    const [cityItems, setCityItems] = useState<StoreItem[]>([]);
    const [isLoadingCityItems, setIsLoadingCityItems] = useState(true);
    const [isCitySubmitting, setIsCitySubmitting] = useState(false);
    const [isCityDialogOpen, setIsCityDialogOpen] = useState(false);
    const [editingCityItem, setEditingCityItem] = useState<ItemFormData | null>(null);


    useEffect(() => {
        if (!loading && !userProfile?.isAdmin) {
            router.push('/');
        }
    }, [userProfile, loading, router]);

    const fetchPageData = useCallback(async () => {
        setIsLoadingPrices(true);
        setIsLoadingRanks(true);
        setIsLoadingTopUsers(true);
        setIsLoadingCityItems(true);

        const [pricesResult, ranksResult, topCoinsResult, topPointsResult, defaultAvatarResult, cityItemsResult] = await Promise.all([
            getAvatarPrices(),
            getSocialRanks(),
            getTopUsers('coins', 5),
            getTopUsers('leaderboardPoints', 5),
            getDefaultAvatar(),
            getStoreItems()
        ]);

        if (pricesResult.success && pricesResult.prices) {
            const priceMap = pricesResult.prices.reduce((acc, item) => {
                acc[item.avatarId] = item.price;
                return acc;
            }, {} as Record<string, number>);
            setPrices(priceMap);
        } else {
            toast({ title: "خطأ", description: pricesResult.error, variant: "destructive" });
        }
        setIsLoadingPrices(false);
        
        if (defaultAvatarResult.success && defaultAvatarResult.avatarId) {
            setDefaultAvatarId(defaultAvatarResult.avatarId);
        }

        if (ranksResult.success && ranksResult.ranks) {
            setRanks(ranksResult.ranks.sort((a,b) => a.threshold - b.threshold));
        } else {
            toast({ title: "خطأ", description: ranksResult.error, variant: "destructive" });
        }
        setIsLoadingRanks(false);
        
        setTopCoinsUsers(topCoinsResult);
        setTopPointsUsers(topPointsResult);
        setIsLoadingTopUsers(false);
        
        setCityItems(cityItemsResult);
        setIsLoadingCityItems(false);

    }, [toast]);

    useEffect(() => {
        if (userProfile?.isAdmin) {
            fetchPageData();
        }
    }, [userProfile?.isAdmin, fetchPageData]);

    const handlePriceChange = (avatarId: string, value: string) => {
        const newPrice = parseInt(value, 10);
        setPrices(prev => ({
            ...prev,
            [avatarId]: isNaN(newPrice) ? 0 : newPrice,
        }));
    };

    const handleSavePrices = async () => {
        setIsSavingPrices(true);
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
        setIsSavingPrices(false);
    };

    const handleSetDefaultAvatar = async (avatarId: string) => {
        const result = await setDefaultAvatar(avatarId);
        if (result.success) {
            toast({ title: "نجاح", description: `تم تعيين ${avatarId} كشخصية افتراضية.` });
            setDefaultAvatarId(avatarId);
            handlePriceChange(avatarId, '0');
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
        setRanks([...ranks, { threshold: lastRankThreshold + 100, name: 'لقب جديد', icon: 'Star' }]);
    };
    
    const handleRemoveRank = (index: number) => {
        if(ranks.length <= 1) {
            toast({title: "لا يمكن حذف آخر لقب متبقٍ", variant: "destructive"});
            return;
        }
        setRanks(ranks.filter((_, i) => i !== index));
    };
    
    const handleSaveRanks = async () => {
        setIsSavingRanks(true);
        const sortedRanks = [...ranks].sort((a,b) => a.threshold - b.threshold);
        const result = await setSocialRanks(sortedRanks);
        if (result.success) {
            toast({ title: "نجاح", description: "تم حفظ الألقاب الاجتماعية بنجاح." });
             setRanks(sortedRanks);
        } else {
             toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsSavingRanks(false);
    };

    // City Store Handlers
    const handleOpenCityDialog = (item: StoreItem | null = null) => {
        if (item) {
            setEditingCityItem(item);
        } else {
            setEditingCityItem({ name: '', type: 'building', price: 0, population: 0, icon: 'Building' });
        }
        setIsCityDialogOpen(true);
    };
    
    const handleCityFormChange = (field: keyof ItemFormData, value: string | number) => {
        if (!editingCityItem) return;
        setEditingCityItem({ ...editingCityItem, [field]: value });
    };

    const handleCitySubmit = async () => {
        if (!editingCityItem) return;
        if (!editingCityItem.name.trim() || editingCityItem.price < 0 || editingCityItem.population < 0) {
            toast({ title: 'بيانات غير صالحة', description: 'الرجاء ملء جميع الحقول بقيم صحيحة.', variant: 'destructive' });
            return;
        }
        setIsCitySubmitting(true);
        const result = await addOrUpdateStoreItem(editingCityItem);
        if (result.success) {
            toast({ title: 'نجاح', description: 'تم حفظ العنصر بنجاح.' });
            setIsCityDialogOpen(false);
            setEditingCityItem(null);
            fetchPageData();
        } else {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setIsCitySubmitting(false);
    };

    const handleCityDelete = async (itemId: string) => {
        if (!window.confirm('هل أنت متأكد من حذف هذا العنصر؟ لا يمكن التراجع عن هذا.')) return;
        setIsCitySubmitting(true);
        const result = await deleteStoreItem(itemId);
        if (result.success) {
            toast({ title: 'نجاح', description: 'تم حذف العنصر.' });
            fetchPageData();
        } else {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setIsCitySubmitting(false);
    };


    const renderTopUsersList = (users: UserProfile[], field: 'coins' | 'leaderboardPoints') => {
        if (isLoadingTopUsers) {
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


    if (loading) {
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

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>متجر الشخصيات</CardTitle>
                                <CardDescription>
                                    عيّن سعرًا لكل شخصية. السعر 0 يعني أن الشخصية مجانية. اضغط على النجمة لتعيين شخصية كافتراضية.
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
                                            {AVATAR_IDS.map(avatarId => {
                                                const isDefault = avatarId === defaultAvatarId;
                                                return (
                                                <div key={avatarId} className="space-y-2">
                                                    <div className="relative">
                                                        <PlayerAvatar avatarId={avatarId} className="w-full aspect-square rounded-lg border-2 border-muted" />
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className={cn("absolute top-1 right-1 h-7 w-7 rounded-full bg-black/30 text-white hover:bg-black/50", isDefault && "text-yellow-400")}
                                                            onClick={() => handleSetDefaultAvatar(avatarId)}
                                                            aria-label="Set as default"
                                                        >
                                                            <Star className={cn("h-5 w-5", isDefault && "fill-current")} />
                                                        </Button>
                                                    </div>
                                                    <div className="relative">
                                                        <CircleDollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-yellow-500" />
                                                        <Input
                                                            type="number"
                                                            className="pl-8 text-center"
                                                            value={isDefault ? '0' : prices[avatarId] || ''}
                                                            onChange={(e) => handlePriceChange(avatarId, e.target.value)}
                                                            placeholder="السعر"
                                                            disabled={isDefault}
                                                        />
                                                    </div>
                                                </div>
                                            )})}
                                        </div>
                                    </ScrollArea>
                                )}
                            </CardContent>
                            <CardFooter>
                                <Button onClick={handleSavePrices} disabled={isSavingPrices || isLoadingPrices} className="w-full md:w-auto">
                                    {isSavingPrices ? <Loader2 className="mr-2 animate-spin" /> : <Save className="mr-2" />}
                                    {isSavingPrices ? 'جاري الحفظ...' : 'حفظ أسعار الشخصيات'}
                                </Button>
                            </CardFooter>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>إدارة الألقاب الاجتماعية</CardTitle>
                                <CardDescription>
                                    تحكم بالألقاب التي يحصل عليها اللاعبون بناءً على نقاط الصدارة.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isLoadingRanks ? (
                                    <div className="text-center p-8">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                                        <p className="mt-2 text-muted-foreground">جاري تحميل الألقاب...</p>
                                    </div>
                                ) : (
                                <div className="space-y-3">
                                    {ranks.map((rank, index) => {
                                        const RankIcon = rankIconMap[rank.icon] || Star;
                                        return (
                                        <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                            <Input 
                                                type="number" 
                                                className="w-24"
                                                value={rank.threshold}
                                                onChange={(e) => handleRankChange(index, 'threshold', parseInt(e.target.value, 10) || 0)}
                                                placeholder="النقاط"
                                            />
                                            <Input 
                                                className="flex-grow"
                                                value={rank.name}
                                                onChange={(e) => handleRankChange(index, 'name', e.target.value)}
                                                placeholder="اسم اللقب"
                                            />
                                            <Select value={rank.icon} onValueChange={(value) => handleRankChange(index, 'icon', value)}>
                                                <SelectTrigger className="w-28">
                                                    <SelectValue>
                                                        <div className="flex items-center gap-2">
                                                            <RankIcon className="w-4 h-4" />
                                                            <span>{rank.icon}</span>
                                                        </div>
                                                    </SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {Object.keys(rankIconMap).map(iconName => {
                                                        const IconComponent = rankIconMap[iconName];
                                                        return (
                                                            <SelectItem key={iconName} value={iconName}>
                                                                <div className="flex items-center gap-2">
                                                                    <IconComponent className="w-4 h-4" />
                                                                    <span>{iconName}</span>
                                                                </div>
                                                            </SelectItem>
                                                        )
                                                    })}
                                                </SelectContent>
                                            </Select>
                                            <Button size="icon" variant="destructive" onClick={() => handleRemoveRank(index)}><Trash2/></Button>
                                        </div>
                                    )})}
                                    <Button variant="outline" className="w-full" onClick={handleAddRank}><PlusCircle/>إضافة لقب جديد</Button>
                                </div>
                                )}
                            </CardContent>
                            <CardFooter>
                                <Button onClick={handleSaveRanks} disabled={isSavingRanks || isLoadingRanks} className="w-full md:w-auto">
                                    {isSavingRanks ? <Loader2 className="mr-2 animate-spin" /> : <Save className="mr-2" />}
                                    {isSavingRanks ? 'جاري الحفظ...' : 'حفظ تغييرات الألقاب'}
                                </Button>
                            </CardFooter>
                        </Card>
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
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex justify-between items-center">
                                    <span>عناصر متجر المدينة</span>
                                    <Button size="sm" onClick={() => handleOpenCityDialog()}>
                                        <PlusCircle className="mr-2" /> إضافة
                                    </Button>
                                </CardTitle>
                                <CardDescription>إدارة العناصر التي يمكن للاعبين بناؤها في مدنهم.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {isLoadingCityItems ? (
                                    <p>جاري تحميل العناصر...</p>
                                ) : (
                                <ScrollArea className="h-48">
                                    <div className="space-y-3">
                                    {cityItems.map((item) => {
                                        const Icon = iconMap[item.icon] || Building;
                                        return (
                                        <div key={item.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                            <div className="flex items-center gap-4">
                                            <Icon className="w-8 h-8 text-primary" />
                                            <div>
                                                <p className="font-bold text-lg">{item.name}</p>
                                                <div className="flex gap-4 text-sm text-muted-foreground">
                                                <span>السعر: {item.price}</span>
                                                <span>السكان: +{item.population}</span>
                                                </div>
                                            </div>
                                            </div>
                                            <div className="flex gap-2">
                                            <Button variant="outline" size="icon" onClick={() => handleOpenCityDialog(item)}><Edit className="w-4 h-4" /></Button>
                                            <Button variant="destructive" size="icon" onClick={() => handleCityDelete(item.id)} disabled={isCitySubmitting}><Trash2 className="w-4 h-4" /></Button>
                                            </div>
                                        </div>
                                        );
                                    })}
                                    </div>
                                </ScrollArea>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>

            <Dialog open={isCityDialogOpen} onOpenChange={setIsCityDialogOpen}>
                <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editingCityItem?.id ? 'تعديل عنصر' : 'إضافة عنصر جديد'}</DialogTitle>
                    <DialogDescription>املأ تفاصيل العنصر أدناه.</DialogDescription>
                </DialogHeader>
                {editingCityItem && (
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="name" className="text-right">الاسم</Label><Input id="name" value={editingCityItem.name} onChange={(e) => handleCityFormChange('name', e.target.value)} className="col-span-3" /></div>
                        <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="price" className="text-right">السعر</Label><Input id="price" type="number" value={editingCityItem.price} onChange={(e) => handleCityFormChange('price', Number(e.target.value))} className="col-span-3" /></div>
                        <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="population" className="text-right">السكان</Label><Input id="population" type="number" value={editingCityItem.population} onChange={(e) => handleCityFormChange('population', Number(e.target.value))} className="col-span-3" /></div>
                        <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="type" className="text-right">النوع</Label><Select value={editingCityItem.type} onValueChange={(v) => handleCityFormChange('type', v)}><SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="building">مبنى</SelectItem><SelectItem value="road">طريق</SelectItem><SelectItem value="decoration">ديكور</SelectItem></SelectContent></Select></div>
                        <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="icon" className="text-right">الأيقونة</Label><Select value={editingCityItem.icon} onValueChange={(v) => handleCityFormChange('icon', v)}><SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger><SelectContent><ScrollArea className="h-72">{ALL_ICONS.map(iconName => { const IconComponent = iconMap[iconName]; return (<SelectItem key={iconName} value={iconName}><div className="flex items-center gap-2"><IconComponent className="w-4 h-4" /><span>{iconName}</span></div></SelectItem>)})}</ScrollArea></SelectContent></Select></div>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCityDialogOpen(false)}>إلغاء</Button>
                    <Button onClick={handleCitySubmit} disabled={isCitySubmitting}>{isCitySubmitting ? <Loader2 className="animate-spin" /> : 'حفظ'}</Button>
                </DialogFooter>
                </DialogContent>
            </Dialog>
        </main>
    );
}
