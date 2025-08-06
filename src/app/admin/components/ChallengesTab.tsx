"use client";

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createChallenge } from '@/lib/actions/challenges';
import { Game, GAME_TYPE_NAMES } from '@/types';
import { PlusCircle, Loader2 } from 'lucide-react';

export default function ChallengesTab() {
    const { toast } = useToast();
    const [title, setTitle] = useState('');
    const [gameType, setGameType] = useState<Game['gameType'] | ''>('');
    const [prizeType, setPrizeType] = useState<'coins' | 'diamonds' | 'leaderboardPoints' | 'honorPoints'>('coins');
    const [prizeValue, setPrizeValue] = useState('');
    const [entryFeeType, setEntryFeeType] = useState<'coins' | 'leaderboardPoints' | 'free'>('free');
    const [entryFeeValue, setEntryFeeValue] = useState('');
    const [durationHours, setDurationHours] = useState('24');
    const [minPlayers, setMinPlayers] = useState('2');
    const [isCreating, setIsCreating] = useState(false);

    const handleCreateChallenge = async () => {
        if (!title || !gameType || !durationHours || !minPlayers) {
            toast({ title: "الرجاء ملء جميع الحقول المطلوبة", variant: 'destructive' });
            return;
        }
        const minPlayersNum = parseInt(minPlayers, 10);
        if (isNaN(minPlayersNum) || minPlayersNum < 2) {
            toast({ title: "الحد الأدنى للاعبين يجب أن يكون 2 على الأقل", variant: 'destructive' });
            return;
        }

        setIsCreating(true);
        const result = await createChallenge({
            title,
            gameType: gameType as Game['gameType'],
            prize: { type: prizeType, value: Number(prizeValue) || 0 },
            entryFee: {
                type: entryFeeType === 'free' ? 'coins' : entryFeeType, // Use a default type for free
                value: entryFeeType === 'free' ? 0 : Number(entryFeeValue) || 0,
            },
            durationInHours: Number(durationHours),
            minPlayersToStart: minPlayersNum,
        });

        if (result.success) {
            toast({ title: "تم إنشاء التحدي بنجاح!", description: "تم إنشاء غرفة للبطولة." });
            // Reset form
            setTitle('');
            setGameType('');
            setPrizeType('coins');
            setPrizeValue('');
            setEntryFeeType('free');
            setEntryFeeValue('');
            setDurationHours('24');
            setMinPlayers('2');
        } else {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
        }
        setIsCreating(false);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>إنشاء تحدي جديد</CardTitle>
                <CardDescription>قم بإعداد بطولة جديدة يمكن للاعبين المشاركة فيها.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="challenge-title">عنوان التحدي</Label>
                    <Input id="challenge-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: بطولة عيد الأضحى" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="game-type">نوع اللعبة</Label>
                    <Select value={gameType} onValueChange={(v) => setGameType(v as Game['gameType'])}>
                        <SelectTrigger id="game-type">
                            <SelectValue placeholder="اختر لعبة..." />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(GAME_TYPE_NAMES).map(([type, name]) => (
                                <SelectItem key={type} value={type}>{name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>الجائزة</Label>
                        <div className="flex gap-2">
                            <Select value={prizeType} onValueChange={(v) => setPrizeType(v as any)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="coins">كوينز</SelectItem>
                                    <SelectItem value="diamonds">ألماس</SelectItem>
                                    <SelectItem value="leaderboardPoints">نقاط صدارة</SelectItem>
                                    <SelectItem value="honorPoints">نقاط شرف</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input type="number" value={prizeValue} onChange={(e) => setPrizeValue(e.target.value)} placeholder="القيمة" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>رسوم الدخول</Label>
                         <div className="flex gap-2">
                            <Select value={entryFeeType} onValueChange={(v) => setEntryFeeType(v as any)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="free">مجاني</SelectItem>
                                    <SelectItem value="coins">كوينز</SelectItem>
                                    <SelectItem value="leaderboardPoints">نقاط صدارة</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input type="number" value={entryFeeValue} onChange={(e) => setEntryFeeValue(e.target.value)} placeholder="القيمة" disabled={entryFeeType === 'free'} />
                        </div>
                    </div>
                </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="duration-hours">مدة البطولة (بالساعات)</Label>
                        <Input id="duration-hours" type="number" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} placeholder="24" min="1" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="min-players">الحد الأدنى للاعبين للبدء</Label>
                        <Input id="min-players" type="number" value={minPlayers} onChange={(e) => setMinPlayers(e.target.value)} placeholder="2" min="2" />
                    </div>
                </div>

                <Button onClick={handleCreateChallenge} disabled={isCreating} className="w-full">
                    {isCreating ? <Loader2 className="animate-spin" /> : <PlusCircle />}
                    إنشاء التحدي
                </Button>
            </CardContent>
        </Card>
    );
}
