
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, ShieldQuestion, Drama } from 'lucide-react';
import { cn } from '@/lib/utils';

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

export default function SocietyChallenges() {
    return (
        <div>
             <div className="text-center mb-6">
                <h2 className="text-3xl font-bold text-purple-300">قيد التطوير</h2>
                <p className="text-gray-400">ميزات وتحديات جديدة قادمة إلى المجتمع قريبًا!</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
