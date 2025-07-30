import React, { useState, useEffect } from 'react';
import type { Game, Player, DayEvent } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sun, MessageSquare, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface DayPhaseProps {
    game: Game;
    self: Player;
}

export function DayPhase({ game, self }: DayPhaseProps) {
    const [events, setEvents] = useState<DayEvent[]>([]);
    const [currentEventIndex, setCurrentEventIndex] = useState(0);

    useEffect(() => {
        const gameEvents = game.mafiaState?.events || [];
        if (gameEvents.length > 0) {
            setEvents(gameEvents);
            setCurrentEventIndex(0);
        }
    }, [game.mafiaState?.events]);

    useEffect(() => {
        if (events.length === 0 || currentEventIndex >= events.length) return;
        
        const timer = setTimeout(() => {
            setCurrentEventIndex(prev => prev + 1);
        }, 3000); // Display each event for 3 seconds

        return () => clearTimeout(timer);
    }, [events, currentEventIndex]);

    const renderEvent = (event: DayEvent) => {
        return (
            <motion.div
                key={event.message}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                className="p-4 rounded-lg bg-yellow-100 dark:bg-yellow-900/50 border border-yellow-300 dark:border-yellow-700"
            >
                <p className="text-center font-semibold text-yellow-800 dark:text-yellow-200">{event.message}</p>
                 {event.revealedTeam && (
                    <p className={`text-center font-bold text-lg mt-1 ${event.revealedTeam === 'mafia' ? 'text-red-500' : 'text-green-500'}`}>
                        {event.revealedTeam === 'mafia' ? "فريق الشر" : "فريق الخير"}
                    </p>
                )}
            </motion.div>
        );
    };

    return (
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 flex flex-col gap-6">
                <Card>
                    <CardHeader>
                        <Sun className="w-10 h-10 text-yellow-500"/>
                        <CardTitle>أشرقت الشمس</CardTitle>
                        <CardDescription>حان وقت النقاش والتصويت.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <h3 className="font-bold mb-2">أحداث الليلة الماضية</h3>
                        <div className="space-y-3 h-48">
                            <AnimatePresence mode="wait">
                                {events[currentEventIndex] && renderEvent(events[currentEventIndex])}
                            </AnimatePresence>
                             {currentEventIndex >= events.length && (
                                <p className="text-center text-muted-foreground pt-8">انتهت أحداث الليلة. ابدأوا النقاش!</p>
                             )}
                        </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>الناجون</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-2">
                            {game.players.filter(p => p.status === 'alive').map(p => (
                                <div key={p.id} className="flex flex-col items-center">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12"/>
                                    <span className="text-xs font-semibold mt-1 truncate">{p.name}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
            <div className="md:col-span-2">
                 <Card className="h-full flex flex-col">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MessageSquare/>
                            النقاش العام
                        </CardTitle>
                         <CardDescription>
                            تحدثوا، حللوا، واتهموا. أسماءكم الحقيقية مخفية.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow flex flex-col">
                         <ScrollArea className="h-96 w-full bg-muted/50 rounded-lg p-4 mb-4">
                            <p className="text-center text-muted-foreground">سيتم تفعيل الدردشة قريبًا...</p>
                         </ScrollArea>
                         <div className="flex gap-2">
                            <Textarea placeholder="اكتب رسالتك..." className="flex-grow" disabled/>
                            <Button disabled>إرسال</Button>
                         </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
