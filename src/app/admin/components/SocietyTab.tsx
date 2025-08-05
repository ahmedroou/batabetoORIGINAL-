
"use client";

import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile } from '@/types';

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Users, Search, Loader2, Award, Coins, MinusCircle, MessageSquareWarning, Shield, Swords, Gavel, Heart, Angry, Star } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

// Server Actions
import { searchUsers, giveReward, applyPunishment, adminUpdateUser } from '@/app/actions';

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
    const [points, setPoints] = useState("");
    const [coins, setCoins] = useState("");
    const [honorPoints, setHonorPoints] = useState("");
    const [loyaltyPoints, setLoyaltyPoints] = useState("");
    const [rebellionPoints, setRebellionPoints] = useState("");
    const [reason, setReason] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

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
        setPoints(String(user.leaderboardPoints || 0));
        setCoins(String(user.coins || 0));
        setHonorPoints(String(user.honorPoints || 0));
        setLoyaltyPoints(String(user.loyaltyPoints || 0));
        setRebellionPoints(String(user.rebellionPoints || 0));
        setReason("");
    };

    const closeDialog = () => {
        setSelectedUser(null);
        setActionType(null);
    };

    const handleActionSubmit = async () => {
        if (!adminProfile || !selectedUser || !actionType) return;
        
        setIsSubmitting(true);

        if (actionType === 'edit') {
            const result = await adminUpdateUser(selectedUser.uid, {
                leaderboardPoints: parseInt(points, 10) || 0,
                coins: parseInt(coins, 10) || 0,
                honorPoints: parseInt(honorPoints, 10) || 0,
                loyaltyPoints: parseInt(loyaltyPoints, 10) || 0,
                rebellionPoints: parseInt(rebellionPoints, 10) || 0,
            });
            if (result.success) {
                toast({ title: "تم تحديث بيانات اللاعب بنجاح."});
                handleSearch(searchTerm); // Refresh
                closeDialog();
            } else {
                 toast({ title: "فشل التحديث", description: result.error, variant: "destructive" });
            }
        } else {
            if (!reason.trim()) {
                toast({ title: "الرجاء ملء حقل السبب", variant: "destructive" });
                setIsSubmitting(false);
                return;
            }
            const actionPoints = parseInt(points, 10) || 0;
            const actionCoins = parseInt(coins, 10) || 0;

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
                                                <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-amber-500"/>{user.honorPoints || 0} شرف</span>
                                                <span className="text-gray-400">|</span>
                                                <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-blue-500"/>{user.loyaltyPoints || 0} ولاء</span>
                                                 <span className="text-gray-400">|</span>
                                                <span className="flex items-center gap-1"><Angry className="w-3 h-3 text-red-500"/>{user.rebellionPoints || 0} تمرد</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className='flex items-center gap-2'>
                                         <Button size="sm" variant="outline" onClick={() => openActionDialog(user, 'edit')}>تعديل</Button>
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
            </Card>

            <Dialog open={!!selectedUser} onOpenChange={(open) => !open && closeDialog()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                           {actionType === 'edit' ? 'تعديل بيانات: ' : actionType === 'reward' ? 'منح مكافأة إلى: ' : 'تطبيق عقوبة على: '} 
                            <span className="text-primary">{selectedUser?.name}</span>
                        </DialogTitle>
                        <DialogDescription>
                           {actionType === 'edit' ? 'قم بتعديل قيم اللاعب مباشرة.' : actionType === 'reward' ? 'سيتم إضافة النقاط والكوينز إلى رصيد اللاعب.' : 'سيتم خصم النقاط والكوينز من رصيد اللاعب.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        {actionType === 'edit' ? (
                             <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2"><Label htmlFor="points">نقاط الصدارة</Label><Input id="points" type="number" value={points} onChange={(e) => setPoints(e.target.value)} /></div>
                                <div className="space-y-2"><Label htmlFor="coins">الكوينز</Label><Input id="coins" type="number" value={coins} onChange={(e) => setCoins(e.target.value)} /></div>
                                <div className="space-y-2"><Label htmlFor="honor">نقاط الشرف</Label><Input id="honor" type="number" value={honorPoints} onChange={(e) => setHonorPoints(e.target.value)} /></div>
                                <div className="space-y-2"><Label htmlFor="loyalty">نقاط الولاء</Label><Input id="loyalty" type="number" value={loyaltyPoints} onChange={(e) => setLoyaltyPoints(e.target.value)} /></div>
                                <div className="space-y-2"><Label htmlFor="rebellion">نقاط التمرد</Label><Input id="rebellion" type="number" value={rebellionPoints} onChange={(e) => setRebellionPoints(e.target.value)} /></div>
                            </div>
                        ) : (
                             <>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2"><Label htmlFor="points">{actionType === 'reward' ? 'مكافأة نقاط' : 'عقوبة نقاط'}</Label><Input id="points" type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="0" /></div>
                                    <div className="space-y-2"><Label htmlFor="coins">{actionType === 'reward' ? 'مكافأة كوينز' : 'عقوبة كوينز'}</Label><Input id="coins" type="number" value={coins} onChange={(e) => setCoins(e.target.value)} placeholder="0" /></div>
                                </div>
                                <div className="space-y-2"><Label htmlFor="reason">السبب (سيظهر للاعب)</Label><Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اكتب سببًا واضحًا..." /></div>
                             </>
                        )}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">إلغاء</Button></DialogClose>
                        <Button onClick={handleActionSubmit} disabled={isSubmitting} variant={actionType === 'punish' ? 'destructive' : 'default'}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد الإجراء'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
