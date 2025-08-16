"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Game, Player, PlayerRole, NightAction, PrivateChat } from '@/types';
import { Button } from '@/components/ui/button';
import { ROLES } from '@/data/mafia-roles';
import { PlayerAvatar } from '../../PlayerAvatar';
import { submitNightAction, processNight, sendPrivateMessage } from '@/lib/actions/behind-the-mask';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, Bed, Shield, Search, Eye, Bomb, VenetianMask, Send, ArrowRight, ChevronDown, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';

interface NightPhaseProps {
  game: Game;
  self: Player;
}

// Map role → action
const ACTION_ICONS: Record<string, React.ElementType> = {
  kill: Bed,
  heal: Shield,
  investigate: Search,
  spy: Eye,
  bomb: Bomb,
  shapeshift: VenetianMask,
};

const getActionTypeForRole = (role: PlayerRole): NightAction['action'] | null => {
  switch (role) {
    case 'killer':
      return 'kill';
    case 'doctor':
      return 'heal';
    case 'detective':
      return 'investigate';
    case 'spy':
      return 'spy';
    case 'bomber':
      return 'bomb';
    case 'shapeshifter':
      return 'shapeshift';
    default:
      return null;
  }
};

// Passive roles (no active night action)
const ROLES_WITH_NO_NIGHT_ACTION: PlayerRole[] = ['civilian', 'soldier'];

export function NightPhase({ game, self }: NightPhaseProps) {
  const { toast } = useToast();
  const isHost = game.hostId === self.id;
  const isAlive = self.status === 'alive';

  // Respect server-configured duration; fallback to 25s for safety
  const nightDuration = game.mafiaState?.settings?.nightTime ?? 25;

  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedDisguise, setSelectedDisguise] = useState<PlayerRole | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingNight, setIsProcessingNight] = useState(false);
  const [timeLeft, setTimeLeft] = useState(nightDuration);

  const [chatMessage, setChatMessage] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const timeoutProcessed = useRef(false);

  const myRoleDetails = self.role ? ROLES[self.role] : null;
  const myActionType = myRoleDetails ? getActionTypeForRole(myRoleDetails.id as PlayerRole) : null;
  const phase = game.mafiaState?.phase;
  const hasSubmittedAction = !!game.mafiaState?.nightActions?.[self.id];

  const currentNight = game.mafiaState?.night || 1;
  const lastUsedNight = game.mafiaState?.lastAbilityUse?.[self.id] || 0;
  const isOnCooldown = (myActionType === 'kill' || myActionType === 'investigate') && currentNight === lastUsedNight + 1;

  // Players you can target (doctor can self-target; others cannot)
  const targetablePlayers = useMemo(() => {
    return game.players.filter((p) => {
      if (p.status !== 'alive') return false;
      if (myActionType !== 'heal' && p.id === self.id) return false;
      return true;
    });
  }, [game.players, myActionType, self.id]);

  // Options for shapeshifter disguise (intentionally limited to town-facing roles)
  const disguiseOptions: PlayerRole[] = ['doctor', 'detective', 'soldier', 'civilian'];

  // Find any private chat that includes me (created after spy vs mafia interactions)
  const myPrivateChat: { id: string; chat: PrivateChat } | null = useMemo(() => {
    const chats = game.mafiaState?.privateChats || {};
    const entry = Object.entries(chats).find(([_, chat]) => chat.participants.includes(self.id));
    return entry ? { id: entry[0], chat: entry[1] } : null;
  }, [game.mafiaState?.privateChats, self.id]);

  // Auto-scroll chat viewport when messages change
  useEffect(() => {
    if (scrollViewportRef.current) {
      scrollViewportRef.current.scrollTo({ top: scrollViewportRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [myPrivateChat?.chat.messages]);

  // Host can process night (once) on timeout or if everyone finished
  const handleProcessNight = useCallback(async () => {
    if (!isHost || timeoutProcessed.current) return;
    timeoutProcessed.current = true;
    setIsProcessingNight(true);
    try {
      await processNight(game.id, self.id);
    } catch (e: any) {
      console.error('Failed to process night:', e);
      toast({ title: 'خطأ', description: e?.message || 'فشل في إنهاء الليل.', variant: 'destructive' });
      timeoutProcessed.current = false; // allow retry
    }
  }, [game.id, isHost, self.id, toast]);

  // Countdown based on server timerEndsAt
  useEffect(() => {
    if (!game.mafiaState?.timerEndsAt) return;
    const endTime = game.mafiaState.timerEndsAt.toMillis();

    const tick = () => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) handleProcessNight();
    };

    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [game.mafiaState?.timerEndsAt, handleProcessNight]);

  // Compute progress: submitted players + passive roles
  const { totalAlivePlayers, submittedCount, progress, allDone } = useMemo(() => {
    const alive = game.players.filter((p) => p.status === 'alive');
    const total = alive.length;
    const passive = alive.filter((p) => p.role && ROLES_WITH_NO_NIGHT_ACTION.includes(p.role)).length;
    const submitted = Object.keys(game.mafiaState?.nightActions || {}).length + passive;
    const pct = total > 0 ? (submitted / total) * 100 : 0;
    return { totalAlivePlayers: total, submittedCount: submitted, progress: pct, allDone: submitted === total };
  }, [game.players, game.mafiaState?.nightActions]);

  // If everyone is done early, host proceeds automatically
  useEffect(() => {
    if (allDone) handleProcessNight();
  }, [allDone, handleProcessNight]);

  const timeIsUp = timeLeft <= 0;
  const canHostProceed = isHost && (allDone || timeIsUp);
  const timeProgress = Math.max(0, Math.min(100, (timeLeft / (nightDuration || 1)) * 100));

  const minutesLeft = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const secondsLeft = (timeLeft % 60).toString().padStart(2, '0');

  const handleTargetSelection = (targetId: string) => {
    if (hasSubmittedAction || isSubmitting || !isAlive || timeIsUp) return;
    setSelectedTargetId(targetId);
  };

  const handleSubmit = async (isSkip = false) => {
    if (hasSubmittedAction || !isAlive || !myActionType) return;

    // Build action
    let finalAction: NightAction | null = null;

    if (isSkip) {
      // Skip is only meaningful for kill/investigate or when forced by cooldown
      if (!(myActionType === 'kill' || myActionType === 'investigate' || isOnCooldown)) {
        toast({ title: 'لا يمكن التخطي لهذا الدور', variant: 'destructive' });
        return;
      }
      finalAction = { actorId: self.id, action: myActionType, targetId: 'skip' };
    } else if (myActionType === 'shapeshift') {
      if (!selectedDisguise) {
        toast({ title: 'اختر شخصية للتنكر', variant: 'destructive' });
        return;
      }
      finalAction = { actorId: self.id, action: 'shapeshift', targetId: self.id, disguiseRole: selectedDisguise };
    } else {
      if (!selectedTargetId) {
        toast({ title: 'اختر هدفًا أولًا', variant: 'destructive' });
        return;
      }
      // Prevent doctor from selecting the same target consecutively (UI hint only; server enforces)
      if (myActionType === 'heal' && selectedTargetId === game.mafiaState?.lastHealedPlayerId) {
        toast({ title: 'لا يمكنك حماية نفس اللاعب مرتين على التوالي.', variant: 'destructive' });
        return;
      }
      finalAction = { actorId: self.id, action: myActionType, targetId: selectedTargetId };
    }

    setIsSubmitting(true);
    try {
      const res = await submitNightAction(game.id, finalAction);
      if (res.success) {
        toast({ title: 'تم تسجيل قرارك بنجاح.' });
        // keep buttons disabled; await state update from server
      } else {
        toast({ title: 'خطأ', description: res.error, variant: 'destructive' });
        setIsSubmitting(false); // allow retry
      }
    } catch (e: any) {
      console.error(e);
      toast({ title: 'خطأ', description: 'فشل إرسال القرار.', variant: 'destructive' });
      setIsSubmitting(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !myPrivateChat || !isAlive) return;
    setIsSendingMessage(true);
    try {
      await sendPrivateMessage(game.id, myPrivateChat.id, {
        senderId: self.id,
        senderName: self.name,
        message: chatMessage.trim(),
      });
      setChatMessage('');
    } catch (error: any) {
      toast({ title: 'فشل إرسال الرسالة', description: error?.message, variant: 'destructive' });
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Fallback/waiting UI if not in night phase (defensive)
  if (phase !== 'night') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white text-center">
        <p className="text-lg text-muted-foreground">بانتظار بداية الليل...</p>
      </div>
    );
  }

  // Passive roles / dead players see a watcher screen
  if (!myRoleDetails || (self.role && ROLES_WITH_NO_NIGHT_ACTION.includes(self.role)) || !isAlive) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white text-center relative overflow-hidden">
        <h1 className="text-4xl font-bold z-10">{!isAlive ? 'أنت تراقب من بعيد' : 'حل الظلام...'}</h1>
        <p className="text-xl text-muted-foreground mt-2 animate-pulse z-10">{!isAlive ? 'لا يمكنك المشاركة الآن.' : 'أنت نائم... في انتظار مرور الليل.'}</p>
        <p className="font-mono text-2xl mt-4 z-10">{minutesLeft}:{secondsLeft}</p>
        {canHostProceed && (
          <Button onClick={handleProcessNight} disabled={isProcessingNight} size="sm" className="absolute bottom-10 z-20">
            {isProcessingNight ? <Loader2 className="animate-spin" /> : <ArrowRight />}
            الانتقال للنهار
          </Button>
        )}
      </div>
    );
  }

  const ActionIcon = ACTION_ICONS[myActionType!] || Bed;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white relative overflow-hidden">
      <div className="absolute top-4 z-10 w-full max-w-4xl px-4">
        <div className="flex justify-between items-center gap-4">
          <div className="w-1/3">
            <h3 className="font-bold text-xs text-center mb-1">التقدم</h3>
            <Progress value={progress} className="w-full h-2 bg-slate-700" />
            <span className="text-xs text-center block">{submittedCount}/{totalAlivePlayers}</span>
          </div>
          <p className="font-mono text-2xl">{minutesLeft}:{secondsLeft}</p>
          <div className="w-1/3 text-left">
            {isHost && (
              <Button onClick={handleProcessNight} disabled={!canHostProceed || isProcessingNight} size="sm">
                {isProcessingNight ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                الانتقال للنهار
              </Button>
            )}
          </div>
        </div>
        <Progress value={timeProgress} className={cn('w-full h-1 mt-2 bg-slate-700', timeLeft < 10 && '[&>*]:bg-red-500 [&>*]:animate-pulse')} />
      </div>

      <AnimatePresence mode="wait">
        {hasSubmittedAction ? (
          <motion.div key="submitted" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center z-10">
            <CheckCircle className="w-24 h-24 text-green-400 mx-auto mb-4" />
            <h1 className="text-3xl font-bold">تم تسجيل قرارك</h1>
            <p className="text-lg text-muted-foreground mt-2 animate-pulse">في انتظار بقية اللاعبين...</p>
          </motion.div>
        ) : (
          <motion.div key="action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-4xl z-10">
            <div className="text-center mb-6">
              <ActionIcon className="w-16 h-16 text-primary mx-auto mb-2" />
              <h1 className="text-4xl font-bold">دورك الآن يا {myRoleDetails.name}</h1>
              <p className="text-lg text-muted-foreground mt-2">{myRoleDetails.description}</p>
            </div>

            {isOnCooldown ? (
              <div className="text-center bg-slate-800/70 p-6 rounded-lg">
                <h2 className="text-2xl font-bold text-yellow-400">قدرتك قيد الراحة الإجبارية</h2>
                <p className="text-muted-foreground mt-2">لقد استخدمت قدرتك في الليلة الماضية، يجب عليك تخطي هذه الليلة.</p>
                <Button onClick={() => handleSubmit(true)} size="lg" className="mt-4" disabled={isSubmitting}>
                  <SkipForward className="ml-2" /> تخطي هذه الليلة
                </Button>
              </div>
            ) : myActionType === 'shapeshift' ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {disguiseOptions.map((roleId) => {
                  const roleDetails = ROLES[roleId];
                  return (
                    <motion.div
                      key={roleId}
                      onClick={() => setSelectedDisguise(roleId)}
                      className={cn(
                        'p-3 rounded-lg border-2 bg-slate-800/50 cursor-pointer transition-all duration-200 text-center space-y-2',
                        selectedDisguise === roleId ? 'border-primary scale-105 shadow-lg shadow-primary/20' : 'border-slate-700 hover:border-primary/50'
                      )}
                      whileHover={{ y: -5 }}
                    >
                      <p className="font-bold text-lg">{roleDetails.name}</p>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {targetablePlayers.map((player) => {
                  const isProtected = myActionType === 'heal' && player.id === game.mafiaState?.lastHealedPlayerId;
                  const isDisabled = isProtected || timeIsUp;
                  return (
                    <motion.div
                      key={player.id}
                      onClick={() => !isDisabled && handleTargetSelection(player.id)}
                      className={cn(
                        'p-3 rounded-lg border-2 bg-slate-800/50 backdrop-blur-sm cursor-pointer transition-all duration-200 text-center space-y-2',
                        selectedTargetId === player.id ? 'border-primary scale-105 shadow-lg shadow-primary/20' : 'border-slate-700 hover:border-primary/50',
                        selectedTargetId && selectedTargetId !== player.id ? 'opacity-50' : 'opacity-100',
                        isDisabled && 'opacity-30 cursor-not-allowed'
                      )}
                      whileHover={{ y: isDisabled ? 0 : -5 }}
                    >
                      <PlayerAvatar avatarId={player.avatarId} className="w-24 h-24 mx-auto rounded-full border-4 border-transparent" temporaryTitle={player.temporaryTitle} />
                      <p className="font-bold text-lg">{player.name}</p>
                      {isProtected && <p className="text-xs text-red-400 font-bold">(لا يمكن حمايته)</p>}
                    </motion.div>
                  );
                })}
              </div>
            )}

            {!isOnCooldown && (
              <div className="mt-8 flex justify-center gap-4">
                <Button
                  onClick={() => handleSubmit(false)}
                  disabled={
                    isSubmitting ||
                    timeIsUp ||
                    (myActionType !== 'shapeshift' && !selectedTargetId) ||
                    (myActionType === 'shapeshift' && !selectedDisguise)
                  }
                  size="lg"
                  className="w-full max-w-xs"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد'}
                </Button>
                {(myActionType === 'kill' || myActionType === 'investigate') && (
                  <Button onClick={() => handleSubmit(true)} variant="outline" size="lg" disabled={isSubmitting || timeIsUp}>
                    تخطي
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {myPrivateChat && isAlive && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="absolute bottom-4 right-4 w-80 bg-background/90 text-foreground rounded-lg shadow-2xl border border-primary/50 z-20 overflow-hidden"
        >
          <div
            className="p-3 border-b border-primary/30 flex justify-between items-center cursor-pointer"
            onClick={() => setIsChatMinimized((v) => !v)}
          >
            <h4 className="font-bold text-center">قناة سرية</h4>
            <motion.div animate={{ rotate: isChatMinimized ? 180 : 0 }}>
              <ChevronDown className="w-5 h-5" />
            </motion.div>
          </div>
          <AnimatePresence>
            {!isChatMinimized && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }}>
                <ScrollArea className="h-64 p-3" viewportRef={scrollViewportRef}>
                  <div className="space-y-3">
                    {myPrivateChat.chat.messages.map((msg, i) => (
                      <div key={i} className={cn('flex flex-col', msg.senderId === self.id ? 'items-end' : 'items-start')}>
                        <div className={cn('p-2 rounded-lg max-w-[80%]', msg.senderId === self.id ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                          <p className="text-sm">{msg.message}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {msg.senderName} - {formatDistanceToNow(msg.timestamp.toDate(), { addSuffix: true, locale: ar })}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <form onSubmit={handleSendMessage} className="p-2 border-t flex gap-2">
                  <Input value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="اكتب رسالتك..." disabled={isSendingMessage} />
                  <Button type="submit" size="icon" disabled={isSendingMessage || !chatMessage.trim()}>
                    {isSendingMessage ? <Loader2 className="animate-spin" /> : <Send />}
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
