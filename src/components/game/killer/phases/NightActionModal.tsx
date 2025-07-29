
"use client";

import { useState } from 'react';
import type { Game, Player, PlayerRole, NightAction } from '@/types';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Swords, HeartPulse, Search, Eye, UserCog, Bomb, ShieldCheck, Ghost } from 'lucide-react';
import * as killerActions from "@/lib/actions/killer";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { cn } from "@/lib/utils";

interface NightActionModalProps {
    game: Game;
    self: Player;
    isOpen: boolean;
    onClose: () => void;
}

const modalInfo: Record<PlayerRole, { title: string, description: string, icon: React.ElementType, targetableRoles?: PlayerRole[] }> = {
    killer: { title: "اختر ضحية", description: "اختر لاعبًا لقتله هذا الليل.", icon: Swords },
    doctor: { title: "اختر من تحمي", description: "اختر لاعبًا لحمايته. يمكنك حماية نفسك.", icon: HeartPulse },
    detective: { title: "اكشف هوية لاعب", description: "اختر لاعبًا لكشف دوره الحقيقي.", icon: Search },
    spy: { title: "تجسس على لاعب", description: "اختر لاعبًا لكشف دوره.", icon: Eye },
    impersonator: { title: "انتحل دورًا", description: "اختر دورًا لتظهر به للجاسوس إذا تحقق منك.", icon: UserCog, targetableRoles: ['doctor', 'detective', 'soldier', 'civilian'] },
    suicide_bomber: { title: "ضع لعنتك", description: "اختر لاعبًا. إذا قتلك هذا اللاعب، سيموت معك.", icon: Bomb },
    soldier: { title: "أنت الجندي", description: "قدرتك سلبية وتعمل تلقائيًا.", icon: ShieldCheck },
    civilian: { title: "مدني", description: "ليس لديك قدرة خاصة.", icon: Ghost },
    contestant: { title: "متسابق", description: "ليس لديك قدرة خاصة.", icon: Ghost }
};

export function NightActionModal({ game, self, isOpen, onClose }: NightActionModalProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedTargetId, setSelectedTargetId] = useState<string>('');
    const [selectedImpersonateRole, setSelectedImpersonateRole] = useState<PlayerRole>();
    
    const info = modalInfo[self.role!];

    const targetablePlayers = self.role === 'doctor' 
        ? game.players.filter(p => p.status === 'alive')
        : game.players.filter(p => p.id !== self.id && p.status === 'alive');
        
    const handleConfirmNightAction = async () => {
        if (!self.role) return;
        
        let action: NightAction = {};
        
        if (self.role === 'killer') action = { killTarget: selectedTargetId };
        else if (self.role === 'doctor') action = { protectTarget: selectedTargetId };
        else if (self.role === 'detective') action = { checkTarget: selectedTargetId };
        else if (self.role === 'spy') action = { checkTarget: selectedTargetId };
        else if (self.role === 'suicide_bomber') action = { setCurseTarget: selectedTargetId };
        else if (self.role === 'impersonator') {
             if (selectedImpersonateRole) {
                action = { impersonateRole: selectedImpersonateRole };
            } else {
                toast({ title: 'خطأ', description: 'يجب اختيار دور لانتحاله', variant: 'destructive' });
                return;
            }
        }
        
        const isTargetMissing = self.role !== 'impersonator' && !selectedTargetId;

        if (Object.keys(action).length === 0 || isTargetMissing) {
            toast({ title: 'خطأ', description: 'يجب اختيار إجراء', variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);
        try {
            await killerActions.submitNightAction(game.id, self.id, action);
            onClose(); // Close modal on success
        } catch(e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (!info) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><info.icon />{info.title}</DialogTitle>
                    <DialogDescription>{info.description}</DialogDescription>
                </DialogHeader>
                <div className="py-4 max-h-96 overflow-y-auto">
                    {self.role === 'impersonator' ? (
                        <RadioGroup value={selectedImpersonateRole} onValueChange={(v) => setSelectedImpersonateRole(v as PlayerRole)} className="grid grid-cols-2 gap-3">
                            {(info.targetableRoles || []).map(role => (
                                <Label key={role} htmlFor={role} className={cn("flex flex-col items-center justify-center gap-1 p-3 rounded-lg border-2 cursor-pointer", selectedImpersonateRole === role ? 'border-primary bg-primary/10' : 'border-muted')}>
                                    <span className="font-bold">{role}</span>
                                    <RadioGroupItem value={role} id={role} className="sr-only"/>
                                </Label>
                            ))}
                        </RadioGroup>
                    ) : (
                        <RadioGroup value={selectedTargetId} onValueChange={setSelectedTargetId} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {targetablePlayers.map(p => (
                                <Label key={p.id} htmlFor={p.id} className={cn("flex flex-col items-center gap-1 p-2 rounded-lg border-2 cursor-pointer transition-all", selectedTargetId === p.id ? 'border-primary bg-primary/10 scale-105' : 'border-muted opacity-80 hover:opacity-100')}>
                                    <PlayerAvatar avatarId={p.avatarId} className="w-16 h-16"/>
                                    <p className="font-semibold">{p.name}</p>
                                    <RadioGroupItem value={p.id} id={p.id} className="sr-only"/>
                                </Label>
                            ))}
                        </RadioGroup>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="secondary" onClick={onClose}>إلغاء</Button>
                    <Button onClick={handleConfirmNightAction} disabled={isSubmitting || (self.role !== 'impersonator' && !selectedTargetId) || (self.role === 'impersonator' && !selectedImpersonateRole)}>
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

