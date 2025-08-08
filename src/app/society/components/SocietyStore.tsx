
"use client";

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Coins, Shield, ArrowRight, Handshake, Star } from 'lucide-react';
import { exchangeForLoyaltyPoints } from '@/lib/actions/user';

const COIN_TO_LOYALTY_RATE = 3;
const LEADERBOARD_TO_LOYALTY_RATE = 2;

export default function SocietyStore() {
    const { userProfile, refreshUserProfile } = useAuth();
    const { toast } = useToast();
    const [coinsToExchange, setCoinsToExchange] = useState('');
    const [pointsToExchange, setPointsToExchange] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleExchange = async (source: 'coins' | 'leaderboardPoints') => {
        if (!userProfile) return;
        const amountStr = source === 'coins' ? coinsToExchange : pointsToExchange;
        const amount = parseInt(amountStr, 10);
        
        if (isNaN(amount) || amount <= 0) {
            toast({ title: 'مبلغ غير صالح', description: 'الرجاء إدخال عدد صحيح موجب.', variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await exchangeForLoyaltyPoints(userProfile.uid, amount, source);
            if (result.success) {
                toast({ title: 'نجاح!', description: `تم التحويل بنجاح.` });
                if (refreshUserProfile) {
                    await refreshUserProfile();
                }
                if (source === 'coins') setCoinsToExchange('');
                else setPointsToExchange('');
            } else {
                toast({ title: 'فشل التحويل', description: result.error, variant: 'destructive' });
            }
        } catch(e: any) {
             toast({ title: 'خطأ', description: e.message || 'حدث خطأ غير متوقع', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const loyaltyFromCoins = (parseInt(coinsToExchange, 10) || 0) * COIN_TO_LOYALTY_RATE;
    const loyaltyFromPoints = (parseInt(pointsToExchange, 10) || 0) * LEADERBOARD_TO_LOYALTY_RATE;

    return (
        <div className="flex justify-center">
            <Card className="w-full max-w-lg bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl text-purple-300">متجر المجتمع</CardTitle>
                    <CardDescription className="text-gray-400">
                        استبدل عملاتك ونقاطك بنقاط الولاء لتعزيز علاقاتك وتحالفاتك.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="p-4 rounded-lg bg-black/30 text-center">
                        <p className="font-bold text-lg">أرصدتك الحالية</p>
                        <div className="flex justify-center items-center gap-6 mt-2">
                             <div className="flex items-center gap-2">
                                <Coins className="w-6 h-6 text-yellow-400" />
                                <span className="text-2xl font-mono">{userProfile?.coins || 0}</span>
                            </div>
                              <div className="flex items-center gap-2">
                                <Star className="w-6 h-6 text-amber-400" />
                                <span className="text-2xl font-mono">{userProfile?.leaderboardPoints || 0}</span>
                            </div>
                             <div className="flex items-center gap-2">
                                <Handshake className="w-6 h-6 text-blue-400" />
                                <span className="text-2xl font-mono">{userProfile?.loyaltyPoints || 0}</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 p-4 rounded-lg border border-slate-700">
                         <Label htmlFor="coins-exchange" className='text-lg'>كوينز مقابل ولاء (1 كوينز = {COIN_TO_LOYALTY_RATE} ولاء)</Label>
                        <div className="flex items-center justify-center gap-2">
                            <div className="relative flex-grow">
                                <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-yellow-400" />
                                <Input id="coins-exchange" type="number" value={coinsToExchange} onChange={(e) => setCoinsToExchange(e.target.value)} placeholder="0" className="bg-gray-900/70 border-gray-600 pl-10 text-lg"/>
                            </div>
                            <ArrowRight className="w-6 h-6 text-gray-400" />
                             <div className="relative flex-grow">
                                <Handshake className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400" />
                                <Input readOnly value={loyaltyFromCoins} className="bg-gray-900/70 border-gray-600 pl-10 text-lg font-bold"/>
                            </div>
                        </div>
                         <Button onClick={() => handleExchange('coins')} disabled={isSubmitting || !coinsToExchange || parseInt(coinsToExchange, 10) <= 0} className="w-full bg-purple-600 hover:bg-purple-700">
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد التحويل'}
                        </Button>
                    </div>

                </CardContent>
            </Card>
        </div>
    );
}
