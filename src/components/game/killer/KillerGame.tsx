

"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Game, Player, ChatMessage, PlayerLocationChoice, KillerMethod, NightChatMessage } from "@/types";
import { KILLER_METHODS } from "@/types";
import { getFailedDetectiveAnimation } from "@/lib/actions/admin";
import * as actions from "@/lib/actions/killer";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, Check, Send, Award, UserCheck, Skull, Glasses, UsersRound, Swords, Moon, Sunrise, Vote, Gavel, ShieldCheck, FileText, UserX, Search, KeyRound, Hand, MessageSquare, Eye, Building, Store, Warehouse, UserPlus, SkipForward, Info, Siren, Users, HandHeart } from "lucide-react";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { AnimatePresence, motion } from "framer-motion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Timestamp } from "firebase/firestore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KillAnimationOverlay } from "./KillAnimationOverlay";
import { TraitorArrestOverlay } from "./TraitorArrestOverlay";


interface KillerGameProps {
    game: Game;
    player: Player;
    self: Player;
    setGame: React.Dispatch<React.SetStateAction<Game | null>>;
}

const CountdownTimer = ({ expiryTimestamp, onExpire }: { expiryTimestamp: number, onExpire: () => void }) => {
    const calculateTimeLeft = useCallback(() => expiryTimestamp - Date.now(), [expiryTimestamp]);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

    useEffect(() => {
        const remaining = calculateTimeLeft();
        if (remaining <= 0) {
            onExpire();
            return;
        };

        const interval = setInterval(() => {
            const newRemaining = calculateTimeLeft();
            if (newRemaining > 0) {
                setTimeLeft(newRemaining);
            } else {
                setTimeLeft(0);
                clearInterval(interval);
                onExpire();
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [expiryTimestamp, onExpire, calculateTimeLeft]);

    if (timeLeft <= 0) {
        return <div className="text-lg font-bold text-destructive">انتهى الوقت!</div>;
    }

    const minutes = Math.floor((timeLeft / 1000 / 60) % 60);
    const seconds = Math.floor((timeLeft / 1000) % 60);

    return (
        <div className="text-lg font-bold font-mono">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
    );
};

export function KillerGame({ game, player, self, setGame }: KillerGameProps) {
    const router = useRouter();
    const { toast } = useToast();
    
    const [alias, setAlias] = useState("");
    const [selectedVictim, setSelectedVictim] = useState<string | null>(null);
    const [method, setMethod] = useState<KillerMethod | null>(null);
    const [killerGuess, setKillerGuess] = useState<string | undefined>();
    const [chatMessage, setChatMessage] = useState("");
    const [nightChatMessage, setNightChatMessage] = useState("");
    const [chatAsDetective, setChatAsDetective] = useState(false);
    const [votedForId, setVotedForId] = useState<string | null>(null);
    const [isArrestModalOpen, setIsArrestModalOpen] = useState(false);
    const [isSideWithKillerModalOpen, setIsSideWithKillerModalOpen] = useState(false);
    const [arrestCandidateId, setArrestCandidateId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [failedDetectiveVideo, setFailedDetectiveVideo] = useState<string | null>(null);
    const [timerExpiredActionCalled, setTimerExpiredActionCalled] = useState(false);
    const [killedByMethod, setKilledByMethod] = useState<KillerMethod | null>(null);
    const [showTraitorArrestAnim, setShowTraitorArrestAnim] = useState(false);

    const [selectedLocation, setSelectedLocation] = useState<PlayerLocationChoice | null>(null);
    const [isCopCheckModalOpen, setIsCopCheckModalOpen] = useState(false);
    const [copCheckCandidateId, setCopCheckCandidateId] = useState<string | null>(null);

    const prevSelfStatus = useRef(self.status);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const nightMessagesEndRef = useRef<HTMLDivElement>(null);
    const chatInputRef = useRef<HTMLInputElement>(null);
    
    const isHost = useMemo(() => game.hostId === self.id, [game.hostId, self.id]);
    const isDetective = useMemo(() => self?.role === 'detective', [self]);
    const isWitness = useMemo(() => self?.role === 'witness', [self]);
    const isCop = useMemo(() => self?.role === 'cop', [self]);
    const isKiller = useMemo(() => self?.role === 'killer', [self]);
    const killer = useMemo(() => game.players.find(p => p.role === 'killer'), [game.players]);
    const hasVoted = useMemo(() => !!(game.votes && game.votes[self.id]), [game.votes, self.id]);
    const votablePlayers = useMemo(() => game.players.filter(p => p.status === 'alive'), [game.players]);
    const eligibleVotersCount = useMemo(() => game.players.filter(p => p.status === 'alive').length, [game.players]);
    const selectedVictimObject = useMemo(() => game.players.find(p => p.id === selectedVictim), [game.players, selectedVictim]);
    const selfLocation = useMemo(() => game.locationChoices?.[self.id], [game.locationChoices, self.id]);

    useEffect(() => {
        if (prevSelfStatus.current === 'alive' && self.status === 'killed') {
             const killMethod = game.nightAction?.method;
            if (killMethod) {
                setKilledByMethod(killMethod);
            }
        }
        prevSelfStatus.current = self.status;
    }, [self.status, game.nightAction]);
    
    useEffect(() => {
        const wasTraitorArrested = game.lastVoteResult?.message?.includes('القبض على الشاهد الخائن');
        if (wasTraitorArrested) {
            setShowTraitorArrestAnim(true);
        }
    }, [game.lastVoteResult]);


    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [game?.messages]);

    useEffect(() => {
        nightMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [game?.nightMessages]);

    useEffect(() => {
        if (game.gameState === 'role_reveal' && isHost) {
            const timer = setTimeout(() => {
                actions.progressToLocationChoice(game.id);
            }, 15000);

            return () => clearTimeout(timer);
        }
    }, [game.gameState, game.id, isHost]);

    useEffect(() => {
        if (game.gameState === 'victim_reveal' && isHost) {
            const timer = setTimeout(() => {
                actions.progressAfterVictimReveal(game.id);
            }, 6000); 
    
            return () => clearTimeout(timer);
        }
    }, [game.gameState, game.id, isHost]);

    useEffect(() => {
        if (game.gameState === 'voting_results' && isHost) {
            const timer = setTimeout(() => {
                actions.continueToNextNight(game.id);
            }, 5000); 

            return () => clearTimeout(timer);
        }
    }, [game.gameState, game.id, isHost]);

    useEffect(() => {
        if (game.gameState === 'ended' && game.gameResult?.winner === 'killer') {
            const fetchVideo = async () => {
                const result = await getFailedDetectiveAnimation();
                if (result.success && result.url) {
                    setFailedDetectiveVideo(result.url);
                }
            };
            fetchVideo();
        }
    }, [game.gameState, game.gameResult?.winner]);

     useEffect(() => {
        if (game.gameState === 'discussion' && game.nightAction?.victimId && game.turn! > (game.lastVictimTurn || 0)) {
            const audio = new Audio('https://cdn.pixabay.com/download/audio/2022/10/18/audio_17cc3b856b.mp3?filename=police-siren-124925.mp3');
            audio.play().catch(e => console.error("Error playing sound:", e));

            const timer = setTimeout(() => {
                audio.pause();
                audio.currentTime = 0;
            }, 5000);

            return () => {
                clearTimeout(timer);
                audio.pause();
                audio.currentTime = 0;
            };
        }
    }, [game.gameState, game.turn, game.lastVictimTurn, game.nightAction?.victimId]);
    
     useEffect(() => {
        const handleKeyPress = (event: KeyboardEvent) => {
            const activeElement = document.activeElement;
            const isTyping = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'BUTTON');

            if (event.key === 'Enter' && !isTyping && (game.gameState === 'discussion' || game.gameState === 'night')) {
                event.preventDefault();
                chatInputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => {
            window.removeEventListener('keydown', handleKeyPress);
        };
    }, [game.gameState]);
    
    const handleTimerExpire = useCallback(() => {
        if (isHost && !timerExpiredActionCalled && game.gameState === 'discussion') {
            setTimerExpiredActionCalled(true);
            actions.endVoteByTimer(game.id);
        }
    }, [isHost, timerExpiredActionCalled, game.id, game.gameState]);
    
    useEffect(() => {
        if (game.gameState === 'discussion') {
            setTimerExpiredActionCalled(false);
        }
    }, [game.gameState]);

    const handleSubmitAlias = async () => {
        if (!alias.trim() || !player) return;
        setIsSubmitting(true);
        try {
            await actions.submitAlias(game.id, player.id, alias);
            toast({title: "تم حفظ اسمك المستعار. في انتظار بقية اللاعبين..."});
        } catch(e: any) {
            toast({title: "خطأ", description: e.message, variant: "destructive"});
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleDetectiveChoice = async (choice: 'discuss' | 'skip') => {
        if (!self || !isDetective) return;
        setIsSubmitting(true);
        try {
          await actions.detectiveMakesChoice(game.id, self.id, choice);
        } catch(e: any) {
          toast({title: "خطأ", description: e.message, variant: "destructive"});
        } finally {
          setIsSubmitting(false);
        }
    }
      
    const handlePerformKill = async () => {
        if (!selectedVictim || !method || !self || self.role !== 'killer') return;
        setIsSubmitting(true);
        try {
            await actions.performNightKill(game.id, self.id, selectedVictim, method, killerGuess);
        } catch(e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
            setSelectedVictim(null);
            setMethod(null);
            setKillerGuess(undefined);
        }
    }

    const handleSkipKill = async () => {
        if (!self || self.role !== 'killer') return;
        setIsSubmitting(true);
        try {
            await actions.skipNightKill(game.id, self.id);
        } catch (e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };


    const handleSendMessage = () => {
        if (!chatMessage.trim() || !self) return;
        const messageText = chatMessage.trim();
        setChatMessage(""); // Clear input immediately for better UX
    
        // Fire-and-forget the action. Don't block the UI.
        actions.submitMessage(game.id, self.id, messageText, chatAsDetective).catch(e => {
            console.error("Message send failed:", e);
            toast({ title: "خطأ في الإرسال", description: "لم يتم إرسال رسالتك.", variant: "destructive" });
            // Optionally, restore the message for the user to retry
            // setChatMessage(messageText); 
        });
    }
    
    const handleSendNightMessage = () => {
        if (!nightChatMessage.trim() || !self || !selfLocation) return;
        const messageText = nightChatMessage.trim();
        setNightChatMessage(""); // Clear input immediately
    
        // Fire-and-forget the action.
        actions.submitNightMessage(game.id, self.id, messageText, selfLocation).catch(e => {
            console.error("Night message send failed:", e);
            toast({ title: "خطأ في الإرسال", description: "لم يتم إرسال رسالتك الليلية.", variant: "destructive" });
        });
    }

    const handleSubmitVote = async (votedForId: string) => {
        if (!votedForId || !self) return;
        setIsSubmitting(true);
        try {
            await actions.submitVote(game.id, self.id, votedForId);
            setVotedForId(votedForId);
            toast({ title: "تم تسجيل صوتك بنجاح!" });
        } catch(e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleArrest = async () => {
        if (!arrestCandidateId || !self || !isDetective) return;
        setIsSubmitting(true);
        try {
          await actions.detectiveArrest(game.id, self.id, arrestCandidateId);
        } catch(e: any) {
           toast({title: "خطأ", description: e.message, variant: "destructive"});
        } finally {
          setIsSubmitting(false);
          setIsArrestModalOpen(false);
          setArrestCandidateId(null);
        }
    }

    const handleSideWithKiller = async () => {
        if (!self || !isWitness) return;
        setIsSubmitting(true);
        try {
            await actions.witnessSidesWithKiller(game.id, self.id);
            toast({ title: "لقد انضممت إلى الظلام!", description: "أصبحت الآن الشاهد المختل." });
        } catch (e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
            setIsSideWithKillerModalOpen(false);
        }
    };
    
    const handleCopCheck = async () => {
        if (!copCheckCandidateId || !self || !isCop) return;
        setIsSubmitting(true);
        try {
            await actions.copCheckPlayer(game.id, self.id, copCheckCandidateId);
            toast({ title: "تم التحقق", description: "سيتم كشف النتيجة في اليوم التالي." });
        } catch (e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
            setIsCopCheckModalOpen(false);
            setCopCheckCandidateId(null);
        }
    };

    const handleChooseLocation = async (location: PlayerLocationChoice) => {
        if (!location || !self) return;
        setIsSubmitting(true);
        try {
            await actions.chooseLocation(game.id, self.id, location);
            toast({ title: `تم تحديد موقعك: ${location}` });
        } catch (e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderInstructionsPhase = () => {
        const killerInstructions = (
            <div className="space-y-6">
                <div className="text-center">
                    <h3 className="text-3xl font-bold text-primary">المحقق والقاتل</h3>
                    <p className="text-muted-foreground">لعبة خداع، غموض، وتحقيق</p>
                </div>
                <div>
                    <h4 className="font-bold text-xl mb-2 text-center">الشخصيات</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div className="p-3 bg-muted rounded-lg"><Skull className="w-10 h-10 mx-auto text-red-500"/><p className="font-bold mt-1">القاتل</p></div>
                        <div className="p-3 bg-muted rounded-lg"><Glasses className="w-10 h-10 mx-auto text-blue-500"/><p className="font-bold mt-1">المحقق</p></div>
                        <div className="p-3 bg-muted rounded-lg"><ShieldCheck className="w-10 h-10 mx-auto text-green-500"/><p className="font-bold mt-1">الشرطي</p></div>
                        <div className="p-3 bg-muted rounded-lg"><Eye className="w-10 h-10 mx-auto text-yellow-500"/><p className="font-bold mt-1">الشاهد</p></div>
                    </div>
                </div>
                <div className="space-y-4 text-right">
                     <p><strong>الاستعداد:</strong> على كل لاعب اختيار اسم وهمي سري.</p>
                     <div>
                        <h5 className="font-semibold text-lg flex items-center gap-2 justify-end"><Moon /> مرحلة الليل</h5>
                        <ul className="list-disc list-inside pr-5 space-y-1 text-muted-foreground">
                            <li>في الليل، يختار كل لاعب منطقة ليتواجد فيها.</li>
                            <li><strong className="text-foreground">القاتل:</strong> يمكنه قتل أي شخص معه في نفس المنطقة.</li>
                            <li><strong className="text-foreground">الشرطي:</strong> يمكنه التحقق من هوية لاعب واحد.</li>
                            <li><strong className="text-foreground">الشاهد:</strong> يرى جميع اللاعبين المتواجدين معه في نفس المنطقة.</li>
                        </ul>
                    </div>
                    <div>
                        <h5 className="font-semibold text-lg flex items-center gap-2 justify-end"><MessageSquare/> التحقيق والمحادثة</h5>
                        <ul className="list-disc list-inside pr-5 space-y-1 text-muted-foreground">
                             <li>يتحدث الجميع بأسمائهم المستعارة.</li>
                             <li><strong className="text-foreground">المحقق:</strong> لديه القدرة على التحدث كمحقق أو كلاعب عادي لخداع الآخرين.</li>
                        </ul>
                    </div>
                </div>
            </div>
        );

        return (
            <div className="w-full max-w-4xl grid lg:grid-cols-2 gap-8">
                <Card className="animate-fade-in-right">
                    <CardHeader><CardTitle>تعليمات اللعبة</CardTitle></CardHeader>
                    <CardContent>{killerInstructions}</CardContent>
                </Card>
                <Card className="animate-fade-in-left">
                    <CardHeader>
                        <CardTitle>التحضير للعبة</CardTitle>
                        <CardDescription>أدخل اسمًا مستعارًا وابدأ المغامرة.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {!self.alias ? (
                            <div className="space-y-2">
                                <Label htmlFor="alias-input">اسمك المستعار</Label>
                                <div className="flex gap-2">
                                    <Input id="alias-input" placeholder="اختر اسمًا سريًا..." value={alias} onChange={e => setAlias(e.target.value)} disabled={isSubmitting}/>
                                    <Button onClick={handleSubmitAlias} disabled={isSubmitting || !alias.trim()}>{isSubmitting ? "..." : "تأكيد"}</Button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-3 rounded-md bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800">
                                تم تأكيد اسمك: <span className="font-bold">{self.alias}</span>. في انتظار بقية اللاعبين...
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>حالة اللاعبين</Label>
                            <div className="grid grid-cols-2 gap-2">
                                {game.players.map(p => (
                                    <div key={p.id} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
                                        <div className={`w-3 h-3 rounded-full animate-pulse ${p.alias ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                        <span>{p.name} {p.id === self.id && "(أنت)"}</span>
                                        <span className="mr-auto">{p.alias ? '✅' : '⌛'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <p className="text-xs text-muted-foreground text-center w-full animate-pulse">
                            ستبدأ اللعبة تلقائيًا عند تأكيد جميع اللاعبين لأسمائهم...
                        </p>
                    </CardFooter>
                </Card>
            </div>
        );
    };

    const renderRoleReveal = () => {
        const roleDetails = {
            killer: { title: "أنت القاتل", color: "text-red-500", description: "مهمتك هي القضاء على الجميع دون أن يتم كشفك." },
            detective: { title: "أنت المحقق", color: "text-blue-500", description: "مهمتك هي كشف القاتل وتوجيه المدنيين للقبض عليه." },
            witness: { title: "أنت الشاهد", color: "text-yellow-500", description: "مهمتك هي مراقبة اللاعبين في منطقتك ليلًا." },
            civilian: { title: "أنت مدني", color: "text-gray-500", description: "مهمتك هي العمل مع الآخرين لكشف القاتل والتصويت لطرده." },
            cop: { title: "أنت الشرطي", color: "text-green-500", description: "مهمتك هي التحقق من هوية لاعب واحد كل ليلة." },
        };
    
        const details = roleDetails[self.role!];
        if (!details || !game.crimeScene) return <p>جاري تحميل البيانات...</p>;

        const isPrivilegedRole = self.role === 'killer' || self.role === 'detective';

        return (
            <AnimatePresence>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-2xl space-y-4">
                    <Card className="text-center border-2 border-primary shadow-2xl overflow-hidden">
                        <CardHeader className="bg-primary/10">
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1, rotate: 360 }} transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.5 }}>
                                <Image src={`/roles/${self.role}.png`} alt={self.role!} width={80} height={80} className="mx-auto" />
                            </motion.div>
                            <h2 className={`text-3xl font-bold ${details.color}`}>{details.title}</h2>
                            <p className="text-muted-foreground">{details.description}</p>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div>
                                <h3 className="font-bold text-lg">تفاصيل القضية الأولية</h3>
                                <p className="text-sm text-muted-foreground">{game.crimeScene.victimAlias} - {game.crimeScene.victimBackground}</p>
                            </div>
                            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-1">
                                <h4 className="flex items-center justify-center gap-3 font-semibold text-xl"><Search className="h-6 w-6 text-primary" /><span>الدليل العام</span></h4>
                                <p className="text-muted-foreground leading-relaxed">{game.crimeScene.publicClue}</p>
                            </div>
                            {isPrivilegedRole && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 1 } }} className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg space-y-1">
                                    <h4 className="flex items-center justify-center gap-3 font-semibold text-xl text-destructive"><KeyRound className="h-6 w-6" /><span>تقرير سري (للقاتل والمحقق فقط)</span></h4>
                                    <p className="text-muted-foreground leading-relaxed">{game.crimeScene.detailedClue}</p>
                                </motion.div>
                            )}
                        </CardContent>
                        <CardFooter>
                            <p className="text-xs text-center w-full text-muted-foreground animate-pulse">
                              {isHost ? "جاري الانتقال للخطوة التالية..." : "في انتظار المضيف..."}
                            </p>
                        </CardFooter>
                    </Card>
                </motion.div>
            </AnimatePresence>
        );
    };

    const renderLocationChoice = () => {
        const hasChosen = !!game.locationChoices?.[self.id];
        
        // Show choice for detective to start first discussion or skip to night
        if (isDetective && game.turn === 1 && !game.locationChoices) {
             return (
                <Card className="w-full max-w-lg text-center animate-pop-in">
                    <CardHeader>
                        <CardTitle>قرار المحقق الأول</CardTitle>
                        <CardDescription>
                            هل تريد بدء جولة تحقيق الآن أم تفضل التجاوز إلى أول ليلة لجمع المعلومات؟
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4">
                        <Button onClick={() => handleDetectiveChoice('discuss')} disabled={isSubmitting} size="lg">
                           <MessageSquare className="mr-2"/> بدء التحقيق
                        </Button>
                        <Button onClick={() => handleDetectiveChoice('skip')} disabled={isSubmitting} size="lg" variant="secondary">
                           <Moon className="mr-2"/> التجاوز إلى الليل
                        </Button>
                    </CardContent>
                </Card>
            );
        }

        if (hasChosen) {
             return (
                <Card className="w-full max-w-lg text-center">
                    <CardHeader>
                        <CardTitle>تم اختيار موقعك</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-lg text-muted-foreground p-4 bg-muted rounded-md animate-pulse">في انتظار بقية اللاعبين لاختيار مواقعهم...</p>
                    </CardContent>
                </Card>
            );
        }

        return (
            <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <CardTitle>اختر موقعك</CardTitle>
                    <CardDescription>
                        اختر موقعًا ستبقى فيه. هذا القرار لمرة واحدة فقط!
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Button
                        variant={selectedLocation === 'night_alley' ? 'default' : 'outline'}
                        className="w-full justify-start h-14 text-lg gap-4"
                        onClick={() => handleChooseLocation('night_alley')}
                        disabled={isSubmitting}
                    >
                        <Building className="w-8 h-8"/> الحارة الليلية
                    </Button>
                    <Button
                        variant={selectedLocation === 'commercial_market' ? 'default' : 'outline'}
                        className="w-full justify-start h-14 text-lg gap-4"
                        onClick={() => handleChooseLocation('commercial_market')}
                        disabled={isSubmitting}
                    >
                        <Store className="w-8 h-8"/> السوق التجاري
                    </Button>
                     <Button
                        variant={selectedLocation === 'abandoned_farm' ? 'default' : 'outline'}
                        className="w-full justify-start h-14 text-lg gap-4"
                        onClick={() => handleChooseLocation('abandoned_farm')}
                        disabled={isSubmitting}
                    >
                        <Warehouse className="w-8 h-8"/> المزرعة المهجورة
                    </Button>
                </CardContent>
            </Card>
        );
    };

    const renderNightPhase = () => {
        const playersInSameLocation = game.players.filter(p => p.id !== self.id && p.status === 'alive' && game.locationChoices?.[p.id] === selfLocation);
        
        const renderNightChat = () => {
            const relevantMessages = (game.nightMessages || []).filter(msg => msg.location === selfLocation);
            return (
                <Card className="w-full max-w-lg mt-4 h-64 flex flex-col">
                    <CardHeader className="p-3 border-b">
                        <CardTitle className="text-base text-center">محادثة المنطقة</CardTitle>
                    </CardHeader>
                    <CardContent className="p-2 flex-grow overflow-hidden flex flex-col gap-2">
                        <ScrollArea className="flex-grow pr-2">
                            <div className="space-y-3">
                                {relevantMessages.map((msg, index) => {
                                    const key = `${msg.timestamp.toMillis()}-${msg.senderId}-${index}`;
                                    const isSelfMsg = msg.senderId === self.id;
                                    return (
                                        <div key={key} className={cn("flex flex-col gap-1 text-sm", isSelfMsg ? "items-end" : "items-start")}>
                                            <div className={cn("rounded-lg px-2 py-1 max-w-xs", isSelfMsg ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-200")}>
                                                <p className="font-bold text-xs mb-0.5">{msg.senderAlias}</p>
                                                <p>{msg.text}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                                <div ref={nightMessagesEndRef} />
                            </div>
                        </ScrollArea>
                        <div className="flex gap-2 pt-2 border-t border-gray-700">
                            <Input 
                                placeholder="رسالة سرية..." 
                                value={nightChatMessage}
                                onChange={e => setNightChatMessage(e.target.value)}
                                onKeyPress={e => e.key === 'Enter' && handleSendNightMessage()}
                                className="bg-gray-800 border-gray-600 text-white h-9"
                            />
                            <Button size="sm" onClick={handleSendNightMessage} disabled={!nightChatMessage.trim()}><Send /></Button>
                        </div>
                    </CardContent>
                </Card>
            )
        }

        const renderPlayerNightActions = () => {
             if (isKiller && self.status === 'alive') {
                return (
                   <Card className="w-full max-w-lg animate-pop-in mt-4">
                      <CardHeader>
                        <CardTitle className="text-center text-xl text-red-500">مرحلة القتل</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                         <div className="space-y-2">
                            <Label>تغيير الموقع (لهذه الليلة فقط)</Label>
                            <RadioGroup 
                                value={selectedLocation || selfLocation} 
                                onValueChange={(v) => setSelectedLocation(v as PlayerLocationChoice)}
                                className="grid grid-cols-3 gap-2"
                            >
                                <Label htmlFor="loc-alley" className={cn('flex flex-col items-center justify-center gap-2 p-2 rounded-lg border-2 cursor-pointer transition-all text-xs h-20', (selectedLocation || selfLocation) === 'night_alley' ? 'border-primary bg-primary/10' : 'border-muted bg-muted/50')}>
                                    <Building className="w-6 h-6"/><p>الحارة</p><RadioGroupItem value="night_alley" id="loc-alley" className="sr-only"/>
                                </Label>
                                <Label htmlFor="loc-market" className={cn('flex flex-col items-center justify-center gap-2 p-2 rounded-lg border-2 cursor-pointer transition-all text-xs h-20', (selectedLocation || selfLocation) === 'commercial_market' ? 'border-primary bg-primary/10' : 'border-muted bg-muted/50')}>
                                    <Store className="w-6 h-6"/><p>السوق</p><RadioGroupItem value="commercial_market" id="loc-market" className="sr-only"/>
                                </Label>
                                <Label htmlFor="loc-farm" className={cn('flex flex-col items-center justify-center gap-2 p-2 rounded-lg border-2 cursor-pointer transition-all text-xs h-20', (selectedLocation || selfLocation) === 'abandoned_farm' ? 'border-primary bg-primary/10' : 'border-muted bg-muted/50')}>
                                    <Warehouse className="w-6 h-6"/><p>المزرعة</p><RadioGroupItem value="abandoned_farm" id="loc-farm" className="sr-only"/>
                                </Label>
                            </RadioGroup>
                            <Button size="sm" className="w-full" onClick={() => handleChooseLocation(selectedLocation!)} disabled={!selectedLocation || selectedLocation === selfLocation || isSubmitting}>
                                {isSubmitting ? '...' : `تغيير الموقع إلى ${selectedLocation}`}
                            </Button>
                         </div>
                         <div className="border-t pt-4">
                            {playersInSameLocation.length > 0 ? (
                            <>
                            <RadioGroup 
                                    value={selectedVictim || ""} 
                                    onValueChange={(value) => setSelectedVictim(value)}
                                    className="grid grid-cols-2 gap-4"
                                >
                                    {playersInSameLocation.map((p) => (
                                    <motion.div key={p.id} initial={{opacity: 0}} animate={{opacity: 1}}>
                                        <Label htmlFor={p.id} className={cn('flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all', selectedVictim === p.id ? 'border-red-500 bg-red-50' : 'border-transparent bg-muted', p.isImmune ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')}>
                                            <PlayerAvatar avatarId={p.avatarId} className="w-16 h-16 rounded-full"/>
                                            <span className="font-bold text-lg">{p.alias}</span>
                                            <RadioGroupItem value={p.id} id={p.id} className="sr-only" disabled={p.isImmune}/>
                                            {p.isImmune && <span className="text-xs font-bold text-red-600">محصّن</span>}
                                        </Label>
                                    </motion.div>
                                    ))}
                                </RadioGroup>
                                <div className="space-y-2 mt-4">
                                    <Label>اختر أسلوب القتل</Label>
                                    <Select onValueChange={(v) => setMethod(v as KillerMethod)} value={method || ""}>
                                        <SelectTrigger><SelectValue placeholder="اختر أسلوبًا..." /></SelectTrigger>
                                        <SelectContent>
                                            {KILLER_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2 mt-2">
                                    <Label>تخمين هوية الضحية (اختياري)</Label>
                                    <Select onValueChange={(v) => setKillerGuess(v)} value={killerGuess}>
                                        <SelectTrigger><SelectValue placeholder="خمن الاسم الحقيقي..." /></SelectTrigger>
                                        <SelectContent>
                                             {playersInSameLocation.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                            ) : <p className="text-center text-muted-foreground">لا يوجد لاعبين آخرين معك في هذه المنطقة.</p>}
                         </div>
                      </CardContent>
                      <CardFooter className="flex-col gap-2">
                        {playersInSameLocation.length > 0 ? (
                            <Button variant="destructive" className="w-full" size="lg" disabled={!selectedVictim || !method || isSubmitting || selectedVictimObject?.isImmune} onClick={handlePerformKill}>
                                <Swords /> {isSubmitting ? '...' : 'تأكيد القتل'}
                            </Button>
                        ) : (
                             <Button variant="secondary" className="w-full" size="lg" disabled={isSubmitting} onClick={handleSkipKill}>
                                <SkipForward /> {isSubmitting ? '...' : 'تخطي الدور'}
                            </Button>
                        )}
                      </CardFooter>
                    </Card>
                )
             } else if (isCop && self.status === 'alive') {
                 return <Button className="mt-4" onClick={() => setIsCopCheckModalOpen(true)} disabled={!!game.copCheck?.used}> <UserCheck/> {game.copCheck?.used ? 'تم استخدام التحقق' : 'تحقق من لاعب'}</Button>
             } else if (isWitness && self.status === 'alive') {
                return (
                    <div className="mt-4 p-4 bg-yellow-900/50 rounded-lg w-full max-w-lg">
                        <h4 className="text-lg font-bold text-yellow-300 text-center mb-2">معلومات الشاهد</h4>
                        {playersInSameLocation.length > 0 ? (
                           <div className="flex flex-wrap gap-4 justify-center">
                               {playersInSameLocation.map(p => (
                                   <div key={p.id} className="flex flex-col items-center gap-1">
                                       <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12"/>
                                       <p className="text-sm font-semibold">{p.alias}</p>
                                   </div>
                               ))}
                           </div>
                        ): (
                            <p className="text-center text-yellow-200/80">لم يكن هناك أحد معك في هذه المنطقة.</p>
                        )}
                    </div>
                )
             }
             return <p className="text-center text-muted-foreground mt-4">أنت الآن في أمان... أو هكذا تظن.</p>
        }
        
        return (
           <div className="flex flex-col lg:flex-row items-start gap-6 w-full max-w-6xl">
                <Card className="w-full lg:w-1/2 text-center bg-gray-900 text-white border-indigo-500 shadow-2xl shadow-indigo-500/30">
                <CardHeader>
                    <motion.div initial={{opacity: 0, scale: 0.5}} animate={{opacity: 1, scale: 1, transition: {delay: 0.5, type: 'spring'}}}>
                        <Moon className="w-24 h-24 mx-auto text-indigo-300"/>
                    </motion.div>
                    <CardTitle className="text-3xl">حل الظلام</CardTitle>
                        <CardDescription className="text-indigo-200">
                            {self.status === 'alive' 
                                ? 'الليل هو وقت الأسرار والأخطار.'
                                : 'أنت خارج اللعبة، ولكن يمكنك مشاهدة الأحداث تتكشف.'
                            }
                        </CardDescription>
                </CardHeader>
                <CardContent>
                        {self.status === 'alive' ? (
                            <div className="space-y-4 flex flex-col items-center">
                               {renderPlayerNightActions()}
                            </div>
                        ) : <p className="text-indigo-400 animate-pulse">في انتظار شروق الشمس...</p> }
                </CardContent>
                </Card>
                <div className="w-full lg:w-1/2">
                    {self.status === 'alive' && renderNightChat()}
                </div>
           </div>
        )
    }
    
    const renderDayPhase = () => {
        let nightEventContent;
        
        const na = game.nightAction;

        const killMessages: Record<KillerMethod, string> = {
            "طعن بالسكين": `اغتيل ${na?.victimAlias} بطعنة سكين.`,
            "ضرب مبرح": `اغتيل ${na?.victimAlias} بضرب مبرح.`,
            "طلقة مسدس": `اغتيل ${na?.victimAlias} بطلقة مسدس.`,
            "وابل من الرصاصات": `اغتيل ${na?.victimAlias} بوابل من الرصاصات.`,
            "تعذيبه حتى الموت": `اغتيل ${na?.victimAlias} بعد تعذيبه.`,
            "تسميمه": `اغتيل ${na?.victimAlias} بالتسميم.`,
            "منحه ميتة رحيمة": `اغتيل ${na?.victimAlias} بميتة رحيمة.`
        };

        if (na?.skipped) {
            nightEventContent = <p className="font-semibold">مرت الليلة بسلام. قرر القاتل عدم التحرك.</p>;
        } else if (na?.victimWasTraitor) {
            nightEventContent = (
                <div className='flex items-center gap-2 text-green-600'>
                    <Siren className="h-5 w-5 animate-pulse" />
                    <p className="font-semibold">خبر جيد! القاتل اغتال الشاهد الخائن {na.victimAlias} بالخطأ.</p>
                </div>
            )
        } else if (na?.victimId && na.victimAlias && na.method) {
            let killMessage = killMessages[na.method] || `تم اغتيال الضحية ${na.victimAlias}.`;
            if (na.killerGuess) {
                const guessedPlayer = game.players.find(p => p.name === na.killerGuess!.guessedPlayerId);
                if (na.killerGuess.wasCorrect) {
                    killMessage += ` تعرف القاتل على هويته الحقيقية.`;
                } else {
                    killMessage += ` ظن القاتل أنه يستهدف ${guessedPlayer?.name || 'شخصًا آخر'}.`;
                }
            }
            nightEventContent = (
                <div className='flex items-center gap-2 text-destructive'>
                    <Siren className="h-5 w-5 animate-pulse" />
                    <p className="font-semibold">{killMessage}</p>
                </div>
            )
        } else if (na?.detectiveSurvived) {
            nightEventContent = <p className="font-semibold text-blue-600">نجا المحقق من محاولة اغتيال!</p>;
        } else if (game.turn && game.turn > 1) {
             nightEventContent = <p className="font-semibold text-gray-800">مرت الليلة بسلام، لم يحدث شيء.</p>;
        } else { // First day
            nightEventContent = <p className="text-center text-muted-foreground">بداية جولة النقاش الأولى.</p>;
        }

        const canSideWithKiller = isWitness && !self.isTraitor && game.players.length >= 5 && game.turn === 1;

        return (
          <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>اليوم {game.turn || 1}</CardTitle>
                   {game.discussionEndsAt && (
                      <div className="p-2 rounded-md bg-muted">
                        <CountdownTimer 
                            expiryTimestamp={game.discussionEndsAt.toMillis()}
                            onExpire={handleTimerExpire}
                        />
                      </div>
                  )}
                </CardHeader>
                <CardContent>
                   <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg space-y-2 text-center">
                     <Sunrise className="w-12 h-12 mx-auto text-yellow-500" />
                     {nightEventContent}
                   </div>
                </CardContent>
              </Card>

              {isCop && game.copCheckResult && (
                <motion.div initial={{opacity: 0}} animate={{opacity: 1}} transition={{delay: 0.5}}>
                    <Card className="border-green-500 bg-green-50/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-green-600"><ShieldCheck /> نتيجة التحقق</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-center">
                           <p>
                            اللاعب <strong>{game.copCheckResult.targetAlias}</strong> هو 
                            <strong>
                                {game.copCheckResult.isKiller ? " القاتل!" : game.copCheckResult.isTraitor ? " خائن!" : " بريء."}
                            </strong>
                           </p>
                        </CardContent>
                    </Card>
                </motion.div>
              )}

              {isDetective && self.status === 'alive' && !game.detectiveArrest?.used && (
                <Card className="border-amber-500">
                    <CardHeader>
                        <CardTitle className="text-amber-600">صلاحية الاعتقال</CardTitle>
                        <CardDescription>لديك فرصة واحدة لاعتقال القاتل. إذا أخطأت، خسر فريقك.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="outline" className="w-full border-amber-500 text-amber-600 hover:bg-amber-50" onClick={() => setIsArrestModalOpen(true)}>
                            <Hand /> تنفيذ الاعتقال
                        </Button>
                    </CardContent>
                </Card>
              )}

              {canSideWithKiller && (
                  <Card className="border-destructive bg-red-900/10">
                      <CardHeader>
                          <CardTitle className="text-destructive">فرصة للخيانة</CardTitle>
                          <CardDescription>هل ستنضم إلى القاتل وتصبح الشاهد المختل؟ هذا قرار اليوم الأول فقط.</CardDescription>
                      </CardHeader>
                      <CardContent>
                          <Button variant="destructive" className="w-full" onClick={() => setIsSideWithKillerModalOpen(true)}>
                              <UserPlus /> الانحياز للقاتل
                          </Button>
                      </CardContent>
                  </Card>
              )}
               {self.isTraitor && (
                    <div className="p-4 rounded-lg text-center text-white bg-gradient-to-br from-red-800 to-red-900">
                        <h3 className="text-xl font-bold">أنت الشاهد المختل</h3>
                        <p className="text-sm opacity-80">أنت الآن في فريق القاتل. ساعده على الفوز!</p>
                    </div>
                )}
            </div>
    
            <div className="lg:col-span-2 space-y-4">
                <Card className="flex flex-col h-[70vh]">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><MessageSquare /> غرفة التحقيق</CardTitle>
                        <CardDescription>ناقشوا الأدلة وحاولوا كشف القاتل. أصواتكم حاسمة.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow overflow-hidden flex flex-col gap-4">
                       <ScrollArea className="flex-grow pr-4">
                         <div className="space-y-4">
                            {(game.messages || []).map((msg, index) => {
                                const key = `${msg.timestamp.toMillis()}-${msg.senderId}-${index}`;
                                const isSelfMsg = msg.senderId === self.id;
                                const senderPlayer = game.players.find(p => p.id === msg.senderId);
    
                                return (
                                    <div key={key} className={cn("flex flex-col gap-1", isSelfMsg ? "items-end" : "items-start")}>
                                        <div className={cn("rounded-lg px-3 py-2 max-w-sm", isSelfMsg ? "bg-primary text-primary-foreground" : msg.isDetective ? "bg-blue-200 text-blue-900" : "bg-muted")}>
                                            <p className="font-bold text-xs mb-1">
                                                {msg.isDetective ? "المحقق" : senderPlayer?.alias || 'لاعب'}
                                            </p>
                                            <p className="text-sm">{msg.text}</p>
                                        </div>
                                    </div>
                                )
                            })}
                            <div ref={messagesEndRef} />
                         </div>
                       </ScrollArea>
                       {self.status === 'alive' ? (
                         <div className="flex flex-col gap-2 pt-2 border-t">
                            <div className="flex gap-2">
                                <Input 
                                    ref={chatInputRef}
                                    placeholder="اكتب رسالتك..." 
                                    value={chatMessage} 
                                    onChange={(e) => setChatMessage(e.target.value)} 
                                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                />
                                <Button onClick={handleSendMessage} disabled={!chatMessage.trim()}><Send /></Button>
                            </div>
                             {isDetective && (
                                <div className="flex items-center space-x-2 space-x-reverse">
                                    <Checkbox id="asDetective" checked={chatAsDetective} onCheckedChange={(c) => setChatAsDetective(c as boolean)} />
                                    <label htmlFor="asDetective" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        إرسال كـ "المحقق"
                                    </label>
                                </div>
                            )}
                         </div>
                       ) : (
                        <p className="text-center text-sm text-muted-foreground p-2 border-t">لا يمكنك المشاركة في النقاش.</p>
                       )}
                    </CardContent>
                </Card>
            </div>
            
             <div className="lg:col-span-3">
                <Card>
                    <CardHeader>
                        <CardTitle>لوحة التصويت</CardTitle>
                        <CardDescription>
                            {hasVoted ? `صوتك تم تسجيله. بانتظار ${eligibleVotersCount - Object.keys(game.votes || {}).length} لاعبين.` : 'صوّت للاعب الذي تشتبه بأنه القاتل، أو اختر عدم التصويت.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {votablePlayers.map(p => {
                            const hasBeenVotedFor = votedForId === p.id;
                            return (
                                <div key={p.id} className="text-center space-y-2">
                                    <PlayerAvatar avatarId={p.avatarId} className={`w-20 h-20 rounded-full mx-auto border-4 ${hasBeenVotedFor ? 'border-primary' : 'border-transparent'}`} />
                                    <p className="font-bold">{p.alias}</p>
                                    <Button 
                                        size="sm" 
                                        onClick={() => handleSubmitVote(p.id)}
                                        disabled={hasVoted || self.status !== 'alive' || isSubmitting}
                                    >
                                        {hasVoted ? <Check/> : <Vote />}
                                        {hasVoted ? 'تم' : 'صوّت'}
                                    </Button>
                                </div>
                            )
                        })}
                    </CardContent>
                    <CardFooter>
                        <Button
                            variant="secondary"
                            className="w-full"
                            onClick={() => handleSubmitVote('__SKIP_VOTE__')}
                            disabled={hasVoted || self.status !== 'alive' || isSubmitting}
                        >
                            عدم التصويت لأي شخص
                        </Button>
                    </CardFooter>
                </Card>
            </div>
          </div>
        )
    }

    const renderVotingResultsPhase = () => {
        const { tied, message, eliminatedPlayerAlias, eliminatedPlayerRole, isTraitor } = game.lastVoteResult || {};
    
        const resultMessage = message || (tied ? 'حدث تعادل في الأصوات! لا أحد سيغادر هذه الجولة.' : 'انتهى التصويت.');
    
        return (
            <Card className="w-full max-w-md animate-pop-in text-center">
                <CardHeader>
                    <Gavel className="w-20 h-20 mx-auto text-primary"/>
                    <CardTitle className="text-3xl mt-2">نتيجة التصويت</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-xl">
                    <p>{resultMessage}</p>
                    {eliminatedPlayerAlias && (
                        <div className="p-3 bg-muted rounded-lg">
                            <p>تم الكشف عن هوية <strong className="text-primary">{eliminatedPlayerAlias}</strong></p>
                            <p>دوره كان: <strong>{eliminatedPlayerRole === 'witness' && isTraitor ? 'الشاهد المختل' : eliminatedPlayerRole}</strong></p>
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    <p className="flex w-full items-center justify-center gap-2 rounded-md bg-muted/50 p-3 text-center text-muted-foreground animate-pulse">
                        <Moon />
                        <span>ستبدأ الليلة التالية بعد لحظات...</span>
                    </p>
                </CardFooter>
            </Card>
        )
    }

    const renderGameEndPhase = () => {
        const { winner, message } = game.gameResult || {};
        const isKillerWinner = winner === 'killer';
        const detectiveFailed = isKillerWinner && game.players.some(p => p.role === 'detective');

        const roleMap: Record<NonNullable<Player['role']>, string> = {
            killer: 'القاتل',
            detective: 'المحقق',
            cop: 'الشرطي',
            witness: 'الشاهد',
            civilian: 'مدني',
        };

        return (
          <Card className={`w-full max-w-lg animate-pop-in text-center ${isKillerWinner ? 'border-destructive' : 'border-green-500'}`}>
              <CardHeader>
                  {isKillerWinner ? <Skull className="w-24 h-24 mx-auto text-destructive"/> : <ShieldCheck className="w-24 h-24 mx-auto text-green-500"/>}
                  <CardTitle className="text-4xl mt-4">انتهت اللعبة!</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                   <h2 className={`text-2xl font-bold ${isKillerWinner ? 'text-destructive' : 'text-green-600'}`}>
                      {isKillerWinner ? 'القاتل يفوز!' : 'المحقق والمدنيون يفوزون!'}
                   </h2>
                   <p className="text-lg text-muted-foreground">{message}</p>
                   {detectiveFailed && (
                     <div className="mt-6 pt-4 border-t">
                        <p className="text-sm text-muted-foreground mb-2">مصير المحقق الفاشل...</p>
                        <div className="w-40 h-40 mx-auto rounded-lg bg-gray-800 p-2 overflow-hidden relative">
                           {failedDetectiveVideo ? (
                                <video src={failedDetectiveVideo} autoPlay loop muted playsInline className="w-full h-full object-cover rounded-md" />
                           ) : (
                               <motion.div 
                                   className="relative w-full h-full"
                                   initial={{ y: -50, opacity: 0 }}
                                   animate={{ y: 0, opacity: 1 }}
                                   transition={{ delay: 1, type: "spring", stiffness: 150 }}
                               >
                                   <Glasses className="w-16 h-16 text-white absolute top-4 left-1/2 -translate-x-1/2" />
                                    <motion.div
                                        className="absolute bottom-0 w-full"
                                        animate={{ y: [0, 4, 0], transition: { duration: 0.5, repeat: Infinity } }}
                                    >
                                        <Hand className="w-10 h-10 text-red-500 absolute bottom-0 left-4" style={{ transform: 'rotate(45deg)' }} />
                                        <Hand className="w-10 h-10 text-red-500 absolute bottom-0 right-4" style={{ transform: 'rotate(-45deg) scaleX(-1)' }} />
                                    </motion.div>
                               </motion.div>
                           )}
                        </div>
                    </div>
                   )}
                   <div className="mt-6 pt-4 border-t space-y-2">
                        <h3 className="font-bold text-lg flex items-center justify-center gap-2"><Users /> كشف الأدوار</h3>
                        {game.players.map(p => (
                            <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-muted text-sm">
                                <div className="flex items-center gap-2">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                                    <span className="font-semibold">{p.name}</span>
                                </div>
                                <span className="font-bold text-primary">{p.isTraitor ? 'الشاهد المختل' : roleMap[p.role!]}</span>
                            </div>
                        ))}
                   </div>
              </CardContent>
              <CardFooter>
                  <Button onClick={() => router.push('/')} className="w-full" size="lg">
                      <Trophy /> العب مرة أخرى
                  </Button>
              </CardFooter>
            </Card>
        )
    }

    const renderKillerModals = () => {
        const arrestablePlayers = game.players.filter(p => p.status === 'alive' && p.id !== self.id);
        const checkablePlayers = game.players.filter(p => p.status === 'alive' && p.id !== self.id);

        return (
          <>
            <Dialog open={isArrestModalOpen} onOpenChange={setIsArrestModalOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>تنفيذ أمر اعتقال</DialogTitle>
                  <DialogDescription>
                    اختر اللاعب الذي تشتبه بأنه القاتل. تذكر، هذا القرار نهائي ولا رجعة فيه.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                   <RadioGroup value={arrestCandidateId || ""} onValueChange={setArrestCandidateId} className="grid grid-cols-3 gap-4 mt-2">
                      {arrestablePlayers.map(p => (
                        <div key={p.id}>
                          <Label htmlFor={`arrest-${p.id}`} className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${arrestCandidateId === p.id ? 'border-red-500 bg-red-50' : 'border-transparent bg-muted'}`}>
                              <PlayerAvatar avatarId={p.avatarId} className="w-16 h-16 rounded-full"/>
                              <span className="font-bold text-lg">{p.alias}</span>
                              <RadioGroupItem value={p.id} id={`arrest-${p.id}`} className="sr-only"/>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">إلغاء</Button>
                  </DialogClose>
                  <Button type="button" variant="destructive" disabled={!arrestCandidateId || isSubmitting} onClick={handleArrest}>
                    {isSubmitting ? "جاري الاعتقال..." : "تأكيد الاعتقال"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={isCopCheckModalOpen} onOpenChange={setIsCopCheckModalOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>التحقق من لاعب</DialogTitle>
                  <DialogDescription>
                    اختر لاعبًا للتحقق من هويته. ستظهر لك النتيجة في اليوم التالي. (محاولة واحدة فقط)
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                   <RadioGroup value={copCheckCandidateId || ""} onValueChange={setCopCheckCandidateId} className="grid grid-cols-3 gap-4 mt-2">
                      {checkablePlayers.map(p => (
                        <div key={p.id}>
                          <Label htmlFor={`check-${p.id}`} className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${copCheckCandidateId === p.id ? 'border-green-500 bg-green-50' : 'border-transparent bg-muted'}`}>
                              <PlayerAvatar avatarId={p.avatarId} className="w-16 h-16 rounded-full"/>
                              <span className="font-bold text-lg">{p.alias}</span>
                              <RadioGroupItem value={p.id} id={`check-${p.id}`} className="sr-only"/>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">إلغاء</Button>
                  </DialogClose>
                  <Button type="button" variant="default" className="bg-green-600 hover:bg-green-700" disabled={!copCheckCandidateId || isSubmitting} onClick={handleCopCheck}>
                    {isSubmitting ? "..." : "تأكيد التحقق"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog open={isSideWithKillerModalOpen} onOpenChange={setIsSideWithKillerModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>هل أنت متأكد من قرارك؟</AlertDialogTitle>
                    <AlertDialogDescription>
                        هذا الإجراء لا يمكن التراجع عنه. ستنضم إلى فريق القاتل سرًا وستعمل على مساعدته في الفوز. هل أنت مستعد للخيانة؟
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>تراجع</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSideWithKiller} className={buttonVariants({ variant: "destructive" })}>
                        نعم، أنا مع القاتل
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
          </>
        )
    }

    const renderContent = () => {
        if (killedByMethod && self.status !== 'alive') {
            return <KillAnimationOverlay method={killedByMethod} onAnimationEnd={() => setKilledByMethod(null)} />;
        }
        if (showTraitorArrestAnim) {
            return <TraitorArrestOverlay onAnimationEnd={() => setShowTraitorArrestAnim(false)} />;
        }

        switch(game.gameState) {
            case 'instructions': return renderInstructionsPhase();
            case 'role_reveal': return renderRoleReveal();
            case 'location_choice': return renderLocationChoice();
            case 'night': return renderNightPhase();
            case 'victim_reveal': return <p>جاري كشف الضحية...</p>; // Simplified, real content is background
            case 'discussion': return renderDayPhase();
            case 'voting_results': return renderVotingResultsPhase();
            case 'ended': return renderGameEndPhase();
            default: return <p>حالة غير معروفة في لعبة "القاتل"...</p>;
        }
    }
    
    return (
        <div className={cn("w-full h-full flex items-center justify-center", self.isTraitor && "bg-[url('https://www.transparenttextures.com/patterns/gplay.png')] bg-red-900/90")}>
            {renderContent()}
            {renderKillerModals()}
        </div>
    );
}
