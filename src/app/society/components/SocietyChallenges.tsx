'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Challenge, ChallengePrize, UserProfile, EntryFee, GameKing, Game } from '@/types';
import { getChallenges, joinChallenge, getChallengeDetails } from '@/lib/actions/challenges';
import { getGameKings, getKingOfGames } from '@/lib/actions/user';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CircleDollarSign, Diamond, Swords, Trophy, Shield, Loader2, ListOrdered, Crown } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { GAME_TYPE_NAMES } from '@/data/icons';
import { useAuth } from '@/hooks/useAuth';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent as AlertDialogContentAlt, AlertDialogDescription as AlertDialogDescriptionAlt, AlertDialogFooter as AlertDialogFooterAlt, AlertDialogHeader as AlertDialogHeaderAlt, AlertDialogTitle as AlertDialogTitleAlt } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Timestamp } from 'firebase/firestore';

// ----------------------------------------------
// Utils
// ----------------------------------------------

const toDate = (v: Date | string | Timestamp | number | undefined | null): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  // @ts-ignore
  if (typeof v?.toDate === 'function') return v.toDate();
  return null;
};

const isEndedChallenge = (challenge: Challenge, nowTs = Date.now()): boolean => {
  const endsAt = toDate(challenge.endsAt)?.getTime();
  if (!endsAt) return true;
  return endsAt < nowTs;
};

// ----------------------------------------------
// Prize UI
// ----------------------------------------------

const PRIZE_ICONS: Record<ChallengePrize['type'], React.ElementType> = {
  coins: CircleDollarSign,
  diamonds: Diamond,
  honorPoints: Shield,
};

const PRIZE_COLORS: Record<ChallengePrize['type'], string> = {
  coins: 'text-yellow-400',
  diamonds: 'text-blue-400',
  honorPoints: 'text-green-500',
};

const PrizeDisplay = ({ prizes, rank }: { prizes: ChallengePrize[] | undefined; rank: '1st' | '2nd' | '3rd' }) => {
  if (!prizes || prizes.length === 0) return <p className="text-sm text-gray-400">لا توجد جائزة</p>;

  const rankColors = {
    '1st': 'text-yellow-300',
    '2nd': 'text-slate-300',
    '3rd': 'text-orange-400',
  } as const;

  return (
    <div className="flex flex-col gap-1 text-sm">
      <h4 className={cn('font-bold', rankColors[rank])}>
        {rank === '1st' ? 'المركز الأول' : rank === '2nd' ? 'المركز الثاني' : 'المركز الثالث'}
      </h4>
      <div className="flex flex-wrap gap-2">
        {prizes.map((prize, index) => {
          const Icon = PRIZE_ICONS[prize.type];
          return (
            <div key={`${prize.type}-${index}`} className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-md">
              <Icon className={cn('w-4 h-4', PRIZE_COLORS[prize.type])} />
              <span className="font-bold text-gray-200">{prize.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ----------------------------------------------
// Leaderboard Dialog
// ----------------------------------------------

const ChallengeLeaderboardDialog = ({ challenge, trigger }: { challenge: Challenge; trigger: React.ReactNode }) => {
  const { getSocialRankForUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [participants, setParticipants] = useState<UserProfile[]>([]);
  const [scoresMap, setScoresMap] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [gameKings, setGameKings] = useState<Record<string, GameKing>>({});
  const [kingOfGames, setKingOfGames] = useState<UserProfile | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!isOpen) return;
    setIsLoading(true);
    let mounted = true;
    try {
      const [details, kings, kog] = await Promise.all([
        getChallengeDetails(challenge.id),
        getGameKings(),
        getKingOfGames(),
      ]);
      if (!mounted) return;
      if (details) {
        setParticipants(details.participants || []);
        setScoresMap(details.scores || {});
      } else {
        setParticipants([]);
        setScoresMap({});
      }
      setGameKings((kings as unknown as Record<string, GameKing>) || {});
      setKingOfGames(kog || null);
    } finally {
      if (mounted) setIsLoading(false);
    }
    return () => {
      mounted = false;
    };
  }, [isOpen, challenge.id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="bg-gray-900 border-purple-500 text-white max-w-lg">
        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl text-purple-300">{challenge.title}</DialogTitle>
          <DialogDescription className="text-gray-400">أفضل 10 لاعبين في صدارة البطولة</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <ScrollArea className="h-96">
              <div className="space-y-2 pr-4">
                {participants.length > 0 ? (
                  participants.map((participant, index) => {
                    const rank = getSocialRankForUser(participant.leaderboardPoints);
                    const isKing = kingOfGames?.uid === participant.uid;
                    const gameKingTitle = Object.values(gameKings).find((k) => k.kingId === participant.uid);
                    const RankIcon = (rank?.icon as React.ElementType) || null;

                    const rowTone =
                      index === 0
                        ? 'bg-yellow-500/20 border-yellow-400'
                        : index === 1
                        ? 'bg-slate-500/20 border-slate-400'
                        : index === 2
                        ? 'bg-orange-500/20 border-orange-400'
                        : 'bg-gray-800 border-gray-700';

                    return (
                      <div key={participant.uid} className={cn('flex justify-between items-center p-2 rounded-lg border-l-4', rowTone)}>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg w-6 text-center text-gray-400">{index + 1}</span>
                          <PlayerAvatar avatarId={participant.avatarId} className="w-10 h-10" />
                          <div className="flex flex-col">
                            <p className="font-semibold flex items-center gap-1.5">
                              {participant.name}
                              {isKing && <Crown className="w-4 h-4 text-yellow-300 fill-yellow-400" title="ملك الملوك" />}
                              {gameKingTitle && !isKing && (
                                <Crown
                                  className="w-4 h-4 text-amber-400"
                                  title={`ملك لعبة ${GAME_TYPE_NAMES[gameKingTitle.gameType as Game['gameType']]}`}
                                />
                              )}
                            </p>
                            {rank && RankIcon && (
                              <Badge variant="secondary" className="w-fit text-xs">
                                {RankIcon && <RankIcon className="w-3 h-3 ml-1" />}
                                {rank.name}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="font-bold text-lg text-yellow-400">{scoresMap[participant.uid] || 0} نقطة</p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-center text-gray-500 h-64 flex items-center justify-center">لا يوجد مشاركون بعد.</p>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ----------------------------------------------
// Entry Fee Badge
// ----------------------------------------------

const EntryFeeDisplay = ({ entryFee }: { entryFee?: EntryFee }) => {
  if (!entryFee || entryFee.value <= 0) {
    return <Badge className="bg-green-500/20 text-green-300 border-green-500/30">انضمام مجاني!</Badge>;
  }

  const Icon = entryFee.type === 'coins' ? CircleDollarSign : Trophy;
  const text = entryFee.type === 'coins' ? 'كوينز' : 'نقاط صدارة';

  return (
    <Badge className="bg-yellow-500/20 text-yellow-200 border-yellow-500/30 gap-1.5">
      <Icon className="w-4 h-4" />
      <span>
        رسوم الانضمام: {entryFee.value} {text}
      </span>
    </Badge>
  );
};

// ----------------------------------------------
// Challenge Card
// ----------------------------------------------

const ChallengeCard = ({ challenge, index, onChallengeUpdate }: { challenge: Challenge; index: number; onChallengeUpdate: (updated: Challenge) => void }) => {
  const { user, userProfile, refreshUserProfile } = useAuth();
  const { toast } = useToast();

  const [isJoining, setIsJoining] = useState(false);
  const [isConfirmingJoin, setIsConfirmingJoin] = useState(false);

  const [timeProgress, setTimeProgress] = useState(0);
  const [endsLabel, setEndsLabel] = useState<string>('...');

  const topThree = challenge.topParticipants || [];

  const isParticipant = !!(userProfile && challenge.participantIds?.includes(userProfile.uid));

  const createdAt = toDate(challenge.createdAt) ?? new Date();
  const endsAt = toDate(challenge.endsAt) ?? new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
  const isEnded = endsAt.getTime() <= Date.now();

  useEffect(() => {
    if (isEnded) {
      setTimeProgress(100);
      setEndsLabel('انتهى');
      return;
    }

    const updateProgress = () => {
      const total = endsAt.getTime() - createdAt.getTime();
      if (total <= 0) {
        setTimeProgress(100);
        setEndsLabel('انتهى');
        return;
      }
      const elapsed = Date.now() - createdAt.getTime();
      const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
      setTimeProgress(pct);
      setEndsLabel(formatDistanceToNowStrict(endsAt, { locale: ar, addSuffix: true }));
    };

    updateProgress();
    const timer = setInterval(updateProgress, 60_000);
    return () => clearInterval(timer);
  }, [createdAt.getTime(), endsAt.getTime(), isEnded]);

  const handleJoin = async () => {
    if (!user || !userProfile) return;
    setIsJoining(true);
    const res = await joinChallenge(challenge.id, user.uid);
    if (res.success) {
      toast({ title: 'لقد انضممت إلى البطولة بنجاح!' });
      refreshUserProfile?.();
      const updated: Challenge = {
        ...challenge,
        participantIds: [...(challenge.participantIds || []), user.uid],
        participantCount: (challenge.participantCount || 0) + 1,
      } as Challenge;
      onChallengeUpdate(updated);
    } else {
      toast({ title: 'خطأ في الانضمام', description: res.error, variant: 'destructive' });
    }
    setIsJoining(false);
    setIsConfirmingJoin(false);
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, delay: index * 0.1 } },
  } as const;

  const myScore = isParticipant ? challenge.scores?.[userProfile!.uid] || 0 : 0;
  const progressToTarget = challenge.targetPoints > 0 ? (myScore / challenge.targetPoints) * 100 : 0;

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <Card
        className={cn(
          'h-full flex flex-col bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm shadow-lg shadow-purple-900/20 relative overflow-hidden',
          isEnded && 'opacity-60 bg-gray-900/70 border-gray-700/50'
        )}
      >
        <CardHeader className="border-b border-white/10 pb-4">
          <div className="flex justify-between items-start mb-2">
            <CardTitle className="text-xl text-purple-300 flex items-center gap-2">
              <Swords className="w-5 h-5" />
              {challenge.title}
            </CardTitle>
            <Badge variant={isEnded ? 'destructive' : 'secondary'}>{isEnded ? 'منتهية' : 'نشطة'}</Badge>
          </div>
          <CardDescription className="text-gray-400 text-sm">
            الهدف: {challenge.targetPoints} نقطة صدارة | اللعبة:{' '}
            {challenge.specificGameType === 'all' ? 'كل الألعاب' : GAME_TYPE_NAMES[challenge.specificGameType as Game['gameType']]}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-grow space-y-4 pt-4">
          <div>
            <h4 className="font-semibold text-gray-300 mb-2 text-sm">الجوائز:</h4>
            <div className="space-y-2">
              <PrizeDisplay prizes={challenge.firstPlacePrize} rank="1st" />
              <PrizeDisplay prizes={challenge.secondPlacePrize} rank="2nd" />
              <PrizeDisplay prizes={challenge.thirdPlacePrize} rank="3rd" />
            </div>
          </div>

          {isParticipant && !isEnded && (
            <div className="pt-2">
              <h4 className="font-semibold text-gray-300 mb-2 text-sm">تقدمك:</h4>
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="font-bold text-yellow-300">
                  {myScore} / {challenge.targetPoints} نقطة
                </span>
                <span>{Math.round(progressToTarget)}%</span>
              </div>
              <Progress value={progressToTarget} className="h-2 [&>*]:bg-yellow-400" />
            </div>
          )}

          {topThree.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-300 mb-2 text-sm">أفضل 3 لاعبين حاليًا:</h4>
              <div className="space-y-1">
                {topThree.map((player, idx) => (
                  <div key={player.uid} className="flex justify-between items-center bg-black/20 p-1 rounded-md text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold w-4">{idx + 1}.</span>
                      <PlayerAvatar avatarId={player.avatarId} className="w-6 h-6" />
                      <span className="font-semibold">{player.name}</span>
                    </div>
                    <span className="font-bold text-yellow-300">{challenge.scores?.[player.uid] || 0} نقطة</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-2 pt-4 border-t border-white/10">
          <div className="w-full space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>تقدم الوقت</span>
              <span className="tabular-nums">{endsLabel}</span>
            </div>
            <Progress value={timeProgress} className="h-2" />
            <div className="flex justify-end text-xs text-gray-400">
              <span>{challenge.participantCount || 0} مشارك</span>
            </div>
          </div>

          <div className="flex justify-between items-center w-full mt-2">
            <EntryFeeDisplay entryFee={challenge.entryFee} />
            <ChallengeLeaderboardDialog
              challenge={challenge}
              trigger={
                <Button variant="link" size="sm" className="text-purple-300 px-0">
                  <ListOrdered className="ml-1 w-4 h-4" />
                  عرض التفاصيل
                </Button>
              }
            />
          </div>

          {isEnded && challenge.winners && (
            <div className="w-full mt-2 text-center text-sm text-green-300 font-bold">تم توزيع الجوائز!</div>
          )}

          {!isEnded && (
            <Button onClick={() => setIsConfirmingJoin(true)} disabled={isJoining || isParticipant} className="w-full bg-purple-600 hover:bg-purple-700 mt-2">
              {isJoining ? <Loader2 className="animate-spin" /> : isParticipant ? 'أنت مشارك' : 'انضم للبطولة'}
            </Button>
          )}
        </CardFooter>

        <AlertDialog open={isConfirmingJoin} onOpenChange={setIsConfirmingJoin}>
          <AlertDialogContentAlt>
            <AlertDialogHeaderAlt>
              <AlertDialogTitleAlt>تأكيد الانضمام إلى البطولة</AlertDialogTitleAlt>
              <AlertDialogDescriptionAlt>
                هل أنت متأكد من رغبتك في الانضمام إلى بطولة "{challenge.title}"؟
                {challenge.entryFee && challenge.entryFee.value > 0 && (
                  <span className="block mt-2 font-bold text-yellow-500">
                    سيتم خصم {challenge.entryFee.value} {challenge.entryFee.type === 'coins' ? 'كوينز' : 'نقاط صدارة'} من رصيدك.
                  </span>
                )}
              </AlertDialogDescriptionAlt>
            </AlertDialogHeaderAlt>
            <AlertDialogFooterAlt>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={handleJoin} disabled={isJoining} className="bg-purple-600 hover:bg-purple-700">
                {isJoining ? <Loader2 className="animate-spin" /> : 'تأكيد الانضمام'}
              </AlertDialogAction>
            </AlertDialogFooterAlt>
          </AlertDialogContentAlt>
        </AlertDialog>
      </Card>
    </motion.div>
  );
};

// ----------------------------------------------
// List Wrapper
// ----------------------------------------------

interface SocietyChallengesProps {
  filter?: 'active' | 'ended';
  query?: string;
  sort?: 'newest' | 'reward' | 'popularity';
  className?: string;
}

export default function SocietyChallenges({ filter = 'active', query = '', sort = 'newest', className }: SocietyChallengesProps) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAndSetChallenges = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetched = await getChallenges();
      setChallenges(fetched || []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAndSetChallenges();
  }, [fetchAndSetChallenges]);

  const handleChallengeUpdate = (updated: Challenge) => {
    setChallenges((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const filteredAndSortedChallenges = useMemo(() => {
    const now = Date.now();
    const q = query.trim().toLowerCase();

    const visible = (challenges || [])
      .filter((c) => {
        // Active / Ended filter
        const ended = isEndedChallenge(c, now);
        const matchesFilter = filter === 'active' ? !ended : ended;

        // Search filter
        const gameTypeName = c.specificGameType ? GAME_TYPE_NAMES[c.specificGameType as Game['gameType']] : '';
        const matchesQuery =
          q === '' ||
          c.title.toLowerCase().includes(q) ||
          (gameTypeName && gameTypeName.toLowerCase().includes(q)) ||
          (c.firstPlacePrize || []).some((p) => p.type.toLowerCase().includes(q));

        return matchesFilter && matchesQuery;
      })
      .sort((a, b) => {
        switch (sort) {
          case 'reward': {
            const totalA = (a.firstPlacePrize || []).reduce((sum, p) => sum + (p?.value || 0), 0);
            const totalB = (b.firstPlacePrize || []).reduce((sum, p) => sum + (p?.value || 0), 0);
            return totalB - totalA;
          }
          case 'popularity':
            return (b.participantCount || 0) - (a.participantCount || 0);
          case 'newest':
          default: {
            const aTime = toDate(a.createdAt)?.getTime() || 0;
            const bTime = toDate(b.createdAt)?.getTime() || 0;
            return bTime - aTime;
          }
        }
      });

    return visible;
  }, [challenges, filter, query, sort]);

  return (
    <div className={className}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <Card key={i} className="h-[420px] flex flex-col bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm shadow-lg shadow-purple-900/20">
              <CardHeader>
                <Skeleton className="h-8 w-3/4 bg-gray-700" />
              </CardHeader>
              <CardContent className="space-y-4 flex-grow">
                <Skeleton className="h-6 w-full bg-gray-700" />
                <Skeleton className="h-6 w-1/2 bg-gray-700" />
                <Skeleton className="h-12 w-full bg-gray-700" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-10 w-full bg-gray-700" />
              </CardFooter>
            </Card>
          ))
        ) : filteredAndSortedChallenges.length > 0 ? (
          filteredAndSortedChallenges.map((challenge, index) => (
            <ChallengeCard key={challenge.id} challenge={challenge} index={index} onChallengeUpdate={handleChallengeUpdate} />
          ))
        ) : (
          <div className="col-span-full text-center py-16">
            <p className="text-2xl text-gray-400">
              {filter === 'active' ? 'لا توجد تحديات نشطة حاليًا تطابق بحثك.' : 'لا توجد تحديات منتهية تطابق بحثك.'}
            </p>
            <p className="text-gray-500">{filter === 'active' ? 'عد قريبًا للتحقق من جديد!' : ''}</p>
          </div>
        )}
      </div>
    </div>
  );
}
