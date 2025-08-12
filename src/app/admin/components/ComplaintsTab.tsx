
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Check, X, Loader2, HandCoins, MessageCircleQuestion, ThumbsUp, ThumbsDown } from 'lucide-react';
import { getComplaints, resolveComplaint } from '@/lib/actions/complaints';
import type { Complaint } from '@/types';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { GAME_TYPE_NAMES } from '@/data/icons';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

export default function ComplaintsTab() {
    const { toast } = useToast();
    const [complaints, setComplaints] = useState<Complaint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isResolving, setIsResolving] = useState<string | null>(null);

    // State for modifying compensation
    const [modifiedCoins, setModifiedCoins] = useState<Record<string, string>>({});
    const [modifiedPoints, setModifiedPoints] = useState<Record<string, string>>({});


    const fetchComplaints = useCallback(async () => {
        setIsLoading(true);
        const result = await getComplaints();
        if (result.success && result.complaints) {
            setComplaints(result.complaints);
        } else {
            toast({ title: 'خطأ', description: 'فشل جلب الشكاوى.', variant: 'destructive' });
        }
        setIsLoading(false);
    }, [toast]);

    useEffect(() => {
        fetchComplaints();
    }, [fetchComplaints]);
    
    const handleResolve = async (complaint: Complaint, resolution: 'approved' | 'rejected' | 'resolved') => {
        setIsResolving(complaint.id);

        let finalCoins = complaint.details.coins || 0;
        let finalPoints = complaint.details.points || 0;

        if (resolution === 'approved') {
            const coinsStr = modifiedCoins[complaint.id];
            const pointsStr = modifiedPoints[complaint.id];
            if (coinsStr !== undefined && !isNaN(parseInt(coinsStr))) {
                finalCoins = parseInt(coinsStr);
            }
            if (pointsStr !== undefined && !isNaN(parseInt(pointsStr))) {
                finalPoints = parseInt(pointsStr);
            }
        }
        
        const result = await resolveComplaint(complaint, resolution, finalCoins, finalPoints);

        if (result.success) {
            toast({ title: 'تمت معالجة الشكوى بنجاح' });
            fetchComplaints(); // Refresh the list
        } else {
             toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setIsResolving(null);
    }

    const missingCurrencyComplaints = complaints.filter(c => c.type === 'missing_currency' && c.status === 'pending');
    const bugReportComplaints = complaints.filter(c => c.type === 'bug_report' && c.status === 'pending');

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><HandCoins /> شكاوى النقاط والكوينز</CardTitle>
                    <CardDescription>مراجعة طلبات التعويض عن العملات المفقودة.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? <Loader2 className="animate-spin mx-auto" /> : (
                        <ScrollArea className="h-96 pr-2">
                             {missingCurrencyComplaints.length === 0 ? <p className="text-center text-muted-foreground">لا توجد شكاوى حاليًا.</p> :
                                <Accordion type="single" collapsible className="w-full">
                                {missingCurrencyComplaints.map(complaint => (
                                    <AccordionItem value={complaint.id} key={complaint.id}>
                                        <AccordionTrigger>
                                            <div className="flex items-center gap-2">
                                                <PlayerAvatar avatarId={complaint.userAvatar} className="w-8 h-8" />
                                                <span className="font-bold">{complaint.userName}</span>
                                                <span className="text-xs text-muted-foreground">({formatDistanceToNow(complaint.createdAt.toDate(), { addSuffix: true, locale: ar })})</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="space-y-4 p-2 bg-muted/50 rounded-b-md">
                                            <p><strong>اللعبة:</strong> {GAME_TYPE_NAMES[complaint.details.game!]}</p>
                                            <p><strong>السبب:</strong> {complaint.details.reason}</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                 <Input 
                                                    type="number" 
                                                    defaultValue={complaint.details.coins}
                                                    onChange={e => setModifiedCoins(prev => ({...prev, [complaint.id]: e.target.value}))}
                                                    placeholder="الكوينز"
                                                 />
                                                 <Input 
                                                    type="number"
                                                    defaultValue={complaint.details.points}
                                                    onChange={e => setModifiedPoints(prev => ({...prev, [complaint.id]: e.target.value}))}
                                                    placeholder="النقاط"
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                 <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => handleResolve(complaint, 'approved')} disabled={isResolving === complaint.id}>
                                                    <ThumbsUp className="ml-2"/> موافقة وتعويض
                                                 </Button>
                                                  <Button className="flex-1" variant="destructive" onClick={() => handleResolve(complaint, 'rejected')} disabled={isResolving === complaint.id}>
                                                    <ThumbsDown className="ml-2"/> رفض
                                                 </Button>
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                            }
                        </ScrollArea>
                    )}
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><MessageCircleQuestion /> تقارير المشاكل والأخطاء</CardTitle>
                    <CardDescription>مراجعة تقارير اللاعبين عن الأخطاء في الألعاب.</CardDescription>
                </CardHeader>
                <CardContent>
                      {isLoading ? <Loader2 className="animate-spin mx-auto" /> : (
                        <ScrollArea className="h-96 pr-2">
                             {bugReportComplaints.length === 0 ? <p className="text-center text-muted-foreground">لا توجد تقارير حاليًا.</p> :
                                <Accordion type="single" collapsible className="w-full">
                                {bugReportComplaints.map(complaint => (
                                    <AccordionItem value={complaint.id} key={complaint.id}>
                                        <AccordionTrigger>
                                            <div className="flex items-center gap-2">
                                                <PlayerAvatar avatarId={complaint.userAvatar} className="w-8 h-8" />
                                                <span className="font-bold">{complaint.userName}</span>
                                                <span className="text-xs text-muted-foreground">({formatDistanceToNow(complaint.createdAt.toDate(), { addSuffix: true, locale: ar })})</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="space-y-2 p-2 bg-muted/50 rounded-b-md">
                                            <p><strong>اللعبة:</strong> {GAME_TYPE_NAMES[complaint.details.game!]}</p>
                                            <p><strong>الوصف:</strong> {complaint.details.description}</p>
                                            <Button className="w-full" variant="secondary" onClick={() => handleResolve(complaint, 'resolved')} disabled={isResolving === complaint.id}>
                                               <Check className="ml-2"/> وضع علامة كمقروء
                                            </Button>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                            }
                        </ScrollArea>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
