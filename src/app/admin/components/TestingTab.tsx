
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TestTube2, Brain, Wand } from 'lucide-react';
import { GENIUS_CHALLENGES, type GeniusChallenge } from '@/data/genius-challenges';

interface TestingTabProps {
    onTestChallenge: (challenge: GeniusChallenge) => void;
    isGeneratingTest: boolean;
    testingChallenge: GeniusChallenge | null;
}

export default function TestingTab({ onTestChallenge, isGeneratingTest, testingChallenge }: TestingTabProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><TestTube2 /> ساحة الاختبار</CardTitle>
                <CardDescription>قم بتوليد وتجربة الألعاب بشكل فوري لأغراض الاختبار.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <Card>
                    <CardHeader>
                        <CardTitle className='flex items-center gap-2'><Brain /> ساحة العباقرة</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-2">
                        {GENIUS_CHALLENGES.map((challenge) => (
                            <Button key={challenge.id} variant="outline" onClick={() => onTestChallenge(challenge)}
                                disabled={isGeneratingTest} className='h-auto py-3 text-xs'>
                                {isGeneratingTest && testingChallenge?.id === challenge.id ? "..." : `${challenge.name}`}
                            </Button>
                        ))}
                    </CardContent>
                </Card>
            </CardContent>
        </Card>
    );
}
