
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
import { Users, Search, Loader2, Award, Coins, MinusCircle, MessageSquareWarning } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

// Server Actions
import { searchUsers, giveReward, applyPunishment } from '@/app/actions';

type ActionType = 'reward' | 'punish';

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
        setPoints("");
        setCoins("");
        setReason("");
    };

    const closeDialog = () => {
        setSelectedUser(null);
        setActionType(null);
    };

    const handleActionSubmit = async () => {
        if (!adminProfile || !selectedUser || !actionType || !reason.trim()) {
            toast({ title: "الرجاء ملء جميع الحقول", variant: "destructive" });
            return;
        }

        const actionPoints = parseInt(points, 10) || 0;
        const actionCoins = parseInt(coins, 10) || 0;

        if(actionPoints < 0 || actionCoins < 0) {
             toast({ title: "لا يمكن استخدام قيم سالبة", variant: "destructive" });
             return;
        }
        if(actionPoints === 0 && actionCoins === 0) {
            toast({ title: "يجب تحديد قيمة للنقاط أو الكوينز", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        const action = actionType === 'reward' ? giveReward : applyPunishment;
        const result = await action(
            adminProfile.uid, 
            selectedUser.uid, 
            { points: actionPoints, coins: actionCoins },
            reason
        );

        if (result.success) {
            toast({ title: "تم تنفيذ الإجراء بنجاح!", description: `تم إرسال إشعار إلى ${selectedUser.name}.` });
            handleSearch(searchTerm); // Refresh search results
            closeDialog();
        } else {
            toast({ title: "فشل الإجراء", description: result.error, variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    return (
        <>
            <Card>
                 <CardHeader>
                    <CardTitle className="flex items-center gap-2"><MessageSquareWarning/> إدارة عقوبات ومكافآت المجتمع</CardTitle>
                    <CardDescription>ابحث عن لاعب لتطبيق عقوبة أو منحه مكافأة. سيتم إرسال إشعار للاعب بالسبب.</CardDescription>
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
                                            <p className='text-xs text-muted-foreground'>{user.leaderboardPoints || 0} نقطة | {user.coins || 0} كوينز</p>
                                        </div>
                                    </div>
                                    <div className='flex items-center gap-2'>
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
                                <Label htmlFor="points">النقاط</Label>
                                <Input id="points" type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="0" />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="coins">الكوينز</Label>
                                <Input id="coins" type="number" value={coins} onChange={(e) => setCoins(e.target.value)} placeholder="0" />
                            </div>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="reason">السبب (سيظهر للاعب)</Label>
                            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اكتب سببًا واضحًا..." />
                        </div>
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
