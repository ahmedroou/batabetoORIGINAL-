
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createChallenge, updateChallenge, deleteChallenge, getAllChallengesForAdmin } from '@/lib/actions/challenges';
import { Game, GAME_TYPE_NAMES, ChallengePrize, Challenge } from '@/types';
import { PlusCircle, Loader2, Trash2, Edit } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, } from "@/components/ui/alert-dialog";
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';


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


const ChallengeForm = ({
  initialData,
  onSubmit,
  isSubmitting,
}: {
  initialData: Omit<Challenge, 'id' | 'createdAt' | 'participantIds' | 'endsAt'> & {durationInHours: number},
  onSubmit: (data: any) => void,
  isSubmitting: boolean
}) => {
    const [title, setTitle] = useState(initialData.title);
    const [durationHours, setDurationHours] = useState(String(initialData.durationInHours || '168'));
    const [targetPoints, setTargetPoints] = useState(String(initialData.targetPoints));
    const [specificGameType, setSpecificGameType] = useState<Game['gameType'] | 'all'>(initialData.specificGameType || 'all');
    const [firstPlacePrizes, setFirstPlacePrizes] = useState<ChallengePrize[]>(initialData.firstPlacePrize || [{ type: 'coins', value: 5 }]);
    const [secondPlacePrizes, setSecondPlacePrizes] = useState<ChallengePrize[]>(initialData.secondPlacePrize || [{ type: 'coins', value: 50 }]);
    const [thirdPlacePrizes, setThirdPlacePrizes] = useState<ChallengePrize[]>(initialData.thirdPlacePrize || [{ type: 'coins', value: 25 }]);

    useEffect(() => {
        setTitle(initialData.title);
        setDurationHours(String(initialData.durationInHours || '168'));
        setTargetPoints(String(initialData.targetPoints));
        setSpecificGameType(initialData.specificGameType || 'all');
        setFirstPlacePrizes(initialData.firstPlacePrize || [{ type: 'coins', value: 5 }]);
        setSecondPlacePrizes(initialData.secondPlacePrize || [{ type: 'coins', value: 50 }]);
        setThirdPlacePrizes(initialData.thirdPlacePrize || [{ type: 'coins', value: 25 }]);
    }, [initialData]);

    const handlePrizeChange = (setter: React.Dispatch<React.SetStateAction<ChallengePrize[]>>, index: number, updatedPrize: ChallengePrize) => {
        setter(prev => prev.map((p, i) => i === index ? updatedPrize : p));
    };

    const addPrize = (setter: React.Dispatch<React.SetStateAction<ChallengePrize[]>>) => {
        setter(prev => [...prev, { type: 'coins', value: 0 }]);
    };

    const removePrize = (setter: React.Dispatch<React.SetStateAction<ChallengePrize[]>>, index: number) => {
        setter(prev => prev.filter((_, i) => i !== index));
    };
    
    const handleSubmit = () => {
        onSubmit({
            title,
            durationInHours: Number(durationHours),
            targetPoints: Number(targetPoints),
            specificGameType,
            firstPlacePrize: firstPlacePrizes.filter(p => p.value > 0),
            secondPlacePrize: secondPlacePrizes.filter(p => p.value > 0),
            thirdPlacePrize: thirdPlacePrizes.filter(p => p.value > 0),
        });
    }

    return (
        <div className="space-y-6">
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
            <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
                {isSubmitting ? <Loader2 className="animate-spin" /> : <PlusCircle />}
                {initialData.title ? "حفظ التعديلات" : "إنشاء البطولة"}
            </Button>
        </div>
    );
};


export default function ChallengesTab() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [isFetching, setIsFetching] = useState(true);
    const [editingChallenge, setEditingChallenge] = useState<Challenge | null>(null);
    const [challengeToDelete, setChallengeToDelete] = useState<Challenge | null>(null);

    const fetchChallenges = useCallback(async () => {
        setIsFetching(true);
        try {
            const fetchedChallenges = await getAllChallengesForAdmin();
            setChallenges(fetchedChallenges);
        } catch (error: any) {
            toast({ title: "خطأ", description: `فشل جلب البطولات: ${error.message}`, variant: "destructive" });
        } finally {
            setIsFetching(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchChallenges();
    }, [fetchChallenges]);

    const handleCreateChallenge = async (data: any) => {
        if (!data.title || !data.durationInHours || !data.targetPoints) {
            toast({ title: "الرجاء ملء جميع الحقول المطلوبة", variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);
        const result = await createChallenge(data);

        if (result.success) {
            toast({ title: "تم إنشاء البطولة بنجاح!" });
            fetchChallenges(); // Refresh the list
        } else {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(false);
    };
    
    const handleUpdateChallenge = async (data: any) => {
        if (!editingChallenge) return;
        setIsSubmitting(true);
        
        const result = await updateChallenge(editingChallenge.id, data);
        
        if (result.success) {
            toast({ title: "تم تحديث البطولة بنجاح!" });
            setEditingChallenge(null);
            fetchChallenges(); // Refresh the list
        } else {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(false);
    };

    const handleDeleteChallenge = async () => {
        if(!challengeToDelete) return;
        setIsSubmitting(true);
        const result = await deleteChallenge(challengeToDelete.id);
        if (result.success) {
            toast({ title: "تم حذف البطولة بنجاح" });
            fetchChallenges();
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        setIsSubmitting(false);
        setChallengeToDelete(null);
    };

    return (
        <AlertDialog>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>{editingChallenge ? "تعديل البطولة" : "إنشاء بطولة جديدة"}</CardTitle>
                    <CardDescription>{editingChallenge ? "عدّل بيانات البطولة الحالية." : "قم بإعداد بطولة جديدة قائمة على تجميع نقاط الصدارة."}</CardDescription>
                </CardHeader>
                <CardContent>
                    <ChallengeForm
                        initialData={editingChallenge || { title: '', durationInHours: '168', targetPoints: '100', specificGameType: 'all', firstPlacePrize: [{type:'coins', value: 5}], secondPlacePrize: [{type:'coins', value: 50}], thirdPlacePrize: [{type:'coins', value: 25}] } as any}
                        onSubmit={editingChallenge ? handleUpdateChallenge : handleCreateChallenge}
                        isSubmitting={isSubmitting}
                    />
                    {editingChallenge && <Button variant="link" onClick={() => setEditingChallenge(null)} className="mt-4">إلغاء التعديل</Button>}
                </CardContent>
            </Card>
             <Card>
                <CardHeader>
                    <CardTitle>البطولات الحالية</CardTitle>
                    <CardDescription>عرض وتعديل وحذف البطولات النشطة أو المنتهية.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isFetching ? <div className="text-center"><Loader2 className="animate-spin"/></div> :
                        <div className="space-y-2 h-[60vh] overflow-y-auto">
                            {challenges.map(challenge => (
                                <div key={challenge.id} className="p-2 bg-muted rounded-md flex justify-between items-center">
                                    <div>
                                        <p className="font-bold">{challenge.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                            تنتهي في: {challenge.endsAt ? format(new Date(challenge.endsAt), 'd MMMM, h:mm a', {locale: ar}) : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button size="icon" variant="ghost" onClick={() => setEditingChallenge(challenge)}><Edit className="w-4 h-4"/></Button>
                                         <AlertDialogTrigger asChild>
                                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setChallengeToDelete(challenge)} disabled={isSubmitting}>
                                                <Trash2 className="w-4 h-4"/>
                                            </Button>
                                        </AlertDialogTrigger>
                                    </div>
                                </div>
                            ))}
                        </div>
                    }
                </CardContent>
            </Card>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
                    <AlertDialogDescription>
                       هل تريد حقا حذف بطولة "{challengeToDelete?.title}"؟ لا يمكن التراجع عن هذا الإجراء.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteChallenge} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
                        {isSubmitting ? "جاري الحذف..." : "نعم، قم بالحذف"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </div>
        </AlertDialog>
    );
}
