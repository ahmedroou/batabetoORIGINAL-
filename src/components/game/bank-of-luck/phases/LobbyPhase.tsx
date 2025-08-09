
"use client";

import { useState, useMemo } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import { PlayerAvatar } from '../../PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Copy, Check, UserX, Settings, Loader2, Save, ArrowRight, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import * as roomActions from '@/lib/actions/room';
import * as bankOfLuckActions from '@/lib/actions/bank-of-luck';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const HowToPlayDialog = () => (
    <Dialog>
        <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
                <HelpCircle className="ml-2 h-4 w-4" />
                كيفية اللعب
            </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
            <DialogHeader>
                <DialogTitle>كيفية لعب بنك الحظ</DialogTitle>
                <DialogDescription>
                    الهدف هو أن تكون أغنى لاعب في نهاية اللعبة عن طريق شراء العقارات وجمع الإيجارات.
                </DialogDescription>
            </DialogHeader>
            <div className="prose prose-sm dark:prose-invert max-h-96 overflow-y-auto pr-4">
                <h4>1. الهدف من اللعبة</h4>
                <p>كن أثرى لاعب في نهاية عدد الجولات المحددة. اللاعب الذي يجمع أكبر ثروة (نقدية + قيمة العقارات) هو الفائز.</p>

                <h4>2. بدء اللعبة</h4>
                <p>يبدأ كل لاعب بمبلغ 1000 دينار. يتم تحديد ترتيب اللاعبين عشوائياً.</p>

                <h4>3. مراحل الدور الواحد</h4>
                <ul>
                    <li><strong>رمي النرد:</strong> في دورك، قم برمي النرد لتحديد عدد الخطوات التي ستتحركها على اللوحة.</li>
                    <li><strong>التحرك:</strong> تتحرك شخصيتك تلقائيًا على اللوحة. إذا مررت بنقطة البداية، ستحصل على 100 دينار.</li>
                    <li><strong>ماذا يحدث عند التوقف؟</strong>
                        <ul>
                            <li><strong>عقار غير مملوك:</strong> يمكنك شراؤه. للشراء، يجب عليك الإجابة على سؤال بشكل صحيح. إذا أجبت خطأ، ستدفع غرامة. يمكنك أيضًا تخطي الشراء.</li>
                            <li><strong>عقار مملوك للاعب آخر:</strong> يجب عليك دفع الإيجار المحدد لصاحب العقار فوراً.</li>
                            <li><strong>عقار تملكه أنت:</strong> لا يحدث شيء، أنت في أمان.</li>
                            <li><strong>بطاقة حظ:</strong> ستحصل على مبلغ مالي عشوائي (ربح أو خسارة).</li>
                            <li><strong>غرامة:</strong> ستدفع المبلغ المحدد للبنك.</li>
                        </ul>
                    </li>
                </ul>

                <h4>4. الإفلاس</h4>
                <p>إذا انخفض رصيدك إلى ما دون الصفر ولم تتمكن من دفع ديونك، تعتبر مفلساً وتخرج من اللعبة. تعود جميع ممتلكاتك إلى البنك وتصبح متاحة للشراء من قبل اللاعبين الآخرين.</p>
                
                <h4>5. نهاية اللعبة</h4>
                <p>تنتهي اللعبة إما بخروج جميع اللاعبين باستثناء لاعب واحد، أو بانتهاء عدد الجولات المحددة من قبل المضيف. يتم بعد ذلك حساب الثروة الإجمالية لكل لاعب، واللاعب الأكثر ثراءً هو الفائز.</p>
            </div>
        </DialogContent>
    </Dialog>
);


interface LobbyPhaseProps {
    game: Game;
    self: Player;
}

export function LobbyPhase({ game, self }: LobbyPhaseProps) {
    const { toast } = useToast();
    const router = useRouter();
    const isHost = game.hostId === self.id;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [playerToKick, setPlayerToKick] = useState<Player | null>(null);
    const [settings, setSettings] = useState(game.bankOfLuckState?.settings || { rounds: 15 });

    
    const activePlayers = useMemo(() => game?.players.filter(p => p.status !== 'left') || [], [game?.players]);

    const handleLeaveGame = async () => {
        setIsSubmitting(true);
        const result = await roomActions.leaveGame(game.id, self.id);
        if (result.success) {
            sessionStorage.removeItem(`player-${game.id}`);
            router.push('/');
            toast({ title: "لقد غادرت الغرفة." });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsSubmitting(false);
    };

    const handleKickPlayer = async () => {
        if (!playerToKick || !isHost) return;
        setIsSubmitting(true);
        const result = await roomActions.kickPlayerFromLobby(game.id, self.id, playerToKick.id);
        if (result.error) {
            toast({ title: "خطأ في الطرد", description: result.error, variant: "destructive" });
        } else {
            toast({ title: "نجاح", description: `تم طرد اللاعب ${playerToKick.name}.` });
        }
        setPlayerToKick(null);
        setIsSubmitting(false);
    };

    const handleStartGame = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await bankOfLuckActions.startGame(game.id, self.id);
        } catch (e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleSaveSettings = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await bankOfLuckActions.updateGameSettings(game.id, self.id, settings);
            toast({ title: "تم حفظ الإعدادات بنجاح" });
        } catch(e: any) {
            toast({ title: "خطأ في حفظ الإعدادات", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleCopyId = () => {
        setIsCopying(true);
        navigator.clipboard.writeText(game.id);
        setTimeout(() => setIsCopying(false), 2000);
    };


    return (
        <>
            <Card className="w-full max-w-md animate-bounce-in">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">بنك الحظ</CardTitle>
                    <CardDescription>ادعُ أصدقاءك. تبدأ اللعبة بلاعبين على الأقل.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input value={game.id} readOnly className="text-center tracking-widest font-mono text-lg h-12 flex-grow" />
                        <TooltipProvider>
                            <Tooltip open={isCopying}>
                                <TooltipTrigger asChild>
                                    <Button onClick={handleCopyId} size="lg" variant="secondary" className="px-4">
                                        {isCopying ? <Check /> : <Copy />}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>تم النسخ!</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                     {isHost && (
                         <div className="space-y-2 pt-2">
                             <Label htmlFor="rounds">عدد الجولات</Label>
                             <div className="flex items-center gap-2">
                                <Input 
                                    id="rounds"
                                    type="number"
                                    value={settings.rounds}
                                    onChange={(e) => setSettings({ ...settings, rounds: parseInt(e.target.value, 10) || 1 })}
                                    className="flex-grow"
                                />
                                 <Button onClick={handleSaveSettings} disabled={isSubmitting}>
                                     {isSubmitting ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />}
                                </Button>
                             </div>
                        </div>
                     )}
                    <div className="space-y-2">
                        <Label>اللاعبون ({activePlayers.length})</Label>
                        <div className="rounded-md border p-4 space-y-3 bg-muted/50 min-h-[120px]">
                            {activePlayers.map(p => (
                                <div key={p.id} className="font-medium flex items-center justify-between gap-3 animate-fade-in">
                                    <div className="flex items-center gap-3">
                                        <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 rounded-full shadow-md" temporaryTitle={p.temporaryTitle} />
                                        <p className="font-bold text-lg">{p.name}</p>
                                    </div>
                                    {isHost && p.id !== self?.id && (
                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setPlayerToKick(p)}>
                                            <UserX className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    {isHost ? (
                        <Button onClick={handleStartGame} disabled={isSubmitting || activePlayers.length < 2} className="w-full" size="lg">
                            <ArrowRight className="mr-2 h-4 w-4" />
                            {isSubmitting ? "..." : activePlayers.length < 2
                                ? `تحتاج ${2 - activePlayers.length} لاعبين على الأقل`
                                : "ابدأ اللعبة"}
                        </Button>
                    ) : (
                        <p className="text-center text-muted-foreground p-4 bg-muted/50 rounded-md animate-pulse">في انتظار صاحب الغرفة لبدء اللعبة...</p>
                    )}
                    <HowToPlayDialog />
                    <Button onClick={handleLeaveGame} variant="outline" className="w-full" disabled={isSubmitting}>
                        <LogOut className="mr-2 h-4 w-4" /> {isSubmitting ? 'جاري المغادرة...' : 'مغادرة الغرفة'}
                    </Button>
                </CardFooter>
            </Card>

            <AlertDialog open={!!playerToKick} onOpenChange={(open) => !open && setPlayerToKick(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                        <AlertDialogDescription>
                            هل تريد حقًا طرد اللاعب "{playerToKick?.name}" من الغرفة؟ لن يتمكن من الانضمام مرة أخرى.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                        <AlertDialogAction onClick={handleKickPlayer} disabled={isSubmitting} className={cn(buttonVariants({ variant: "destructive" }))}>
                            {isSubmitting ? "جاري الطرد..." : "نعم، قم بطرده"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

