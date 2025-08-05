
"use client";

import { useState, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, Game } from '@/types';

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Users, Search, Loader2, Award, Coins, MinusCircle, MessageSquareWarning, Shield, Swords, Gavel, Heart, Angry, Star, Crown, Edit, Diamond } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

// Server Actions
import { giveReward, applyPunishment } from '@/lib/actions/user';
import { adminUpdateUser, searchUsers, recalculateGameKings } from '@/lib/actions/admin';
import { GAME_TYPE_NAMES } from '@/types';


type ActionType = 'reward' | 'punish' | 'edit';

export default function SocietyTab() {
    const { userProfile: adminProfile } = useAuth();
    const { toast } = useToast();
    
    // States
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [searchedUsers, setSearchedUsers] = useState<UserProfile[]>([]);
    
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [actionType, setActionType] = useState<ActionType | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRecalculating, setIsRecalculating] = useState(false);
    
    // State for the comprehensive edit dialog
    const [editData, setEditData] = useState<Partial<UserProfile>>({});

    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

    const handleSearch = useCallback(async (term: string) => {
        setSearchTerm(term);
        if (term.length < 2) {
            setSearchedUsers([]);
            return;
        }
        setIsSearching(true);
        const users = await searchUsers(term);
        setSearchedUsers(users);
        setIsSearching(false);
    }, []);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const term = e.target.value;
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = setTimeout(() => handleSearch(term), 300);
    };

    const openActionDialog = (user: UserProfile, type: ActionType) => {
        setSelectedUser(user);
        setActionType(type);
        if (type === 'edit') {
            setEditData({
                name: user.name,
                leaderboardPoints: user.leaderboardPoints || 0,
                coins: user.coins || 0,
                diamonds: user.diamonds || 0,
                honorPoints: user.honorPoints || 0,
                loyaltyPoints: user.loyaltyPoints || 0,
                rebellionPoints: user.rebellionPoints || 0,
                winCounts: user.winCounts || {},
            });
        } else {
             setEditData({
                leaderboardPoints: 0,
                coins: 0,
             });
        }
    };

    const closeDialog = () => {
        setSelectedUser(null);
        setActionType(null);
        setEditData({});
    };

    const handleRecalculateKings = async () => {
        setIsRecalculating(true);
        const result = await recalculateGameKings();
        if (result.success) {
            toast({ title: "نجاح!", description: `تم تحديث ملوك الألعاب بنجاح. (${result.updatedCount} ملوك).` });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsRecalculating(false);
    };

    const handleActionSubmit = async () => {
        if (!adminProfile || !selectedUser || !actionType) return;
        
        setIsSubmitting(true);

        if (actionType === 'edit') {
            const updatePayload: Partial<UserProfile> = {};
            // Convert string inputs to numbers, ensuring they are valid
            for (const key in editData) {
                if (key === 'winCounts' || key === 'name') {
                     updatePayload[key as keyof typeof updatePayload] = editData[key as keyof typeof editData];
                } else {
                    const value = editData[key as keyof typeof editData];
                    if (typeof value === 'string' && !isNaN(Number(value))) {
                        updatePayload[key as keyof typeof updatePayload] = Number(value);
                    } else if (typeof value === 'number') {
                         updatePayload[key as keyof typeof updatePayload] = value;
                    }
                }
            }
            
            const result = await adminUpdateUser(selectedUser.uid, updatePayload);
            if (result.success) {
                toast({ title: "تم تحديث بيانات اللاعب بنجاح."});
                handleSearch(searchTerm); // Refresh
                closeDialog();
            } else {
                 toast({ title: "فشل التحديث", description: result.error, variant: "destructive" });
            }

        } else { // Reward or Punish
            const reason = (editData as any).reason || "";
            if (!reason.trim()) {
                toast({ title: "الرجاء ملء حقل السبب", variant: "destructive" });
                setIsSubmitting(false);
                return;
            }
            const actionPoints = Number(editData.leaderboardPoints) || 0;
            const actionCoins = Number(editData.coins) || 0;

            if(actionPoints < 0 || actionCoins < 0) {
                 toast({ title: "لا يمكن استخدام قيم سالبة", variant: "destructive" });
                 setIsSubmitting(false);
                 return;
            }
            if(actionPoints === 0 && actionCoins === 0) {
                toast({ title: "يجب تحديد قيمة للنقاط أو الكوينز", variant: "destructive" });
                 setIsSubmitting(false);
                return;
            }
            const action = actionType === 'reward' ? giveReward : applyPunishment;
            const result = await action(
                adminProfile.uid, 
                selectedUser.uid, 
                { points: actionPoints, coins: actionCoins },
                reason
            );

            if (result.success) {
                toast({ title: "تم تنفيذ الإجراء بنجاح!", description: `تم إرسال إشعار إلى ${selectedUser.name}.` });
                handleSearch(searchTerm); // Refresh
                closeDialog();
            } else {
                toast({ title: "فشل الإجراء", description: result.error, variant: "destructive" });
            }
        }
        setIsSubmitting(false);
    };
    
    const handleEditDataChange = (field: keyof UserProfile, value: string | number | object) => {
        setEditData(prev => ({...prev, [field]: value}));
    }

    const renderEditDialog = () => (
        <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
                <DialogTitle>تعديل شامل لبيانات: {selectedUser?.name}</DialogTitle>
                <DialogDescription>
                    قم بتعديل قيم اللاعب مباشرة. سيؤثر هذا على رصيده ورتبته وسجلاته.
                </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[60vh] p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* General Stats */}
                    <div className="space-y-4 p-4 border rounded-lg">
                        <h4 className="font-bold">البيانات الأساسية</h4>
                        <div className="space-y-2">
                            <Label htmlFor="name">الاسم</Label>
                            <Input id="name" value={editData.name || ''} onChange={(e) => handleEditDataChange('name', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="leaderboardPoints">نقاط الصدارة</Label>
                            <Input id="leaderboardPoints" type="number" value={editData.leaderboardPoints || ''} onChange={(e) => handleEditDataChange('leaderboardPoints', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="coins">الكوينز</Label>
                            <Input id="coins" type="number" value={editData.coins || ''} onChange={(e) => handleEditDataChange('coins', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="diamonds">الألماس</Label>
                            <Input id="diamonds" type="number" value={editData.diamonds || ''} onChange={(e) => handleEditDataChange('diamonds', e.target.value)} />
                        </div>
                    </div>

                    {/* Social Points */}
                    <div className="space-y-4 p-4 border rounded-lg">
                        <h4 className="font-bold">النقاط الاجتماعية</h4>
                         <div className="space-y-2">
                            <Label htmlFor="honorPoints">نقاط الشرف</Label>
                            <Input id="honorPoints" type="number" value={editData.honorPoints || ''} onChange={(e) => handleEditDataChange('honorPoints', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="loyaltyPoints">نقاط الولاء</Label>
                            <Input id="loyaltyPoints" type="number" value={editData.loyaltyPoints || ''} onChange={(e) => handleEditDataChange('loyaltyPoints', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rebellionPoints">نقاط التمرد</Label>
                            <Input id="rebellionPoints" type="number" value={editData.rebellionPoints || ''} onChange={(e) => handleEditDataChange('rebellionPoints', e.target.value)} />
                        </div>
                    </div>
                    
                     {/* Win Counts */}
                    <div className="space-y-4 p-4 border rounded-lg">
                         <h4 className="font-bold">سجلات الفوز</h4>
                         {Object.keys(GAME_TYPE_NAMES).map(gameType => (
                            <div className="space-y-2" key={gameType}>
                                <Label htmlFor={`wins-${gameType}`}>{GAME_TYPE_NAMES[gameType as Game['gameType']]}</Label>
                                <Input
                                    id={`wins-${gameType}`}
                                    type="number"
                                    value={(editData.winCounts as any)?.[gameType] || 0}
                                    onChange={(e) => {
                                        const newWinCounts = { ...(editData.winCounts || {}), [gameType]: Number(e.target.value) };
                                        handleEditDataChange('winCounts', newWinCounts);
                                    }}
                                />
                            </div>
                        ))}
                    </div>

                </div>
            </ScrollArea>
            <DialogFooter>
                <DialogClose asChild><Button variant="outline">إلغاء</Button></DialogClose>
                <Button onClick={handleActionSubmit} disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="animate-spin" /> : 'حفظ التغييرات الشاملة'}
                </Button>
            </DialogFooter>
        </DialogContent>
    );

    const renderRewardPunishDialog = () => (
         <DialogContent>
            <DialogHeader>
                <DialogTitle>
                    {actionType === 'reward' ? 'منح مكافأة إلى: ' : 'تطبيق عقوبة على: '} 
                    <span className="text-primary">{selectedUser?.name}</span>
                </DialogTitle>
                <DialogDescription>
                    {actionType === 'reward' ? 'سيتم إضافة النقاط والكوينز إلى رصيد اللاعب.' : 'سيتم خصم النقاط والكوينز من رصيد اللاعب.'}
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="points">{actionType === 'reward' ? 'مكافأة نقاط' : 'عقوبة نقاط'}</Label>
                        <Input id="points" type="number" value={editData.leaderboardPoints || ''} onChange={(e) => handleEditDataChange('leaderboardPoints', e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="coins">{actionType === 'reward' ? 'مكافأة كوينز' : 'عقوبة كوينز'}</Label>
                        <Input id="coins" type="number" value={editData.coins || ''} onChange={(e) => handleEditDataChange('coins', e.target.value)} placeholder="0" />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="reason">السبب (سيظهر للاعب)</Label>
                    <Input id="reason" value={(editData as any).reason || ''} onChange={(e) => handleEditDataChange('reason' as any, e.target.value)} placeholder="اكتب سببًا واضحًا..." />
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="outline">إلغاء</Button></DialogClose>
                <Button onClick={handleActionSubmit} disabled={isSubmitting} variant={actionType === 'punish' ? 'destructive' : 'default'}>
                    {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد الإجراء'}
                </Button>
            </DialogFooter>
        </DialogContent>
    );

    return (
        <>
            <Card>
                 <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Gavel/> إدارة عقوبات ومكافآت المجتمع</CardTitle>
                    <CardDescription>ابحث عن لاعب لتطبيق عقوبة أو منحه مكافأة أو تعديل بياناته. سيتم إرسال إشعار للاعب بالسبب عند العقوبة والمكافأة.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2 relative">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="ابحث بالاسم أو البريد الإلكتروني..."
                            onChange={handleSearchChange}
                            className="pr-10"
                        />
                    </div>
                    <ScrollArea className="h-96 pr-2">
                        <div className="space-y-2">
                            {isSearching ? <div className="text-center p-4"><Loader2 className="animate-spin" /></div> :
                            searchedUsers.map(user => (
                                <div key={user.uid} className="flex justify-between items-center p-2 rounded-md bg-muted">
                                    <div className='flex items-center gap-2'>
                                        <PlayerAvatar avatarId={user.avatarId || 'Avatar00.png'} className="w-10 h-10"/>
                                        <div>
                                            <p className='font-bold'>{user.name}</p>
                                            <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                                                <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-500" />{user.leaderboardPoints || 0}</span>
                                                <span className="text-gray-400">|</span>
                                                <span className="flex items-center gap-1"><Coins className="w-3 h-3 text-amber-500" />{user.coins || 0}</span>
                                                 <span className="text-gray-400">|</span>
                                                <span className="flex items-center gap-1"><Diamond className="w-3 h-3 text-blue-400" />{user.diamonds || 0}</span>
                                                <span className="text-gray-400">|</span>
                                                <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-amber-500"/>{user.honorPoints || 0} شرف</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className='flex items-center gap-2'>
                                         <Button size="sm" variant="outline" onClick={() => openActionDialog(user, 'edit')}>
                                            <Edit className="ml-2 w-4 h-4"/> تعديل
                                         </Button>
                                        <Button size="sm" variant="outline" onClick={() => openActionDialog(user, 'reward')} className="text-green-600 border-green-600 hover:bg-green-100 hover:text-green-700">
                                            <Award className="ml-2 w-4 h-4"/> مكافأة
                                        </Button>
                                         <Button size="sm" variant="destructive" onClick={() => openActionDialog(user, 'punish')}>
                                            <MinusCircle className="ml-2 w-4 h-4"/> عقوبة
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </CardContent>
                <CardFooter>
                     <Button onClick={handleRecalculateKings} disabled={isRecalculating}>
                        <Crown className="ml-2" />
                        {isRecalculating ? 'جاري الحساب...' : 'إعادة حساب ملوك الألعاب'}
                    </Button>
                </CardFooter>
            </Card>

            <Dialog open={!!selectedUser} onOpenChange={(open) => !open && closeDialog()}>
                {actionType === 'edit' ? renderEditDialog() : renderRewardPunishDialog()}
            </Dialog>
        </>
    );
}

