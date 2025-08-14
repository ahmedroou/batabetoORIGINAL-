'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, PlusCircle, DoorOpen, Trophy, Sparkles, Users, Clock, Mars, Venus } from 'lucide-react';
import Link from 'next/link';
import type { User, UserProfile, Challenge, EntryFee, Game } from '@/types';
import { createLeague, joinLeague, updateUserGender, joinChallenge } from '@/lib/actions/user';
import { GAME_TYPE_NAMES } from '@/data/icons';
import { Timestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

// ————————————————————————————————————————
// خلفية زخرفية قابلة لإعادة الاستخدام داخل الـ Dialog
// ————————————————————————————————————————
function AuroraBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      <div className="absolute -inset-24 bg-[radial-gradient(50%_40%_at_20%_10%,hsl(var(--primary)/.18),transparent),radial-gradient(40%_30%_at_80%_0%,hsl(var(--secondary)/.18),transparent),radial-gradient(30%_40%_at_50%_100%,hsl(var(--primary)/.12),transparent)]" />
      <div className="absolute inset-0 bg-[conic-gradient(from_180deg_at_50%_50%,hsl(var(--primary)/.1),transparent,transparent,hsl(var(--secondary)/.1),transparent)] opacity-60 blur-xl" />
    </div>
  );
}

// ————————————————————————————————————————
// عرض رسوم الدخول بشكل أنيق
// ————————————————————————————————————————
const EntryFeeDisplay = ({ entryFee }: { entryFee?: EntryFee }) => {
  if (!entryFee || entryFee.value <= 0) {
    return (
      <div className="mx-auto w-fit rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-emerald-400">
        انضمام مجاني!
      </div>
    );
  }
  const text = entryFee.type === 'coins' ? 'كوينز' : 'نقاط صدارة';
  return (
    <div className="mx-auto flex w-fit items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-amber-300">
      <Trophy className="h-4 w-4" />
      <span className="font-semibold">رسوم الدخول: {entryFee.value} {text}</span>
    </div>
  );
};

// ————————————————————————————————————————
// حوار التحدّي الجديد (مُحسّن بصريًا)
// ————————————————————————————————————————
const NewChallengeDialog = ({ challenge, isOpen, onOpenChange }: { challenge: Challenge | null; isOpen: boolean; onOpenChange: (open: boolean) => void; }) => {
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
        toast({ title: 'تم الانضمام بنجاح!' });
        onOpenChange(false);
      } else {
        toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
      }
    } finally {
      setIsJoining(false);
    }
  };

  const endsAt = challenge.endsAt instanceof Timestamp ? challenge.endsAt.toDate() : (challenge as any).endsAt ? new Date((challenge as any).endsAt) : null;
  const gameName = challenge.specificGameType === 'all' ? 'كل الألعاب' : (GAME_TYPE_NAMES as any)[challenge.specificGameType as Game['gameType']] || '—';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="relative overflow-hidden rounded-2xl border border-primary/30 bg-background/80 p-0 text-foreground shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <AuroraBackdrop />
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="relative p-6 sm:p-8">
          <DialogHeader className="text-center space-y-4">
            <div className="relative mx-auto grid h-24 w-24 place-items-center rounded-3xl border border-border bg-gradient-to-br from-primary/10 to-secondary/10 shadow-inner">
              <motion.div animate={{ rotate: [0, 8, -8, 0] }} transition={{ repeat: Infinity, duration: 3.6, ease: 'easeInOut' }}>
                <Trophy className="h-14 w-14 text-amber-300" />
              </motion.div>
              <Sparkles className="absolute -top-2 -right-2 h-5 w-5 text-primary" />
              <Sparkles className="absolute -bottom-2 -left-2 h-5 w-5 text-secondary" />
            </div>
            <DialogTitle className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
              بطولة جديدة انطلقت!
            </DialogTitle>
            <DialogDescription className="text-base sm:text-lg text-muted-foreground">{challenge.title}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-3 text-center">
            <p>الهدف: <span className="font-bold text-primary">{challenge.targetPoints}</span> نقطة صدارة</p>
            <p>اللعبة: <span className="font-bold text-secondary">{gameName}</span></p>
            <EntryFeeDisplay entryFee={challenge.entryFee} />
            {endsAt ? (
              <p className="text-xs text-muted-foreground">ينتهي في: {endsAt.toLocaleString('ar')}</p>
            ) : null}
          </div>

          <DialogFooter className="mt-6 grid gap-2 sm:grid-cols-2">
            <Button onClick={handleJoinClick} disabled={isJoining} className="rounded-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg hover:opacity-90">
              {isJoining ? <Loader2 className="animate-spin" /> : 'انضم الآن!'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">لاحقًا</Button>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

// ————————————————————————————————————————
// الواجهة الرئيسية للحوارات (محافظة على واجهتك الأصلية)
// ————————————————————————————————————————
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
  const [leagueName, setLeagueName] = useState('');
  const [leaguePassword, setLeaguePassword] = useState('');
  const [joinLeagueId, setJoinLeagueId] = useState('');
  const [joinLeaguePassword, setJoinLeaguePassword] = useState('');

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
      toast({ title: 'الرجاء ملء اسم الدوري وإدخال كلمة سر من 5 أرقام', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    const result = await createLeague(user.uid, leagueName.trim(), leaguePassword);
    if (result.success) {
      toast({ title: 'تم إنشاء الدوري بنجاح!', description: `معرف الدوري: ${result.leagueId}` });
      setIsCreateLeagueOpen(false);
      setLeagueName('');
      setLeaguePassword('');
    } else {
      toast({ title: 'خطأ في الإنشاء', description: result.error, variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handleJoinLeague = async () => {
    if (!user || !joinLeagueId.trim() || !joinLeaguePassword.trim()) {
      toast({ title: 'الرجاء ملء جميع الحقول', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    const result = await joinLeague(user.uid, joinLeagueId.toUpperCase(), joinLeaguePassword);
    if (result.success) {
      toast({ title: 'تم الانضمام للدوري بنجاح!' });
      setIsJoinLeagueOpen(false);
      setJoinLeagueId('');
      setJoinLeaguePassword('');
    } else {
      toast({ title: 'خطأ في الانضمام', description: result.error, variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handleGenderSave = async () => {
    if (!user || !selectedGender) {
      toast({ title: 'الرجاء اختيار جنس.', variant: 'destructive' });
      return;
    }
    setIsSubmittingGender(true);
    try {
      const result = await updateUserGender(user.uid, selectedGender);
      if (result.success) {
        toast({ title: 'تم حفظ اختيارك بنجاح.' });
        if (refreshUserProfile) await refreshUserProfile();
        setIsGenderModalOpen(false);
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmittingGender(false);
    }
  };

  // ——— Dialog: إنشاء دوري ———
  const CreateLeagueDialog = (
    <Dialog open={isCreateLeagueOpen} onOpenChange={setIsCreateLeagueOpen}>
      <DialogContent className="relative overflow-hidden rounded-2xl border border-primary/30 bg-background/80 p-0 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <AuroraBackdrop />
        <div className="relative p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-xl">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary font-extrabold">إنشاء دوري جديد</span>
              <PlusCircle className="h-5 w-5 text-primary" />
            </DialogTitle>
            <DialogDescription>أنشئ دوريًا خاصًا وشارك المعرف مع أصدقائك.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="league-name">اسم الدوري</Label>
              <Input id="league-name" value={leagueName} onChange={(e) => setLeagueName(e.target.value)} placeholder="مثال: دوري الأبطال" className="rounded-xl" />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="league-password">كلمة المرور (5 أرقام)</Label>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground underline decoration-dotted cursor-help">لماذا 5 أرقام؟</span>
                    </TooltipTrigger>
                    <TooltipContent>رقم قصير وسهل التذكّر لأعضاء الدوري.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="league-password"
                type="text"
                inputMode="numeric"
                value={leaguePassword}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^\d*$/.test(val) && val.length <= 5) setLeaguePassword(val);
                }}
                placeholder="_ _ _ _ _"
                maxLength={5}
                className="rounded-xl tracking-[.5em] text-center font-semibold"
              />
            </div>
          </div>
          <DialogFooter className="mt-6 flex gap-2 sm:gap-3">
            <Button variant="secondary" onClick={() => setIsCreateLeagueOpen(false)} className="rounded-xl">إلغاء</Button>
            <Button onClick={handleCreateLeague} disabled={isLoading} className="rounded-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg hover:opacity-90">
              {isLoading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> جاري الإنشاء…</span> : 'إنشاء'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ——— Dialog: الانضمام إلى دوري ———
  const JoinLeagueDialog = (
    <Dialog open={isJoinLeagueOpen} onOpenChange={setIsJoinLeagueOpen}>
      <DialogContent className="relative overflow-hidden rounded-2xl border border-primary/30 bg-background/80 p-0 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <AuroraBackdrop />
        <div className="relative p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-xl">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary font-extrabold">الانضمام إلى دوري</span>
              <DoorOpen className="h-5 w-5 text-primary" />
            </DialogTitle>
            <DialogDescription>أدخل معرف الدوري وكلمة المرور للانضمام.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="join-league-id">معرف الدوري</Label>
              <Input id="join-league-id" value={joinLeagueId} onChange={(e) => setJoinLeagueId(e.target.value)} placeholder="ABC123" className="rounded-xl uppercase" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="join-league-password">كلمة المرور</Label>
              <Input id="join-league-password" type="password" value={joinLeaguePassword} onChange={(e) => setJoinLeaguePassword(e.target.value)} className="rounded-xl" />
            </div>
          </div>
          <DialogFooter className="mt-6 flex gap-2 sm:gap-3">
            <Button variant="secondary" onClick={() => setIsJoinLeagueOpen(false)} className="rounded-xl">إلغاء</Button>
            <Button onClick={handleJoinLeague} disabled={isLoading} className="rounded-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg hover:opacity-90">
              {isLoading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> جاري الانضمام…</span> : 'انضمام'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ——— Dialog: دورياتي ———
  const MyLeaguesDialog = (
    <Dialog open={isMyLeaguesOpen} onOpenChange={setIsMyLeaguesOpen}>
      <DialogContent className="relative overflow-hidden rounded-2xl border border-primary/30 bg-background/80 p-0 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <AuroraBackdrop />
        <div className="relative p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary text-xl font-extrabold">دورياتي</DialogTitle>
            <DialogDescription>هذه هي الدوريات التي تشارك فيها حاليًا.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="mt-4 h-72 w-full rounded-xl border p-2">
            {userProfile.leagues && userProfile.leagues.length > 0 ? (
              <div className="space-y-2">
                {userProfile.leagues.map((league) => (
                  <motion.div key={league.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between rounded-xl border bg-card/60 p-3 hover:shadow-md">
                    <div>
                      <p className="font-semibold">{league.name}</p>
                      <p className="text-xs text-muted-foreground">ID: {league.id}</p>
                    </div>
                    <Button variant="ghost" size="sm" asChild className="rounded-xl">
                      <Link href={`/leagues/${league.id}`} onClick={() => setIsMyLeaguesOpen(false)}>عرض</Link>
                    </Button>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="grid h-40 place-items-center text-center text-muted-foreground">
                <div>
                  <Sparkles className="mx-auto h-6 w-6" />
                  <p className="mt-2">لم تنضم إلى أي دوري بعد.</p>
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ——— Dialog: تحديد الجنس (إلزامي لمرة واحدة) ———
  const GenderDialog = (
    <Dialog open={isGenderModalOpen} onOpenChange={(open) => { if (!open) setIsGenderModalOpen(false); }}>
      <DialogContent className="relative max-w-md overflow-hidden rounded-2xl border border-primary/30 bg-background/80 p-0 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/60" onInteractOutside={(e) => e.preventDefault()}>
        <AuroraBackdrop />
        <div className="relative p-6 sm:p-8" dir="rtl" lang="ar">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">تحديد الجنس</DialogTitle>
            <DialogDescription className="text-center">الرجاء تحديد جنسك للمتابعة. هذا الإجراء مطلوب لمرة واحدة فقط.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <RadioGroup onValueChange={(value) => setSelectedGender(value as 'male' | 'female')} defaultValue={selectedGender || undefined} className="grid grid-cols-2 gap-3">
              <Label htmlFor="male" className={cn('flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 p-4 transition-all', selectedGender === 'male' ? 'border-primary bg-primary/10' : 'border-border')}>
                <RadioGroupItem value="male" id="male" className="sr-only" />
                <Mars className="h-5 w-5" />
                <span>ذكر</span>
              </Label>
              <Label htmlFor="female" className={cn('flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 p-4 transition-all', selectedGender === 'female' ? 'border-primary bg-primary/10' : 'border-border')}>
                <RadioGroupItem value="female" id="female" className="sr-only" />
                <Venus className="h-5 w-5" />
                <span>أنثى</span>
              </Label>
            </RadioGroup>
            <Button onClick={handleGenderSave} disabled={!selectedGender || isSubmittingGender} className="w-full rounded-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:opacity-90">
              {isSubmittingGender ? 'جاري الحفظ…' : 'حفظ والمتابعة'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      {CreateLeagueDialog}
      {JoinLeagueDialog}
      {MyLeaguesDialog}
      {GenderDialog}

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
