
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
    const [prizeCoins, setPrizeCoins] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const handleCreateChallenge = async () => {
        if (!title || !gameType || !endDate) {
            toast({ title: "الرجاء ملء جميع الحقول", variant: 'destructive' });
            return;
        }
        setIsCreating(true);
        const result = await createChallenge({
            title,
            gameType: gameType as Game['gameType'],
            prize: { type: 'coins', value: Number(prizeCoins) || 0 },
            endsAt: new Date(endDate),
        });

        if (result.success) {
            toast({ title: "تم إنشاء التحدي بنجاح!" });
            setTitle('');
            setGameType('');
            setPrizeCoins('');
            setEndDate('');
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
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="game-type">نوع اللعبة</Label>
                        <Select value={gameType} onValueChange={(v) => setGameType(v as Game['gameType'])}>
                            <SelectTrigger id="game-type">
                                <SelectValue placeholder="اختر لعبة..." />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(GAME_TYPE_NAMES).map(([type, name]) => {
                                    if(type === 'the-castle') return null; // Exclude 'the-castle'
                                    return <SelectItem key={type} value={type}>{name}</SelectItem>
                                })}
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="prize-coins">جائزة الكوينز (اختياري)</Label>
                        <Input id="prize-coins" type="number" value={prizeCoins} onChange={(e) => setPrizeCoins(e.target.value)} placeholder="0" />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="end-date">تاريخ انتهاء التحدي</Label>
                    <Input id="end-date" type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
                <Button onClick={handleCreateChallenge} disabled={isCreating} className="w-full">
                    {isCreating ? <Loader2 className="animate-spin" /> : <PlusCircle />}
                    إنشاء التحدي
                </Button>
            </CardContent>
        </Card>
    );
}
