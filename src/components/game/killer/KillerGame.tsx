
"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Game, Player, ChatMessage } from "@/types";
import * as actions from "@/app/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, Check, Send, Award, UserCheck, Skull, Glasses, UsersRound, Swords, Moon, Sunrise, Vote, Gavel, ShieldCheck, FileText, UserX, Search, KeyRound, Hand, MessageSquare, Eye, Spy } from "lucide-react";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { AnimatePresence, motion } from "framer-motion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Timestamp } from "firebase/firestore";

interface KillerGameProps {
    game: Game;
    player: Player;
    self: Player;
    isHost: boolean;
    setGame: React.Dispatch<React.SetStateAction<Game | null>>;
}

export function KillerGame({ game, player, self, isHost, setGame }: KillerGameProps) {
    const router = useRouter();
    const { toast } = useToast();
    
    // State Hooks - Placed at the top
    const [alias, setAlias] = useState("");
    const [selectedVictim, setSelectedVictim] = useState<string | null>(null);
    const [method, setMethod] = useState("");
    const [isTargetingDetective, setIsTargetingDetective] = useState(false);
    const [chatMessage, setChatMessage] = useState("");
    const [votedForId, setVotedForId] = useState<string | null>(null);
    const [isArrestModalOpen, setIsArrestModalOpen] = useState(false);
    const [arrestCandidateId, setArrestCandidateId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [failedDetectiveVideo, setFailedDetectiveVideo] = useState<string | null>(null);
    const [isUsingAccomplicePower, setIsUsingAccomplicePower] = useState(false);
    const [accomplicePowerUsed, setAccomplicePowerUsed] = useState(self?.accomplicePowerUsed ?? false);


    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatInputRef = useRef<HTMLInputElement>(null);
    
    const playerNumberMap = useMemo(() => {
        const playerMap: Record<string, string> = {};
        // Sort players to have a consistent order for numbering.
        const sortedPlayers = [...game.players].sort((a, b) => a.name.localeCompare(b.name));
        sortedPlayers.forEach((p, index) => {
            playerMap[p.id] = `لاعب ${index + 1}`;
        });
        return playerMap;
    }, [game.players]);

    // Memoized Values - Depend on state and props
    const isDetective = useMemo(() => self?.role === 'detective', [self]);
    const isWitness = useMemo(() => self?.role === 'witness', [self]);
    const isAccomplice = useMemo(() => self?.role === 'accomplice', [self]);
    const killer = useMemo(() => game.players.find(p => p.role === 'killer'), [game.players]);
    const hasVoted = useMemo(() => !!(game.votes && game.votes[self.id]), [game.votes, self.id]);
    const votablePlayers = useMemo(() => game.players.filter(p => p.status === 'alive'), [game.players]);
    const eligibleVotersCount = useMemo(() => game.players.filter(p => p.status === 'alive').length, [game.players]);
    const selectedVictimObject = useMemo(() => game.players.find(p => p.id === selectedVictim), [game.players, selectedVictim]);

    // Effect Hooks
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [game?.messages]);

    useEffect(() => {
        if (game.gameState === 'roles' && isHost) {
            const timer = setTimeout(() => {
                actions.progressToCrimeScene(game.id);
            }, 7000); 

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
                const result = await actions.getFailedDetectiveAnimation();
                if (result.success && result.url) {
                    setFailedDetectiveVideo(result.url);
                }
            };
            fetchVideo();
        }
    }, [game.gameState, game.gameResult?.winner]);
    
     useEffect(() => {
        if (self && self.accomplicePowerUsed) {
            setAccomplicePowerUsed(true);
        }
    }, [self]);

    useEffect(() => {
        const handleKeyPress = (event: KeyboardEvent) => {
            const activeElement = document.activeElement;
            const isTyping = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'BUTTON');

            if (event.key === 'Enter' && !isTyping && game.gameState === 'discussion') {
                event.preventDefault();
                chatInputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => {
            window.removeEventListener('keydown', handleKeyPress);
        };
    }, [game.gameState]);


    const handleSubmitAlias = async () => {
        if (!alias.trim() || !player) return;
        setIsSubmitting(true);
        try {
            await actions.submitAlias(game.id, player.id, alias);
            toast({title: "تم حفظ اسمك المستعار"});
        } catch(e: any) {
            toast({title: "خطأ", description: e.message, variant: "destructive"});
        } finally {
            setIsSubmitting(false);
        }
    }
    
    const handleAssignRoles = async () => {
        setIsSubmitting(true);
        try {
            await actions.assignRoles(game.id);
        } catch (e: any) {
            let errorMessage = e.message || "حدث خطأ غير متوقع عند توزيع الأدوار.";
            toast({ title: "خطأ في توزيع الأدوار", description: errorMessage, variant: "destructive", duration: 9000 });
        } finally {
            setIsSubmitting(false);
        }
    };

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
        if (!selectedVictim || !method.trim() || !self || self.role !== 'killer') return;
        setIsSubmitting(true);
        try {
            await actions.performNightKill(game.id, self.id, selectedVictim, method, isTargetingDetective);
        } catch(e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
            setSelectedVictim(null);
            setMethod("");
            setIsTargetingDetective(false);
        }
    }

    const handleSkipKill = async () => {
        if (!self || self.role !== 'killer' || game.killerSkipUsed) return;
        setIsSubmitting(true);
        try {
            await actions.skipNightKill(game.id, self.id);
        } catch(e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleSendMessage = async () => {
        if (!chatMessage.trim() || !self || isSubmitting) return;

        setIsSubmitting(true);
        const messageText = chatMessage.trim();
        const clientTempId = `temp_${Date.now()}_${Math.random()}`;
        
        const isImpersonating = isAccomplice && isUsingAccomplicePower && !accomplicePowerUsed;

        const optimisticMessage: ChatMessage & { clientTempId: string } = {
            senderId: self.id,
            senderAlias: isImpersonating ? "المحقق" : (self.alias || self.name),
            isDetective: self.role === 'detective' || isImpersonating,
            text: messageText,
            timestamp: Timestamp.now(),
            clientTempId,
        };
        
        setGame(currentGame => {
            if (!currentGame) return null;
            return {
                ...currentGame,
                messages: [...(currentGame.messages || []), optimisticMessage],
            };
        });

        setChatMessage("");

        try {
            await actions.submitMessage(game.id, self.id, messageText, isImpersonating);
            if (isImpersonating) {
                setAccomplicePowerUsed(true);
                setIsUsingAccomplicePower(false);
                toast({ title: "تم استخدام الميزة", description: "لقد تحدثت بصفتك المحقق. تم إشعار المحقق الحقيقي بذلك." });
            }
        } catch (e: any) {
            toast({ title: "خطأ في الإرسال", description: "لم يتم إرسال رسالتك.", variant: "destructive" });
            
            setGame(currentGame => {
                if (!currentGame) return null;
                return {
                    ...currentGame,
                    messages: currentGame.messages?.filter(msg => (msg as any).clientTempId !== clientTempId),
                };
            });
            setChatMessage(messageText);
        } finally {
            setIsSubmitting(false);
        }
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
    
    const renderAliasSelection = () => {
        const allAliasesSet = game.players.every(p => p.alias);
  
        return (
            <Card className="w-full max-w-md animate-pop-in">
                <CardHeader>
                    <CardTitle className="text-center">اختر اسمًا مستعارًا</CardTitle>
                    <CardDescription className="text-center">
                        اختر اسمًا سريًا لاستخدامه في هذه اللعبة. لا تخبر أحدًا باسمك!
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!self?.alias ? (
                        <div className="flex gap-2">
                            <Input
                                placeholder="أدخل اسمك المستعار..."
                                value={alias}
                                onChange={e => setAlias(e.target.value)}
                                disabled={isSubmitting}
                            />
                            <Button onClick={handleSubmitAlias} disabled={isSubmitting || !alias.trim()}>
                                {isSubmitting ? "..." : "تأكيد"}
                            </Button>
                        </div>
                    ) : (
                        <div className="text-center p-3 bg-green-100 text-green-800 rounded-md">
                            تم حفظ اسمك المستعار: <span className="font-bold">{self.alias}</span>
                        </div>
                    )}
  
                    <div className="space-y-2">
                        <Label>حالة اللاعبين</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {game.players.map(p => (
                                <div key={p.id} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                    <div className={`w-3 h-3 rounded-full ${p.alias ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                    <span>{p.name} {p.id === player.id && "(أنت)"}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    {isHost && (
                        <Button onClick={handleAssignRoles} disabled={!allAliasesSet || isSubmitting} className="w-full">
                            {isSubmitting ? "جاري التوزيع..." : !allAliasesSet ? "في انتظار جميع اللاعبين..." : "توزيع الأدوار وبدء اللعبة"}
                        </Button>
                    )}
                </CardContent>
            </Card>
        )
    };

    const renderRoleReveal = () => {
        const roleDetails = {
            killer: { title: "أنت القاتل", icon: Skull, color: "text-red-500", description: "مهمتك هي القضاء على الجميع دون أن يتم كشفك." },
            detective: { title: "أنت المحقق", icon: Glasses, color: "text-blue-500", description: "مهمتك هي كشف القاتل وتوجيه المدنيين للقبض عليه." },
            accomplice: { title: "أنت مساعد القاتل", icon: Spy, color: "text-purple-500", description: `القاتل هو ${killer?.alias}. ساعده في الخفاء للفوز.` },
            witness: { title: "أنت الشاهد", icon: Eye, color: "text-yellow-500", description: "يمكنك كشف القاتل إذا ارتكب خطأ. راقب وحلل بصمت." },
            civilian: { title: "أنت مدني", icon: UsersRound, color: "text-gray-500", description: "مهمتك هي العمل مع الآخرين لكشف القاتل والتصويت لطرده." },
        };
    
        const details = roleDetails[self.role!];
    
        return (
            <AnimatePresence>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                    <Card className="w-full max-w-sm text-center border-2 border-primary shadow-2xl">
                        <CardHeader>
                            <CardTitle className="text-xl">تم توزيع الأدوار</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center gap-4">
                             <motion.div 
                                initial={{ scale: 0 }} 
                                animate={{ scale: 1, rotate: 360 }}
                                transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.5 }}
                             >
                                <details.icon className={`w-24 h-24 ${details.color}`} />
                             </motion.div>
                             <h2 className={`text-3xl font-bold ${details.color}`}>{details.title}</h2>
                             <p className="text-muted-foreground">{details.description}</p>
                        </CardContent>
                         <CardFooter>
                            <p className="text-xs text-center w-full text-muted-foreground animate-pulse">
                              ستبدأ اللعبة بعد لحظات...
                            </p>
                        </CardFooter>
                    </Card>
                </motion.div>
            </AnimatePresence>
        )
    };

    const renderCrimeScene = () => {
        if (!game.crimeScene) return null;
      
        return (
            <div className="w-full max-w-2xl flex flex-col gap-4">
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.2 } }}>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-3xl text-primary font-semibold">
                                <FileText className="h-8 w-8" />
                                <span>ملف القضية: 001</span>
                            </CardTitle>
                            <CardDescription>تفاصيل مسرح الجريمة الوهمي لبدء التحقيق.</CardDescription>
                        </CardHeader>
                    </Card>
                </motion.div>
        
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.4 } }}>
                    <Card>
                        <CardContent className="p-6 space-y-1">
                            <h4 className="flex items-center gap-3 font-semibold text-2xl">
                                <UserX className="h-7 w-7 text-primary" />
                                <span>الضحية</span>
                            </h4>
                            <p className="pr-10 text-muted-foreground leading-relaxed">{`${game.crimeScene.victimAlias} - ${game.crimeScene.victimBackground}`}</p>
                        </CardContent>
                    </Card>
                </motion.div>
        
                {(self.role === 'civilian' || self.role === 'witness' || self.role === 'accomplice') && (
                  <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.8 } }}>
                      <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-1">
                          <h4 className="flex items-center gap-3 font-semibold text-xl">
                              <Search className="h-6 w-6 text-primary" />
                              <span>الدليل العام (للجميع عدا القاتل والمحقق)</span>
                          </h4>
                          <p className="pr-9 text-muted-foreground leading-relaxed">{game.crimeScene.publicClue}</p>
                      </div>
                  </motion.div>
                )}
        
                {(self.role === 'killer' || self.role === 'detective') && (
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0, transition: { delay: 1.0 } }}>
                        <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg space-y-1">
                            <h4 className="flex items-center gap-3 font-semibold text-xl text-destructive">
                                <KeyRound className="h-6 w-6" />
                                <span>تقرير سري (للقاتل والمحقق فقط)</span>
                            </h4>
                            <p className="pr-9 text-muted-foreground leading-relaxed">{game.crimeScene.detailedClue}</p>
                        </div>
                    </motion.div>
                )}
        
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, transition: { delay: 1.2 } }}>
                    {isDetective ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>قرار المحقق</CardTitle>
                                <CardDescription>اختر مسار التحقيق التالي.</CardDescription>
                            </CardHeader>
                            <CardContent className="w-full flex flex-col sm:flex-row gap-2">
                                <Button onClick={() => handleDetectiveChoice('discuss')} disabled={isSubmitting} className="flex-1">
                                    <Vote /> بدء النقاش والتصويت
                                </Button>
                                <Button onClick={() => handleDetectiveChoice('skip')} disabled={isSubmitting} className="flex-1" variant="secondary">
                                    <Moon /> تخطي إلى الليلة الأولى
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <p className="text-center text-muted-foreground p-3 w-full animate-pulse">في انتظار قرار المحقق...</p>
                    )}
                </motion.div>
            </div>
        );
      };

    const renderNightPhase = () => {
        if (self.role === 'killer' && self.status === 'alive') {
          const potentialVictims = game.players.filter(p => p.id !== self.id && p.status === 'alive');

          return (
            <Card className="w-full max-w-lg animate-pop-in">
              <CardHeader>
                <motion.div initial={{y: -20, opacity: 0}} animate={{y: 0, opacity: 1}}>
                  <Skull className="w-16 h-16 mx-auto text-red-500"/>
                </motion.div>
                <CardTitle className="text-center text-2xl text-red-500">حان وقت الاصطياد</CardTitle>
                <CardDescription className="text-center">اختر ضحيتك التالية وقدم أسلوبًا لجريمتك.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-lg font-semibold">اختر الضحية</Label>
                   <RadioGroup 
                        value={selectedVictim || ""} 
                        onValueChange={(value) => {
                            const victim = potentialVictims.find(p => p.id === value);
                            if (!victim?.isImmune) {
                                setSelectedVictim(value);
                            } else {
                                toast({
                                    title: "لاعب محصّن",
                                    description: "هذا اللاعب نجا من محاولة اغتيال سابقة ولا يمكن استهدافه مرة أخرى.",
                                    variant: "default"
                                });
                            }
                        }}
                        className="grid grid-cols-2 gap-4 mt-2"
                    >
                    {potentialVictims.map((p, index) => (
                      <motion.div key={p.id} initial={{opacity: 0}} animate={{opacity: 1, transition: {delay: 0.1 * index}}}>
                        <Label htmlFor={p.id} className={cn('flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all', selectedVictim === p.id ? 'border-red-500 bg-red-50' : 'border-transparent bg-muted', p.isImmune ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')}>
                            <PlayerAvatar avatarId={p.avatarId} className="w-16 h-16 rounded-full"/>
                            <span className="font-bold text-lg">{p.alias}</span>
                            <RadioGroupItem value={p.id} id={p.id} className="sr-only" disabled={p.isImmune}/>
                            {p.isImmune && <span className="text-xs font-bold text-red-600">محصّن</span>}
                        </Label>
                      </motion.div>
                    ))}
                  </RadioGroup>
                </div>
                 <div>
                    <Label htmlFor="method" className="text-lg font-semibold">اكتب أسلوب القتل</Label>
                    <Textarea 
                        id="method" 
                        placeholder="مثال: طعنة في الظلام..." 
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                        className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                        سيظهر هذا الأسلوب كدليل للمحقق والمدنيين.
                    </p>
                </div>
                 <div className="flex items-center space-x-2 space-x-reverse mt-4 p-3 bg-red-900/10 border border-red-500/20 rounded-lg">
                    <Checkbox 
                        id="target-detective"
                        checked={isTargetingDetective}
                        onCheckedChange={(checked) => setIsTargetingDetective(checked as boolean)}
                        disabled={!selectedVictim || selectedVictimObject?.isImmune}
                    />
                    <div className="grid gap-1.5 leading-none">
                        <label
                          htmlFor="target-detective"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          استهداف المحقق (محاولة اغتيال)
                        </label>
                        <p className="text-xs text-muted-foreground">
                          حدد هذا الخيار إذا كنت تعتقد أن ضحيتك هي المحقق.
                        </p>
                    </div>
                </div>
              </CardContent>
              <CardFooter className="flex-col gap-2">
                 <Button 
                    variant="destructive" 
                    className="w-full" 
                    size="lg" 
                    disabled={!selectedVictim || !method.trim() || isSubmitting || selectedVictimObject?.isImmune} 
                    onClick={handlePerformKill}
                >
                  <Swords />
                  {isSubmitting ? 'جاري التنفيذ...' : 'تأكيد القتل'}
                </Button>
                 <Button 
                    variant="secondary" 
                    className="w-full" 
                    size="lg" 
                    disabled={!!game.killerSkipUsed || isSubmitting} 
                    onClick={handleSkipKill}
                >
                  <Moon />
                  {game.killerSkipUsed ? 'تم استخدام التخطي' : 'تخطي القتل (لمرة واحدة)'}
                </Button>
              </CardFooter>
            </Card>
          )
        }
    
        return (
           <Card className="w-full max-w-md text-center bg-gray-900 text-white border-indigo-500 shadow-2xl shadow-indigo-500/30">
               <CardHeader>
                   <motion.div initial={{opacity: 0, scale: 0.5}} animate={{opacity: 1, scale: 1, transition: {delay: 0.5, type: 'spring'}}}>
                       <Moon className="w-24 h-24 mx-auto text-indigo-300"/>
                   </motion.div>
                   <CardTitle className="text-3xl">حل الظلام</CardTitle>
                    <CardDescription className="text-indigo-200">
                        {self.status === 'alive' 
                            ? 'الجميع نيام... إلا القاتل. إنه يختار ضحيته التالية.'
                            : 'أنت خارج اللعبة، ولكن يمكنك مشاهدة الأحداث تتكشف.'
                        }
                    </CardDescription>
               </CardHeader>
               <CardContent>
                   <p className="text-indigo-400 animate-pulse">في انتظار شروق الشمس...</p>
               </CardContent>
           </Card>
        )
    }
    
    const renderQuietNight = (message: string) => (
        <Card className="w-full max-w-md text-center bg-gray-900 text-white border-gray-500">
            <CardHeader>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}>
                    <Moon className="w-24 h-24 mx-auto text-gray-300"/>
                </motion.div>
                <CardTitle className="text-2xl mt-4">ليلة هادئة</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-xl">{message}</p>
                <p className="text-white/80 animate-pulse mt-8">
                    {isHost ? 'جاري الانتقال إلى الصباح...' : 'في انتظار المضيف...'}
                </p>
            </CardContent>
        </Card>
    );

    const renderVictimRevealPhase = () => {
        const hasWitnessInfo = isWitness && game.witnessInfo?.killerAlias;

        if (hasWitnessInfo) {
            const isFailedAssassination = game.witnessInfo!.reason === 'assassination_failed';
            const witnessMessage = isFailedAssassination
                ? `حاول القاتل ${game.witnessInfo!.killerAlias} اغتيال ${game.witnessInfo!.victimAlias}، لكنه فشل لأنه ليس المحقق.`
                : `هاجم القاتل ${game.witnessInfo!.killerAlias} المحقق ${game.witnessInfo!.victimAlias}، لكن المحقق نجا لأنه لم يستهدف بشكل صحيح.`;
            const title = 'لقد رأيت كل شيء!';

            return (
                <Card className="w-full max-w-lg text-center border-2 border-yellow-500 bg-yellow-50/20 text-white">
                    <CardHeader>
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}>
                            <Eye className="w-24 h-24 mx-auto text-yellow-300"/>
                        </motion.div>
                        <CardTitle className="text-2xl mt-4 text-yellow-300">{title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-xl">
                           {witnessMessage}
                        </p>
                        <div className="p-3 bg-black/20 rounded-md">
                            <p className="text-sm font-bold">أسلوب القتل:</p>
                            <p className="text-base">{game.witnessInfo!.method}</p>
                        </div>
                        <p className="text-white/80 animate-pulse mt-8">
                            {isHost ? 'جاري الانتقال إلى الصباح...' : 'في انتظار المضيف...'}
                        </p>
                    </CardContent>
                </Card>
            );
        }

        const victim = game.nightAction?.victimId ? game.players.find(p => p.id === game.nightAction!.victimId && p.status === 'killed') : null;

        if (victim) {
            return (
                <div className="text-center">
                    <motion.div 
                        initial={{ opacity: 0, y: 50, scale: 0.5 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                    >
                        <PlayerAvatar avatarId={victim.avatarId} className="w-48 h-48 rounded-full mx-auto shadow-2xl border-4 border-destructive" />
                    </motion.div>
                    <motion.h2 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8, duration: 0.5 }}
                        className="mt-6 text-4xl font-bold text-white"
                    >
                        الضحية هي...
                    </motion.h2>
                    <motion.h1 
                        initial={{ opacity: 0, scale: 2 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 1.5, type: "spring", stiffness: 100 }}
                        className="mt-2 text-6xl font-extrabold text-destructive tracking-wider"
                        style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.7)' }}
                    >
                        {victim.alias}
                    </motion.h1>
                     <p className="text-white/80 animate-pulse mt-8">
                        {isHost ? 'جاري الانتقال إلى الصباح...' : 'في انتظار المضيف...'}
                    </p>
                </div>
            );
        }
        
        return renderQuietNight("مرت الليلة بسلام، لم يحدث شيء.");
    };

    const renderDayPhase = () => {
        let nightEventContent;
    
        if (game.detectiveAlert) {
             nightEventContent = (
                 <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2 text-center">
                    <ShieldCheck className="w-12 h-12 mx-auto text-blue-500" />
                    <p className="font-semibold text-blue-800">تنبيه للمحقق!</p>
                    <p className="text-sm text-blue-600">
                       استخدم مساعد القاتل <strong>{game.detectiveAlert}</strong> ميزته للتحدث باسمك.
                    </p>
                </div>
             )
        } else {
             const victimKilled = game.nightAction?.victimId && game.players.find(p => p.id === game.nightAction.victimId && p.status === 'killed');
            if (victimKilled) {
                nightEventContent = (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg space-y-2 text-center">
                      <Sunrise className="w-12 h-12 mx-auto text-yellow-500" />
                      <p className="font-semibold">تم العثور على <strong className="text-destructive">{victimKilled.alias}</strong> مقتولاً.</p>
                      {game.nightAction.method && (
                        <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-left">
                            <p><strong>أسلوب القتل:</strong> {game.nightAction.method}</p>
                        </div>
                      )}
                    </div>
                );
            } else if (game.turn && game.turn > 1) { // It's not the first day and no one died
                 nightEventContent = (
                    <div className="p-4 bg-gray-100 border border-gray-200 rounded-lg space-y-2 text-center">
                        <Moon className="w-12 h-12 mx-auto text-gray-500" />
                        <p className="font-semibold text-gray-800">ليلة هادئة</p>
                        <p className="text-sm text-gray-600">مرت الليلة بسلام، لم يحدث شيء.</p>
                    </div>
                );
            } else { // First day
                nightEventContent = <p className="text-center text-muted-foreground">بداية جولة النقاش الأولى.</p>;
            }
        }


        return (
          <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>اليوم {game.turn || 1}</CardTitle>
                </CardHeader>
                <CardContent>
                   {nightEventContent}
                </CardContent>
              </Card>

              {isWitness && game.witnessInfo && (
                <motion.div initial={{opacity: 0}} animate={{opacity: 1}} transition={{delay: 0.5}}>
                    <Card className="border-yellow-500 bg-yellow-50/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-yellow-600"><Eye /> معلومة سرية</CardTitle>
                            <CardDescription>لقد شهدت على خطأ القاتل.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <p className="text-center text-lg">
                                القاتل هو <strong className="text-destructive">{game.witnessInfo.killerAlias}</strong>.
                            </p>
                             <div className="text-sm text-center p-2 bg-yellow-100/50 rounded-md">
                                <p>حاول قتل <strong className="text-blue-700">{game.witnessInfo.victimAlias}</strong> باستخدام: "{game.witnessInfo.method}"</p>
                            </div>
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
               {isAccomplice && self.status === 'alive' && !accomplicePowerUsed && (
                <Card className="border-purple-500">
                    <CardHeader>
                        <CardTitle className="text-purple-600">ميزة خاصة: انتحال الهوية</CardTitle>
                        <CardDescription>استخدم هذه الميزة لمرة واحدة للتحدث كالمحقق وتضليل الآخرين.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center space-x-2 space-x-reverse">
                            <Checkbox id="accomplice-power" checked={isUsingAccomplicePower} onCheckedChange={c => setIsUsingAccomplicePower(c as boolean)} />
                            <label htmlFor="accomplice-power" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                تفعيل القدرة للرسالة القادمة
                            </label>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">عند الإرسال، سيتلقى المحقق الحقيقي تنبيهًا بكشف هويتك.</p>
                    </CardContent>
                </Card>
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
                            {(game.messages || []).map((msg) => {
                                const key = (msg as any).clientTempId || `${msg.timestamp.toMillis()}-${msg.senderId}`;
                                const isSelfMsg = msg.senderId === self.id;
                                const genericName = playerNumberMap[msg.senderId] || 'لاعب غير معروف';
                                let displayName: string;

                                if (self.role === 'detective') {
                                    if (msg.isDetective) {
                                        displayName = `المحقق (${genericName})`;
                                    } else {
                                        displayName = `${msg.senderAlias} (${genericName})`;
                                    }
                                } else {
                                    if (isSelfMsg) {
                                        displayName = genericName;
                                    } else if (msg.isDetective) {
                                        displayName = "المحقق";
                                    } else {
                                        displayName = genericName;
                                    }
                                }
    
                                return (
                                    <div key={key} className={cn("flex flex-col gap-1", isSelfMsg ? "items-end" : "items-start")}>
                                        <div className={cn("rounded-lg px-3 py-2 max-w-sm", isSelfMsg ? "bg-primary text-primary-foreground" : "bg-muted")}>
                                            <p className="font-bold text-xs mb-1">{displayName}</p>
                                            <p className="text-sm">{msg.text}</p>
                                        </div>
                                    </div>
                                )
                            })}
                            <div ref={messagesEndRef} />
                         </div>
                       </ScrollArea>
                       {self.status === 'alive' ? (
                         <div className="flex gap-2 pt-2 border-t">
                            <Input 
                                ref={chatInputRef}
                                placeholder="اكتب رسالتك..." 
                                value={chatMessage} 
                                onChange={(e) => setChatMessage(e.target.value)} 
                                onKeyPress={(e) => e.key === 'Enter' && !isSubmitting && handleSendMessage()}
                                disabled={isSubmitting}
                            />
                            <Button onClick={handleSendMessage} disabled={isSubmitting || !chatMessage.trim()}><Send /></Button>
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
        const { tied, message } = game.lastVoteResult || {};
    
        const resultMessage = message || (tied ? 'حدث تعادل في الأصوات! لا أحد سيغادر هذه الجولة.' : 'انتهى التصويت.');
    
        return (
            <Card className="w-full max-w-md animate-pop-in text-center">
                <CardHeader>
                    <Gavel className="w-20 h-20 mx-auto text-primary"/>
                    <CardTitle className="text-3xl mt-2">نتيجة التصويت</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-xl">
                    <p>{resultMessage}</p>
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

        return (
          <Card className={`w-full max-w-lg animate-pop-in text-center ${isKillerWinner ? 'border-destructive' : 'border-green-500'}`}>
              <CardHeader>
                  {isKillerWinner ? <Skull className="w-24 h-24 mx-auto text-destructive"/> : <ShieldCheck className="w-24 h-24 mx-auto text-green-500"/>}
                  <CardTitle className="text-4xl mt-4">انتهت اللعبة!</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
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
        return (
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
        )
    }

    const renderContent = () => {
        switch(game.gameState) {
            case 'aliases': return renderAliasSelection();
            case 'roles':
                if (!self.role) {
                    return (
                        <Card className="w-full max-w-sm text-center">
                            <CardHeader>
                                <CardTitle>جاري توزيع الأدوار...</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground animate-pulse">
                                    يتم الآن تحديد الأدوار بشكل سري.
                                </p>
                            </CardContent>
                        </Card>
                    );
                }
                return renderRoleReveal();
            case 'crime_scene': return renderCrimeScene();
            case 'night': return renderNightPhase();
            case 'victim_reveal': return renderVictimRevealPhase();
            case 'discussion': return renderDayPhase();
            case 'voting_results': return renderVotingResultsPhase();
            case 'ended': return renderGameEndPhase();
            default: return <p>حالة غير معروفة في لعبة "القاتل"...</p>;
        }
    }
    
    return (
        <>
            {renderContent()}
            {renderKillerModals()}
        </>
    );
}
