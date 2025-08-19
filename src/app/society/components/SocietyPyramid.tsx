

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { UserProfile, SocialRank, Decree, AvatarPrice, AllegianceRequest } from '@/types';
import { humiliatePlayer, issueDecree, begForMercy, forceAvatarChange, issueDuelChallenge, requestAllegiance, getUsersByRank, liftPunishment } from '@/lib/actions/user';
import { adminSearchUsers } from '@/lib/actions/admin/users';
import { Loader2, Crown, Shield, User, ThumbsDown, Handshake, ChevronDown, ChevronUp, Search, Gavel, Coins, HeartHandshake, Swords, VenetianMask, KeyRound, ShieldCheck, Gem, Star, Award, MessageCircleWarning, Users as UsersIcon, Link as LinkIcon, Edit, UserMinus, ScrollText, Drama, TowerControl, ShieldQuestion } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getPunishmentAvatarPrices } from '@/lib/actions/admin/settings';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { RANK_ICON_MAP } from '@/data/social-ranks';
import { Trophy } from 'lucide-react';


/**
 * —— Enhancements summary ——
 * • Stronger UX: clearer affordances, keyboard access, aria labels, clearer empty states.
 * • Safer handlers: numeric parsing, guard rails, disabled states when insufficient honor/invalid input.
 * • Visual polish: subtle gradients, borders, hover overlays, micro-animations, larger readable touch targets.
 * • Performance: stable callbacks, light memoization, throttled search already kept with debounce.
 * • Backward compatible: no API shape changes and no new imports outside the file.
 */

// —— Small utils ——
const clampInt = (val: string | number, min = 0, fallback = 0) => {
  const n = typeof val === 'number' ? val : parseInt(val as string, 10);
  return Number.isFinite(n) ? Math.max(min, n) : fallback;
};

const formatNumber = (n?: number) => new Intl.NumberFormat('ar-EG').format(n ?? 0);

const LOYALTY_COST_MAP: Record<number, number> = { 1: 3, 2: 6, 3: 8 };

// —— Modal for interactions ——
const InteractionModal = ({
  isOpen,
  onClose,
  actor,
  target,
  actorRank,
  targetRank,
  onHumiliate,
  onIssueDecree,
  onForceAvatar,
  onLiftPunishment,
  onRequestAllegiance,
}: {
  isOpen: boolean;
  onClose: () => void;
  actor: UserProfile;
  target: UserProfile;
  actorRank: SocialRank | null;
  targetRank: SocialRank | null;
  onHumiliate: (targetId: string, durationInDays: number, taxToLift: number) => Promise<void>;
  onIssueDecree: (targetId: string, title: string, durationInDays: number) => Promise<void>;
  onForceAvatar: (targetId: string, avatarId: string, durationInDays: number, taxToLift: number) => Promise<void>;
  onLiftPunishment: (targetId: string) => Promise<void>;
  onRequestAllegiance: (targetId: string, durationInDays: number, offerAmount: number) => Promise<void>;
}) => {
  // States for Punishments
  const [decreeTitle, setDecreeTitle] = useState("");
  const [decreeDuration, setDecreeDuration] = useState(1);

  const [humiliationDuration, setHumiliationDuration] = useState(1);
  const [humiliationTax, setHumiliationTax] = useState("10");

  const [avatarPunishmentDuration, setAvatarPunishmentDuration] = useState(1);
  const [avatarPunishmentTax, setAvatarPunishmentTax] = useState("10");
  const [selectedPunishmentAvatar, setSelectedPunishmentAvatar] = useState("");
  const [availablePunishmentAvatars, setAvailablePunishmentAvatars] = useState<string[]>([]);
  
  // States for Allegiance
  const [allegianceDuration, setAllegianceDuration] = useState(1);
  const [allegianceOffer, setAllegianceOffer] = useState("5");

  useEffect(() => {
    if (isOpen) {
      setAvailablePunishmentAvatars(actor.unlockedPunishmentAvatars || []);
      // Reset local state on open for a clean slate
      setDecreeTitle("");
      setDecreeDuration(1);
      setHumiliationDuration(1);
      setHumiliationTax("10");
      setAvatarPunishmentDuration(1);
      setAvatarPunishmentTax("10");
      setSelectedPunishmentAvatar("");
      setAllegianceDuration(1);
      setAllegianceOffer("5");
    }
  }, [isOpen, actor]);

  if (!actorRank || !targetRank) return null;

  const canPunish = actorRank.threshold > targetRank.threshold;
  const canRequestAllegiance = actorRank.threshold < targetRank.threshold;
  const isAlreadyHumiliated = !!(target.humiliation?.until && new Date(target.humiliation.until) > new Date());
  const isAlreadyPunishedWithAvatar = !!(target.originalAvatarToRevert?.until && new Date(target.originalAvatarToRevert.until) > new Date());
  const isPunishedByMe = (target.humiliation?.by === actor.uid && isAlreadyHumiliated) || (target.originalAvatarToRevert?.by === actor.uid && isAlreadyPunishedWithAvatar);

  const getHonorCost = (duration: number) => duration * 3;
  const getAvatarHonorCost = (duration: number) => duration * 2;
  const getAllegianceLoyaltyCost = (duration: number) => LOYALTY_COST_MAP[duration] || 3;
  const canAfford = (cost: number) => (actor.honorPoints || 0) >= cost;
  const canAffordLoyalty = (cost: number) => (actor.loyaltyPoints || 0) >= cost;
  const canAffordCoins = (amount: number) => (actor.coins || 0) >= amount;

  const InfoRow = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex items-center justify-between text-xs bg-slate-800/60 border border-slate-700 rounded px-2 py-1">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-slate-100">{value}</span>
    </div>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-2 p-3 rounded-lg border border-purple-500/30 bg-gradient-to-b from-slate-900/60 to-slate-900/30">
      <h4 className="text-sm font-bold text-purple-200 tracking-wide">{title}</h4>
      {children}
    </div>
  );

  const renderPunishmentCard = (
    title: string,
    permissionId: any,
    costFn: (duration: number) => number,
    currentDuration: number,
    durationSetter: (duration: number) => void,
    isPunishedFlag: boolean,
    children: React.ReactNode,
  ) => {
    const hasPermission = actor.permissions?.includes(permissionId);
    if (!hasPermission || !canPunish) return null;

    const cost = costFn(currentDuration);

    return (
      <div className={cn(
        'p-3 rounded-lg space-y-2 border',
        isPunishedFlag ? 'border-green-500/40 bg-green-900/10' : 'border-red-500/40 bg-red-900/10'
      )}>
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-red-300">{title}</h4>
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded', canAfford(cost) ? 'bg-emerald-700/40 text-emerald-200' : 'bg-red-800/40 text-red-200')}>
            التكلفة: {formatNumber(cost)} شرف
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <Label className="text-xs shrink-0">المدة</Label>
          <Select value={String(currentDuration)} onValueChange={(v) => durationSetter(Number(v))}>
            <SelectTrigger className="bg-slate-800 border-slate-600"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-900 text-white border-purple-500">
              <SelectItem value="1">يوم ({formatNumber(costFn(1))} شرف)</SelectItem>
              <SelectItem value="2">يومان ({formatNumber(costFn(2))} شرف)</SelectItem>
              <SelectItem value="3">3 أيام ({formatNumber(costFn(3))} شرف)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isPunishedFlag && (
          <p className="text-xs text-green-200/90">هناك عقوبة سارية على اللاعب — يمكنك رفعها من الأسفل إن كانت صادرة منك.</p>
        )}
        {children}
      </div>
    );
  };

  const honorLeft = (actor.honorPoints || 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-950 text-white border-purple-600/50 max-w-xl shadow-2xl">
        <DialogHeader>
          <div className="flex items-center justify-center gap-3">
            <div className="relative p-[2px] rounded-full bg-gradient-to-tr from-purple-400 to-amber-300">
              <div className="rounded-full bg-slate-950 p-1">
                <PlayerAvatar avatarId={target.avatarId} className="w-12 h-12 rounded-full" />
              </div>
            </div>
            <div className="text-center">
              <DialogTitle className="text-2xl font-extrabold tracking-wide">التفاعل مع {target.name}</DialogTitle>
              <DialogDescription className="text-slate-400">
                {targetRank.name} • {formatNumber(target.leaderboardPoints)} نقطة
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3">
          <Section title="بيانات سريعة">
            <div className="grid grid-cols-3 gap-2">
              <InfoRow label="شرفك" value={formatNumber(honorLeft)} />
              <InfoRow label="ولاءك" value={formatNumber(actor.loyaltyPoints || 0)} />
              <InfoRow label="كوينز" value={formatNumber(actor.coins || 0)} />
            </div>
          </Section>

          <ScrollArea className="max-h-[50vh] pr-1">
            <div className="space-y-3">
              
              {canRequestAllegiance && (
                  <Section title="طلب الولاء">
                      <p className="text-xs text-slate-300">اطلب الحماية من لاعب أعلى منك رتبة مقابل نقاط ولاء وكوينز.</p>
                      <div className="flex gap-2 items-center">
                        <Label className="text-xs shrink-0">المدة</Label>
                        <Select value={String(allegianceDuration)} onValueChange={(v) => setAllegianceDuration(Number(v))}>
                            <SelectTrigger className="bg-slate-800 border-slate-600"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-slate-900 text-white border-purple-500">
                                <SelectItem value="1">يوم ({getAllegianceLoyaltyCost(1)} ولاء)</SelectItem>
                                <SelectItem value="2">يومان ({getAllegianceLoyaltyCost(2)} ولاء)</SelectItem>
                                <SelectItem value="3">3 أيام ({getAllegianceLoyaltyCost(3)} ولاء)</SelectItem>
                            </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Label className="text-xs shrink-0">عرض الكوينز</Label>
                        <Input 
                            type="number" 
                            min={0}
                            value={allegianceOffer} 
                            onChange={(e) => setAllegianceOffer(e.target.value)} 
                            className="bg-slate-800 border-slate-600"
                        />
                      </div>
                      <Button
                          className="w-full bg-blue-600 hover:bg-blue-700"
                          onClick={() => onRequestAllegiance(target.uid, allegianceDuration, clampInt(allegianceOffer, 0))}
                          disabled={!canAffordLoyalty(getAllegianceLoyaltyCost(allegianceDuration)) || !canAffordCoins(clampInt(allegianceOffer, 0))}
                      >
                          إرسال طلب الولاء
                      </Button>
                      {!canAffordLoyalty(getAllegianceLoyaltyCost(allegianceDuration)) && <p className="text-xs text-red-400">لا تملك نقاط ولاء كافية.</p>}
                      {!canAffordCoins(clampInt(allegianceOffer, 0)) && <p className="text-xs text-red-400">لا تملك كوينز كافية لهذا العرض.</p>}
                  </Section>
              )}
              
              {!canPunish && !canRequestAllegiance && (
                <div className="p-3 rounded border border-slate-700 bg-slate-900/40 text-sm text-slate-300">
                  لا يمكنك معاقبة لاعب من نفس طبقتك. ارفع مستواك أو تفاعل مع لاعبين من طبقة أدنى.
                </div>
              )}

              {isPunishedByMe && (
                <div className="p-3 border border-green-500/50 rounded-lg space-y-2 bg-green-900/20">
                  <h4 className="font-bold text-center text-green-300">رفع العقوبة</h4>
                  <p className="text-xs text-center text-slate-300">أنت من عاقبت هذا اللاعب. يمكنك رفع العقوبة عنه.</p>
                  <Button className="w-full" variant="secondary" onClick={() => onLiftPunishment(target.uid)}>
                    العفو عند المقدرة
                  </Button>
                </div>
              )}

              {renderPunishmentCard(
                'إذلال عام',
                'can_send_global_taunt',
                getHonorCost,
                humiliationDuration,
                setHumiliationDuration,
                isAlreadyHumiliated,
                (
                  <>
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={humiliationTax}
                      onChange={(e) => setHumiliationTax(e.target.value)}
                      placeholder="ضريبة الخلاص (كوينز)..."
                      className="bg-slate-800 border-slate-600"
                    />
                    <Button
                      className="w-full"
                      variant="destructive"
                      title={!canAfford(getHonorCost(humiliationDuration)) ? 'لا تملك شرفًا كافيًا' : ''}
                      onClick={() => onHumiliate(target.uid, humiliationDuration, clampInt(humiliationTax, 0))}
                      disabled={isAlreadyHumiliated || !canAfford(getHonorCost(humiliationDuration))}
                    >
                      {isAlreadyHumiliated ? 'تم إذلاله بالفعل' : 'إذلال'}
                    </Button>
                  </>
                ),
              )}

              {renderPunishmentCard(
                'تغيير اللقب',
                'can_force_name_change',
                getHonorCost,
                decreeDuration,
                setDecreeDuration,
                !!((target.decrees || []).find((d) => d.until && new Date(d.until) > new Date())),
                (
                  <>
                    <Input
                      value={decreeTitle}
                      onChange={(e) => setDecreeTitle(e.target.value)}
                      placeholder="اللقب المهين المؤقت..."
                      className="bg-slate-800 border-slate-600"
                      maxLength={24}
                    />
                    <Button
                      className="w-full"
                      variant="destructive"
                      title={!canAfford(getHonorCost(decreeDuration)) ? 'لا تملك شرفًا كافيًا' : ''}
                      onClick={() => onIssueDecree(target.uid, decreeTitle.trim(), decreeDuration)}
                      disabled={!decreeTitle.trim() || !canAfford(getHonorCost(decreeDuration))}
                    >
                      تأكيد تغيير اللقب
                    </Button>
                  </>
                ),
              )}

              {renderPunishmentCard(
                'فرض شخصية',
                'can_force_avatar_change',
                getAvatarHonorCost,
                avatarPunishmentDuration,
                setAvatarPunishmentDuration,
                isAlreadyPunishedWithAvatar,
                (
                  <>
                    <Select value={selectedPunishmentAvatar} onValueChange={setSelectedPunishmentAvatar}>
                      <SelectTrigger className="bg-slate-800 border-slate-600">
                        <SelectValue placeholder="اختر شخصية عقاب..." />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 text-white border-purple-500">
                        {availablePunishmentAvatars.map((avatarId) => (
                          <SelectItem key={avatarId} value={avatarId}>
                            <div className="flex items-center gap-2">
                              <PlayerAvatar avatarId={avatarId} className="w-6 h-6 rounded-full" />
                              <span>{avatarId.replace('.png', '')}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={avatarPunishmentTax}
                      onChange={(e) => setAvatarPunishmentTax(e.target.value)}
                      placeholder="ضريبة الخلاص (كوينز)..."
                      className="bg-slate-800 border-slate-600"
                    />
                    <Button
                      className="w-full"
                      variant="destructive"
                      title={!canAfford(getAvatarHonorCost(avatarPunishmentDuration)) ? 'لا تملك شرفًا كافيًا' : ''}
                      onClick={() => onForceAvatar(target.uid, selectedPunishmentAvatar, avatarPunishmentDuration, clampInt(avatarPunishmentTax, 0))}
                      disabled={isAlreadyPunishedWithAvatar || !selectedPunishmentAvatar || !canAfford(getAvatarHonorCost(avatarPunishmentDuration))}
                    >
                      {isAlreadyPunishedWithAvatar ? 'عليه عقوبة شخصية بالفعل' : 'فرض الشخصية'}
                    </Button>
                  </>
                ),
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="w-full">إغلاق</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// —— Player card ——
const PlayerCard = ({ player, rank, onPlayerClick, colorClass }: { player: UserProfile; rank: SocialRank | null; onPlayerClick: (player: UserProfile) => void; colorClass: string }) => {
  const isHumiliated = !!(player.humiliation?.until && new Date(player.humiliation.until) > new Date());
  const hasPunishmentAvatar = !!(player.originalAvatarToRevert?.until && new Date(player.originalAvatarToRevert.until) > new Date());
  const currentDecree = (player.decrees || []).find((d) => d.until && new Date(d.until) > new Date());
  const titleToShow = currentDecree ? currentDecree.title : rank?.name;
  const isUnderProtection = !!player.allegiance?.to;
  const isPunished = isHumiliated || hasPunishmentAvatar;
  const RankIcon = rank?.icon ? RANK_ICON_MAP[rank.icon as string] || Trophy : Trophy;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPlayerClick(player);
    }
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`عرض تفاعل مع ${player.name}`}
      layoutId={`player-card-${player.uid}`}
      whileHover={{ scale: 1.04, zIndex: 10 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onPlayerClick(player)}
      onKeyDown={handleKey}
      className="group/card relative cursor-pointer aspect-[3/4.5] bg-slate-800/60 border border-purple-400/30 rounded-xl flex flex-col items-center justify-center p-2 text-center shadow-lg text-white overflow-hidden"
    >
      {/* Glow ring on hover */}
      <div
          className={cn("pointer-events-none absolute -inset-1 rounded-2xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 blur-md bg-gradient-to-tr via-transparent to-transparent", colorClass)}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/10 to-slate-900/50 opacity-50 group-hover/card:opacity-100 transition-opacity" />

      {isPunished && <Gavel className="w-5 h-5 text-destructive absolute top-1 left-1" title="خاضع لعقوبة" />}

      <PlayerAvatar avatarId={player.avatarId} className="w-20 h-20 rounded-full border-2 border-purple-400/50 shadow" />

      <h4 className="font-bold mt-2 truncate w-full flex items-center justify-center gap-1">
        {player.name}
      </h4>

      {titleToShow && (
          <Badge variant={currentDecree ? 'destructive' : 'secondary'} className="mt-1 inline-flex items-center gap-1.5">
              {RankIcon && !currentDecree && <RankIcon className="w-3 h-3"/>}
              {titleToShow}
          </Badge>
      )}

      <div className="flex items-center gap-2 mt-1">
        {isHumiliated && <ThumbsDown className="w-4 h-4 text-red-500" title="مُذل" />}
        {isUnderProtection && <Shield className="w-4 h-4 text-yellow-400" title={`تحت حماية ${player.allegiance?.toName}`} />}
      </div>

      {/* Stats */}
      <div className="absolute bottom-2 text-xs space-y-1 w-full px-1">
        <div className="flex justify-between items-center bg-black/25 p-1 rounded">
          <span>👑 الشرف</span>
          <span className="font-bold text-amber-300">{formatNumber(player.honorPoints || 0)}</span>
        </div>
        <div className="flex justify-between items-center bg-black/25 p-1 rounded">
          <span>🤝 الولاء</span>
          <span className="font-bold text-blue-300">{formatNumber(player.loyaltyPoints || 0)}</span>
        </div>
        <div className="flex justify-between items-center bg-black/25 p-1 rounded">
          <span>🔥 التمرد</span>
          <span className="font-bold text-red-400">{formatNumber(player.rebellionPoints || 0)}</span>
        </div>
      </div>

      {/* Hover overlay CTA */}
      <div className="absolute inset-x-2 bottom-2 opacity-0 group-hover/card:opacity-100 transition-opacity">
        <Button className="w-full" size="sm" variant="secondary">التفاعل</Button>
      </div>
    </motion.div>
  );
};

// —— Main ——
export default function SocietyPyramid({ searchTerm }: { searchTerm: string }) {
  const { userProfile, socialRanks, refreshUserProfile, getSocialRankForUser } = useAuth();
  const { toast } = useToast();
  const [playersByRank, setPlayersByRank] = useState<Record<string, UserProfile[]>>({});
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [selectedPlayer, setSelectedPlayer] = useState<UserProfile | null>(null);
  const [searchedPlayers, setSearchedPlayers] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Sort ranks ascending for ranges, descending for display (pyramid top first)
  const sortedRanksForIteration = useMemo(() => [...socialRanks].sort((a, b) => a.threshold - b.threshold), [socialRanks]);
  const sortedRanksForDisplay = useMemo(() => [...socialRanks].sort((a, b) => b.threshold - a.threshold), [socialRanks]);

  const fetchPlayersForRank = useCallback(async (minPoints: number, maxPoints: number | null, rankName: string) => {
    setIsLoading((prev) => ({ ...prev, [rankName]: true }));
    try {
      const players = await getUsersByRank(minPoints, maxPoints, 8);
      setPlayersByRank((prev) => ({ ...prev, [rankName]: players }));
    } catch (error) {
      console.error(`Failed to fetch players for rank ${rankName}:`, error);
    } finally {
      setIsLoading((prev) => ({ ...prev, [rankName]: false }));
    }
  }, []);

  // Initial fetch once
  useEffect(() => {
    if (socialRanks.length > 0 && Object.keys(playersByRank).length === 0) {
      sortedRanksForIteration.forEach((rank, index) => {
        const minPoints = rank.threshold;
        const maxPoints = index < sortedRanksForIteration.length - 1 ? sortedRanksForIteration[index + 1].threshold : null;
        fetchPlayersForRank(minPoints, maxPoints, rank.name);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socialRanks, sortedRanksForIteration, fetchPlayersForRank, playersByRank]);

  const handlePlayerClick = (player: UserProfile) => {
    if (player.uid !== userProfile?.uid) setSelectedPlayer(player);
  };

  const handleCloseModal = () => setSelectedPlayer(null);

  const refreshAllData = useCallback(async () => {
    if (socialRanks.length > 0) {
      for (const [index, rank] of sortedRanksForIteration.entries()) {
        const minPoints = rank.threshold;
        const maxPoints = index < sortedRanksForIteration.length - 1 ? sortedRanksForIteration[index + 1].threshold : null;
        await fetchPlayersForRank(minPoints, maxPoints, rank.name);
      }
    }
    if (refreshUserProfile) refreshUserProfile();
    handleCloseModal();
  }, [socialRanks, sortedRanksForIteration, fetchPlayersForRank, refreshUserProfile]);

  // —— Actions ——
  const handleHumiliate = async (targetId: string, durationInDays: number, taxToLift: number) => {
    if (!userProfile) return;
    const result = await humiliatePlayer(userProfile.uid, targetId, durationInDays, taxToLift);
    if (result.success) {
      toast({ title: 'تم بنجاح!', description: 'لقد قمت بإذلال اللاعب بنجاح.' });
      await refreshAllData();
    } else {
      toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
    }
  };

  const handleIssueDecree = async (targetId: string, title: string, durationInDays: number) => {
    if (!userProfile) return;
    const result = await issueDecree(userProfile.uid, targetId, title, durationInDays);
    if (result.success) {
      toast({ title: 'تم إصدار المرسوم!', description: 'تم تغيير لقب اللاعب مؤقتًا.' });
      await refreshAllData();
    } else {
      toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
    }
  };

  const handleForceAvatar = async (targetId: string, avatarId: string, durationInDays: number, taxToLift: number) => {
    if (!userProfile) return;
    const result = await forceAvatarChange(userProfile.uid, targetId, avatarId, durationInDays, taxToLift);
    if (result.success) {
      toast({ title: 'تم بنجاح!', description: 'تم تغيير شخصية اللاعب كعقوبة.' });
      await refreshAllData();
    } else {
      toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
    }
  };

  const handleLiftPunishment = async (targetId: string) => {
    if (!userProfile) return;
    const result = await liftPunishment(userProfile.uid, targetId);
    if (result.success) {
      toast({ title: 'تم رفع العقوبة بنجاح!' });
      await refreshAllData();
    } else {
      toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
    }
  };

  const handleRequestAllegiance = async (targetId: string, durationInDays: number, offerAmount: number) => {
      if (!userProfile) return;
      const result = await requestAllegiance(userProfile.uid, targetId, durationInDays, offerAmount);
      if (result.success) {
        toast({ title: 'تم إرسال الطلب', description: 'تم إرسال طلب الولاء بنجاح.' });
        handleCloseModal();
      } else {
        toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
      }
  };

  // —— Search ——
  const handleSearch = useCallback(async () => {
    if (searchTerm.trim().length < 2) {
      setSearchedPlayers([]);
      return;
    }
    setIsSearching(true);
    const users = await adminSearchUsers(searchTerm.trim());
    setSearchedPlayers(users);
    setIsSearching(false);
  }, [searchTerm]);

  useEffect(() => {
    const id = setTimeout(() => handleSearch(), 300);
    return () => clearTimeout(id);
  }, [handleSearch]);

  const actorCurrentRank = userProfile ? getSocialRankForUser(userProfile.leaderboardPoints) : null;
  const targetCurrentRank = selectedPlayer ? getSocialRankForUser(selectedPlayer.leaderboardPoints) : null;

  return (
    <>
      <div className="space-y-8" aria-live="polite" aria-busy={isSearching}>
        {searchTerm.trim().length > 1 ? (
          <Card className="bg-common-card">
            <CardHeader>
              <CardTitle className="text-purple-300">نتائج البحث</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {isSearching ? (
                <div className="flex items-center justify-center py-10 gap-3">
                  <Loader2 className="animate-spin" />
                  <span className="text-slate-400">جارِ البحث...</span>
                </div>
              ) : searchedPlayers.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4"
                >
                  {searchedPlayers.map((p) => (
                    <PlayerCard key={p.uid} player={p} rank={getSocialRankForUser(p.leaderboardPoints)} onPlayerClick={handlePlayerClick} colorClass="from-purple-500"/>
                  ))}
                </motion.div>
              ) : (
                <p className="text-center text-gray-500">لم يتم العثور على لاعبين.</p>
              )}
            </CardContent>
          </Card>
        ) : (
          sortedRanksForDisplay.map((rank, index) => {
            const playersInRank = playersByRank[rank.name] || [];
            const Icon = RANK_ICON_MAP[rank.icon as string] || Trophy;

            const cardStyle =
              index === 0 ? 'bg-top-rank-card' : index === 1 ? 'bg-second-rank-card' : index === 2 ? 'bg-third-rank-card' : 'bg-common-card';

            const titleStyle =
              index === 0 ? 'text-yellow-900' : index === 1 ? 'text-slate-900' : index === 2 ? 'text-orange-100' : 'text-purple-300';

            const iconStyle =
              index === 0 ? 'text-yellow-800' : index === 1 ? 'text-slate-800' : index === 2 ? 'text-orange-200' : 'text-amber-400';

            const borderStyle =
              index === 0 ? 'border-yellow-400/50' : index === 1 ? 'border-slate-400/50' : index === 2 ? 'border-amber-500/50' : 'border-purple-500/30';

            const colorClass = 
                index === 0 ? 'from-yellow-400' :
                index === 1 ? 'from-slate-400' :
                index === 2 ? 'from-orange-500' :
                'from-purple-500';

            return (
              <motion.div
                key={rank.name}
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 + index * 0.1 }}
              >
                <Card className={cn(cardStyle, 'rounded-2xl overflow-hidden')}> {/* softer corners */}
                  <CardHeader className={cn('border-b-2', borderStyle)}>
                    <CardTitle className={cn('flex items-center gap-4 text-2xl', titleStyle)}>
                      <Icon className={cn('w-8 h-8', iconStyle)} />
                      <span>
                        طبقة: {rank.name}
                        <span className="mx-2 text-xs font-normal text-slate-500">({formatNumber(rank.threshold)}+ نقطة)</span>
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {isLoading[rank.name] && playersInRank.length === 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                        {[...Array(8)].map((_, i) => (
                          <Skeleton key={i} className="w-full aspect-[3/4.5] bg-slate-700/50 animate-pulse rounded-lg" />
                        ))}
                      </div>
                    ) : playersInRank.length > 0 ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4"
                      >
                        {playersInRank.map((p) => (
                          <PlayerCard key={p.uid} player={p} rank={rank} onPlayerClick={handlePlayerClick} colorClass={colorClass} />
                        ))}
                      </motion.div>
                    ) : (
                      <p className="text-center text-gray-500 py-4">لا يوجد لاعبون في هذه الطبقة بعد.</p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      {selectedPlayer && userProfile && (
        <InteractionModal
          isOpen={!!selectedPlayer}
          onClose={handleCloseModal}
          actor={userProfile}
          target={selectedPlayer}
          actorRank={actorCurrentRank}
          targetRank={targetCurrentRank}
          onHumiliate={handleHumiliate}
          onIssueDecree={handleIssueDecree}
          onForceAvatar={handleForceAvatar}
          onLiftPunishment={handleLiftPunishment}
          onRequestAllegiance={handleRequestAllegiance}
        />
      )}
    </>
  );
}
