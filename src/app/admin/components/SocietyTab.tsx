
"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
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
import { Users, Search, Loader2, Award, Coins, MinusCircle, MessageSquareWarning, Shield, Swords, Gavel, Heart, Angry, Star, Crown, Edit, Diamond, MailPlus, Megaphone, Save, TowerControl, DatabaseZap, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";


// Server Actions
import { adminUpdateUser, recalculateGameKings, adminSendMail, setAnnouncement, getAnnouncement, backfillPunishmentStatus, adminGiveReward, adminApplyPunishment, adminSearchUsers } from '@/lib/actions/admin';
import { GAME_TYPE_NAMES } from '@/types';
import { cn } from '@/lib/utils';


type ActionType = 'reward' | 'punish' | 'edit';

export default function SocietyTab() {
    const { userProfile: adminProfile } = useAuth();
    const { toast } = useToast();
    
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [searchedUsers, setSearchedUsers] = useState<UserProfile[]>([]);
    
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [actionType, setActionType] = useState<ActionType | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRecalculating, setIsRecalculating] = useState(false);
    
    const [editData, setEditData] = useState<Partial<UserProfile>>({});

    const [isMailDialogOpen, setIsMailDialogOpen] = useState(false);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [mailSubject, setMailSubject] = useState("");
    const [mailBody, setMailBody] = useState("");
    const [mailCoins, setMailCoins] = useState("");
    const [isSendingMail, setIsSendingMail] = useState(false);
    
    const [announcementText, setAnnouncementText] = useState("");
    const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
    
    const [isTriggeringWar, setIsTriggeringWar] = useState(false);
    
    const [isBackfilling, setIsBackfilling] = useState(false);
    const [showBackfillDialog, setShowBackfillDialog] = useState(false);



    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const fetchAnnouncement = async () => {
            const announcementResult = await getAnnouncement();
            if (announcementResult.success && announcementResult.text) {
                setAnnouncementText(announcementResult.text);
            }
        };
        fetchAnnouncement();
    }, []);

    const handleSearch = useCallback(async (term: string) => {
        setSearchTerm(term);
        if (term.length < 2) {
            setSearchedUsers([]);
            return;
        }
        setIsSearching(true);
        if (!adminProfile) return;
        const users = await adminSearchUsers(adminProfile.uid, term);
        setSearchedUsers(users);
        setIsSearching(false);
    }, [adminProfile]);

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
        if (!adminProfile) return;
        setIsRecalculating(true);
        const result = await recalculateGameKings(adminProfile.uid);
        if (result.success) {
            toast({ title: "نجاح!", description: `تم تحديث ملوك الألعاب بنجاح. (${result.updatedCount} ملوك).` });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsRecalculating(false);
    };
    
    const handleTriggerClassWar = async () => {
        toast({ title: "قيد التطوير", description: "هذه الميزة ما زالت قيد التطوير." });
        return;
    };
    
    const handleBackfill = async () => {
        if (!adminProfile) return;
        setIsBackfilling(true);
        const result = await backfillPunishmentStatus(adminProfile.uid);
         if (result.success) {
            toast({ title: "نجاح!", description: `تم فحص وتحديث ${result.count} لاعب بنجاح.` });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsBackfilling(false);
        setShowBackfillDialog(false);
    };

    const handleActionSubmit = async () => {
        if (!adminProfile || !selectedUser || !actionType) return;
        
        setIsSubmitting(true);

        if (actionType === 'edit') {
            const updatePayload: Partial<UserProfile> = {};
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
            
            const result = await adminUpdateUser(adminProfile.uid, selectedUser.uid, updatePayload);
            if (result.success) {
                toast({ title: "تم تحديث بيانات اللاعب بنجاح."});
                handleSearch(searchTerm);
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
            const action = actionType === 'reward' ? adminGiveReward : adminApplyPunishment;
            const result = await action(
                adminProfile.uid, 
                selectedUser.uid, 
                { points: actionPoints, coins: actionCoins },
                reason
            );

            if (result.success) {
                toast({ title: "تم تنفيذ الإجراء بنجاح!", description: `تم إرسال إشعار إلى ${selectedUser.name}.` });
                handleSearch(searchTerm);
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

    const handleOpenMailDialog = () => {
        if (selectedUserIds.size === 0) {
            toast({ title: "لم يتم تحديد أي مستخدم", description: "الرجاء تحديد مستخدم واحد على الأقل لإرسال رسالة.", variant: "destructive" });
            return;
        }
        setIsMailDialogOpen(true);
        setMailSubject("");
        setMailBody("");
        setMailCoins("");
    };

    const handleSendMail = async () => {
        if (selectedUserIds.size === 0 || !mailSubject.trim() || !mailBody.trim() || !adminProfile) {
            toast({ title: "خطأ", description: "الرجاء ملء جميع الحقول.", variant: "destructive" });
            return;
        }
        const coinsToSend = parseInt(mailCoins, 10) || 0;
        if (coinsToSend < 0) {
             toast({ title: "خطأ", description: "لا يمكن إرسال عدد سالب من الكوينز.", variant: "destructive" });
            return;
        }

        setIsSendingMail(true);
        const result = await adminSendMail(adminProfile.uid, Array.from(selectedUserIds), mailSubject, mailBody, coinsToSend);
        if (result.success) {
            toast({ title: "نجاح", description: `تم إرسال الرسالة إلى ${selectedUserIds.size} مستخدم بنجاح.` });
            setIsMailDialogOpen(false);
            setSelectedUserIds(new Set());
        } else {
            toast({ title: "فشل الإرسال", description: result.error, variant: "destructive" });
        }
        setIsSendingMail(false);
    };

    const toggleUserSelection = (userId: string) => {
        setSelectedUserIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(userId)) {
                newSet.delete(userId);
            } else {
                newSet.add(userId);
            }
            return newSet;
        });
    };

    const handleSelectAll = () => {
        if (searchedUsers.length === 0) return;
        const allIds = new Set(searchedUsers.map(u => u.uid));
        setSelectedUserIds(allIds);
    };

    const handleDeselectAll = () => {
        setSelectedUserIds(new Set());
    };
    
    const handleSaveAnnouncement = async () => {
        if (!adminProfile) return;
        setIsSavingAnnouncement(true);
        const result = await setAnnouncement(adminProfile.uid, announcementText);
        if (result.success) {
            toast({ title: "تم حفظ الإعلان بنجاح." });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsSavingAnnouncement(false);
    };


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
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Megaphone /> لوحة الإعلانات</CardTitle>
                        <CardDescription>اكتب رسالة ستظهر في أعلى الصفحة الرئيسية لجميع اللاعبين.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Textarea
                            value={announcementText}
                            onChange={(e) => setAnnouncementText(e.target.value)}
                            placeholder="اكتب إعلانك هنا..."
                            rows={4}
                        />
                        <Button onClick={handleSaveAnnouncement} disabled={isSavingAnnouncement}>
                            <Save className="mr-2 h-4 w-4" />
                            {isSavingAnnouncement ? 'جاري الحفظ...' : 'حفظ الإعلان'}
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Gavel/> إدارة المجتمع والمستخدمين</CardTitle>
                        <CardDescription>ابحث عن لاعب لتطبيق عقوبة، منحه مكافأة، تعديل بياناته، أو إرسال رسائل جماعية.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-2">
                            <div className="relative flex-grow">
                                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="ابحث بالاسم أو البريد الإلكتروني..."
                                    onChange={handleSearchChange}
                                    className="pr-10"
                                />
                            </div>
                            <Button onClick={handleOpenMailDialog} disabled={selectedUserIds.size === 0}>
                                <MailPlus className="ml-2" /> إرسال رسالة ({selectedUserIds.size})
                            </Button>
                        </div>
                         <div className="flex gap-2">
                             <Button onClick={handleSelectAll} variant="outline" size="sm" disabled={searchedUsers.length === 0}>
                                <Checkbox checked={selectedUserIds.size > 0 && selectedUserIds.size === searchedUsers.length} className="ml-2"/> تحديد الكل
                            </Button>
                             <Button onClick={handleDeselectAll} variant="outline" size="sm" disabled={selectedUserIds.size === 0}>
                                 إلغاء تحديد الكل
                             </Button>
                         </div>
                        <ScrollArea className="h-96 pr-2">
                            <div className="space-y-2">
                                {isSearching ? <div className="text-center p-4"><Loader2 className="animate-spin" /></div> :
                                searchedUsers.map(user => (
                                    <div key={user.uid} className={cn("flex justify-between items-center p-2 rounded-md", selectedUserIds.has(user.uid) ? "bg-primary/10" : "bg-muted")}>
                                        <div className='flex items-center gap-2'>
                                            <Checkbox checked={selectedUserIds.has(user.uid)} onCheckedChange={() => toggleUserSelection(user.uid)}/>
                                            <PlayerAvatar avatarId={user.avatarId || 'Avatar00.png'} className="w-10 h-10"/>
                                            <div>
                                                <p className='font-bold'>{user.name}</p>
                                                <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-500" />{user.leaderboardPoints || 0}</span>
                                                    <span className="text-gray-400">|</span>
                                                    <span className="flex items-center gap-1"><Coins className="w-3 h-3 text-amber-500" />{user.coins || 0}</span>
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
                    <CardFooter className="justify-between">
                        <Button onClick={handleRecalculateKings} disabled={isRecalculating}>
                            <Crown className="ml-2" />
                            {isRecalculating ? 'جاري الحساب...' : 'إعادة حساب ملوك الألعاب'}
                        </Button>
                        <Button onClick={handleTriggerClassWar} variant="destructive" disabled={isTriggeringWar}>
                            <TowerControl className="ml-2"/>
                            {isTriggeringWar ? 'جاري...' : 'بدء حرب الطبقات'}
                        </Button>
                    </CardFooter>
                </Card>
                
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><DatabaseZap/> أدوات الصيانة</CardTitle>
                        <CardDescription>عمليات تُنفذ مرة واحدة أو عند الحاجة لإصلاح البيانات.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="outline" onClick={() => setShowBackfillDialog(true)} disabled={isBackfilling}>
                            <RefreshCw className="ml-2"/>
                            {isBackfilling ? 'جاري التحديث...' : 'تحديث حالات العقوبة لجميع اللاعبين'}
                        </Button>
                        <p className="text-xs text-muted-foreground mt-2">
                           استخدم هذا الخيار إذا كان اللاعبون المعاقبون لا يظهرون في غرفة العقاب. سيقوم هذا الإجراء بالمرور على كل اللاعبين وتحديث حالتهم.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={!!selectedUser} onOpenChange={(open) => !open && closeDialog()}>
                {actionType === 'edit' ? renderEditDialog() : renderRewardPunishDialog()}
            </Dialog>

            <Dialog open={isMailDialogOpen} onOpenChange={(open) => !open && setIsMailDialogOpen(false)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>إرسال رسالة إلى: {selectedUserIds.size} مستخدم</DialogTitle>
                        <DialogDescription>ستظهر هذه الرسالة في صندوق البريد الخاص باللاعبين المحددين.</DialogDescription>
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
                        <Button variant="secondary" onClick={() => setIsMailDialogOpen(false)}>إلغاء</Button>
                        <Button onClick={handleSendMail} disabled={isSendingMail}>
                            {isSendingMail ? <Loader2 className="animate-spin" /> : 'إرسال'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
            <AlertDialog open={showBackfillDialog} onOpenChange={setShowBackfillDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>تأكيد عملية الصيانة</AlertDialogTitle>
                        <AlertDialogDescription>
                            سيقوم هذا الإجراء بالمرور على جميع المستخدمين في قاعدة البيانات للتحقق من عقوباتهم وتحديث حالتهم. قد تستهلك هذه العملية عددًا كبيرًا من عمليات القراءة. هل أنت متأكد من المتابعة؟
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBackfill} disabled={isBackfilling}>
                            {isBackfilling ? <Loader2 className="animate-spin" /> : "نعم، قم بالتحديث"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
