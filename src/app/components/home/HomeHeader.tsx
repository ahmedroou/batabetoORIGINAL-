
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogOut, User, ShieldCheck, Store, Mail as MailIcon, MessageSquarePlus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import type { UserProfile, Game, ComplaintType } from "@/types";
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
