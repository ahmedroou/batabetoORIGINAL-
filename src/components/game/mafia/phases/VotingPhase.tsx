import React, { useState } from 'react';
import type { Game, Player } from '@/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Gavel, Send, CheckCircle, Loader2 } from 'lucide-react';
import { submitVote } from '@/lib/actions/mafia';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

interface VotingPhaseProps {
    game: Game;
    self: Player;
}

export function VotingPhase({ game, self }: VotingPhaseProps) {
    const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    const myVote = game.mafiaState?.votes?.[self.id];
    const alivePlayers = game.players.filter(p => p.status === 'alive');

    const handleVote = async () => {
        if (!selectedTargetId) {
            toast({ title: 'الرجاء اختيار لاعب للتصويت عليه', variant: 'destructive' });
            return;
        }
        setIsSubmitting(true);
        try {
            await submitVote(game.id, self.id, selectedTargetId);
            toast({ title: 'تم تسجيل صوتك بنجاح' });
        } catch (error: any) {
            toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Card className="w-full max-w-2xl">
            <CardHeader className="text-center">
                <Gavel className="w-12 h-12 mx-auto text-primary"/>
                <CardTitle>مرحلة التصويت</CardTitle>
                <CardDescription>حان وقت المحاكمة. صوّت على اللاعب الذي تعتقد أنه من المافيا لإعدامه.</CardDescription>
            </CardHeader>
            <CardContent>
                {myVote ? (
                    <div className="p-6 rounded-lg bg-green-100 dark:bg-green-900/50 text-center">
                        <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4"/>
                        <p className="text-xl font-semibold">شكراً لك، تم تسجيل صوتك.</p>
                        <p className="text-muted-foreground">في انتظار بقية اللاعبين...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        <AnimatePresence>
                        {alivePlayers.map((player) => (
                            player.id !== self.id && (
                                <motion.div
                                    key={player.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                >
                                    <button
                                        onClick={() => setSelectedTargetId(player.id)}
                                        className={cn(
                                            "w-full p-3 rounded-lg border-2 flex flex-col items-center gap-2 transition-all duration-200",
                                            selectedTargetId === player.id 
                                                ? 'border-primary bg-primary/10 shadow-lg scale-105' 
                                                : 'border-muted bg-background hover:border-primary/50'
                                        )}
                                    >
                                        <PlayerAvatar avatarId={player.avatarId} className="w-20 h-20"/>
                                        <span className="font-bold truncate">{player.name}</span>
                                    </button>
                                </motion.div>
                            )
                        ))}
                        </AnimatePresence>
                    </div>
                )}
            </CardContent>
            {!myVote && (
                <CardFooter>
                    <Button 
                        onClick={handleVote} 
                        disabled={!selectedTargetId || isSubmitting}
                        className="w-full"
                        size="lg"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin"/> : <Send className="mr-2"/>}
                        تأكيد التصويت
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}
