
"use client";

import { useState } from "react";
import type { Game, Player, PowerupType, Challenge, ChallengeType } from "@/types";
import { selectTeam, startRopeOfSalvationGame, initiateChallenge } from "@/lib/actions/rope-of-salvation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { Users, ArrowRight, Telescope, Compass, LocateFixed, Lightbulb, Heart, Star, Shield, HelpCircle, MemoryStick, PenTool, AlarmClock, Route } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";


interface RopeOfSalvationGameProps {
    game: Game;
    player: Player;
    self: Player;
    isHost: boolean;
}

const TeamColumn = ({ teamId, title, players, self, onSelectTeam }: { teamId: 'A' | 'B', title: string, players: Player[], self: Player, onSelectTeam: (team: 'A' | 'B') => void }) => {
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


const PowerupIcon = ({ type }: { type: PowerupType }) => {
    switch(type) {
        case 'telescope': return <Telescope className="h-6 w-6" />;
        case 'compass': return <Compass className="h-6 w-6" />;
        case 'gps': return <LocateFixed className="h-6 w-6" />;
        case 'hint': return <Lightbulb className="h-6 w-6" />;
        default: return null;
    }
}

const ChallengeIcon = ({ type }: { type?: ChallengeType }) => {
    switch(type) {
        case 'missing_symbol': return <HelpCircle className="h-6 w-6 text-purple-400" />;
        case 'image_order':
        case 'dark_path':
        case 'silent_communication': return <MemoryStick className="h-6 w-6 text-blue-400" />;
        case 'distorted_audio': return <PenTool className="h-6 w-6 text-green-400" />;
        case 'code_breaker': return <Route className="h-6 w-6 text-orange-400" />;
        case 'timing_button': return <AlarmClock className="h-6 w-6 text-red-400" />;
        default: return <Shield className="h-6 w-6 text-gray-400" />;
    }
};

export function RopeOfSalvationGame({ game, player, self, isHost }: RopeOfSalvationGameProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isInitiatingChallenge, setIsInitiatingChallenge] = useState(false);

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

    const handleInitiateChallenge = async () => {
        setIsInitiatingChallenge(true);
        try {
            await initiateChallenge(game.id, self.id);
        } catch(error: any) {
             toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsInitiatingChallenge(false);
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
                            <TeamColumn teamId="A" title="الفريق الأزرق" players={teamA} self={self} onSelectTeam={handleSelectTeam} />
                            <TeamColumn teamId="B" title="الفريق الأحمر" players={teamB} self={self} onSelectTeam={handleSelectTeam} />
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
        const { map, mapDimensions, teamAPosition, teamBPosition, collapsePosition } = game;

        if (!map || !mapDimensions || !teamAPosition || !teamBPosition || typeof collapsePosition === 'undefined') {
            return <p>جاري تحميل الخريطة...</p>;
        }
        
        const myTeam = self.team;
        const activeTeamPos = game.activeTeam === 'A' ? teamAPosition : teamBPosition;
        const currentTileIndex = activeTeamPos.row * mapDimensions.cols + activeTeamPos.col;
        const currentTile = map[currentTileIndex];

        return (
             <div className="w-full max-w-7xl animate-pop-in space-y-4">
                {/* Top Info Bar */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Team A Info */}
                    <Card className={cn("border-2", myTeam === 'A' ? 'border-blue-500' : 'border-transparent')}>
                        <CardHeader className="flex-row items-center justify-between p-3">
                            <CardTitle className="text-blue-500">الفريق الأزرق</CardTitle>
                            <div className="flex items-center gap-2">
                                {teamA.map(p => <PlayerAvatar key={p.id} avatarId={p.avatarId} className="w-8 h-8"/>)}
                            </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 flex items-center justify-between">
                            <div className="flex items-center gap-1 font-bold text-lg"><Star className="h-5 w-5 text-yellow-400"/> {game.teamAScore ?? 0}</div>
                             <div className="flex items-center gap-2 w-1/2">
                                <Heart className="h-5 w-5 text-red-500" />
                                <Progress value={game.teamAHealth ?? 100} className="h-3" />
                            </div>
                        </CardContent>
                    </Card>
                    {/* Team B Info */}
                     <Card className={cn("border-2", myTeam === 'B' ? 'border-red-500' : 'border-transparent')}>
                        <CardHeader className="flex-row items-center justify-between p-3">
                            <CardTitle className="text-red-500">الفريق الأحمر</CardTitle>
                             <div className="flex items-center gap-2">
                                {teamB.map(p => <PlayerAvatar key={p.id} avatarId={p.avatarId} className="w-8 h-8"/>)}
                            </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 flex items-center justify-between">
                             <div className="flex items-center gap-1 font-bold text-lg"><Star className="h-5 w-5 text-yellow-400"/> {game.teamBScore ?? 0}</div>
                            <div className="flex items-center gap-2 w-1/2">
                                <Heart className="h-5 w-5 text-red-500" />
                                <Progress value={game.teamBHealth ?? 100} className="h-3" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
                
                {/* Map Area */}
                <Card className="p-4">
                    <div 
                        className="relative grid bg-gray-800/50 rounded-lg overflow-hidden" 
                        style={{gridTemplateColumns: `repeat(${mapDimensions.cols}, 1fr)`}}
                    >
                         {map.map((tile, index) => {
                             const col = index % mapDimensions.cols;
                             const isCollapsed = col <= collapsePosition;
                             return (
                                 <div 
                                     key={tile.id} 
                                     className={cn(
                                         "aspect-square flex items-center justify-center border border-white/10 transition-colors duration-500",
                                         isCollapsed ? 'bg-red-900/80 animate-pulse' : 'bg-gray-700/50',
                                         tile.type === 'safe' && !isCollapsed && 'bg-green-800/50',
                                         tile.type === 'powerup' && !isCollapsed && 'bg-yellow-800/50',
                                     )}
                                >
                                    {!isCollapsed && tile.type === 'challenge' && <ChallengeIcon type={tile.challengeType} />}
                                </div>
                             )
                         })}

                        {/* Team A Token */}
                        <div className="absolute transition-all duration-500" style={{ top: `${(teamAPosition.row / mapDimensions.rows) * 100}%`, left: `${(teamAPosition.col / mapDimensions.cols) * 100}%`, width: `${100 / mapDimensions.cols}%`, height: `${100 / mapDimensions.rows}%` }}>
                             <div className="w-full h-full flex items-center justify-center p-1">
                                <div className="w-full h-full rounded-full bg-blue-500 border-2 border-white shadow-lg flex items-center justify-center text-white font-bold">A</div>
                             </div>
                        </div>
                         {/* Team B Token */}
                         <div className="absolute transition-all duration-500" style={{ top: `${(teamBPosition.row / mapDimensions.rows) * 100}%`, left: `${(teamBPosition.col / mapDimensions.cols) * 100}%`, width: `${100 / mapDimensions.cols}%`, height: `${100 / mapDimensions.rows}%` }}>
                             <div className="w-full h-full flex items-center justify-center p-1">
                                <div className="w-full h-full rounded-full bg-red-500 border-2 border-white shadow-lg flex items-center justify-center text-white font-bold">B</div>
                             </div>
                        </div>
                    </div>
                </Card>

                 {/* Action/Challenge Area */}
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div className="md:col-span-2">
                        <Card>
                            <CardHeader><CardTitle>التحرك التالي</CardTitle></CardHeader>
                            <CardContent className="min-h-[100px] flex items-center justify-center">
                               {game.activeTeam === myTeam ? (
                                   currentTile?.type === 'challenge' ? (
                                    <Button onClick={handleInitiateChallenge} disabled={isInitiatingChallenge}>
                                       {isInitiatingChallenge ? "جاري التحضير..." : "ابدأ التحدي!"}
                                    </Button>
                                   ) : (
                                       <p className="text-green-500 font-bold">أنت في منطقة آمنة!</p>
                                   )
                               ) : (
                                   <p className="text-muted-foreground animate-pulse">في انتظار الفريق الآخر...</p>
                               )}
                            </CardContent>
                        </Card>
                     </div>
                     <div>
                        <Card>
                            <CardHeader><CardTitle>أدوات النجاة</CardTitle></CardHeader>
                            <CardContent className="grid grid-cols-2 gap-2">
                                <TooltipProvider>
                                {Object.entries((myTeam === 'A' ? game.teamAPowerups : game.teamBPowerups) || {}).map(([type, available]) => (
                                     <Tooltip key={type}>
                                        <TooltipTrigger asChild>
                                            <Button variant="outline" size="lg" disabled={!available} className="flex flex-col h-auto p-3 gap-1">
                                                <PowerupIcon type={type as PowerupType} />
                                                <span className="text-xs capitalize">{type}</span>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent><p>وصف {type}</p></TooltipContent>
                                     </Tooltip>
                                ))}
                                </TooltipProvider>
                            </CardContent>
                        </Card>
                     </div>
                 </div>

            </div>
        );
    }
    
    const renderChallengeView = () => {
        const { currentChallenge } = game;
        if (!currentChallenge) {
            return <p>خطأ: لم يتم تحميل التحدي.</p>;
        }

        return (
            <div className="w-full max-w-2xl animate-pop-in">
                <Card>
                    <CardHeader className="text-center">
                        <CardTitle className="text-3xl text-primary">{currentChallenge.name}</CardTitle>
                        <CardDescription className="text-lg">{currentChallenge.description}</CardDescription>
                        <div className="font-mono text-4xl pt-4">
                            {/* Countdown Timer would go here */}
                            {currentChallenge.time_limit}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div>
                            <h4 className="font-bold text-xl mb-2 text-center">طريقة اللعب</h4>
                            <p className="text-center text-muted-foreground">{currentChallenge.how_to_play}</p>
                        </div>
                        
                        <div className="bg-muted p-4 rounded-lg">
                           {/* Placeholder for the actual interactive challenge UI */}
                           <p className="text-center font-semibold">مكونات التحدي التفاعلية ستظهر هنا.</p>
                        </div>

                    </CardContent>
                    <CardFooter className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-lg text-center">
                            <p className="font-bold text-green-700 dark:text-green-300">عند النجاح</p>
                            <p className="text-sm text-green-600 dark:text-green-400">{currentChallenge.on_success}</p>
                        </div>
                         <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-lg text-center">
                            <p className="font-bold text-red-700 dark:text-red-300">عند الفشل</p>
                            <p className="text-sm text-red-600 dark:text-red-400">{currentChallenge.on_failure}</p>
                        </div>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    switch(game.gameState) {
        case 'team_selection':
            return renderTeamSelection();
        case 'map_view':
            return renderMapView();
        case 'challenge':
            return renderChallengeView();
        default:
            return <p>حالة غير معروفة في لعبة "حبل النجاة"...</p>;
    }
}
