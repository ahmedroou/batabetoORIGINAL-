
"use client";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Challenge, Game } from '@/types';
import { CircleDollarSign, Diamond, Swords, Calendar, Play, ShieldCheck, Palette } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { motion } from 'framer-motion';

const GAME_TYPE_NAMES: Record<Game['gameType'], string> = {
    'king-of-genius': 'ساحة العباقرة',
    'trap-answer': 'الجواب المفخخ',
    'prison': 'السجن',
    'behind-the-mask': 'خلف القناع',
    'word_war': 'حرب الكلمات',
    'draw-and-guess': 'لعبة رسمة',
};

interface ChallengeCardProps {
    challenge: Challenge;
    index: number;
}

export default function ChallengeCard({ challenge, index }: ChallengeCardProps) {
    const cardVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                duration: 0.4,
                delay: index * 0.1,
            }
        }
    };
    
    return (
        <motion.div variants={cardVariants} initial="hidden" animate="visible">
            <Card className="h-full flex flex-col bg-gray-800/50 border-purple-500/30 text-white backdrop-blur-sm shadow-lg shadow-purple-900/20">
                <CardHeader>
                    <CardTitle className="text-2xl text-purple-300">{challenge.title}</CardTitle>
                    <CardDescription className="text-gray-400">
                        بطولة في لعبة: <strong>{GAME_TYPE_NAMES[challenge.gameType]}</strong>
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow space-y-3">
                    {challenge.prize?.value > 0 && (
                        <div className="flex items-center gap-2">
                             {challenge.prize.type === 'coins' ? <CircleDollarSign className="w-5 h-5 text-yellow-400" /> : <Diamond className="w-5 h-5 text-blue-400" />}
                            <span>الجائزة: <span className="font-bold">{challenge.prize.value} {challenge.prize.type === 'coins' ? 'كوينز' : 'ألماس'}</span></span>
                        </div>
                    )}
                    {challenge.entryFee?.value > 0 && (
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-green-400" />
                            <span>رسوم الدخول: <span className="font-bold">{challenge.entryFee.value} نقطة</span></span>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-gray-400" />
                        <span>ينتهي: <span className="font-bold">{formatDistanceToNow(challenge.endsAt, { addSuffix: true, locale: ar })}</span></span>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button className="w-full bg-purple-600 hover:bg-purple-700">
                        <Play className="ml-2" />
                        شارك في التحدي (قريبًا)
                    </Button>
                </CardFooter>
            </Card>
        </motion.div>
    );
}
