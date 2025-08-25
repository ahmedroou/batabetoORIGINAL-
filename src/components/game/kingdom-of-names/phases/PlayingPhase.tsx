
'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { submitAnswers, updatePlayerProgress } from '@/lib/actions/kingdom-of-names';
import { useToast } from '@/hooks/use-toast';
import { Send, Loader2 } from 'lucide-react';

interface PlayingPhaseProps {
  game: Game;
  self: Player;
}

export default function PlayingPhase({ game, self }: PlayingPhaseProps) {
    const { toast } = useToast();
    const state = game.kingdomOfNamesState;
    const initialAnswers = state?.playerProgress?.[self.id]?.answers || {};
    const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const progressUpdateTimer = useRef<NodeJS.Timeout | null>(null);

    const categories = state?.categories || [];
    const letter = state?.letter || '';
    
    const hasSubmitted = !!state?.playerAnswers?.[self.id];
    
    const canSubmit = useMemo(() => {
        return categories.every(cat => answers[cat] && answers[cat].trim() !== '');
    }, [categories, answers]);
    
    // Auto-save progress
    useEffect(() => {
        if (progressUpdateTimer.current) clearTimeout(progressUpdateTimer.current);
        progressUpdateTimer.current = setTimeout(() => {
            if (!hasSubmitted) {
                updatePlayerProgress(game.id, self.id, answers);
            }
        }, 1500); // Save every 1.5 seconds

        return () => {
            if (progressUpdateTimer.current) clearTimeout(progressUpdateTimer.current);
        };
    }, [answers, game.id, self.id, hasSubmitted]);

    const handleAnswerChange = (category: string, value: string) => {
        setAnswers(prev => ({ ...prev, [category]: value }));
    };

    const handleSubmit = async () => {
        if (!canSubmit) {
            toast({ title: "الرجاء تعبئة جميع الحقول", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            await submitAnswers(game.id, self.id, answers);
            toast({ title: "تم إرسال إجاباتك!" });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (hasSubmitted) {
        return (
            <Card className="w-full max-w-lg text-center">
                 <CardHeader>
                    <CardTitle>تم استلام إجاباتك</CardTitle>
                    <CardDescription>في انتظار بقية اللاعبين...</CardDescription>
                </CardHeader>
                <CardContent>
                    <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto" />
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card className="w-full max-w-2xl">
            <CardHeader className="text-center">
                <CardTitle className="text-5xl font-bold font-mono">{letter}</CardTitle>
                <CardDescription>أكمل الجدول بكلمات تبدأ بالحرف الظاهر.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {categories.map(category => (
                    <div key={category} className="grid grid-cols-[100px_1fr] items-center gap-4">
                        <label htmlFor={`cat-${category}`} className="text-right font-semibold">{category}</label>
                        <Input 
                            id={`cat-${category}`}
                            value={answers[category] || ''}
                            onChange={(e) => handleAnswerChange(category, e.target.value)}
                            disabled={isSubmitting}
                        />
                    </div>
                ))}
            </CardContent>
            <CardFooter>
                <Button className="w-full" onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
                    <Send className="mr-2" />
                    {isSubmitting ? 'جاري الإرسال...' : 'رفع القلم!'}
                </Button>
            </CardFooter>
        </Card>
    );
}
