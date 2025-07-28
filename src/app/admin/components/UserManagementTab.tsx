

"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Users, Search, Loader2, CircleDollarSign, Edit, Send, RefreshCw, Eye, Clock } from 'lucide-react';

// Server Actions
import { getLatestUsers, getMostFrequentUsers, searchUsers, adminUpdateUser, sendMailToUser } from '@/app/actions';
import { getSocialRankForUser } from '@/lib/actions/user';

interface UserManagementTabProps {
    openResetAvatarsDialog: () => void;
}

export default function UserManagementTab({ openResetAvatarsDialog }: UserManagementTabProps) {
    const { userProfile: adminProfile, socialRanks: allSocialRanks } = useAuth();
    const { toast } = useToast();
    
    // States for User Management
    const [userSearchTerm, setUserSearchTerm] = useState("");
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [searchedUsers, setSearchedUsers] = useState<UserProfile[]>([]);
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [editingCoins, setEditingCoins] = useState<string>("");
    const [isResettingAvatars, setIsResettingAvatars] = useState(false);

    // Mail states
    const [mailRecipient, setMailRecipient] = useState<UserProfile | null>(null);
    const [mailSubject, setMailSubject] = useState("");
    const [mailBody, setMailBody] = useState("");
    const [mailCoins, setMailCoins] = useState("");
    const [isSendingMail, setIsSendingMail] = useState(false);

    // States for User Activity
    const [latestVisitors, setLatestVisitors] = useState<UserProfile[]>([]);
    const [mostFrequentVisitors, setMostFrequentVisitors] = useState<UserProfile[]>([]);
    const [isActivityLoading, setIsActivityLoading] = useState(true);

    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

     const fetchActivityData = useCallback(async () => {
        setIsActivityLoading(true);
        const [latest, mostFrequent] = await Promise.all([
            getLatestUsers(10),
            getMostFrequentUsers(10)
        ]);
        setLatestVisitors(latest);
        setMostFrequentVisitors(mostFrequent);
        setIsActivityLoading(false);
    }, []);

    useEffect(() => {
        fetchActivityData();
    }, [fetchActivityData]);


    const handleSearchTermChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const term = e.target.value;
        setUserSearchTerm(term);
        
        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }
        
        if (term.trim() === '') {
            setSearchedUsers([]);
            return;
        }

        setIsSearchingUsers(true);
        debounceTimeout.current = setTimeout(async () => {
            const users = await searchUsers(term);
            setSearchedUsers(users);
            setIsSearchingUsers(false);
        }, 500); // 500ms delay
    };

    const handleUpdateUser = async () => {
        if (!editingUser) return;
        const coins = parseInt(editingCoins, 10);
        if (isNaN(coins)) {
            toast({ title: "قيمة غير صالحة", description: "الرجاء إدخال رقم صحيح للكوينز.", variant: "destructive" });
            return;
        }
        const result = await adminUpdateUser(editingUser.uid, { coins });
        if(result.success) {
            toast({title: "تم تحديث المستخدم بنجاح."});
            setEditingUser(null);
            setSearchedUsers(users => users.map(u => u.uid === editingUser.uid ? {...u, coins } : u));
        } else {
            toast({title: "خطأ في التحديث", description: result.error, variant: "destructive"});
        }
    };
    
    const handleOpenMailDialog = (user: UserProfile) => {
        setMailRecipient(user);
        setMailSubject("");
        setMailBody("");
        setMailCoins("");
    };

    const handleSendMail = async () => {
        if (!mailRecipient || !mailSubject.trim() || !mailBody.trim() || !adminProfile) {
            toast({ title: "خطأ", description: "الرجاء ملء جميع الحقول.", variant: "destructive" });
            return;
        }
        const coinsToSend = parseInt(mailCoins, 10) || 0;
        if (coinsToSend < 0) {
             toast({ title: "خطأ", description: "لا يمكن إرسال عدد سالب من الكوينز.", variant: "destructive" });
            return;
        }

        setIsSendingMail(true);
        const result = await sendMailToUser(adminProfile.uid, mailRecipient.uid, mailSubject, mailBody, coinsToSend);
        if (result.success) {
            toast({ title: "نجاح", description: `تم إرسال الرسالة إلى ${mailRecipient.name} بنجاح.` });
            setMailRecipient(null);
        } else {
            toast({ title: "فشل الإرسال", description: result.error, variant: "destructive" });
        }
        setIsSendingMail(false);
    };

    return (
        <>
            <Card>
                 <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Users /> إدارة المستخدمين</CardTitle>
                    <CardDescription>ابحث عن مستخدم وقم بتعديل بياناته أو شاهد إحصائيات النشاط.</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h3 className='font-bold text-lg'>البحث والتعديل</h3>
                        <div className="flex gap-2 relative">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input 
                                placeholder="ابحث بالاسم أو البريد الإلكتروني..."
                                value={userSearchTerm}
                                onChange={handleSearchTermChange}
                                className="pr-10"
                            />
                        </div>
                        <div className="space-y-2">
                            {isSearchingUsers && <div className="text-center p-4"><Loader2 className="animate-spin" /></div>}
                            {searchedUsers.map(user => {
                                const rank = getSocialRankForUser(user.leaderboardPoints || 0, allSocialRanks);
                                const RankIcon = rank?.icon;
                                return (
                                    <div key={user.uid} className="flex justify-between items-center p-2 bg-muted rounded-md">
                                        <div className='flex items-center gap-2'>
                                            <PlayerAvatar avatarId={user.avatarId || 'Avatar00.png'} className="w-10 h-10"/>
                                            <div>
                                                <p className='font-bold'>{user.name}</p>
                                                {rank && RankIcon && (
                                                    <p className='text-xs text-muted-foreground font-semibold flex items-center gap-1.5'>
                                                        <RankIcon className="w-3 h-3 text-amber-500" />
                                                        {rank.name}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className='flex items-center gap-2'>
                                            <CircleDollarSign className='text-yellow-500'/>
                                            <span className='font-bold'>{user.coins}</span>
                                            <Button size="icon" variant="ghost" onClick={() => handleOpenMailDialog(user)}>
                                                <Send className="w-4 h-4" />
                                            </Button>
                                            <Button size="icon" variant="ghost" onClick={() => { setEditingUser(user); setEditingCoins(String(user.coins)); }}>
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                     <div className="space-y-4">
                         <h3 className='font-bold text-lg'>إحصائيات النشاط</h3>
                         {isActivityLoading ? <div className='text-center'><Loader2 className='animate-spin'/></div> : (
                             <div className='grid grid-cols-1 gap-4'>
                                 <div>
                                     <h4 className='font-semibold mb-2 flex items-center gap-2'><Clock/> أحدث الزوار</h4>
                                     <div className='space-y-2'>
                                         {latestVisitors.map(u => (
                                             <div key={u.uid} className='flex items-center justify-between p-2 bg-muted/50 rounded-md text-sm'>
                                                 <div className='flex items-center gap-2'>
                                                     <PlayerAvatar avatarId={u.avatarId} className="w-8 h-8"/>
                                                     <span>{u.name}</span>
                                                 </div>
                                                 <span className='text-muted-foreground'>{u.lastVisited ? formatDistanceToNow(u.lastVisited, { addSuffix: true, locale: ar }) : 'غير معروف'}</span>
                                             </div>
                                         ))}
                                     </div>
                                 </div>
                                 <div>
                                     <h4 className='font-semibold mb-2 flex items-center gap-2'><Eye/> الأكثر زيارة</h4>
                                     <div className='space-y-2'>
                                         {mostFrequentVisitors.map(u => (
                                              <div key={u.uid} className='flex items-center justify-between p-2 bg-muted/50 rounded-md text-sm'>
                                                 <div className='flex items-center gap-2'>
                                                     <PlayerAvatar avatarId={u.avatarId} className="w-8 h-8"/>
                                                     <span>{u.name}</span>
                                                 </div>
                                                 <span className='font-bold text-primary'>{u.visitCount || 0} زيارة</span>
                                             </div>
                                         ))}
                                     </div>
                                 </div>
                             </div>
                         )}
                     </div>
                </CardContent>
                <CardFooter>
                    <Button variant="destructive" onClick={openResetAvatarsDialog} disabled={isResettingAvatars}>
                        <RefreshCw className="mr-2" />
                        {isResettingAvatars ? 'جاري العمل...' : 'إعادة ضبط شخصيات جميع اللاعبين'}
                    </Button>
                </CardFooter>
            </Card>

            <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>تعديل بيانات: {editingUser?.name}</DialogTitle>
                        <DialogDescription>قم بتعديل رصيد الكوينز للمستخدم.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="coins" className="text-right">الكوينز</Label>
                            <Input id="coins" type="number" value={editingCoins} onChange={(e) => setEditingCoins(e.target.value)} className="col-span-3" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setEditingUser(null)}>إلغاء</Button>
                        <Button onClick={handleUpdateUser}>حفظ التغييرات</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Mail Dialog */}
            <Dialog open={!!mailRecipient} onOpenChange={(open) => !open && setMailRecipient(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>إرسال رسالة إلى: {mailRecipient?.name}</DialogTitle>
                        <DialogDescription>ستظهر هذه الرسالة في صندوق البريد الخاص باللاعب داخل اللعبة.</DialogDescription>
                    </DialogHeader>
                     <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="mail-subject" className="text-right">الموضوع</Label>
                            <Input id="mail-subject" value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} className="col-span-3" />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="mail-body" className="text-right">الرسالة</Label>
                            <Textarea id="mail-body" value={mailBody} onChange={(e) => setMailBody(e.target.value)} className="col-span-3" rows={5}/>
                        </div>
                         <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="mail-coins" className="text-right">إرفاق كوينز</Label>
                            <Input id="mail-coins" type="number" value={mailCoins} onChange={(e) => setMailCoins(e.target.value)} className="col-span-3" placeholder="0" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setMailRecipient(null)}>إلغاء</Button>
                        <Button onClick={handleSendMail} disabled={isSendingMail}>
                            {isSendingMail ? <Loader2 className="animate-spin" /> : <Send className="mr-2" />}
                            إرسال
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

    
    
