"use client";

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createChallenge } from '@/lib/actions/challenges';
import { Game, GAME_TYPE_NAMES, ChallengePrize } from '@/types';
import { PlusCircle, Loader2, Trash2 } from 'lucide-react';

const PrizeInput = ({ prize, onUpdate, onRemove }: { prize: ChallengePrize, onUpdate: (p: ChallengePrize) => void, onRemove: () => void }) => {
    return (
        <div className="flex gap-2 items-center bg-muted p-2 rounded-md">
            <Select value={prize.type} onValueChange={(v) => onUpdate({ ...prize, type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="coins">كوينز</SelectItem>
                    <SelectItem value="diamonds">ألماس</SelectItem>
                    <SelectItem value="honorPoints">نقاط شرف</SelectItem>
                </SelectContent>
            </Select>
            <Input type="text" inputMode="numeric" pattern="[0-9]*" value={prize.value} onChange={(e) => onUpdate({ ...prize, value: Number(e.target.value) || 0 })} placeholder="القيمة" />
            <Button size="icon" variant="ghost" className="text-destructive" onClick={onRemove}><Trash2 className="w-4 h-4" /></Button>
        </div>
    );
};


export default function ChallengesTab() {
    const { toast } = useToast();
    const [title, setTitle] = useState('');
    const [durationHours, setDurationHours] = useState('168'); // Default to 1 week
    const [targetPoints, setTargetPoints] = useState('100');
    const [specificGameType, setSpecificGameType] = useState<Game['gameType'] | 'all'>('all');
    
    const [firstPlacePrizes, setFirstPlacePrizes] = useState<ChallengePrize[]>([{ type: 'coins', value: 5 }]);
    const [secondPlacePrizes, setSecondPlacePrizes] = useState<ChallengePrize[]>([{ type: 'coins', value: 50 }]);
    const [thirdPlacePrizes, setThirdPlacePrizes] = useState<ChallengePrize[]>([{ type: 'coins', value: 25 }]);

    const [isCreating, setIsCreating] = useState(false);

    const handlePrizeChange = (setter: React.Dispatch<React.SetStateAction<ChallengePrize[]>>, index: number, updatedPrize: ChallengePrize) => {
        setter(prev => prev.map((p, i) => i === index ? updatedPrize : p));
    };

    const addPrize = (setter: React.Dispatch<React.SetStateAction<ChallengePrize[]>>) => {
        setter(prev => [...prev, { type: 'coins', value: 0 }]);
    };

    const removePrize = (setter: React.Dispatch<React.SetStateAction<ChallengePrize[]>>, index: number) => {
        setter(prev => prev.filter((_, i) => i !== index));
    };


    const handleCreateChallenge = async () => {
        if (!title || !durationHours || !targetPoints) {
            toast({ title: "الرجاء ملء جميع الحقول المطلوبة", variant: 'destructive' });
            return;
        }

        setIsCreating(true);
        const result = await createChallenge({
            title,
            durationInHours: Number(durationHours),
            targetPoints: Number(targetPoints),
            specificGameType,
            firstPlacePrize: firstPlacePrizes.filter(p => p.value > 0),
            secondPlacePrize: secondPlacePrizes.filter(p => p.value > 0),
            thirdPlacePrize: thirdPlacePrizes.filter(p => p.value > 0),
        });

        if (result.success) {
            toast({ title: "تم إنشاء البطولة بنجاح!" });
            // Reset form
            setTitle('');
            setDurationHours('168');
            setTargetPoints('100');
            setSpecificGameType('all');
            setFirstPlacePrizes([{ type: 'coins', value: 5 }]);
            setSecondPlacePrizes([{ type: 'coins', value: 50 }]);
            setThirdPlacePrizes([{ type: 'coins', value: 25 }]);
        } else {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
        }
        setIsCreating(false);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>إنشاء بطولة جديدة</CardTitle>
                <CardDescription>قم بإعداد بطولة جديدة قائمة على تجميع نقاط الصدارة.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="challenge-title">عنوان البطولة</Label>
                    <Input id="challenge-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: بطولة عيد الأضحى" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="space-y-2">
                        <Label htmlFor="target-points">نقاط الصدارة المستهدفة</Label>
                        <Input id="target-points" type="text" inputMode="numeric" pattern="[0-9]*" value={targetPoints} onChange={(e) => setTargetPoints(e.target.value)} placeholder="100" />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="duration-hours">مدة البطولة (بالساعات)</Label>
                        <Input id="duration-hours" type="text" inputMode="numeric" pattern="[0-9]*" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} placeholder="168" />
                    </div>
                </div>

                 <div className="space-y-2">
                    <Label htmlFor="game-type">نوع البطولة</Label>
                    <Select value={specificGameType} onValueChange={(v) => setSpecificGameType(v as any)}>
                        <SelectTrigger id="game-type">
                            <SelectValue placeholder="اختر نوع البطولة..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">شاملة (كل الألعاب)</SelectItem>
                            {Object.entries(GAME_TYPE_NAMES).map(([type, name]) => (
                                <SelectItem key={type} value={type}>{name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-4 pt-4 border-t">
                    <h4 className="font-bold text-lg">جوائز المراكز</h4>
                    {[
                        { title: 'المركز الأول', prizes: firstPlacePrizes, setter: setFirstPlacePrizes },
                        { title: 'المركز الثاني', prizes: secondPlacePrizes, setter: setSecondPlacePrizes },
                        { title: 'المركز الثالث', prizes: thirdPlacePrizes, setter: setThirdPlacePrizes }
                    ].map(({ title, prizes, setter }) => (
                         <div key={title} className="space-y-2 p-3 border rounded-lg">
                            <Label className="font-semibold">{title}</Label>
                            {prizes.map((prize, index) => (
                                <PrizeInput
                                    key={index}
                                    prize={prize}
                                    onUpdate={(p) => handlePrizeChange(setter, index, p)}
                                    onRemove={() => removePrize(setter, index)}
                                />
                            ))}
                            <Button variant="outline" size="sm" onClick={() => addPrize(setter)}>
                                <PlusCircle className="w-4 h-4 ml-2" /> إضافة جائزة أخرى
                            </Button>
                        </div>
                    ))}
                </div>

                <Button onClick={handleCreateChallenge} disabled={isCreating} className="w-full">
                    {isCreating ? <Loader2 className="animate-spin" /> : <PlusCircle />}
                    إنشاء البطولة
                </Button>
            </CardContent>
        </Card>
    );
}
