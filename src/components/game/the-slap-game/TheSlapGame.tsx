
"use client";

import { useState } from 'react';
import type { Game, Player } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { submitDescription, submitGuesses, nextSlapRound } from '@/lib/actions/the-slap-game';
import { Send, FileText, Users, CheckCircle2 } from 'lucide-react';

interface TheSlapGameProps {
    game: Game;
    self: Player;
}

export function TheSlapGame({ game, self }: TheSlapGameProps) {
    const { toast } = useToast();
    const [description, setDescription] = useState('');
    const [guesses, setGuesses] = useState<{ describedId?: string; describerId?: string }>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isDescriber = game.slapState?.currentDescriberId === self.id;
    const hasDescribed = !!game.slapState?.description;
    const hasGuessed = !!game.slapState?.guesses?.[self.id];

    const handleSubmitDescription = async () => {
        if (!description.trim()) {
            toast({ title: "الوصف لا يمكن أن يكون فارغًا", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            await submitDescription(game.id, self.id, description);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmitGuesses = async () => {
        if (!guesses.describedId || !guesses.describerId) {
            toast({ title: "الرجاء تخمين الواصف والموصوف", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            await submitGuesses(game.id, self.id, guesses.describedId, guesses.describerId);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleNextRound = async () => {
         setIsSubmitting(true);
        try {
            await nextSlapRound(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }


    const renderDescriptionPhase = () => {
        const describedPlayer = game.players.find(p => p.id === game.slapState?.currentDescribedId);

        return (
            <Card className="w-full max-w-lg animate-pop-in">
                <CardHeader>
                    <CardTitle className="text-center">الجولة {game.round || 1}</CardTitle>
                    <CardDescription className="text-center text-lg">
                        {isDescriber ? `حان دورك لوصف ${describedPlayer?.name || 'لاعب'}.` : `في انتظار ${game.players.find(p => p.id === game.slapState?.currentDescriberId)?.name} لوصف أحد اللاعبين.`}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isDescriber ? (
                        hasDescribed ? (
                            <p className="text-center text-green-600 font-bold p-4 bg-green-50 rounded-lg">تم إرسال وصفك بنجاح. في انتظار بقية اللاعبين...</p>
                        ) : (
                            <div className="space-y-4">
                                <p>صف هذا اللاعب بكلمات أو رموز دون ذكر اسمه. كن مبدعًا!</p>
                                <Textarea
                                    placeholder="اكتب وصفك هنا..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={4}
                                />
                                <Button onClick={handleSubmitDescription} disabled={isSubmitting} className="w-full">
                                    <Send className="mr-2" /> {isSubmitting ? 'جاري الإرسال...' : 'إرسال الوصف'}
                                </Button>
                            </div>
                        )
                    ) : (
                        <p className="text-center text-muted-foreground animate-pulse p-4">الواصف يكتب الآن...</p>
                    )}
                </CardContent>
            </Card>
        );
    };
    
    const renderGuessingPhase = () => {
        return (
            <Card className="w-full max-w-lg animate-pop-in">
                <CardHeader>
                    <CardTitle className="text-center">خمن من؟</CardTitle>
                    <CardDescription className="text-center">بطاقة وصف مجهولة تم رميها. من هو الواصف ومن هو الموصوف؟</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="p-6 bg-yellow-100/50 border-2 border-dashed border-yellow-300 rounded-lg text-center">
                        <p className="text-xl font-bold">"{game.slapState?.description}"</p>
                    </div>

                    {hasGuessed ? (
                        <p className="text-center text-green-600 font-bold p-4 bg-green-50 rounded-lg">تم تسجيل تخمينك. في انتظار الآخرين...</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="font-bold">من هو الشخص الموصوف؟</label>
                                <Select onValueChange={(value) => setGuesses(g => ({ ...g, describedId: value }))}>
                                    <SelectTrigger><SelectValue placeholder="اختر لاعب..." /></SelectTrigger>
                                    <SelectContent>
                                        {game.players.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="font-bold">من هو الشخص الواصف؟</label>
                                <Select onValueChange={(value) => setGuesses(g => ({ ...g, describerId: value }))}>
                                    <SelectTrigger><SelectValue placeholder="اختر لاعب..." /></SelectTrigger>
                                    <SelectContent>
                                        {game.players.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    {!hasGuessed && (
                        <Button onClick={handleSubmitGuesses} disabled={isSubmitting || !guesses.describedId || !guesses.describerId} className="w-full">
                            <CheckCircle2 className="mr-2" /> {isSubmitting ? 'جاري الحفظ...' : 'حفظ التخمينات'}
                        </Button>
                    )}
                </CardFooter>
            </Card>
        );
    };

    const renderResultsPhase = () => {
        const describer = game.players.find(p => p.id === game.slapState?.currentDescriberId);
        const described = game.players.find(p => p.id === game.slapState?.currentDescribedId);
        const lastRoundPoints = game.slapState?.lastRoundPoints || {};
        
        return (
            <Card className="w-full max-w-2xl animate-pop-in">
                <CardHeader>
                    <CardTitle className="text-center">نتائج الجولة</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="p-4 bg-muted rounded-lg space-y-2">
                        <p><strong>الواصف:</strong> {describer?.name}</p>
                        <p><strong>الموصوف:</strong> {described?.name}</p>
                        <p className="text-lg font-bold border-t pt-2 mt-2"><strong>الوصف كان:</strong> "{game.slapState?.description}"</p>
                    </div>

                    <div className="space-y-2">
                        <h3 className="font-bold text-lg">النقاط المكتسبة/المخصومة:</h3>
                        {game.players.map(p => (
                            <div key={p.id} className="flex justify-between items-center p-2 bg-card border rounded-md">
                                <div className='flex items-center gap-2'>
                                  <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                                  <span>{p.name}</span>
                                </div>
                                <span className={`font-bold text-lg ${lastRoundPoints[p.id] > 0 ? 'text-green-500' : lastRoundPoints[p.id] < 0 ? 'text-red-500' : ''}`}>
                                  {lastRoundPoints[p.id] > 0 ? `+${lastRoundPoints[p.id]}` : lastRoundPoints[p.id] || 0}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-2">
                        <h3 className="font-bold text-lg">مجموع النقاط:</h3>
                        {game.players.map(p => (
                            <div key={p.id} className="flex justify-between items-center p-2 bg-card border rounded-md">
                                <div className='flex items-center gap-2'>
                                  <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                                  <span>{p.name}</span>
                                </div>
                               <span className="font-bold text-lg text-primary">{game.playerScores?.[p.id] || 0}</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleNextRound} disabled={isSubmitting} className="w-full">
                        {isSubmitting ? 'جاري التحميل...' : 'الجولة التالية'}
                    </Button>
                </CardFooter>
            </Card>
        );
    };

    switch (game.gameState) {
        case 'slap-describing':
            return renderDescriptionPhase();
        case 'slap-guessing':
            return renderGuessingPhase();
        case 'slap-results':
            return renderResultsPhase();
        default:
            return (
                <Card>
                    <CardHeader>
                        <CardTitle>لعبة الصفعة</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>حالة غير معروفة: {game.gameState}</p>
                    </CardContent>
                </Card>
            );
    }
}
