"use client";

import type { Game, Player, DayEvent } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { Sun, Skull, ShieldCheck, Search, Gavel } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { transitionToVoting } from '@/lib/actions/behind-the-mask';

interface DayPhaseProps {
    game: Game;
    self: Player;
}

const EVENT_ICONS: Record<DayEvent['type'], React.ElementType> = {
    death: Skull,
    protection: ShieldCheck,
    investigation: Search,
    execution: Skull,
    spy_reveal: Search,
};

export function DayPhase({ game, self }: DayPhaseProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const events = game.mafiaState?.events || [];
    const isHost = game.hostId === self.id;

    const handleStartVoting = async () => {
        if (!isHost) return;
        setIsSubmitting(true);
        try {
            await transitionToVoting(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card className="w-full max-w-2xl bg-blue-50/90 backdrop-blur-sm border-blue-200">
            <CardHeader className="text-center">
                <Sun className="w-16 h-16 mx-auto text-yellow-500" />
                <CardTitle className="text-4xl font-bold text-gray-800">أشرقت الشمس...</CardTitle>
                <CardDescription className="text-lg">
                    حان وقت النقاش. هذه هي أحداث الليلة الماضية:
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-48 p-4 bg-white/70 rounded-lg border">
                    {events.length === 0 ? (
                        <p className="text-center text-muted-foreground">مرت الليلة بسلام، لم يحدث شيء يذكر.</p>
                    ) : (
                        <div className="space-y-3">
                            <AnimatePresence>
                                {events.map((event, index) => {
                                    const Icon = EVENT_ICONS[event.type] || Sun;
                                    return (
                                        <motion.div
                                            key={index}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0, transition: { delay: index * 0.3 } }}
                                            className="flex items-center gap-4 p-3 bg-white rounded-md shadow-sm"
                                        >
                                            <Icon className="w-6 h-6 text-primary flex-shrink-0" />
                                            <p className="text-gray-700 font-medium">{event.message}</p>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    )}
                </ScrollArea>
                 <div className="mt-6 text-center">
                    {isHost ? (
                        <Button size="lg" onClick={handleStartVoting} disabled={isSubmitting}>
                            <Gavel className="ml-2"/>
                            {isSubmitting ? 'جاري...' : 'بدء التصويت'}
                        </Button>
                    ) : (
                        <p className="text-muted-foreground animate-pulse">في انتظار المضيف لبدء التصويت...</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
