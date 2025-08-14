"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { UserProfile } from '@/types';
import { getAllUsers, getTopPunisher } from '@/lib/actions/user';
import { Loader2, Gavel, Hammer, Search, X, Clock } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ------------------------------------
// Helpers
// ------------------------------------
function getActivePunishment(player: UserProfile) {
  const now = new Date();
  const humiliationActive = player.humiliation?.until && new Date(player.humiliation.until) > now ? player.humiliation : null;
  const avatarActive = player.originalAvatarToRevert?.until && new Date(player.originalAvatarToRevert.until) > now ? player.originalAvatarToRevert : null;
  const decreeActive = (player.decrees || []).find(d => d.until && new Date(d.until) > now) || null;

  if (humiliationActive) return { type: 'إذلال', by: humiliationActive.byName, until: humiliationActive.until };
  if (avatarActive) return { type: 'تغيير شخصية', by: avatarActive.byName, until: avatarActive.until };
  if (decreeActive) return { type: `لقب مهين: ${decreeActive.title}` as const, by: decreeActive.issuedByName, until: decreeActive.until };
  return null;
}

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  show: (i: number) => ({ opacity: 1, y: 0, scale: 1, transition: { delay: i * 0.04, type: 'spring', stiffness: 160, damping: 18 } }),
};

// ------------------------------------
// Top Punisher Card
// ------------------------------------
const TopPunisherCard = ({ punisher }: { punisher: UserProfile | null }) => {
  if (!punisher) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
      <Card className="bg-gradient-to-tr from-red-900 via-gray-900 to-black border-2 border-red-500/50 shadow-2xl shadow-red-900/40">
        <CardHeader className="text-center">
          <Hammer className="w-16 h-16 text-red-400 mx-auto" />
          <CardTitle className="text-2xl text-red-300">جلاد المجتمع</CardTitle>
          <CardDescription className="text-gray-300/80">أكثر اللاعبين تشديدًا للعقوبات هذا الأسبوع</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-2">
          <div className="relative">
            <PlayerAvatar avatarId={punisher.avatarId} className="w-24 h-24 rounded-full border-4 border-red-400 shadow-lg" />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ boxShadow: '0 0 40px rgba(239,68,68,.25) inset' }}
            />
          </div>
          <h3 className="text-2xl font-extrabold text-white">{punisher.name}</h3>
          <p className="font-bold text-lg text-red-400">عاقب {punisher.punishmentsIssued || 0} لاعبًا</p>
        </CardContent>
      </Card>
    </motion.div>
  );
};

// ------------------------------------
// Prisoner Card
// ------------------------------------
function PrisonerCard({ player, index }: { player: UserProfile; index: number }) {
  const punishment = getActivePunishment(player);
  return (
    <motion.div
      custom={index}
      variants={itemVariants}
      initial="hidden"
      animate="show"
      className="relative p-3 bg-gray-900/70 border-2 border-gray-700/50 rounded-lg text-center flex flex-col items-center shadow-lg focus-within:ring-2 focus-within:ring-red-500/50"
      role="listitem"
    >
      <div className="relative w-24 h-24 mb-2">
        <PlayerAvatar avatarId={player.avatarId} className="w-full h-full rounded-full border-4 border-destructive filter grayscale" />
        {/* Prison bars overlay */}
        <div
          className="absolute inset-0 rounded-full"
          aria-hidden
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 2px, transparent 2px, transparent 10px)',
          }}
        />
      </div>
      <h4 className="font-bold mt-2 truncate w-full text-white" title={player.name}>
        {player.name}
      </h4>
      {punishment ? (
        <div className="text-xs text-center mt-2 space-y-1 w-full">
          <p className="text-red-300 font-semibold px-2 py-1 bg-red-900/40 rounded-full truncate">بواسطة: {punishment.by}</p>
          <p className="text-yellow-300 font-semibold px-2 py-1 bg-yellow-900/40 rounded-full truncate">النوع: {punishment.type}</p>
          <p className="text-gray-300 font-semibold text-xs mt-1 flex items-center justify-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            تنتهي {formatDistanceToNow(new Date(punishment.until), { addSuffix: true, locale: ar })}
          </p>
        </div>
      ) : (
        <p className="text-xs text-gray-400 mt-2">— لا عقوبة فعّالة —</p>
      )}
    </motion.div>
  );
}

// ------------------------------------
// Main Component
// ------------------------------------
export default function SocietyPrison() {
  const [allPrisoners, setAllPrisoners] = useState<UserProfile[]>([]);
  const [filteredPrisoners, setFilteredPrisoners] = useState<UserProfile[]>([]);
  const [topPunisher, setTopPunisher] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'timeLeft' | 'name'>('timeLeft');
  const [visibleCount, setVisibleCount] = useState(16);

  const fetchPrisonData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [prisoners, punisher] = await Promise.all([
        getAllUsers('punished', 30),
        getTopPunisher(),
      ]);
      setAllPrisoners(prisoners);
      setFilteredPrisoners(prisoners);
      setTopPunisher(punisher);
    } catch (e) {
      console.error('Failed to fetch prison data:', e);
      setError('تعذر تحميل بيانات السجن. حاول لاحقًا.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrisonData();
  }, [fetchPrisonData]);

  // Debounced search (client-side over the initially fetched set for snappy UX)
  useEffect(() => {
    const id = setTimeout(() => {
      const q = searchTerm.trim().toLowerCase();
      if (!q) {
        setFilteredPrisoners(allPrisoners);
        setVisibleCount(16);
        return;
      }
      const filtered = allPrisoners.filter((p) => p.name.toLowerCase().includes(q));
      setFilteredPrisoners(filtered);
      setVisibleCount(Math.max(16, filtered.length));
    }, 250);
    return () => clearTimeout(id);
  }, [searchTerm, allPrisoners]);

  // Sorting derived list
  const sortedPrisoners = useMemo(() => {
    const list = [...filteredPrisoners];
    if (sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'ar')); // Arabic-friendly sort
    } else {
      // timeLeft: soonest to expire first
      const timeOf = (p: UserProfile) => {
        const punishment = getActivePunishment(p);
        return punishment ? new Date(punishment.until).getTime() : Number.POSITIVE_INFINITY;
      };
      list.sort((a, b) => timeOf(a) - timeOf(b));
    }
    return list;
  }, [filteredPrisoners, sortBy]);

  const displayPrisoners = sortedPrisoners.slice(0, visibleCount);
  const canShowMore = visibleCount < sortedPrisoners.length && !searchTerm;

  return (
    <div className="w-full">
      <TopPunisherCard punisher={topPunisher} />

      <Card className="bg-black border-red-900/80 text-white backdrop-blur-sm shadow-2xl shadow-red-900/40 flex flex-col h-full">
        <CardHeader className="text-center space-y-4">
          <div>
            <CardTitle className="text-3xl text-red-400 flex items-center justify-center gap-3">
              <Gavel className="w-10 h-10" />
              سجل العار
            </CardTitle>
            <CardDescription className="text-gray-400">اللاعبون الخاضعون حاليًا لعقوبة.</CardDescription>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 max-w-3xl mx-auto w-full">
            <div className="relative flex-1">
              <Input
                placeholder="ابحث عن سجين بالاسم..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-gray-800/70 border-red-500/50 text-white focus-visible:ring-red-500/60 pr-10"
                aria-label="بحث"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              {searchTerm && (
                <button
                  aria-label="مسح البحث"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-200"
                  onClick={() => setSearchTerm('')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="w-full sm:w-56">
              <Select value={sortBy} onValueChange={(v: 'timeLeft' | 'name') => setSortBy(v)}>
                <SelectTrigger className="bg-gray-800/70 border-red-500/50 text-white">
                  <SelectValue placeholder="ترتيب حسب" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 text-white border-red-500/50">
                  <SelectItem value="timeLeft">الأقرب لانتهاء العقوبة</SelectItem>
                  <SelectItem value="name">الاسم (ألفبائي)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="sr-only" aria-live="polite">عدد النتائج: {sortedPrisoners.length}</p>
        </CardHeader>

        <CardContent className="flex-grow">
          {isLoading ? (
            <div className="flex justify-center items-center h-full py-10">
              <Loader2 className="w-12 h-12 animate-spin text-red-400" />
            </div>
          ) : error ? (
            <div className="text-center py-10 text-red-300">{error}</div>
          ) : sortedPrisoners.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" role="list">
                {displayPrisoners.map((player, index) => (
                  <PrisonerCard key={player.uid} player={player} index={index} />
                ))}
              </div>
              {canShowMore && (
                <div className="flex justify-center mt-6">
                  <button
                    className="px-5 py-2 rounded-md border border-red-500/60 hover:border-red-400 text-red-300 hover:text-white bg-red-900/30 hover:bg-red-800/40 transition-colors"
                    onClick={() => setVisibleCount((c) => c + 16)}
                  >
                    عرض المزيد
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-10 text-gray-500 h-full flex flex-col justify-center items-center">
              <Gavel className="w-20 h-20 text-gray-700" />
              <p className="text-lg mt-4">
                {searchTerm ? 'لم يتم العثور على سجناء بهذا الاسم.' : 'غرفة العقاب فارغة حاليًا.'}
              </p>
              {!searchTerm && <p>يبدو أن الجميع يتصرفون بلطف!</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
