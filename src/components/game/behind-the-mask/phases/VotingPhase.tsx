
"use client";

import { useState, useEffect } from 'react';
import type { Game, Player } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { submitVote, processDay } from '@/lib/actions/behind-the-mask';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, Gavel } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface VotingPhaseProps {
    game: Game;
    self: Player;
}

export function VotingPhase({ game, self }: VotingPhaseProps) {
    const { toast } = useToast();
    const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [timeLeft, setTimeLeft] = useState(45); // Default, will be updated by effect

    const isHost = game.hostId === self.id;
    const hasVoted = !!game.mafiaState?.votes?.[self.id];
    const targetablePlayers = game.players.filter(p => p.status === 'alive');

    useEffect(() => {
        if (!game.mafiaState?.timerEndsAt) return;
        const endTime = game.mafiaState.timerEndsAt.toMillis();

        const updateTimer = () => {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);

            if (remaining === 0 && isHost) {
                // To prevent multiple calls, a more robust solution might be needed
                // but for now, this will trigger the host to process the day.
                processDay(game.id, self.id).catch(e => console.error("Failed to process day on timeout", e));
            }
        };

        const timer = setInterval(updateTimer, 1000);
        updateTimer(); // Initial call
        return () => clearInterval(timer);
    }, [game.mafiaState?.timerEndsAt, isHost, game.id, self.id]);

    const handleVoteSelection = (targetId: string) => {
        if (hasVoted || isSubmitting) return;
        setSelectedTargetId(targetId);
    };

    const handleSubmit = async () => {
        if (!selectedTargetId || hasVoted) return;

        setIsSubmitting(true);
        try {
            await submitVote(game.id, self.id, selectedTargetId);
            toast({ title: "تم تسجيل صوتك." });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card className="w-full max-w-3xl bg-red-50/90 backdrop-blur-sm border-red-200">
            <CardHeader className="text-center">
                <Gavel className="w-16 h-16 mx-auto text-red-700" />
                <CardTitle className="text-4xl font-bold text-gray-800">مرحلة التصويت</CardTitle>
                <CardDescription className="text-lg">
                    اختر من تعتقد أنه من الأشرار لإعدامه. تبقى <span className="font-bold">{timeLeft}</span> ثانية.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {hasVoted ? (
                    <div className="text-center p-8">
                        <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold">تم تسجيل صوتك!</h2>
                        <p className="text-muted-foreground animate-pulse">في انتظار بقية اللاعبين...</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {targetablePlayers.map(player => (
                                <motion.div
                                    key={player.id}
                                    onClick={() => handleVoteSelection(player.id)}
                                    className={cn(
                                        "p-3 rounded-lg border-2 bg-white/80 cursor-pointer transition-all duration-200 text-center space-y-2",
                                        selectedTargetId === player.id ? "border-primary scale-105 shadow-lg shadow-primary/20" : "border-gray-300 hover:border-primary/50"
                                    )}
                                    whileHover={{ y: -5 }}
                                >
                                    <PlayerAvatar avatarId={player.avatarId} className="w-24 h-24 mx-auto" />
                                    <p className="font-bold text-lg">{player.name}</p>
                                </motion.div>
                            ))}
                        </div>
                        
                        <div className="flex justify-center">
                            <Button 
                                onClick={handleSubmit} 
                                disabled={!selectedTargetId || isSubmitting}
                                size="lg"
                                className="w-full max-w-xs"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" /> : `تأكيد التصويت على ${targetablePlayers.find(p => p.id === selectedTargetId)?.name || ''}`}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
