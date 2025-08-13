
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogOut, User, ShieldCheck, Store, Mail as MailIcon, MessageSquarePlus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import type { UserProfile, Game, ComplaintType, Mail } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { submitComplaint } from "@/lib/actions/complaints";
import { GAME_TYPE_NAMES } from "@/data/icons";
import { useAuth } from "@/hooks/useAuth";
import { getMail, claimMailCoins, markMailAsRead } from "@/lib/actions/user";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";


const ComplaintDialog = ({ userProfile }: { userProfile: UserProfile }) => {
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

const MailboxDialog = () => {
    const { user, refreshUserProfile } = useAuth();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [userMail, setUserMail] = useState<Mail[]>([]);
    const [isFetchingMail, setIsFetchingMail] = useState(false);
    const [isClaimingCoins, setIsClaimingCoins] = useState<string | null>(null);

    const handleOpenMailbox = async () => {
        if (!user) return;
        setIsOpen(true);
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
        if (result.success) {
            toast({ title: "نجاح!", description: "تمت إضافة الكوينز إلى رصيدك." });
            setUserMail(prev => prev.map(m => m.id === mailId ? { ...m, coinsClaimed: true } : m));
            if (refreshUserProfile) refreshUserProfile();
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsClaimingCoins(null);
    };

    const unreadMailCount = useMemo(() => userMail.filter(m => !m.isRead).length, [userMail]);

    useEffect(() => {
        if (user && !isFetchingMail) {
            getMail(user.uid).then(setUserMail);
        }
    }, [user, isFetchingMail]);
    
    return (
         <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                 <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                           <Button variant="ghost" size="icon" onClick={handleOpenMailbox} className="relative">
                                <MailIcon className="h-6 w-6 text-primary" />
                                {unreadMailCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500"/>}
                            </Button>
                        </TooltipTrigger>
                         <TooltipContent><p>صندوق البريد</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </DialogTrigger>
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
    )
}

interface HomeHeaderProps {
    userProfile: UserProfile;
}

export default function HomeHeader({ userProfile }: HomeHeaderProps) {
    const router = useRouter();

    const handleSignOut = async () => {
        await signOut(auth);
        router.push('/');
    };
    
    return (
        <header className="w-full p-4">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Link href="/profile">
                                    <Button variant="ghost" size="icon">
                                        <User className="h-6 w-6 text-primary" />
                                    </Button>
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent><p>ملفك الشخصي</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <MailboxDialog />
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={handleSignOut}>
                                    <LogOut className="h-6 w-6 text-destructive" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>تسجيل الخروج</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                
                <div className="flex-1"></div>
                
                <div className="flex items-center gap-2">
                    {userProfile.isAdmin && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Link href="/admin">
                                        <Button variant="ghost" size="icon">
                                            <ShieldCheck className="h-6 w-6 text-destructive" />
                                        </Button>
                                    </Link>
                                </TooltipTrigger>
                                <TooltipContent><p>لوحة تحكم الأدمن</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    <ComplaintDialog userProfile={userProfile} />
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Link href="/store">
                                    <Button variant="ghost" size="icon">
                                        <Store className="h-6 w-6 text-primary" />
                                    </Button>
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent><p>المتجر</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>
        </header>
    );
}

