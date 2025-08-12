
"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, PlusCircle, DoorOpen, Trophy, Mail as MailIcon, MessageSquarePlus } from "lucide-react";
import Link from 'next/link';
import type { User, UserProfile, League, Mail, Game, Challenge, EntryFee, ComplaintType } from '@/types';
import { createLeague, joinLeague as joinLeagueAction, getMail, claimMailCoins, markMailAsRead, updateUserGender, joinChallenge } from '@/lib/actions/user';
import { submitComplaint } from '@/lib/actions/complaints';
import { GAME_TYPE_NAMES } from '@/data/icons';
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


// --- NewChallengeDialog Component ---
const EntryFeeDisplay = ({ entryFee }: { entryFee?: EntryFee }) => {
    if (!entryFee || entryFee.value <= 0) {
        return <p className="text-lg text-green-400 font-bold">انضمام مجاني!</p>;
    }
    const text = entryFee.type === 'coins' ? 'كوينز' : 'نقاط صدارة';
    return (
        <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-yellow-900/50">
            <Trophy className="w-6 h-6 text-yellow-300"/>
            <p className="text-lg font-bold text-yellow-200">
                رسوم الدخول: {entryFee.value} {text}
            </p>
        </div>
    )
}

const NewChallengeDialog = ({ challenge, isOpen, onOpenChange }: { challenge: Challenge | null, isOpen: boolean, onOpenChange: (open: boolean) => void }) => {
    const { userProfile } = useAuth();
    const { toast } = useToast();
    const [isJoining, setIsJoining] = useState(false);

    if (!challenge) return null;

    const handleJoinClick = async () => {
        if (!userProfile) return;
        setIsJoining(true);
        try {
            const result = await joinChallenge(challenge.id, userProfile.uid);
            if (result.success) {
                toast({ title: "تم الانضمام بنجاح!" });
                onOpenChange(false);
            } else {
                toast({ title: "خطأ", description: result.error, variant: 'destructive' });
            }
        } finally {
            setIsJoining(false);
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="bg-gray-900 border-purple-500 text-white">
                <DialogHeader className="text-center space-y-4">
                    <Trophy className="w-20 h-20 text-yellow-400 mx-auto" />
                    <DialogTitle className="text-3xl text-purple-300">بطولة جديدة انطلقت!</DialogTitle>
                    <DialogDescription className="text-gray-300 text-xl font-bold">{challenge.title}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-center">
                    <p>الهدف: <span className="font-bold text-amber-300">{challenge.targetPoints} نقطة صدارة</span></p>
                    <p>اللعبة: <span className="font-bold text-amber-300">{challenge.specificGameType === 'all' ? 'كل الألعاب' : GAME_TYPE_NAMES[challenge.specificGameType as Game['gameType']]}</span></p>
                    <EntryFeeDisplay entryFee={challenge.entryFee} />
                </div>
                <DialogFooter className="flex-col sm:flex-col sm:space-x-0 gap-2">
                    <Button onClick={handleJoinClick} disabled={isJoining} className="w-full bg-purple-600 hover:bg-purple-700">
                        {isJoining ? <Loader2 className="animate-spin" /> : 'انضم الآن!'}
                    </Button>
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
                        لاحقًا
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// --- ComplaintDialog Component ---
export const ComplaintDialog = ({ userProfile }: { userProfile: UserProfile }) => {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [missingCoins, setMissingCoins] = useState('');
    const [missingPoints, setMissingPoints] = useState('');
    const [missingGame, setMissingGame] = useState<Game['gameType'] | ''>('');
    const [missingReason, setMissingReason] = useState('');

    const [bugGame, setBugGame] = useState<Game['gameType'] | ''>('');
    const [bugDescription, setBugDescription] = useState('');

    const resetForms = () => {
        setMissingCoins(''); setMissingPoints(''); setMissingGame(''); setMissingReason('');
        setBugGame(''); setBugDescription('');
    }

    const handleSubmit = async (type: ComplaintType) => {
        setIsSubmitting(true);
        let details: any = {};
        if (type === 'missing_currency') {
            if (!missingGame || !missingReason) {
                toast({ title: 'الرجاء ملء جميع الحقول', variant: 'destructive' });
                setIsSubmitting(false);
                return;
            }
            details = { 
                game: missingGame,
                coins: parseInt(missingCoins) || 0,
                points: parseInt(missingPoints) || 0,
                reason: missingReason
            };
        } else { // bug_report
            if (!bugGame || !bugDescription) {
                toast({ title: 'الرجاء ملء جميع الحقول', variant: 'destructive' });
                setIsSubmitting(false);
                return;
            }
            details = { game: bugGame, description: bugDescription };
        }

        const result = await submitComplaint({
            userId: userProfile.uid,
            userName: userProfile.name,
            userAvatar: userProfile.avatarId,
            type,
            details,
        });

        if (result.success) {
            toast({ title: 'تم إرسال شكواك بنجاح!', description: 'سيقوم المشرف بمراجعتها قريبًا.' });
            setIsOpen(false);
            resetForms();
        } else {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(false);
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                 <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                           <Button variant="ghost" size="icon">
                                <MessageSquarePlus className="h-6 w-6 text-primary" />
                            </Button>
                        </TooltipTrigger>
                         <TooltipContent><p>إرسال شكوى</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                 <DialogHeader>
                    <DialogTitle>مركز الشكاوى</DialogTitle>
                    <DialogDescription>واجهت مشكلة؟ أبلغنا عنها هنا.</DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="missing_currency">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="missing_currency">نقاط/كوينز مفقودة</TabsTrigger>
                        <TabsTrigger value="bug_report">مشكلة في لعبة</TabsTrigger>
                    </TabsList>
                    <TabsContent value="missing_currency" className="pt-4">
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <Input type="number" placeholder="عدد الكوينز المفقودة" value={missingCoins} onChange={e => setMissingCoins(e.target.value)} />
                                <Input type="number" placeholder="عدد النقاط المفقودة" value={missingPoints} onChange={e => setMissingPoints(e.target.value)} />
                            </div>
                            <Select value={missingGame} onValueChange={v => setMissingGame(v as any)}>
                                <SelectTrigger><SelectValue placeholder="في أي لعبة؟" /></SelectTrigger>
                                <SelectContent>
                                    {Object.entries(GAME_TYPE_NAMES).map(([type, name]) => <SelectItem key={type} value={type}>{name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Textarea placeholder="اشرح السبب باختصار..." value={missingReason} onChange={e => setMissingReason(e.target.value)} />
                            <Button onClick={() => handleSubmit('missing_currency')} disabled={isSubmitting} className="w-full">
                                {isSubmitting ? <Loader2 className="animate-spin" /> : 'إرسال طلب التعويض'}
                            </Button>
                        </div>
                    </TabsContent>
                    <TabsContent value="bug_report" className="pt-4">
                        <div className="space-y-4">
                             <Select value={bugGame} onValueChange={v => setBugGame(v as any)}>
                                <SelectTrigger><SelectValue placeholder="اختر اللعبة التي بها المشكلة" /></SelectTrigger>
                                <SelectContent>
                                    {Object.entries(GAME_TYPE_NAMES).map(([type, name]) => <SelectItem key={type} value={type}>{name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Textarea placeholder="صف المشكلة بالتفصيل..." value={bugDescription} onChange={e => setBugDescription(e.target.value)} rows={5}/>
                            <Button onClick={() => handleSubmit('bug_report')} disabled={isSubmitting} className="w-full">
                                {isSubmitting ? <Loader2 className="animate-spin" /> : 'إرسال تقرير المشكلة'}
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}


// --- Main Dialogs Component ---
interface HomeDialogsProps {
    user: User;
    userProfile: UserProfile;
    activeChallenges: Challenge[];
    newChallengeAvailable: boolean;
    markChallengeAsSeen: (challengeDate: any) => void;
}

export default function HomeDialogs({ user, userProfile, activeChallenges, newChallengeAvailable, markChallengeAsSeen }: HomeDialogsProps) {
    const { toast } = useToast();
    const { refreshUserProfile } = useAuth();
    const [isLoading, setIsLoading] = useState<boolean>(false);
    
    // League Dialog States
    const [isCreateLeagueOpen, setIsCreateLeagueOpen] = useState(false);
    const [isJoinLeagueOpen, setIsJoinLeagueOpen] = useState(false);
    const [isMyLeaguesOpen, setIsMyLeaguesOpen] = useState(false);
    const [leagueName, setLeagueName] = useState("");
    const [leaguePassword, setLeaguePassword] = useState("");
    const [joinLeagueId, setJoinLeagueId] = useState("");
    const [joinLeaguePassword, setJoinLeaguePassword] = useState("");

    // Mail Dialog States
    const [isMailboxOpen, setIsMailboxOpen] = useState(false);
    const [userMail, setUserMail] = useState<Mail[]>([]);
    const [isFetchingMail, setIsFetchingMail] = useState(false);
    const [isClaimingCoins, setIsClaimingCoins] = useState<string | null>(null);

    // Gender Dialog States
    const [isGenderModalOpen, setIsGenderModalOpen] = useState(!userProfile.gender);
    const [selectedGender, setSelectedGender] = useState<'male' | 'female' | null>(null);
    const [isSubmittingGender, setIsSubmittingGender] = useState(false);
    
    // New Challenge Dialog State
    const [isNewChallengeDialogOpen, setIsNewChallengeDialogOpen] = useState(false);

    useEffect(() => {
        if (newChallengeAvailable && activeChallenges.length > 0) {
            setIsNewChallengeDialogOpen(true);
        }
    }, [newChallengeAvailable, activeChallenges]);

    const handleCreateLeague = async () => {
        if (!user || !leagueName.trim() || !/^\d{5}$/.test(leaguePassword)) {
            toast({ title: "الرجاء ملء اسم الدوري وإدخال كلمة سر من 5 أرقام", variant: "destructive" });
            return;
        }
        setIsLoading(true);
        const result = await createLeague(user.uid, leagueName, leaguePassword);
        if (result.success) {
            toast({ title: "تم إنشاء الدوري بنجاح!", description: `معرف الدوري: ${result.leagueId}` });
            setIsCreateLeagueOpen(false);
            setLeagueName('');
            setLeaguePassword('');
        } else {
            toast({ title: "خطأ في الإنشاء", description: result.error, variant: "destructive" });
        }
        setIsLoading(false);
    };

    const handleJoinLeague = async () => {
        if (!user || !joinLeagueId.trim() || !joinLeaguePassword.trim()) {
            toast({ title: "الرجاء ملء جميع الحقول", variant: "destructive" });
            return;
        }
        setIsLoading(true);
        const result = await joinLeagueAction(user.uid, joinLeagueId.toUpperCase(), joinLeaguePassword);
        if (result.success) {
            toast({ title: "تم الانضمام للدوري بنجاح!" });
            setIsJoinLeagueOpen(false);
            setJoinLeagueId('');
            setJoinLeaguePassword('');
        } else {
            toast({ title: "خطأ في الانضمام", description: result.error, variant: "destructive" });
        }
        setIsLoading(false);
    };
    
    const handleOpenMailbox = async () => {
        if (!user) return;
        setIsMailboxOpen(true);
        setIsFetchingMail(true);
        const mail = await getMail(user.uid);
        setUserMail(mail);
        setIsFetchingMail(false);
    };

    const handleMarkAsRead = async (mailId: string) => {
        if (!user) return;
        const mailIndex = userMail.findIndex(m => m.id === mailId);
        if (mailIndex !== -1 && !userMail[mailIndex].isRead) {
            setUserMail(prev => {
                const newMail = [...prev];
                newMail[mailIndex].isRead = true;
                return newMail;
            });
            await markMailAsRead(user.uid, mailId);
        }
    };
    
    const handleClaimCoins = async (mailId: string) => {
        if (!user) return;
        setIsClaimingCoins(mailId);
        const result = await claimMailCoins(user.uid, mailId);
        if(result.success) {
            toast({ title: "نجاح!", description: "تمت إضافة الكوينز إلى رصيدك."});
            setUserMail(prev => prev.map(m => m.id === mailId ? {...m, coinsClaimed: true} : m));
            if(refreshUserProfile) refreshUserProfile();
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive"});
        }
        setIsClaimingCoins(null);
    };
    
    const unreadMailCount = useMemo(() => userMail.filter(m => !m.isRead).length, [userMail]);
    
    useEffect(() => {
        if (user && !isFetchingMail) {
            getMail(user.uid).then(setUserMail);
        }
    }, [user, isFetchingMail]);
    
    const handleGenderSave = async () => {
        if (!user || !selectedGender) {
            toast({ title: "الرجاء اختيار جنس.", variant: "destructive" });
            return;
        }
        setIsSubmittingGender(true);
        try {
            const result = await updateUserGender(user.uid, selectedGender);
            if (result.success) {
                toast({ title: "تم حفظ اختيارك بنجاح." });
                if (refreshUserProfile) await refreshUserProfile();
                setIsGenderModalOpen(false); 
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmittingGender(false);
        }
    };


    return (
        <>
            {/* League Dialogs */}
            <Dialog open={isCreateLeagueOpen} onOpenChange={setIsCreateLeagueOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>إنشاء دوري جديد</DialogTitle>
                        <DialogDescription>
                            قم بإنشاء دوري خاص بك وبأصدقائك. سيتم إنشاء معرف فريد يمكنك مشاركته.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="league-name">اسم الدوري</Label>
                            <Input id="league-name" value={leagueName} onChange={e => setLeagueName(e.target.value)} placeholder="مثال: دوري الأبطال" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="league-password">كلمة المرور (5 أرقام)</Label>
                            <Input 
                                id="league-password" 
                                type="text" 
                                inputMode="numeric"
                                value={leaguePassword} 
                                onChange={e => {
                                    const val = e.target.value;
                                    if (/^\d*$/.test(val) && val.length <= 5) {
                                        setLeaguePassword(val);
                                    }
                                }} 
                                placeholder="_ _ _ _ _" 
                                maxLength={5}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setIsCreateLeagueOpen(false)}>إلغاء</Button>
                        <Button onClick={handleCreateLeague} disabled={isLoading}>
                            {isLoading ? 'جاري الإنشاء...' : 'إنشاء'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isJoinLeagueOpen} onOpenChange={setIsJoinLeagueOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>الانضمام إلى دوري</DialogTitle>
                        <DialogDescription>
                            أدخل معرف الدوري وكلمة المرور للانضمام.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="join-league-id">معرف الدوري</Label>
                            <Input id="join-league-id" value={joinLeagueId} onChange={e => setJoinLeagueId(e.target.value)} placeholder="ABC123" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="join-league-password">كلمة المرور</Label>
                            <Input id="join-league-password" type="password" value={joinLeaguePassword} onChange={e => setJoinLeaguePassword(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setIsJoinLeagueOpen(false)}>إلغاء</Button>
                        <Button onClick={handleJoinLeague} disabled={isLoading}>
                            {isLoading ? 'جاري الانضمام...' : 'انضمام'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isMyLeaguesOpen} onOpenChange={setIsMyLeaguesOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>دورياتي</DialogTitle>
                        <DialogDescription>
                            هذه هي الدوريات التي تشارك فيها حاليًا.
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-72 w-full rounded-md border p-2 bg-background mt-4">
                       {userProfile.leagues && userProfile.leagues.length > 0 ? (
                            userProfile.leagues.map(league => (
                                <div key={league.id} className="p-2 mb-2 rounded-md bg-muted flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold">{league.name}</p>
                                        <p className="text-xs text-muted-foreground">ID: {league.id}</p>
                                    </div>
                                    <Button variant="ghost" size="sm" asChild>
                                        <Link href={`/leagues/${league.id}`} onClick={() => setIsMyLeaguesOpen(false)}>عرض</Link>
                                    </Button>
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-muted-foreground p-4">لم تنضم إلى أي دوري بعد.</p>
                        )}
                    </ScrollArea>
                </DialogContent>
            </Dialog>
            
            {/* Mailbox Dialog */}
             <Dialog open={isMailboxOpen} onOpenChange={setIsMailboxOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>صندوق البريد</DialogTitle>
                        <DialogDescription>الرسائل من الإدارة. تختفي الرسائل بعد 3 أيام.</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-96 w-full rounded-md border p-2 bg-background mt-4">
                        {isFetchingMail ? (
                            <p>جاري تحميل البريد...</p>
                        ) : userMail.length > 0 ? (
                            userMail.map(mail => (
                                <div key={mail.id} className="p-3 mb-2 rounded-md bg-muted" onClick={() => handleMarkAsRead(mail.id)}>
                                    <div className="flex justify-between items-center">
                                        <p className="text-xs text-muted-foreground">{formatDistanceToNow(mail.createdAt, { addSuffix: true, locale: ar })}</p>
                                        <div className="flex items-center gap-2">
                                            <p className={cn("font-semibold text-right", !mail.isRead && "text-primary")}>{mail.subject}</p>
                                            {!mail.isRead && <div className="w-2 h-2 rounded-full bg-primary" />}
                                        </div>
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground text-right">{mail.body}</p>
                                    {mail.coins && !mail.coinsClaimed && (
                                        <div className="mt-2 text-left">
                                            <Button size="sm" onClick={() => handleClaimCoins(mail.id)} disabled={isClaimingCoins === mail.id}>
                                                {isClaimingCoins === mail.id ? "جاري..." : `المطالبة بـ ${mail.coins} كوينز`}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-muted-foreground p-8">صندوق بريدك فارغ.</p>
                        )}
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* Gender Dialog */}
            <Dialog open={isGenderModalOpen} onOpenChange={(open) => { if (!open) setIsGenderModalOpen(false)}}>
                <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle className="text-center text-2xl">تحديد الجنس</DialogTitle>
                        <DialogDescription className="text-center">
                            الرجاء تحديد جنسك للمتابعة. هذا الإجراء مطلوب لمرة واحدة فقط.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                         <RadioGroup
                            onValueChange={(value) => setSelectedGender(value as 'male' | 'female')}
                            defaultValue={selectedGender || undefined}
                            className="flex items-center gap-4"
                         >
                            <Label htmlFor="male" className={cn("flex items-center gap-2 p-4 rounded-lg border-2 cursor-pointer flex-grow justify-center transition-all", selectedGender === 'male' ? 'border-primary bg-primary/10' : 'border-border bg-transparent')}>
                                <RadioGroupItem value="male" id="male" className="sr-only"/>
                                <span>ذكر</span>
                            </Label>
                             <Label htmlFor="female" className={cn("flex items-center gap-2 p-4 rounded-lg border-2 cursor-pointer flex-grow justify-center transition-all", selectedGender === 'female' ? 'border-primary bg-primary/10' : 'border-border bg-transparent')}>
                                 <RadioGroupItem value="female" id="female" className="sr-only" />
                                 <span>أنثى</span>
                            </Label>
                         </RadioGroup>
                         <Button onClick={handleGenderSave} disabled={!selectedGender || isSubmittingGender} className="w-full">
                            {isSubmittingGender ? "جاري الحفظ..." : "حفظ والمتابعة"}
                         </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* New Challenge Dialog */}
             <NewChallengeDialog 
                isOpen={isNewChallengeDialogOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        setIsNewChallengeDialogOpen(false);
                        if (markChallengeAsSeen && activeChallenges[0]?.createdAt) {
                            markChallengeAsSeen(activeChallenges[0].createdAt);
                        }
                    }
                }}
                challenge={activeChallenges[0]}
             />
        </>
    );
}
