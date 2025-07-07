
'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy } from 'lucide-react';

interface FinalResultsProps {
    winner: 'الفريق الأزرق' | 'الفريق الأحمر' | 'تعادل';
    message: string;
}

export function FinalResults({ winner, message }: FinalResultsProps) {
    const router = useRouter();
    const winnerColor = winner === 'الفريق الأزرق' ? 'text-primary' : 'text-destructive';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl"
        >
            <Card className="text-center">
                <CardHeader>
                    <Trophy className="w-24 h-24 mx-auto text-yellow-400" />
                    <CardTitle className="text-5xl font-extrabold">انتهت اللعبة!</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <h2 className={`text-4xl font-bold ${winnerColor}`}>
                        {winner === 'تعادل' ? 'النتيجة تعادل!' : `الفائز هو ${winner}!`}
                    </h2>
                    <p className="text-lg text-muted-foreground">{message}</p>
                </CardContent>
                <CardFooter>
                    <Button onClick={() => router.push('/')} className="w-full" size="lg">
                        <Trophy className="ml-2" />
                        العب مرة أخرى
                    </Button>
                </CardFooter>
            </Card>
        </motion.div>
    );
}
