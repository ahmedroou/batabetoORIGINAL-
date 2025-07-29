"use client";

import { useState, useEffect, useRef } from 'react';
import type { Game, Player, Role } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import * as mafiaActions from '@/lib/actions/mafia';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MAFIA_ROLES } from '@/data/mafia-roles';
import { DefaultCard } from '../cards/DefaultCard';
import { KillerCard } from '../cards/KillerCard';
import { DetectiveCard } from '../cards/DetectiveCard';
import { DoctorCard } from '../cards/DoctorCard';
import { Eye, Loader2, VenetianMask, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface RoleRevealPhaseProps {
  game: Game;
  self: Player;
}

const roleCardMap: Record<string, React.FC<{ role: Role }>> = {
    killer: KillerCard,
    detective: DetectiveCard,
    doctor: DoctorCard,
    default: DefaultCard,
};

export function RoleRevealPhase({ game, self }: RoleRevealPhaseProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const isHost = game.hostId === user?.uid;
    const [isRevealed, setIsRevealed] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const selfInGame = game.players.find(p => p.id === self.id);
    const roleInfo = MAFIA_ROLES.find(r => r.id === selfInGame?.role);

    const handleStartNight = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await mafiaActions.progressToNight(game.id, self.id);
        } catch (error: any) {
            toast({
                title: 'خطأ',
                description: error.message || 'فشل بدء الليل.',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!selfInGame || !roleInfo) {
        return <Loader2 className="w-12 h-12 animate-spin" />;
    }

    const CardComponent = roleCardMap[roleInfo.id] || roleCardMap.default;

    return (
        <div className="flex flex-col items-center justify-center text-center text-white w-full">
            <h1 className="text-4xl font-bold tracking-tighter mb-2">اكشف عن دورك...</h1>
            <p className="text-lg text-muted-foreground mb-8">احفظ دورك جيدًا. سينقلك المضيف إلى الليل قريبًا.</p>
            
            <div className="w-[300px] h-[420px] [perspective:1000px]">
                <motion.div
                    className="relative w-full h-full transform-style-3d"
                    animate={{ rotateY: isRevealed ? 180 : 0 }}
                    transition={{ duration: 0.6 }}
                >
                    {/* Card Back */}
                    <div className="absolute w-full h-full backface-hidden flex flex-col items-center justify-center bg-gray-800 border-2 border-primary rounded-xl shadow-2xl shadow-primary/30">
                        <VenetianMask className="w-32 h-32 text-primary" />
                        <p className="mt-4 text-2xl font-bold">هويتك سرية</p>
                        <Button onClick={() => setIsRevealed(true)} className="mt-6">
                            <Eye className="ml-2" />
                            اكشف عن دوري
                        </Button>
                    </div>

                    {/* Card Front */}
                    <div className={cn("absolute w-full h-full backface-hidden [transform:rotateY(180deg)]", roleInfo.team === 'mafia' ? 'bg-red-900/20' : 'bg-blue-900/20')}>
                        <CardComponent role={roleInfo} />
                    </div>
                </motion.div>
            </div>

            {/* Host Button */}
            <div className="mt-8">
                {isHost ? (
                    <Button onClick={handleStartNight} disabled={isSubmitting} size="lg">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : <Moon className="ml-2" />}
                        بدء الليل
                    </Button>
                ) : (
                    <p className="text-muted-foreground animate-pulse">في انتظار المضيف لبدء الليل...</p>
                )}
            </div>
        </div>
    );
}
