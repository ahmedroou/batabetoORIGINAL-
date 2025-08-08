
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, ShieldQuestion, Drama, TowerControl } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

const MainCard = ({ icon: Icon, title, description, buttonText, className }: { icon: React.ElementType, title: string, description: string, buttonText: string, className?: string }) => (
    <Card className={cn("bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm shadow-lg shadow-purple-900/20 flex flex-col", className)}>
        <CardHeader>
            <div className="flex items-center gap-4">
                <Icon className="w-8 h-8 text-yellow-400" />
                <CardTitle className="text-2xl text-purple-300">{title}</CardTitle>
            </div>
            <CardDescription className="text-gray-400 pt-2">{description}</CardDescription>
        </CardHeader>
        <div className="p-4 mt-auto">
            <Button variant="secondary" className="w-full" disabled>{buttonText}</Button>
        </div>
    </Card>
);

const CountdownTimer = () => {
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        const calculateTimeLeft = () => {
            const now = new Date();
            const nextFriday = new Date(now);
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

    const TimeBlock = ({ value, label }: { value: number, label: string }) => (
        <div className="flex flex-col items-center">
            <span className="font-mono text-3xl font-bold text-yellow-200">{String(value).padStart(2, '0')}</span>
            <span className="text-xs text-yellow-400/80">{label}</span>
        </div>
    );
    
    return (
        <div className="flex items-center justify-center gap-4 p-2 rounded-lg">
            <TimeBlock value={timeLeft.days} label="أيام" />
            <span className="text-3xl font-mono text-yellow-400/50">:</span>
            <TimeBlock value={timeLeft.hours} label="ساعات" />
            <span className="text-3xl font-mono text-yellow-400/50">:</span>
            <TimeBlock value={timeLeft.minutes} label="دقائق" />
            <span className="text-3xl font-mono text-yellow-400/50">:</span>
            <TimeBlock value={timeLeft.seconds} label="ثواني" />
        </div>
    );
};


export default function SocietyChallenges() {
    return (
        <div>
             <div className="text-center mb-6">
                <h2 className="text-3xl font-bold text-purple-300">ميزات قادمة</h2>
                <p className="text-gray-400">نحن نعمل بجد على إضافة هذه الميزات المثيرة إلى المجتمع!</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 <MainCard
                    icon={TowerControl}
                    title="حروب الطبقات"
                    description="فعالية أسبوعية للسيطرة على قوانين الأسبوع المقبل."
                    buttonText="حتى الحرب القادمة"
                    className="lg:col-span-full bg-class-wars-card border-red-500/50"
                 >
                    <CountdownTimer />
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
                />
            </div>
        </div>
    );
}
