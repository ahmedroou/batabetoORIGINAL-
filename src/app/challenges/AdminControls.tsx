
"use client";

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createChallenge } from '@/lib/actions/challenges';
import { Game } from '@/types';
import { PlusCircle, Loader2, Shield, ShieldCheck, CircleDollarSign, Diamond } from 'lucide-react';
import { motion } from 'framer-motion';

const GAME_TYPE_NAMES: Record<Game['gameType'], string> = {
    'king-of-genius': 'ساحة العباقرة',
    'trap-answer': 'الجواب المفخخ',
    'prison': 'السجن',
    'behind-the-mask': 'خلف القناع',
    'word_war': 'حرب الكلمات',
};

export default function AdminControls() {
    const { toast } = useToast();
    const [title, setTitle] = useState('');
    const [gameType, setGameType] = useState<Game['gameType'] | ''>('');
    const [prizeValue, setPrizeValue] = useState('');
    const [prizeCurrency, setPrizeCurrency] = useState<'coins' | 'diamonds'>('coins');
    const [entryFee, setEntryFee] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const handleCreateChallenge = async () => {
        if (!title || !gameType || !endDate) {
            toast({ title: "الرجاء ملء جميع الحقول المطلوبة", variant: 'destructive' });
            return;
        }
        setIsCreating(true);
        const result = await createChallenge({
            title,
            gameType: gameType as Game['gameType'],
            prize: { type: prizeCurrency, value: Number(prizeValue) || 0 },
            entryFee: { type: 'leaderboardPoints', value: Number(entryFee) || 0 },
            endsAt: new Date(endDate),
        });

        if (result.success) {
            toast({ title: "تم إنشاء التحدي بنجاح!", description: "سيظهر في قائمة التحديات لجميع اللاعبين." });
            setTitle('');
            setGameType('');
            setPrizeValue('');
            setEntryFee('');
            setEndDate('');
        } else {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
        }
        setIsCreating(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
        >
            <Card className="bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Shield /> لوحة تحكم التحديات</CardTitle>
                    <CardDescription className="text-gray-400">قم بإعداد بطولة جديدة يمكن للاعبين المشاركة فيها.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="challenge-title">عنوان التحدي</Label>
                        <Input className="bg-gray-900/70 border-gray-600" id="challenge-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: بطولة عيد الأضحى" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="game-type">نوع اللعبة</Label>
                            <Select value={gameType} onValueChange={(v) => setGameType(v as Game['gameType'])}>
                                <SelectTrigger id="game-type" className="bg-gray-900/70 border-gray-600">
                                    <SelectValue placeholder="اختر لعبة..." />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-900 text-white border-purple-500">
                                    {Object.entries(GAME_TYPE_NAMES).map(([type, name]) => (
                                        <SelectItem key={type} value={type}>{name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                             <Label htmlFor="prize-value">قيمة الجائزة</Label>
                             <div className="flex gap-1">
                                <Input className="bg-gray-900/70 border-gray-600" id="prize-value" type="number" value={prizeValue} onChange={(e) => setPrizeValue(e.target.value)} placeholder="0" />
                                <Select value={prizeCurrency} onValueChange={setPrizeCurrency}>
                                    <SelectTrigger className="w-24 bg-gray-900/70 border-gray-600">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-900 text-white border-purple-500">
                                        <SelectItem value="coins"><CircleDollarSign className="w-4 h-4 text-yellow-400"/></SelectItem>
                                        <SelectItem value="diamonds"><Diamond className="w-4 h-4 text-blue-400"/></SelectItem>
                                    </SelectContent>
                                </Select>
                             </div>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="entry-fee">رسوم الدخول (نقاط)</Label>
                            <Input className="bg-gray-900/70 border-gray-600" id="entry-fee" type="number" value={entryFee} onChange={(e) => setEntryFee(e.target.value)} placeholder="0" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="end-date">تاريخ انتهاء التحدي</Label>
                        <Input className="bg-gray-900/70 border-gray-600" id="end-date" type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                    <Button onClick={handleCreateChallenge} disabled={isCreating} className="w-full bg-purple-600 hover:bg-purple-700">
                        {isCreating ? <Loader2 className="animate-spin" /> : <PlusCircle />}
                        إنشاء التحدي
                    </Button>
                </CardContent>
            </Card>
        </motion.div>
    );
}
