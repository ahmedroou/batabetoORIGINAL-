
"use client";

import type { Game, Player, DayEvent } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { Sun, Skull, ShieldCheck, Search, Gavel, Info, FileText } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { transitionToVoting } from '@/lib/actions/behind-the-mask';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

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

const EVENT_COLORS: Record<DayEvent['type'], string> = {
    death: 'bg-red-100 border-red-300 text-red-800',
    protection: 'bg-green-100 border-green-300 text-green-800',
    investigation: 'bg-blue-100 border-blue-300 text-blue-800',
    execution: 'bg-gray-200 border-gray-400 text-gray-800',
    spy_reveal: 'bg-purple-100 border-purple-300 text-purple-800',
};


export function DayPhase({ game, self }: DayPhaseProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const events = game.mafiaState?.events || [];
    const privateEvents = game.mafiaState?.privateEvents?.[self.id] || [];
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
        <Card className="w-full max-w-2xl bg-gradient-to-b from-blue-50 to-orange-50/90 backdrop-blur-sm border-blue-200">
            <CardHeader className="text-center">
                <Sun className="w-16 h-16 mx-auto text-yellow-500 animate-pulse-glow" />
                <CardTitle className="text-4xl font-bold text-gray-800">أشرقت الشمس...</CardTitle>
                <CardDescription className="text-lg">
                    حان وقت النقاش. هذه هي أحداث الليلة الماضية:
                </CardDescription>
            </CardHeader>
            <CardContent>
                {privateEvents.length > 0 && (
                     <Alert className="mb-4 bg-purple-100 border-purple-300 shadow-md">
                      <FileText className="h-5 w-5 text-purple-800" />
                      <AlertTitle className="text-purple-900 font-bold">تقرير سري لك فقط</AlertTitle>
                      <AlertDescription className="text-purple-800 text-base">
                         {privateEvents.join(' ')}
                      </AlertDescription>
                    </Alert>
                )}
                <div className="p-4 bg-white/70 rounded-lg border">
                    <h3 className="font-bold text-lg mb-3 text-center text-gray-700">سجل الأحداث الصباحي</h3>
                    {events.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">مرت الليلة بسلام، لم يحدث شيء يذكر.</p>
                    ) : (
                        <div className="space-y-3">
                            <AnimatePresence>
                                {events.map((event, index) => {
                                    const Icon = EVENT_ICONS[event.type] || Sun;
                                    const colorClass = EVENT_COLORS[event.type] || 'bg-gray-100 border-gray-300 text-gray-800';
                                    return (
                                        <motion.div
                                            key={index}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0, transition: { delay: index * 0.3 } }}
                                            className={cn("flex items-center gap-4 p-3 rounded-md shadow-sm border", colorClass)}
                                        >
                                            <Icon className="w-6 h-6 flex-shrink-0" />
                                            <p className="font-medium text-base">{event.message}</p>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
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

