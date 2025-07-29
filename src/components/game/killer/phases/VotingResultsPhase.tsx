
"use client";

import { useState } from 'react';
import type { Game } from '@/types';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Gavel, Loader2, ArrowRight } from 'lucide-react';
import * as killerActions from "@/lib/actions/killer";
import { useToast } from "@/hooks/use-toast";

interface VotingResultsPhaseProps {
    game: Game;
    isHost: boolean;
}

export function VotingResultsPhase({ game, isHost }: VotingResultsPhaseProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { wasTie, message, eliminatedPlayerRole } = game.lastVoteResult || {};

    const handleProgressToNight = async () => {
        setIsSubmitting(true);
        try {
            await killerActions.progressToNight(game.id, game.hostId);
        } catch(e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="w-full max-w-md animate-pop-in text-center">
                <CardHeader>
                    <Gavel className="w-20 h-20 mx-auto text-primary"/>
                    <CardTitle className="text-3xl mt-2">نتيجة التصويت</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-xl">
                    <p>{message}</p>
                    {!wasTie && eliminatedPlayerRole && (
                        <div className="p-3 bg-muted rounded-lg">
                            <p>دوره كان: <strong className="text-primary">{eliminatedPlayerRole}</strong></p>
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                   {isHost ? (
                        <Button onClick={handleProgressToNight} disabled={isSubmitting} className="w-full">
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'الانتقال إلى الليل'}
                            <ArrowRight />
                        </Button>
                    ) : (
                         <p className="w-full text-center text-muted-foreground animate-pulse">في انتظار المضيف...</p>
                    )}
                </CardFooter>
            </Card>
        </motion.div>
    );
}
