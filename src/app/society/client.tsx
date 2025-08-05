
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, Search, TowerControl, BookOpen, ShieldQuestion, Drama } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SocietyPyramid from './components/SocietyPyramid';
import SocietyClans from './components/SocietyClans';
import SocietyChallenges from './components/SocietyChallenges';
import SocietyStore from './components/SocietyStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';


export default function SocietyClient() {
    const { user, loading } = useAuth();
    const router = useRouter();

    // Countdown Timer State
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        const calculateTimeLeft = () => {
            const now = new Date();
            const nextFriday = new Date(now);
            // Go to the next Friday 10 PM
            nextFriday.setDate(now.getDate() + (5 - now.getDay() + 7) % 7);
            nextFriday.setHours(22, 0, 0, 0);

            if (nextFriday < now) {
                nextFriday.setDate(nextFriday.getDate() + 7);
            }

            const difference = nextFriday.getTime() - now.getTime();

            if (difference > 0) {
                return {
                    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                    minutes: Math.floor((difference / 1000 / 60) % 60),
                    seconds: Math.floor((difference / 1000) % 60),
                };
            }
            return { days: 0, hours: 0, minutes: 0, seconds: 0 };
        };

        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        return () => clearInterval(timer);
    }, []);
    
    if (loading) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-gray-900">
                <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
            </div>
        );
    }
    
     if (!user) {
        router.push('/login');
        return null;
    }

    const TimeBlock = ({ value, label }: { value: number, label: string }) => (
        <div className="flex flex-col items-center">
            <span className="font-mono text-3xl font-bold text-yellow-200">{String(value).padStart(2, '0')}</span>
            <span className="text-xs text-yellow-400/80">{label}</span>
        </div>
    );


    const MainCard = ({ icon: Icon, title, description, buttonText, className, children }: { icon: React.ElementType, title: string, description: string, buttonText: string, className?: string, children?: React.ReactNode }) => (
        <Card className={cn("bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm shadow-lg shadow-purple-900/20 flex flex-col", className)}>
            <CardHeader>
                <div className="flex items-center gap-4">
                    <Icon className="w-8 h-8 text-yellow-400" />
                    <CardTitle className="text-2xl text-purple-300">{title}</CardTitle>
                </div>
                <CardDescription className="text-gray-400 pt-2">{description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow flex items-center justify-center">
                {children}
            </CardContent>
            <div className="p-4 mt-auto">
                <Button variant="secondary" className="w-full" disabled>{buttonText}</Button>
            </div>
        </Card>
    );

    return (
        <div className="min-h-screen w-full bg-gray-900 bg-gradient-to-tr from-black via-gray-900 to-purple-900/50 text-white font-sans">
            <div className="fixed inset-0 stars z-0"></div>
            <div className="fixed inset-0 twinkling z-0"></div>
             <main className="relative z-10 container mx-auto px-4 py-8">
                <header className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-bold text-purple-300 tracking-wider">
                           مجتمع اللعبة
                        </h1>
                         <p className="text-lg text-gray-400 mt-2">حيث تتجلى القوة والنفوذ</p>
                    </div>
                    <div className="flex items-center gap-4">
                         <div className="relative w-64">
                            <Input placeholder="ابحث عن لاعب..." className="bg-gray-800/70 border-purple-500/50 text-white focus:ring-purple-500 pl-10" />
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        </div>
                        <button onClick={() => router.push('/')} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                            <ArrowLeft className="h-6 w-6" />
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                    <MainCard
                        icon={TowerControl}
                        title="حروب الطبقات"
                        description="فعالية أسبوعية للسيطرة على قوانين الأسبوع المقبل."
                        buttonText="حتى الحرب القادمة"
                        className="lg:col-span-2 bg-class-wars-card border-red-500/50"
                    >
                         <div className="flex items-center justify-center gap-4 p-2 rounded-lg">
                            <TimeBlock value={timeLeft.days} label="أيام" />
                            <span className="text-3xl font-mono text-yellow-400/50">:</span>
                            <TimeBlock value={timeLeft.hours} label="ساعات" />
                            <span className="text-3xl font-mono text-yellow-400/50">:</span>
                            <TimeBlock value={timeLeft.minutes} label="دقائق" />
                            <span className="text-3xl font-mono text-yellow-400/50">:</span>
                            <TimeBlock value={timeLeft.seconds} label="ثواني" />
                        </div>
                    </MainCard>
                     <MainCard
                        icon={BookOpen}
                        title="المتحف الطبقي"
                        description="أرشيف يعرض قادة الطبقات عبر التاريخ، الثورات الناجحة، وأشهر قوانين الذل."
                        buttonText="قريبًا"
                    />
                    <MainCard
                        icon={ShieldQuestion}
                        title="طاولة المستشارين"
                        description="مجموعة من اللاعبين يتم اختيارهم أسبوعيًا كمستشارين للزعيم، لهم تأثير خاص."
                        buttonText="قريبًا"
                    />
                     <MainCard
                        icon={Drama}
                        title="نقابة العبيد"
                        description="منظمة سرية تتشكل تلقائيًا من الطبقة الأخيرة للتحضير للثورة والتآمر في الخفاء."
                        buttonText="قريبًا"
                        className="lg:col-start-4 lg:row-start-1"
                    />
                </div>


                <Tabs defaultValue="pyramid" className="w-full">
                    <TabsList className="grid w-full grid-cols-4 bg-black/30 backdrop-blur-sm border border-purple-500/30 text-purple-300">
                        <TabsTrigger value="pyramid">الهرم الاجتماعي</TabsTrigger>
                        <TabsTrigger value="challenges">التحديات</TabsTrigger>
                        <TabsTrigger value="clans">الفرق</TabsTrigger>
                        <TabsTrigger value="store">متجر المجتمع</TabsTrigger>
                    </TabsList>
                    <TabsContent value="pyramid" className="mt-6">
                        <SocietyPyramid />
                    </TabsContent>
                    <TabsContent value="challenges" className="mt-6">
                        <SocietyChallenges />
                    </TabsContent>
                    <TabsContent value="clans" className="mt-6">
                        <SocietyClans />
                    </TabsContent>
                     <TabsContent value="store" className="mt-6">
                        <SocietyStore />
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
