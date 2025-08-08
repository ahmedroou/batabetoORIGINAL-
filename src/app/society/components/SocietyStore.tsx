
"use client";

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Coins, Shield, ArrowRight, Handshake, Angry } from 'lucide-react';
import { exchangeCoinsForLoyaltyPoints, exchangeCoinsForHonor, exchangeCoinsForRebellion } from '@/lib/actions/user';

const COIN_TO_LOYALTY_RATE = 3;
const COIN_TO_HONOR_RATE = 2;
const COIN_TO_REBELLION_RATE = 2;


export default function SocietyStore() {
    const { userProfile, refreshUserProfile } = useAuth();
    const { toast } = useToast();
    const [loyaltyCoins, setLoyaltyCoins] = useState('');
    const [honorCoins, setHonorCoins] = useState('');
    const [rebellionCoins, setRebellionCoins] = useState('');
    const [isSubmitting, setIsSubmitting] = useState<'loyalty' | 'honor' | 'rebellion' | null>(null);

    const handleLoyaltyExchange = async () => {
        if (!userProfile) return;
        const amount = parseInt(loyaltyCoins, 10);
        if (isNaN(amount) || amount <= 0) {
            toast({ title: 'مبلغ غير صالح', description: 'الرجاء إدخال عدد صحيح موجب.', variant: 'destructive' });
            return;
        }
        setIsSubmitting('loyalty');
        try {
            const result = await exchangeCoinsForLoyaltyPoints(userProfile.uid, amount);
            if (result.success) {
                toast({ title: 'نجاح!', description: `تم استبدال ${amount} كوينز بنجاح.` });
                if (refreshUserProfile) await refreshUserProfile();
                setLoyaltyCoins('');
            } else {
                toast({ title: 'فشل التحويل', description: result.error, variant: 'destructive' });
            }
        } catch(e: any) {
             toast({ title: 'خطأ', description: e.message || 'حدث خطأ غير متوقع', variant: 'destructive' });
        } finally {
            setIsSubmitting(null);
        }
    };
    
     const handleHonorExchange = async () => {
        if (!userProfile) return;
        const amount = parseInt(honorCoins, 10);
        if (isNaN(amount) || amount <= 0) {
            toast({ title: 'مبلغ غير صالح', description: 'الرجاء إدخال عدد صحيح موجب.', variant: 'destructive' });
            return;
        }
        setIsSubmitting('honor');
        try {
            const result = await exchangeCoinsForHonor(userProfile.uid, amount);
            if (result.success) {
                toast({ title: 'نجاح!', description: `تم استبدال ${amount} كوينز بنجاح.` });
                if (refreshUserProfile) await refreshUserProfile();
                setHonorCoins('');
            } else {
                toast({ title: 'فشل التحويل', description: result.error, variant: 'destructive' });
            }
        } catch(e: any) {
             toast({ title: 'خطأ', description: e.message || 'حدث خطأ غير متوقع', variant: 'destructive' });
        } finally {
            setIsSubmitting(null);
        }
    };
    
    const handleRebellionExchange = async () => {
        if (!userProfile) return;
        const amount = parseInt(rebellionCoins, 10);
        if (isNaN(amount) || amount <= 0) {
            toast({ title: 'مبلغ غير صالح', description: 'الرجاء إدخال عدد صحيح موجب.', variant: 'destructive' });
            return;
        }
        setIsSubmitting('rebellion');
        try {
            const result = await exchangeCoinsForRebellion(userProfile.uid, amount);
            if (result.success) {
                toast({ title: 'نجاح!', description: `تم استبدال ${amount} كوينز بنجاح.` });
                if (refreshUserProfile) await refreshUserProfile();
                setRebellionCoins('');
            } else {
                toast({ title: 'فشل التحويل', description: result.error, variant: 'destructive' });
            }
        } catch(e: any) {
             toast({ title: 'خطأ', description: e.message || 'حدث خطأ غير متوقع', variant: 'destructive' });
        } finally {
            setIsSubmitting(null);
        }
    };


    const loyaltyFromCoins = (parseInt(loyaltyCoins, 10) || 0) * COIN_TO_LOYALTY_RATE;
    const honorFromCoins = (parseInt(honorCoins, 10) || 0) * COIN_TO_HONOR_RATE;
    const rebellionFromCoins = (parseInt(rebellionCoins, 10) || 0) * COIN_TO_REBELLION_RATE;


    return (
        <div className="flex justify-center">
            <Card className="w-full max-w-lg bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl text-purple-300">متجر المجتمع</CardTitle>
                    <CardDescription className="text-gray-400">
                        استبدل عملاتك لتعزيز مكانتك الاجتماعية.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="p-4 rounded-lg bg-black/30 text-center">
                        <p className="font-bold text-lg">أرصدتك الحالية</p>
                        <div className="flex justify-center items-center gap-6 mt-2 flex-wrap">
                             <div className="flex items-center gap-2">
                                <Coins className="w-6 h-6 text-yellow-400" />
                                <span className="text-2xl font-mono">{userProfile?.coins || 0}</span>
                            </div>
                              <div className="flex items-center gap-2">
                                <Shield className="w-6 h-6 text-amber-400" />
                                <span className="text-2xl font-mono">{userProfile?.honorPoints || 0}</span>
                            </div>
                             <div className="flex items-center gap-2">
                                <Handshake className="w-6 h-6 text-blue-400" />
                                <span className="text-2xl font-mono">{userProfile?.loyaltyPoints || 0}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Angry className="w-6 h-6 text-red-500" />
                                <span className="text-2xl font-mono">{userProfile?.rebellionPoints || 0}</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 p-4 rounded-lg border border-slate-700">
                         <Label htmlFor="coins-exchange-loyalty" className='text-lg'>كوينز مقابل ولاء (1 كوينز = {COIN_TO_LOYALTY_RATE} ولاء)</Label>
                        <div className="flex items-center justify-center gap-2">
                            <div className="relative flex-grow">
                                <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-yellow-400" />
                                <Input id="coins-exchange-loyalty" type="number" value={loyaltyCoins} onChange={(e) => setLoyaltyCoins(e.target.value)} placeholder="0" className="bg-gray-900/70 border-gray-600 pl-10 text-lg"/>
                            </div>
                            <ArrowRight className="w-6 h-6 text-gray-400" />
                             <div className="relative flex-grow">
                                <Handshake className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400" />
                                <Input readOnly value={loyaltyFromCoins} className="bg-gray-900/70 border-gray-600 pl-10 text-lg font-bold"/>
                            </div>
                        </div>
                         <Button onClick={handleLoyaltyExchange} disabled={isSubmitting !== null || !loyaltyCoins || parseInt(loyaltyCoins, 10) <= 0} className="w-full bg-purple-600 hover:bg-purple-700">
                            {isSubmitting === 'loyalty' ? <Loader2 className="animate-spin" /> : 'تأكيد التحويل'}
                        </Button>
                    </div>

                     <div className="space-y-4 p-4 rounded-lg border border-slate-700">
                         <Label htmlFor="coins-exchange-honor" className='text-lg'>كوينز مقابل شرف (1 كوينز = {COIN_TO_HONOR_RATE} شرف)</Label>
                        <div className="flex items-center justify-center gap-2">
                            <div className="relative flex-grow">
                                <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-yellow-400" />
                                <Input id="coins-exchange-honor" type="number" value={honorCoins} onChange={(e) => setHonorCoins(e.target.value)} placeholder="0" className="bg-gray-900/70 border-gray-600 pl-10 text-lg"/>
                            </div>
                            <ArrowRight className="w-6 h-6 text-gray-400" />
                             <div className="relative flex-grow">
                                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-400" />
                                <Input readOnly value={honorFromCoins} className="bg-gray-900/70 border-gray-600 pl-10 text-lg font-bold"/>
                            </div>
                        </div>
                         <Button onClick={handleHonorExchange} disabled={isSubmitting !== null || !honorCoins || parseInt(honorCoins, 10) <= 0} className="w-full bg-purple-600 hover:bg-purple-700">
                           {isSubmitting === 'honor' ? <Loader2 className="animate-spin" /> : 'تأكيد التحويل'}
                        </Button>
                    </div>
                    
                     <div className="space-y-4 p-4 rounded-lg border border-slate-700">
                         <Label htmlFor="coins-exchange-rebellion" className='text-lg'>كوينز مقابل تمرد (1 كوينز = {COIN_TO_REBELLION_RATE} تمرد)</Label>
                        <div className="flex items-center justify-center gap-2">
                            <div className="relative flex-grow">
                                <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-yellow-400" />
                                <Input id="coins-exchange-rebellion" type="number" value={rebellionCoins} onChange={(e) => setRebellionCoins(e.target.value)} placeholder="0" className="bg-gray-900/70 border-gray-600 pl-10 text-lg"/>
                            </div>
                            <ArrowRight className="w-6 h-6 text-gray-400" />
                             <div className="relative flex-grow">
                                <Angry className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
                                <Input readOnly value={rebellionFromCoins} className="bg-gray-900/70 border-gray-600 pl-10 text-lg font-bold"/>
                            </div>
                        </div>
                         <Button onClick={handleRebellionExchange} disabled={isSubmitting !== null || !rebellionCoins || parseInt(rebellionCoins, 10) <= 0} className="w-full bg-purple-600 hover:bg-purple-700">
                           {isSubmitting === 'rebellion' ? <Loader2 className="animate-spin" /> : 'تأكيد التحويل'}
                        </Button>
                    </div>

                </CardContent>
            </Card>
        </div>
    );
}
