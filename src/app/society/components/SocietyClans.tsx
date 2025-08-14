
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Clan, UserProfile } from '@/types';
import { getClans, createClan } from '@/lib/actions/clans';
import { Loader2, Users, Crown, Shield, User, PlusCircle, RefreshCw, Search, Award } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

// ————————————————————————————————————————————
// Create / Manage Clan Dialogs
// ————————————————————————————————————————————
function ClanManagementDialogs({ userProfile, onCreated }: { userProfile: UserProfile | null; onCreated: () => void }) {
  const { toast } = useToast();
  const [isCreateClanOpen, setIsCreateClanOpen] = useState(false);
  const [clanName, setClanName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nameError = useMemo(() => {
    const trimmed = clanName.trim();
    if (!trimmed) return '';
    if (trimmed.length < 2) return 'الاسم قصير جدًا';
    if (trimmed.length > 24) return 'الاسم طويل جدًا (الحد 24)';
    // عربي/إنجليزي/أرقام/مسافة فقط
    if (!/^[\p{L}\p{N} ]+$/u.test(trimmed)) return 'يسمح بالحروف والأرقام والمسافات فقط';
    return '';
  }, [clanName]);

  const canSubmit = !!userProfile && !!clanName.trim() && !nameError && (userProfile.coins || 0) >= 5 && !isSubmitting;

  const handleCreateClan = async () => {
    if (!canSubmit || !userProfile) {
      toast({ title: 'تعذّر الإنشاء', description: nameError || 'تحقق من الرصيد والاسم', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    const result = await createClan(userProfile.uid, clanName.trim());
    if (result.success) {
      toast({ title: 'تم إنشاء الفريق بنجاح!' });
      setIsCreateClanOpen(false);
      setClanName('');
      onCreated();
    } else {
      toast({ title: 'خطأ في الإنشاء', description: result.error, variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  return (
    <>
      {!userProfile?.clan ? (
        <Dialog open={isCreateClanOpen} onOpenChange={setIsCreateClanOpen}>
          <DialogTrigger asChild>
            <Button className="bg-purple-600 hover:bg-purple-700 gap-2">
              <PlusCircle className="ml-0" />
              أنشئ فريقك
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-950 border-purple-500/50 text-white shadow-2xl">
            <DialogHeader>
              <DialogTitle>إنشاء فريق جديد</DialogTitle>
              <DialogDescription className="text-gray-400">
                التأسيس يكلف <span className="text-purple-300 font-semibold">5 كوينز</span>. اختر اسمًا واضحًا ومميزًا.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="clan-name">اسم الفريق</Label>
                <Input
                  id="clan-name"
                  value={clanName}
                  onChange={(e) => setClanName(e.target.value)}
                  placeholder="مثال: فرسان الشمال"
                  className={cn('bg-gray-900 border-gray-700 text-white', nameError && 'border-red-500 focus-visible:ring-red-500')}
                />
                <div className="flex items-center justify-between text-xs">
                  <span className={cn('h-4', nameError ? 'text-red-400' : 'text-transparent')}>{nameError || 'placeholder'}</span>
                  <span className={cn('tabular-nums', clanName.length > 24 ? 'text-red-400' : 'text-gray-400')}>{clanName.trim().length}/24</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateClanOpen(false)}>إلغاء</Button>
              <Button onClick={handleCreateClan} disabled={!canSubmit} className="bg-purple-600 hover:bg-purple-700">
                {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد الإنشاء (5 كوينز)'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <Button className="bg-purple-600/70 hover:bg-purple-700/80" disabled>
          <Users className="ml-2" />
          إدارة فريقي (قريبًا)
        </Button>
      )}
    </>
  );
}

// ————————————————————————————————————————————
// Main Clans Listing
// ————————————————————————————————————————————
export default function SocietyClans() {
  const { userProfile } = useAuth();
  const [clans, setClans] = useState<Clan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchClans = useCallback(async () => {
    setIsLoading(true);
    const fetchedClans = await getClans();
    setClans(fetchedClans.clans);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchClans();
  }, [fetchClans]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...clans].sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
    if (!q) return sorted;
    return sorted.filter((c) => c.name.toLowerCase().includes(q));
  }, [clans, query]);

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.45, ease: 'easeOut' } }),
  } as const;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ClanManagementDialogs userProfile={userProfile} onCreated={fetchClans} />
          <Button variant="outline" onClick={fetchClans} className="gap-2 border-purple-500/40 text-purple-200 hover:text-white hover:bg-purple-500/10">
            <RefreshCw className="w-4 h-4" /> تحديث القائمة
          </Button>
        </div>
        <div className="relative w-full md:w-80">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن فريق..."
            className="bg-gray-900/80 border-purple-500/40 text-white pl-10"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        </div>
      </div>

      {/* Header Banner */}
      <Card className="bg-gradient-to-r from-purple-900/70 via-gray-900/70 to-black/70 border border-purple-700/40 text-white overflow-hidden">
        <CardHeader className="relative">
          <div className="absolute -inset-1 opacity-20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-500 via-fuchsia-500 to-cyan-400 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <Award className="w-8 h-8 text-purple-300" />
            <div>
              <CardTitle className="text-2xl">لوحة شرف الفرق</CardTitle>
              <CardDescription className="text-gray-300">ترتيب تنازلي حسب مجموع النقاط</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="w-full h-28 bg-gray-900/60 border-gray-800 animate-pulse">
                <CardContent className="p-4 flex items-center gap-4">
                  <Skeleton className="w-12 h-12 bg-gray-800 rounded-full" />
                  <div className="flex-grow space-y-2">
                    <Skeleton className="h-6 w-3/4 bg-gray-800" />
                    <Skeleton className="h-4 w-1/2 bg-gray-800" />
                  </div>
                  <Skeleton className="w-20 h-8 bg-gray-800" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          filtered.map((clan, index) => {
            const color = clan.color || '#8b5cf6';
            const topClass =
              index === 0 ? 'ring-2 ring-yellow-400/60 shadow-yellow-400/20' :
              index === 1 ? 'ring-2 ring-slate-300/60 shadow-slate-300/20' :
              index === 2 ? 'ring-2 ring-amber-500/60 shadow-amber-500/20' : 'ring-1 ring-purple-500/20';
            const RoleIcon = (role: string) => (role === 'leader' ? Crown : role === 'officer' ? Shield : User);

            const isExpanded = expandedId === clan.id;

            return (
              <motion.div key={clan.id} custom={index} variants={cardVariants} initial="hidden" animate="visible">
                <Card
                  className={cn(
                    'group border-0 bg-gray-900/60 text-white shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden',
                    topClass
                  )}
                >
                  <CardContent className="p-5">
                    {/* Row */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : clan.id)}
                      className="w-full text-left"
                      aria-expanded={isExpanded}
                      aria-controls={`clan-panel-${clan.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-2xl font-bold w-8 text-center text-gray-400 tabular-nums">{index + 1}</div>
                        <div className="relative w-14 h-14 flex-shrink-0">
                          <div className="absolute -inset-0.5 rounded-full opacity-30 blur-md"
                               style={{ background: `radial-gradient(60% 60% at 50% 50%, ${color}66 0%, transparent 70%)` }} />
                          <PlayerAvatar avatarId={clan.emblem || 'Avatar000.png'} className="w-14 h-14 p-1 rounded-full border-2 border-gray-800" />
                        </div>
                        <div className="flex-grow min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold truncate" style={{ color }}>{clan.name}</h3>
                            {index < 3 && (
                              <span className={cn('px-2 py-0.5 text-xs rounded-full', index === 0 ? 'bg-yellow-500/20 text-yellow-300' : index === 1 ? 'bg-gray-300/20 text-gray-200' : 'bg-amber-500/20 text-amber-200')}
                              >الأفضل #{index + 1}</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-400">مجموع النقاط: <span className="text-gray-200 font-semibold">{clan.totalPoints}</span></p>
                        </div>
                        <div className="hidden md:flex -space-x-3">
                          {clan.members.slice(0, 5).map((member) => {
                            const Icon = RoleIcon(member.role);
                            return (
                              <div key={member.id} className="relative">
                                <PlayerAvatar avatarId={member.avatarId} className="w-10 h-10 border-2 border-gray-900 rounded-full" />
                                <div className="absolute -bottom-1 -right-1 bg-gray-900 rounded-full p-0.5 shadow">
                                  <Icon className={cn('w-4 h-4', member.role === 'leader' ? 'text-yellow-400' : member.role === 'vice-leader' ? 'text-gray-300' : 'text-gray-500')} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                          <span className="text-xs text-gray-400">أعضاء</span>
                          <span className="px-2 py-1 rounded-md bg-gray-800 text-gray-200 tabular-nums">{clan.members.length}</span>
                        </div>
                      </div>
                    </button>

                    {/* Expandable panel */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          id={`clan-panel-${clan.id}`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                          className="mt-4 border-t border-gray-800 pt-4"
                        >
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {clan.members.map((m) => {
                              const Icon = RoleIcon(m.role);
                              const colorClass = m.role === 'leader' ? 'text-yellow-300' : m.role === 'vice-leader' ? 'text-gray-300' : 'text-purple-300/70';
                              return (
                                <div key={m.id} className="flex items-center gap-2 bg-gray-900/60 border border-gray-800 rounded-md p-2">
                                  <PlayerAvatar avatarId={m.avatarId} className="w-8 h-8 rounded-full border border-gray-800" />
                                  <div className="min-w-0">
                                    <p className="text-sm truncate">{m.name}</p>
                                    <div className="flex items-center gap-1 text-xs text-gray-400">
                                      <Icon className={cn('w-3.5 h-3.5', colorClass)} />
                                      <span>{m.role === 'leader' ? 'قائد' : m.role === 'vice-leader' ? 'نائب' : 'عضو'}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        ) : (
          <Card className="bg-gray-900/60 border border-purple-500/30 text-white">
            <CardContent className="py-14 text-center space-y-3">
              <Users className="w-12 h-12 mx-auto text-purple-300" />
              <CardTitle className="text-2xl">لا توجد فرق متاحة بعد</CardTitle>
              <p className="text-gray-400">كن أول من يؤسس فريقًا أسطوريًا ويقود الأعضاء نحو القمة!</p>
              <div className="pt-2">
                <ClanManagementDialogs userProfile={userProfile} onCreated={fetchClans} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
