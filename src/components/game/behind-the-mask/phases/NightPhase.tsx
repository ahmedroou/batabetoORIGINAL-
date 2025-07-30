
"use client";

import { useState } from 'react';
import type { Game, Player, PlayerRole, NightActionType } from '@/types';
import { Button } from '@/components/ui/button';
import { ROLES } from '@/data/mafia-roles';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { submitNightAction } from '@/lib/actions/behind-the-mask';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, Bed, Shield, Search, Eye, Bomb, VenetianMask } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

interface NightPhaseProps {
    game: Game;
    self: Player;
}

const ACTION_ICONS: Record<string, React.ElementType> = {
    kill: Bed,
    heal: Shield,
    investigate: Search,
    spy: Eye,
    bomb: Bomb,
    shapeshift: VenetianMask,
};

const getActionTypeForRole = (role: PlayerRole): NightActionType | null => {
    switch (role) {
        case 'killer': return 'kill';
        case 'doctor': return 'heal';
        case 'detective': return 'investigate';
        case 'spy': return 'spy';
        case 'bomber': return 'bomb';
        case 'shapeshifter': return 'shapeshift';
        default: return null;
    }
}

export function NightPhase({ game, self }: NightPhaseProps) {
    const { toast } = useToast();
    const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const myRoleDetails = self.role ? ROLES[self.role] : null;
    const myActionType = myRoleDetails ? getActionTypeForRole(myRoleDetails.id) : null;
    const hasSubmittedAction = !!game.mafiaState?.nightActions?.[self.id];
    
    // Players who are alive and can be targeted
    const targetablePlayers = game.players.filter(p => p.status === 'alive' && p.id !== self.id);

    const handleTargetSelection = (targetId: string) => {
        if (hasSubmittedAction || isSubmitting) return;
        setSelectedTargetId(targetId);
    };

    const handleSubmit = async () => {
        if (!selectedTargetId || !myActionType || hasSubmittedAction) return;

        setIsSubmitting(true);
        const result = await submitNightAction(game.id, {
            actorId: self.id,
            action: myActionType,
            targetId: selectedTargetId,
        });

        if (result.success) {
            toast({ title: "تم تسجيل قرارك بنجاح." });
        } else {
            toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
        // isSubmitting will be set to false implicitly when hasSubmittedAction becomes true on next re-render
    };

    if (!myRoleDetails || !myActionType) {
        // This is for civilians or roles with no night action
        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white text-center">
                 <Bed className="w-24 h-24 text-blue-300 mb-4" />
                <h1 className="text-4xl font-bold">حل الظلام...</h1>
                <p className="text-xl text-muted-foreground mt-2 animate-pulse">أنت نائم... في انتظار مرور الليل.</p>
            </div>
        );
    }
    
    const ActionIcon = ACTION_ICONS[myActionType] || Bed;


    return (
        <div className="w-full max-w-4xl h-full flex flex-col items-center justify-center p-4 bg-gray-900 text-white">
             <AnimatePresence mode="wait">
                {hasSubmittedAction ? (
                    <motion.div
                        key="submitted"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center"
                    >
                        <CheckCircle className="w-24 h-24 text-green-400 mx-auto mb-4" />
                        <h1 className="text-3xl font-bold">تم تسجيل قرارك</h1>
                        <p className="text-lg text-muted-foreground mt-2 animate-pulse">في انتظار بقية اللاعبين...</p>
                    </motion.div>
                ) : (
                    <motion.div
                        key="action"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="w-full"
                    >
                        <div className="text-center mb-6">
                             <ActionIcon className="w-16 h-16 text-primary mx-auto mb-2" />
                            <h1 className="text-4xl font-bold">دورك الآن يا {myRoleDetails.name}</h1>
                            <p className="text-lg text-muted-foreground mt-2">اختر هدفك لهذه الليلة.</p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {targetablePlayers.map(player => (
                                <motion.div
                                    key={player.id}
                                    onClick={() => handleTargetSelection(player.id)}
                                    className={cn(
                                        "p-3 rounded-lg border-2 bg-gray-800/50 cursor-pointer transition-all duration-200 text-center space-y-2",
                                        selectedTargetId === player.id ? "border-primary scale-105 shadow-lg shadow-primary/20" : "border-gray-700 hover:border-primary/50"
                                    )}
                                    whileHover={{ y: -5 }}
                                >
                                    <PlayerAvatar avatarId={player.avatarId} className="w-24 h-24 mx-auto" />
                                    <p className="font-bold text-lg">{player.name}</p>
                                </motion.div>
                            ))}
                        </div>
                        
                        <div className="mt-8 flex justify-center">
                            <Button 
                                onClick={handleSubmit} 
                                disabled={!selectedTargetId || isSubmitting}
                                size="lg"
                                className="w-full max-w-xs"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" /> : `تأكيد اختيار ${targetablePlayers.find(p => p.id === selectedTargetId)?.name || ''}`}
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

