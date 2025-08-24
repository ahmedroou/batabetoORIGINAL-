"use client";

import type { Game, Player, PublicChatMessage, PrivateEvent } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Gavel, ShieldCheck, FileText, Send, Ban, X, VenetianMask, User, ArrowDown } from 'lucide-react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { processDay, sendPublicMessage, submitVote } from '@/lib/actions/behind-the-mask';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '../../PlayerAvatar';
import { Input } from '@/components/ui/input';
import { Timestamp } from 'firebase/firestore';
import { ROLES } from '@/data/mafia-roles';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';

/* -------------------------------------------------------------------------- */
/* Constants & helpers                                                         */
/* -------------------------------------------------------------------------- */

type QuickReaction = "👍" | "👎" | "🤔" | "🤫";
const QUICK_REACTIONS: QuickReaction[] = ["👍", "👎", "🤔", "🤫"];

const PLAYER_COLORS = [
  'text-red-400', 'text-blue-400', 'text-green-400', 'text-yellow-400',
  'text-purple-400', 'text-pink-400', 'text-indigo-400', 'text-teal-400'
];

const MS = {
  CHAT_MIN_INTERVAL: 950, // محليًا — أقل بقليل من السيرفر 1000ms
};

const formatTime = (total: number) => {
  const m = Math.floor(total / 60);
  const s = Math.max(0, total % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const isTimestamp = (v: any): v is Timestamp => v && typeof v?.toMillis === 'function';

/* -------------------------------------------------------------------------- */
/* Secret Report Modal                                                         */
/* -------------------------------------------------------------------------- */

const SecretReportCard = ({ event, onClose }: { event: PrivateEvent, onClose: () => void }) => {
  const prefersReducedMotion = useReducedMotion();
  const roleDetails = event.targetPlayer?.role ? ROLES[event.targetPlayer.role] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      aria-modal
      role="dialog"
      aria-label="تقرير سري"
    >
      <motion.div
        className="w-full max-w-sm"
        initial={{ scale: prefersReducedMotion ? 1 : 0.5, rotateY: prefersReducedMotion ? 0 : 90 }}
        animate={{ scale: 1, rotateY: 0 }}
        exit={{ scale: prefersReducedMotion ? 1 : 0.5, rotateY: prefersReducedMotion ? 0 : -90 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.4, type: 'spring' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Card className="bg-slate-800 border-yellow-500/50 text-white shadow-2xl overflow-hidden">
          <CardHeader className="bg-slate-900/50 p-4 border-b border-yellow-500/30">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-yellow-300">
                <FileText /> تقرير سري
              </CardTitle>
              <Button aria-label="إغلاق" variant="ghost" size="icon" className="text-slate-400 hover:text-white h-8 w-8" onClick={onClose}>
                <X/>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6 text-center space-y-4">
            <PlayerAvatar avatarId={event.targetPlayer?.avatarId || 'Avatar01.png'} className="w-32 h-32 mx-auto rounded-full border-4 border-yellow-400" />
            <h3 className="text-2xl font-bold">{event.targetPlayer?.name}</h3>
            <p className="text-lg text-slate-200 bg-black/30 p-3 rounded-md">{event.message}</p>
            {roleDetails && (
              <div className="flex items-center justify-center gap-2 p-2 bg-purple-900/50 rounded-lg">
                <VenetianMask className="w-5 h-5 text-purple-300" />
                <span className="font-bold text-purple-200">الدور: {roleDetails.name}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* Main Component                                                              */
/* -------------------------------------------------------------------------- */

interface DayPhaseProps {
  game: Game;
  self: Player;
}

type DisplayMessage = PublicChatMessage & { pending?: boolean };

export function DayPhaseAlt({ game, self }: DayPhaseProps) {
  const { toast } = useToast();
  const prefersReducedMotion = useReducedMotion();

  const [message, setMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState(180);
  const [optimisticMessages, setOptimisticMessages] = useState<DisplayMessage[]>([]);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hostActionPending, setHostActionPending] = useState(false);
  const [selectedReport, setSelectedReport] = useState<PrivateEvent | null>(null);

  // NEW: حالات للتحكم في الصندوق الثابت للمحادثة
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const privateEvents = game.mafiaState?.privateEvents?.[self.id] || [];
  const publicChat = game.mafiaState?.publicChat || [];
  const isHost = game.hostId === self.id;
  const canVote = self.status === 'alive';
  const votes = game.mafiaState?.votes || {};
  const phase = game.mafiaState?.phase || 'day';
  const isDayPhase = phase === 'day';
  const isVotingPhase = phase === 'voting';

  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const processedRef = useRef(false); // يمنع تكرار processDay عند انتهاء الوقت
  const lastSendAtRef = useRef<number>(0);
  const msgCountRef = useRef<number>(0);

  // Keep selected vote in sync with server state
  useEffect(() => {
    setSelectedVote(game.mafiaState?.votes?.[self.id] ?? null);
  }, [game.mafiaState?.votes, self.id]);

  const handleProcessDay = useCallback(async () => {
    if (!isHost || processedRef.current) return;
    try {
      setHostActionPending(true);
      await processDay(game.id, self.id);
      processedRef.current = true;
    } catch (e: any) {
      console.error('Host failed to process day on timeout', e);
    } finally {
      setHostActionPending(false);
    }
  }, [isHost, game.id, self.id]);

  // Global timer for both day & voting
  useEffect(() => {
    processedRef.current = false; // إعادة الضبط عندما يتغيّر مؤقّت السيرفر
    if (!game.mafiaState?.timerEndsAt) return;
    const endTime = game.mafiaState.timerEndsAt.toMillis();
    const updateTimer = () => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) handleProcessDay();
    };
    const timer = setInterval(updateTimer, 1_000);
    updateTimer();
    return () => clearInterval(timer);
  }, [game.mafiaState?.timerEndsAt, handleProcessDay]);

  // NEW: راقب التمرير لتحديد هل نحن في أسفل الصندوق أم لا
  useEffect(() => {
    const el = scrollViewportRef.current;
    if (!el) return;

    const onScroll = () => {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
      setIsAtBottom(atBottom);
      if (atBottom) setUnreadCount(0);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    // شغّل الحساب أول مرة
    onScroll();
    return () => el.removeEventListener('scroll', onScroll as any);
  }, []);

  // Scroll helper (ثابت الارتفاع + نزول تلقائي عند وصول آخر رسالة)
  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollViewportRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !prefersReducedMotion ? 'smooth' : 'auto' });
  }, [prefersReducedMotion]);

  // Auto-scroll على كل دفعة رسائل جديدة + عداد الرسائل غير المقروءة عندما لا نكون في الأسفل
  const allMessages: DisplayMessage[] = useMemo(() => (
    [...publicChat, ...optimisticMessages]
  ), [publicChat, optimisticMessages]);

  useEffect(() => {
    const total = allMessages.length;
    const delta = Math.max(0, total - msgCountRef.current);
    msgCountRef.current = total;

    // نزول تلقائي دائمًا حسب طلبك
    scrollToBottom(true);

    // لو المستخدم ليس في الأسفل، زوّد العداد
    if (!isAtBottom && delta > 0) setUnreadCount((c) => c + delta);
  }, [allMessages, isAtBottom, scrollToBottom]);

  const maybeScrollToBottom = useCallback((smooth: boolean) => {
    // إبقاء الدالة القديمة متاحة لمناداة اختيارية
    scrollToBottom(smooth);
  }, [scrollToBottom]);

  // Clear optimistic when server pushes latest (كي لا تتكرر)
  useEffect(() => { setOptimisticMessages([]); }, [publicChat]);

  const handleVote = async (targetId: string | null) => {
    if (!canVote) return;
    setIsSubmitting(true);
    const previous = selectedVote;
    setSelectedVote(targetId);
    try {
      await submitVote(game.id, self.id, targetId);
    } catch (error: any) {
      toast({ title: 'خطأ في التصويت', description: error?.message || 'تعذر إرسال التصويت', variant: 'destructive' });
      setSelectedVote(previous);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendMessage = async (content: string) => {
    if (!isDayPhase) {
      toast({ title: 'غير مسموح', description: 'يمكن التحدث فقط أثناء مرحلة النقاش (النهار).', variant: 'destructive' });
      return;
    }

    // تبريد محلي بسيط لتفادي رسالة السبام من السيرفر
    const now = Date.now();
    if (now - lastSendAtRef.current < MS.CHAT_MIN_INTERVAL) {
      toast({ title: 'تمهل قليلًا', description: 'الرجاء الانتظار لحظة قبل إرسال رسالة أخرى.', variant: 'default' });
      return;
    }

    const optimisticMessage: DisplayMessage = {
      senderId: self.id,
      senderName: self.name,
      message: content,
      timestamp: Timestamp.now(),
      pending: true,
    };
    setOptimisticMessages(prev => [...prev, optimisticMessage]);
    lastSendAtRef.current = now;

    try {
      await sendPublicMessage(game.id, { senderId: self.id, senderName: self.name, message: content });
    } catch (error: any) {
      toast({ title: 'فشل إرسال الرسالة', description: error?.message || 'تعذر الإرسال', variant: 'destructive' });
      setOptimisticMessages(prev => prev.filter(msg => msg !== optimisticMessage));
      // لا نعدّل lastSendAtRef هنا حتى لا نُعاقب المستخدم على فشل الإرسال
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const messageToSend = message.trim();
    if (!messageToSend || self.status !== 'alive') return;
    sendMessage(messageToSend);
    setMessage("");
  };

  const handleQuickReaction = (reaction: QuickReaction) => {
    if (self.status !== 'alive') return;
    // نسمح بالردود السريعة حتى أثناء قرب انتهاء الوقت، مع نفس التبريد
    sendMessage(reaction);
  };

  const playerColors = useMemo(() => game.players.reduce((acc, player, index) => {
    acc[player.id] = PLAYER_COLORS[index % PLAYER_COLORS.length];
    return acc;
  }, {} as Record<string, string>), [game.players]);

  const alivePlayers = useMemo(() => (
    game.players.filter(p => p.status === 'alive')
  ), [game.players]);

  const voteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(votes).forEach(targetId => {
      if (targetId) counts[targetId] = (counts[targetId] || 0) + 1;
    });
    return counts;
  }, [votes]);

  const headerTitle = isVotingPhase ? 'مرحلة التصويت' : 'مرحلة النقاش';

  return (
    <>
      <AnimatePresence>
        {selectedReport && <SecretReportCard event={selectedReport} onClose={() => setSelectedReport(null)} />}
      </AnimatePresence>

      <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-day-phase-bg bg-cover bg-center" data-phase={phase}>
        <header className="text-center shrink-0 mb-4 bg-black/40 p-2 rounded-xl text-white w-full max-w-7xl" aria-live="polite">
          <div className="flex items-center justify-center gap-4">
            <h1 className="text-2xl md:text-4xl font-bold">
              {headerTitle} ({formatTime(timeLeft)})
            </h1>
          </div>
        </header>

        <main className="w-full max-w-7xl flex-grow grid grid-cols-1 md:grid-cols-4 gap-4 min-h-0">
          {/* Voting Panel */}
          <div className="md:col-span-1 flex flex-col h-full space-y-4">
            <Card className="flex-grow bg-black/30 backdrop-blur-sm border-slate-700 text-white">
              <CardHeader className="p-3">
                <CardTitle className="flex items-center justify-center gap-2 text-red-400">
                  <Gavel/> ساحة الإعدام
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <ScrollArea className="h-[calc(80vh-200px)]">
                  <div className="space-y-2 pr-2">
                    {alivePlayers.map(player => (
                      <Button
                        key={player.id}
                        variant={selectedVote === player.id ? 'destructive' : 'secondary'}
                        className="w-full justify-between h-12"
                        onClick={() => handleVote(player.id)}
                        disabled={!canVote || isSubmitting}
                      >
                        <div className='flex items-center gap-2'>
                          <PlayerAvatar avatarId={player.avatarId} className="w-8 h-8"/>
                          <span>{player.name}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded-md text-xs">
                          <User className="w-3 h-3"/>
                          <span>{voteCounts[player.id] || 0}</span>
                        </div>
                      </Button>
                    ))}
                    <Button
                      variant={selectedVote === null ? 'destructive' : 'secondary'}
                      className="w-full justify-between h-12 bg-slate-600 hover:bg-slate-700"
                      onClick={() => handleVote(null)}
                      disabled={!canVote || isSubmitting}
                    >
                      <div className="flex items-center gap-2"><Ban className="w-8 h-8"/><span>تخطي</span></div>
                      <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded-md text-xs"><User className="w-3 h-3"/><span>{Object.values(votes).filter(v => v === null).length}</span></div>
                    </Button>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Chat & Tabs */}
          <div className="md:col-span-3 flex flex-col h-full bg-black/30 backdrop-blur-sm border-slate-500/50 text-white rounded-lg">
            <Tabs defaultValue="chat" className="flex flex-col h-full">
              <TabsList className="grid w-full grid-cols-3 shrink-0 bg-slate-800/50">
                <TabsTrigger value="chat">{isDayPhase ? 'النقاش العام' : 'سجل النقاش'}</TabsTrigger>
                <TabsTrigger value="events">أحداث الليلة</TabsTrigger>
                <TabsTrigger value="reports">التقارير السرية <Badge variant="destructive" className={cn("ml-2", privateEvents.length === 0 && "hidden")}>{privateEvents.length}</Badge></TabsTrigger>
              </TabsList>

              {/* Chat */}
              <TabsContent value="chat" className="flex-grow min-h-0 p-2">
                {/* صندوق محادثة ثابت الارتفاع */}
                <Card className="bg-gradient-to-br from-slate-900/60 to-slate-800/40 border-slate-700/60 shadow-xl rounded-2xl flex h-[60vh] md:h-[68vh]">
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* منطقة الرسائل */}
                    <CardContent className="p-0 flex-1 min-h-0 relative overflow-hidden">
                      <ScrollArea className="h-full pr-2" viewportRef={scrollViewportRef}>
                        <div className="p-3 space-y-4">
                          {allMessages.map((msg, i) => {
                            const isQuickReaction = QUICK_REACTIONS.includes(msg.message as QuickReaction);
                            const millis = isTimestamp(msg.timestamp) ? msg.timestamp.toMillis() : Number(msg.timestamp ?? 0);
                            const key = `${msg.senderId}-${millis}-${i}`;
                            const fromSelf = msg.senderId === self.id;
                            return (
                              <div key={key} className={cn("flex items-start gap-3 w-full transition-opacity", fromSelf ? "flex-row-reverse" : "", msg.pending ? "opacity-60" : "opacity-100")}> 
                                <PlayerAvatar avatarId={game.players.find(p => p.id === msg.senderId)?.avatarId || 'Avatar01.png'} className="w-9 h-9 shrink-0 mt-1 ring-2 ring-slate-700 rounded-full"/>
                                <div className={cn(
                                  "max-w-[78%] rounded-2xl px-3 py-2 shadow",
                                  fromSelf ? "bg-primary/90 rounded-br-none" : "bg-slate-700/80 rounded-bl-none",
                                  isQuickReaction ? "bg-transparent shadow-none px-1 py-1" : ""
                                )}> 
                                  {!isQuickReaction && <p className={cn("font-bold text-[11px] mb-1 tracking-wide", playerColors[msg.senderId])}>{msg.senderName}</p>}
                                  <p className={cn("text-[15px] leading-6 text-slate-100 break-words whitespace-pre-wrap", isQuickReaction ? "text-4xl" : "")}>{msg.message}</p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </ScrollArea>

                      {/* زر القفز لآخر الرسائل + عداد غير المقروء */}
                      <AnimatePresence>
                        {!isAtBottom && unreadCount > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="absolute bottom-4 inset-x-0 flex justify-center pointer-events-none"
                          >
                            <Button
                              type="button"
                              size="sm"
                              className="pointer-events-auto bg-slate-900/80 border border-slate-700 hover:bg-slate-800 rounded-full backdrop-blur flex items-center gap-2"
                              onClick={() => scrollToBottom(true)}
                            >
                              <ArrowDown className="w-4 h-4"/>
                              <span>انتقال لآخر {unreadCount} رسالة</span>
                            </Button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>

                    {/* أسفل الصندوق: تفاعلات سريعة + إدخال */}
                    <CardFooter className="border-t border-slate-700/60 p-3 space-y-2">
                      <div className="flex justify-center gap-2">
                        {QUICK_REACTIONS.map(r => (
                          <Button key={r} aria-label={`تفاعل ${r}`} variant="outline" size="icon" onClick={() => handleQuickReaction(r)} disabled={!canVote || !isDayPhase} className="bg-slate-800 border-slate-600 hover:bg-slate-700 text-2xl rounded-xl h-10 w-10">{r}</Button>
                        ))}
                      </div>
                      <form onSubmit={handleSendMessage} className="flex gap-2">
                        <Input
                          placeholder={isDayPhase ? (canVote ? "اكتب رسالتك..." : "لا يمكنك الحديث وأنت ميت.") : "الدردشة مغلقة أثناء التصويت"}
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          disabled={!canVote || !isDayPhase}
                          className="bg-slate-900/70 border-slate-600 focus:ring-primary text-base text-white rounded-xl"
                          aria-label="اكتب رسالتك"
                        />
                        <Button type="submit" size="icon" disabled={!message.trim() || !canVote || !isDayPhase} aria-label="إرسال" className="rounded-xl"><Send /></Button>
                      </form>
                    </CardFooter>
                  </div>
                </Card>
              </TabsContent>

              {/* Events */}
              <TabsContent value="events" className="flex-grow p-4">
                <ScrollArea className="h-full pr-2">
                  <div className="space-y-3">
                    {game.mafiaState?.events?.map((event, i) => {
                      if (event.type === 'death' && event.killedPlayer) {
                        return (
                          <Card key={`death-${i}`} className="bg-red-900/40 border-red-500/50 text-white overflow-hidden">
                            <CardHeader className='p-3'>
                              <CardTitle className="text-red-300 flex items-center gap-2">تقرير عام</CardTitle>
                            </CardHeader>
                            <CardContent className="p-3 text-center">
                              <div className="relative inline-block">
                                <PlayerAvatar avatarId={event.killedPlayer.avatarId} className="w-24 h-24 mx-auto rounded-full border-4 border-red-400/50" />
                                <div className="absolute inset-0 bg-red-500/30 rounded-full" style={{ clipPath: "polygon(0 40%, 100% 60%, 100% 100%, 0% 100%)" }}></div>
                              </div>
                              <p className="mt-2 text-lg font-bold">تم القضاء على: <span className="text-red-200">{event.killedPlayer.name}</span></p>
                              <p className="text-slate-300">{event.message}</p>
                            </CardContent>
                          </Card>
                        )
                      }
                      return (
                        <Alert key={`evt-${i}`} className="bg-slate-800 border-slate-600 text-white">
                          <ShieldCheck className="h-4 w-4 text-blue-400" />
                          <AlertTitle>{event.type === 'protection' ? 'خبر سار' : 'حدث جديد'}</AlertTitle>
                          <AlertDescription>{event.message}</AlertDescription>
                        </Alert>
                      )
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Private Reports */}
              <TabsContent value="reports" className="flex-grow p-4">
                <ScrollArea className="h-full pr-2">
                  {privateEvents.length > 0 ? (
                    <div className="space-y-2">
                      {privateEvents.map((event, index) => (
                        <Button
                          key={`rep-${index}`}
                          variant="outline"
                          className="w-full justify-start gap-2 bg-slate-800 border-purple-600 hover:bg-slate-700 text-white"
                          onClick={() => setSelectedReport(event)}
                        >
                          <FileText className="w-4 h-4 text-purple-400"/>
                          تقرير عن {event.targetPlayer?.name || 'لاعب'}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-center text-slate-400 h-full flex items-center justify-center">لا توجد تقارير لك.</p>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </>
  );
}
