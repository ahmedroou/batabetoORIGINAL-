
"use client";

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Coins, Shield, ArrowRight } from 'lucide-react';
import { exchangeCoinsForHonor } from '@/lib/actions/user';

const HONOR_RATE = 3; // 1 Coin = 3 Honor

export default function SocietyStore() {
    const { userProfile, refreshUserProfile } = useAuth();
    const { toast } = useToast();
    const [coinsToExchange, setCoinsToExchange] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleExchange = async () => {
        const amount = parseInt(coinsToExchange, 10);
        if (isNaN(amount) || amount <= 0) {
            toast({ title: 'مبلغ غير صالح', description: 'الرجاء إدخال عدد صحيح موجب من الكوينز.', variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);
        const result = await exchangeCoinsForHonor(userProfile!.uid, amount);
        if (result.success) {
            toast({ title: 'نجاح!', description: `تم تحويل ${amount} كوينز إلى ${amount * HONOR_RATE} نقاط شرف.` });
            if (refreshUserProfile) {
                await refreshUserProfile();
            }
            setCoinsToExchange('');
        } else {
            toast({ title: 'فشل التحويل', description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(false);
    };

    const honorToGet = (parseInt(coinsToExchange, 10) || 0) * HONOR_RATE;

    return (
        <div className="flex justify-center">
            <Card className="w-full max-w-lg bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl text-purple-300">متجر المجتمع</CardTitle>
                    <CardDescription className="text-gray-400">
                        استبدل الكوينز التي كسبتها بشق الأنفس بنقاط الشرف لتعزيز مكانتك الاجتماعية.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 rounded-lg bg-black/30 text-center">
                        <p className="font-bold text-lg">رصيدك الحالي</p>
                        <div className="flex justify-center items-center gap-6 mt-2">
                             <div className="flex items-center gap-2">
                                <Coins className="w-6 h-6 text-yellow-400" />
                                <span className="text-2xl font-mono">{userProfile?.coins || 0}</span>
                            </div>
                             <div className="flex items-center gap-2">
                                <Shield className="w-6 h-6 text-amber-400" />
                                <span className="text-2xl font-mono">{userProfile?.honorPoints || 0}</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="coins-exchange">كوينز للتحويل (1 كوين = {HONOR_RATE} شرف)</Label>
                        <div className="flex items-center justify-center gap-2">
                            <div className="relative flex-grow">
                                <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-yellow-400" />
                                <Input
                                    id="coins-exchange"
                                    type="number"
                                    value={coinsToExchange}
                                    onChange={(e) => setCoinsToExchange(e.target.value)}
                                    placeholder="0"
                                    className="bg-gray-900/70 border-gray-600 pl-10 text-lg"
                                />
                            </div>
                            <ArrowRight className="w-6 h-6 text-gray-400" />
                             <div className="relative flex-grow">
                                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-400" />
                                <Input
                                    readOnly
                                    value={honorToGet}
                                    className="bg-gray-900/70 border-gray-600 pl-10 text-lg font-bold"
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleExchange} disabled={isSubmitting || !coinsToExchange || parseInt(coinsToExchange, 10) <= 0} className="w-full bg-purple-600 hover:bg-purple-700">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد التحويل'}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
