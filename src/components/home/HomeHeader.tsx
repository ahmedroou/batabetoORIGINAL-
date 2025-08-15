
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getMail, claimMailCoins, markMailAsRead, respondToAllegianceRequest } from '@/lib/actions/user';
import { submitComplaint } from '@/lib/actions/complaints';

import type { Game, ComplaintType, Mail, UserProfile, AllegianceRequest } from '@/types';
import { GAME_TYPE_NAMES } from '@/data/icons';
import { PlayerAvatar } from '../game/PlayerAvatar';

import {
  AlertCircle,
  Bug,
  CheckCircle2,
  Coins,
  Crown,
  Inbox,
  Loader2,
  LogOut,
  Mail as MailIcon,
  ShieldCheck,
  Store,
  User,
  GitPullRequest,
  Check,
  X,
  Shield,
  Calendar,
  Users as UsersIcon, // Renamed to avoid conflict with User icon
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

/***************************
 * ComplaintDialog (exported)
 ***************************/
export const ComplaintDialog = ({ userProfile, trigger }: { userProfile: UserProfile; trigger: React.ReactNode }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Missing currency
  const [missingCoins, setMissingCoins] = useState('');
  const [missingPoints, setMissingPoints] = useState('');
  const [missingGame, setMissingGame] = useState<Game['gameType'] | ''>('');
  const [missingReason, setMissingReason] = useState('');

  // Bug report
  const [bugGame, setBugGame] = useState<Game['gameType'] | ''>('');
  const [bugDescription, setBugDescription] = useState('');

  const resetForms = () => {
    setMissingCoins('');
    setMissingPoints('');
    setMissingGame('');
    setMissingReason('');
    setBugGame('');
    setBugDescription('');
  };

  const handleSubmit = async (type: ComplaintType) => {
    setIsSubmitting(true);
    try {
      let details: any = {};
      if (type === 'missing_currency') {
        if (!missingGame || !missingReason) {
          toast({ title: 'الرجاء ملء جميع الحقول', variant: 'destructive' });
          return;
        }
        details = {
          game: missingGame,
          coins: parseInt(missingCoins) || 0,
          points: parseInt(missingPoints) || 0,
          reason: missingReason,
        };
      } else {
        if (!bugGame || !bugDescription) {
          toast({ title: 'الرجاء ملء جميع الحقول', variant: 'destructive' });
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
        setOpen(false);
        resetForms();
      } else {
        toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        dir="rtl"
        className={cn(
          'max-w-2xl border-white/10',
          'bg-gradient-to-br from-background/80 via-background/70 to-background/80 backdrop-blur-xl',
          'shadow-2xl'
        )}
      >
        <DialogHeader className="text-center space-y-1">
          <DialogTitle className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            مركز الشكاوى
          </DialogTitle>
          <DialogDescription>واجهت مشكلة؟ أبلغنا عنها هنا.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="missing_currency" className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-xl">
            <TabsTrigger value="missing_currency" className="data-[state=active]:bg-primary/10">
              <Coins className="ms-1 h-4 w-4" /> نقاط/كوينز مفقودة
            </TabsTrigger>
            <TabsTrigger value="bug_report" className="data-[state=active]:bg-primary/10">
              <Bug className="ms-1 h-4 w-4" /> مشكلة في لعبة
            </TabsTrigger>
          </TabsList>

          {/* Missing currency */}
          <TabsContent value="missing_currency" className="pt-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>عدد الكوينز المفقودة</Label>
                  <Input inputMode="numeric" type="number" value={missingCoins} onChange={(e) => setMissingCoins(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>عدد النقاط المفقودة</Label>
                  <Input inputMode="numeric" type="number" value={missingPoints} onChange={(e) => setMissingPoints(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>اللعبة</Label>
                <Select value={missingGame} onValueChange={(v) => setMissingGame(v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="في أي لعبة؟" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(GAME_TYPE_NAMES).map(([type, name]) => (
                      <SelectItem key={type} value={type}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>وصف مختصر</Label>
                <Textarea placeholder="اشرح السبب باختصار…" value={missingReason} onChange={(e) => setMissingReason(e.target.value)} />
              </div>

              <Button
                onClick={() => handleSubmit('missing_currency')}
                disabled={isSubmitting}
                className="w-full rounded-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إرسال طلب التعويض'}
              </Button>
            </div>
          </TabsContent>

          {/* Bug report */}
          <TabsContent value="bug_report" className="pt-4">
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>اللعبة</Label>
                <Select value={bugGame} onValueChange={(v) => setBugGame(v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر اللعبة التي بها المشكلة" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(GAME_TYPE_NAMES).map(([type, name]) => (
                      <SelectItem key={type} value={type}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>التفاصيل</Label>
                <Textarea rows={5} placeholder="صف المشكلة بالتفصيل…" value={bugDescription} onChange={(e) => setBugDescription(e.target.value)} />
              </div>

              <Button
                onClick={() => handleSubmit('bug_report')}
                disabled={isSubmitting}
                className="w-full rounded-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground"
              >
                {isSubmitting ? <Loader2 className="animate-spin" /> : 'إرسال تقرير المشكلة'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

/*************
 * MailboxDialog
 ****************/
const MailboxDialog = () => {
  const { user, userProfile, refreshUserProfile } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [userMail, setUserMail] = useState<Mail[]>([]);
  const [allegianceRequests, setAllegianceRequests] = useState<AllegianceRequest[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'rewards' | 'requests'>('all');

  const handleOpen = async () => {
    if (!user || !userProfile) return;
    setOpen(true);
    setIsFetching(true);
    const mail = await getMail(user.uid);
    setUserMail(mail);
    setAllegianceRequests(userProfile.allegianceRequests || []);
    setIsFetching(false);
  };
  
  const refreshAll = async () => {
      if(!user || !userProfile) return;
      await refreshUserProfile?.();
      const mail = await getMail(user.uid);
      setUserMail(mail);
      setAllegianceRequests(userProfile.allegianceRequests || []);
  }

  const handleMarkAsRead = async (mailId: string) => {
    if (!user) return;
    const idx = userMail.findIndex((m) => m.id === mailId);
    if (idx !== -1 && !userMail[idx].isRead) {
      setUserMail((prev) => {
        const draft = [...prev];
        draft[idx].isRead = true;
        return draft;
      });
      await markMailAsRead(user.uid, mailId);
    }
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    const unread = userMail.filter((m) => !m.isRead);
    if (unread.length === 0) return;
    const updated = userMail.map((m) => ({ ...m, isRead: true }));
    setUserMail(updated);
    for (const m of unread) {
      // تسلسل بسيط لتفادي ضغط الطلبات
      await markMailAsRead(user.uid, m.id);
    }
  };

  const handleClaimCoins = async (mailId: string) => {
    if (!user) return;
    setClaimingId(mailId);
    const res = await claimMailCoins(user.uid, mailId);
    if (res.success) {
      toast({ title: 'نجاح!', description: 'تمت إضافة الكوينز إلى رصيدك.' });
      await refreshAll();
    } else {
      toast({ title: 'خطأ', description: res.error, variant: 'destructive' });
    }
    setClaimingId(null);
  };
  
  const handleRespondToRequest = async (request: AllegianceRequest, response: 'accepted' | 'rejected') => {
      if(!user) return;
      setRespondingId(request.fromId);
      const res = await respondToAllegianceRequest(user.uid, request, response);
      if(res.success) {
          toast({title: 'تم', description: `لقد ${response === 'accepted' ? 'قبلت' : 'رفضت'} الطلب.`});
          await refreshAll();
      } else {
          toast({title: 'خطأ', description: res.error, variant: 'destructive'});
      }
      setRespondingId(null);
  }

  useEffect(() => {
      setAllegianceRequests(userProfile?.allegianceRequests || []);
  }, [userProfile?.allegianceRequests]);

  const unreadCount = useMemo(() => userMail.filter((m) => !m.isRead).length + allegianceRequests.length, [userMail, allegianceRequests]);

  const filteredMail = useMemo(() => {
    switch (filter) {
      case 'unread':
        return userMail.filter((m) => !m.isRead);
      case 'rewards':
        return userMail.filter((m) => !!m.coins);
      default:
        return userMail;
    }
  }, [userMail, filter]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleOpen} className="relative rounded-full" aria-label="فتح صندوق البريد">
                <MailIcon className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>صندوق البريد</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </DialogTrigger>

      <DialogContent
        dir="rtl"
        className={cn(
          'max-w-2xl border-white/10',
          'bg-gradient-to-br from-background/80 via-background/70 to-background/80 backdrop-blur-xl',
          'shadow-2xl'
        )}
      >
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center justify-between gap-2">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary text-xl font-extrabold tracking-tight">صندوق البريد</span>
            <span className="text-xs text-muted-foreground">الرسائل تختفي بعد 3 أيام</span>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-xs">
            <Inbox className="h-4 w-4" /> إدارة التنبيهات والمكافآت
          </DialogDescription>
        </DialogHeader>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all">الكل</TabsTrigger>
                <TabsTrigger value="unread">غير مقروء ({userMail.filter(m => !m.isRead).length})</TabsTrigger>
                <TabsTrigger value="rewards">مكافآت</TabsTrigger>
                <TabsTrigger value="requests">طلبات ({allegianceRequests.length})</TabsTrigger>
            </TabsList>
            <ScrollArea className="mt-3 h-96 w-full rounded-xl border border-white/10 p-2">
                {isFetching ? (
                     <div className="grid place-items-center h-full"><Loader2 className="animate-spin w-8 h-8"/></div>
                ) : (
                    <>
                        <TabsContent value="requests" className="m-0">
                             <div className="grid gap-2">
                                {allegianceRequests.length > 0 ? allegianceRequests.map((req) => (
                                     <div key={req.createdAt.toString()} className="rounded-xl border p-3 bg-card/70 border-white/10">
                                         <div className="flex items-center justify-between gap-2">
                                             <div className="flex items-center gap-2">
                                                <PlayerAvatar avatarId={req.fromAvatar} className="w-8 h-8" />
                                                <div>
                                                    <p className="font-semibold text-sm">{req.fromName}</p>
                                                    <p className="text-xs text-muted-foreground">طلب ولاء</p>
                                                </div>
                                             </div>
                                             <div className="flex items-center gap-2">
                                                 <Button size="sm" variant="secondary" className="bg-green-600 hover:bg-green-700" onClick={() => handleRespondToRequest(req, 'accepted')} disabled={respondingId === req.fromId}><Check className="w-4 h-4"/></Button>
                                                 <Button size="sm" variant="destructive" onClick={() => handleRespondToRequest(req, 'rejected')} disabled={respondingId === req.fromId}><X className="w-4 h-4"/></Button>
                                             </div>
                                         </div>
                                         <div className="mt-2 text-xs grid grid-cols-2 gap-2 text-center">
                                             <div className="p-1 bg-black/20 rounded">
                                                <p className="text-muted-foreground">العرض</p>
                                                <p className="font-bold">{req.offer.amount} <Coins className="inline w-3 h-3 text-yellow-400"/></p>
                                             </div>
                                              <div className="p-1 bg-black/20 rounded">
                                                <p className="text-muted-foreground">المدة</p>
                                                <p className="font-bold">{req.durationInDays} أيام</p>
                                             </div>
                                         </div>
                                     </div>
                                )) : (
                                     <div className="text-center py-16 text-muted-foreground"><p>لا توجد طلبات حاليًا.</p></div>
                                )}
                            </div>
                        </TabsContent>
                        
                        <TabsContent value="all" className="m-0">
                           {filteredMail.length === 0 && <div className="text-center py-16 text-muted-foreground"><p>صندوق بريدك فارغ.</p></div>}
                           <div className="grid gap-2">
                            <AnimatePresence>
                                {filteredMail.map((mail) => (
                                    <motion.div
                                    key={mail.id}
                                    layout
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    onClick={() => handleMarkAsRead(mail.id)}
                                    className={cn(
                                        'cursor-pointer rounded-xl border p-3 transition-colors',
                                        'bg-card/70 border-white/10 hover:bg-card/90'
                                    )}
                                    >
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs text-muted-foreground">
                                        {formatDistanceToNow(mail.createdAt, { addSuffix: true, locale: ar })}
                                        </p>
                                        <div className="flex items-center gap-2">
                                        {!mail.isRead && <span className="inline-flex h-2 w-2 rounded-full bg-primary" />}
                                        <p className={cn('font-semibold', !mail.isRead && 'text-primary')}>{mail.subject}</p>
                                        </div>
                                    </div>

                                    <p className="mt-2 line-clamp-3 text-right text-sm text-muted-foreground">{mail.body}</p>

                                    {mail.coins && !mail.coinsClaimed && (
                                        <div className="mt-3 text-left">
                                        <Button size="sm" onClick={() => handleClaimCoins(mail.id)} disabled={claimingId === mail.id}>
                                            {claimingId === mail.id ? (
                                            <span className="inline-flex items-center gap-2">
                                                <Loader2 className="h-4 w-4 animate-spin" /> جاري…
                                            </span>
                                            ) : (
                                            <span className="inline-flex items-center gap-1">
                                                <Coins className="h-4 w-4" /> المطالبة بـ {mail.coins} كوينز
                                            </span>
                                            )}
                                        </Button>
                                        </div>
                                    )}
                                    {mail.coins && mail.coinsClaimed && (
                                        <div className="mt-3 flex items-center gap-2 text-xs text-emerald-500">
                                        <CheckCircle2 className="h-4 w-4" /> تم استلام المكافأة
                                        </div>
                                    )}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                           </div>
                        </TabsContent>
                         {/* These tabs just re-use the "all" content filtered */}
                        <TabsContent value="unread" className="m-0"><TabsContent value="all" className="m-0" /></TabsContent>
                        <TabsContent value="rewards" className="m-0"><TabsContent value="all" className="m-0" /></TabsContent>
                    </>
                )}
            </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};


const NavButton = ({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) => (
    <TooltipProvider>
        <Tooltip>
            <TooltipTrigger asChild>
                <Link href={href} aria-label={label}>
                    <Button variant="ghost" size="icon" className="rounded-full w-11 h-11 bg-background/5 backdrop-blur-sm hover:bg-primary/10">
                        <Icon className="h-6 w-6 text-primary" />
                    </Button>
                </Link>
            </TooltipTrigger>
            <TooltipContent>
                <p>{label}</p>
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
);


/*************
 * HomeHeader
 *************/
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
    <motion.header
      dir="rtl"
      className="w-full p-4"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between rounded-2xl border border-white/10 bg-background/50 px-4 py-2 backdrop-blur-xl shadow-lg">
        {/* Right side: Main navigation */}
        <div className="flex items-center gap-1 md:gap-2">
            <NavButton href="/society" label="المجتمع" icon={UsersIcon} />
            <NavButton href="/kings" label="قاعة الملوك" icon={Crown} />
            <NavButton href="/store" label="المتجر" icon={Store} />
             {userProfile.isAdmin && (
                <NavButton href="/admin" label="لوحة التحكم" icon={ShieldCheck} />
             )}
        </div>

        {/* Center: App Name */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block">
            <Link href="/">
                 <span className="text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-fuchsia-500">
                    بطابيطو
                </span>
            </Link>
        </div>

        {/* Left: User actions */}
        <div className="flex items-center gap-1 md:gap-2">
            <MailboxDialog />
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Link href="/profile" aria-label="ملفك الشخصي">
                            <Button variant="ghost" size="icon" className="rounded-full w-11 h-11 bg-background/5 backdrop-blur-sm hover:bg-primary/10">
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
                        <Button variant="ghost" size="icon" onClick={handleSignOut} className="rounded-full w-11 h-11 bg-background/5 backdrop-blur-sm hover:bg-red-500/10" aria-label="تسجيل الخروج">
                            <LogOut className="h-6 w-6 text-destructive" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>تسجيل الخروج</p></TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
      </div>
    </header>
  );
}

