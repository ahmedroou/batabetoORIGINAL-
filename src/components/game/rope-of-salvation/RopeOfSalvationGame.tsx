
"use client";

import { useState } from "react";
import type { Game, Player } from "@/types";
import { selectTeam, startRopeOfSalvationGame } from "@/lib/actions/rope-of-salvation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { Users, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";

interface RopeOfSalvationGameProps {
    game: Game;
    player: Player;
    self: Player;
    isHost: boolean;
}

const TeamColumn = ({ teamId, title, players, self, onSelectTeam, gameId }: { teamId: 'A' | 'B', title: string, players: Player[], self: Player, onSelectTeam: (team: 'A' | 'B') => void, gameId: string }) => {
    const isFull = players.length >= 2;
    const isInTeam = players.some(p => p.id === self.id);

    return (
        <div className="flex flex-col gap-4 p-4 bg-muted rounded-lg">
            <h3 className={`text-2xl font-bold text-center ${teamId === 'A' ? 'text-blue-500' : 'text-red-500'}`}>{title}</h3>
            <div className="space-y-3 min-h-[160px]">
                {players.map(p => (
                    <motion.div 
                        key={p.id}
                        layoutId={`player-${p.id}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="flex items-center gap-3 p-2 bg-background rounded-md shadow"
                    >
                        <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12" />
                        <div>
                            <p className="font-bold">{p.name}</p>
                            {p.id === self.id && <p className="text-xs text-primary">(أنت)</p>}
                        </div>
                    </motion.div>
                ))}
            </div>
            <Button 
                onClick={() => onSelectTeam(teamId)} 
                disabled={isFull && !isInTeam}
            >
                {isInTeam ? "أنت في هذا الفريق" : isFull ? "الفريق ممتلئ" : "انضم للفريق"}
            </Button>
        </div>
    );
};

export function RopeOfSalvationGame({ game, player, self, isHost }: RopeOfSalvationGameProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSelectTeam = async (team: 'A' | 'B') => {
        setIsSubmitting(true);
        try {
            await selectTeam(game.id, self.id, team);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleStartGame = async () => {
        setIsSubmitting(true);
        try {
            await startRopeOfSalvationGame(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }

    const teamA = game.players.filter(p => p.team === 'A');
    const teamB = game.players.filter(p => p.team === 'B');
    const unassigned = game.players.filter(p => !p.team);
    const canStart = teamA.length === 2 && teamB.length === 2;

    const renderTeamSelection = () => {
        return (
            <Card className="w-full max-w-4xl animate-pop-in">
                <CardHeader className="text-center">
                    <CardTitle className="text-3xl">توزيع الفرق</CardTitle>
                    <CardDescription>اختر فريقك. تحتاجون لاعبين اثنين في كل فريق لبدء اللعبة.</CardDescription>
                </CardHeader>
                <CardContent>
                    <AnimatePresence>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <TeamColumn teamId="A" title="الفريق الأزرق" players={teamA} self={self} onSelectTeam={handleSelectTeam} gameId={game.id} />
                            <TeamColumn teamId="B" title="الفريق الأحمر" players={teamB} self={self} onSelectTeam={handleSelectTeam} gameId={game.id} />
                        </div>
                    </AnimatePresence>
                    {unassigned.length > 0 && (
                        <div className="mt-6">
                            <h4 className="text-center font-bold text-muted-foreground">لاعبون لم ينضموا لفريق بعد</h4>
                            <div className="flex justify-center flex-wrap gap-4 mt-2">
                                {unassigned.map(p => (
                                    <div key={p.id} className="flex flex-col items-center">
                                        <PlayerAvatar avatarId={p.avatarId} className="w-12 h-12" />
                                        <p className="text-sm font-medium">{p.name}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    {isHost ? (
                        <Button className="w-full" size="lg" disabled={!canStart || isSubmitting} onClick={handleStartGame}>
                            {isSubmitting ? "جاري البدء..." : !canStart ? "في انتظار اكتمال الفرق..." : "بدء اللعبة"}
                            <ArrowRight className="mr-2" />
                        </Button>
                    ) : (
                        <p className="text-center w-full text-muted-foreground">في انتظار صاحب الغرفة لبدء اللعبة بعد اكتمال الفرق</p>
                    )}
                </CardFooter>
            </Card>
        );
    }
    
    const renderMapView = () => {
        return (
             <Card className="w-full max-w-4xl animate-pop-in">
                <CardHeader>
                    <CardTitle>خريطة الهروب</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>سيتم عرض الخريطة والتحديات هنا...</p>
                </CardContent>
            </Card>
        );
    }

    switch(game.gameState) {
        case 'team_selection':
            return renderTeamSelection();
        case 'map_view':
            return renderMapView();
        // Add other game states here
        default:
            return <p>حالة غير معروفة في لعبة "حبل النجاة"...</p>;
    }
}
