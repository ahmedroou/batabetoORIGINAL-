
'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from '@/hooks/use-toast';
import { Check, Lightbulb } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';

const ciphers = [
    { type: 'Caesar', shift: 3, hint: 'إزاحة قيصرية بمقدار 3' },
    { type: 'Reverse', hint: 'الكلمة معكوسة' },
];
const words = ['REACT', 'GENKIT', 'FIREBASE', 'CHALLENGE'];

const generateCipher = () => {
    const word = words[Math.floor(Math.random() * words.length)];
    const cipher = ciphers[Math.floor(Math.random() * ciphers.length)];
    let encrypted = '';
    
    if (cipher.type === 'Caesar' && cipher.shift) {
        encrypted = word.split('').map(char => String.fromCharCode(char.charCodeAt(0) + cipher.shift!)).join('');
    } else if (cipher.type === 'Reverse') {
        encrypted = word.split('').reverse().join('');
    }

    return { plaintext: word, encrypted, hint: cipher.hint };
};

export function CipherShift({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
    const { toast } = useToast();
    const [puzzle] = useState(() => game.challengeState?.puzzle || generateCipher());
    const [guess, setGuess] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [startTime] = useState(Date.now());
    
    useEffect(() => {
        const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
        if (myResult) {
            setHasSubmitted(true);
        }
    }, [game.challengeState, self.id]);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        const endTime = Date.now();
        const timeTaken = (endTime - startTime) / 1000;
        const isCorrect = guess.trim().toUpperCase() === puzzle.plaintext;

        toast({
            title: isCorrect ? "صحيح!" : "خطأ!",
            description: isCorrect ? `لقد فككت الشيفرة: ${puzzle.plaintext}` : "للأسف، إجابة خاطئة.",
            variant: isCorrect ? "default" : "destructive",
            className: isCorrect ? "bg-green-600 border-green-600 text-white" : ""
        });
        
        try {
            await submitChallengeResult(game.id, self.id, { isCorrect, time: timeTaken });
            setHasSubmitted(true);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
            setIsSubmitting(false);
        }
    };
    
    if (hasSubmitted) {
        return (
             <Card className="w-full max-w-md bg-gray-900/80 border-gray-700 text-white text-center">
                <CardHeader>
                    <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Check className="w-20 h-20 text-green-500 mx-auto mb-4" />
                    <p className="text-xl">تم إرسال نتيجتك. في انتظار بقية اللاعبين...</p>
                </CardContent>
            </Card>
        )
    }
    
    return (
        <Card className="w-full max-w-md bg-gray-900/80 border-gray-700 text-white">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
                <CardDescription className="text-gray-400">{challenge.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="p-6 bg-gray-900/50 rounded-lg border border-gray-700 text-center">
                    <p className="text-gray-400 text-sm mb-2">النص المشفّر</p>
                    <p className="font-mono text-4xl tracking-widest text-yellow-300">{puzzle.encrypted}</p>
                </div>
                <div className="flex items-center justify-center gap-2 text-gray-300 p-2 bg-gray-800 rounded-md">
                    <Lightbulb className="w-5 h-5 text-yellow-400" />
                    <p><span className="font-semibold">تلميح:</span> {puzzle.hint}</p>
                </div>
                <div className="space-y-2">
                    <Input
                        type="text"
                        placeholder="أدخل إجابتك هنا..."
                        value={guess}
                        onChange={(e) => setGuess(e.target.value)}
                        className="text-center h-12 text-lg bg-gray-800 border-gray-600 text-white focus:border-primary"
                        disabled={isSubmitting}
                        onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                    />
                    <Button onClick={handleSubmit} disabled={isSubmitting || !guess.trim()} className="w-full" size="lg" variant="secondary">
                        {isSubmitting ? '...' : 'تأكيد'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
