import React from 'react';
import type { Game, Player } from '@/types';
import { RoleDetails } from '@/data/mafia-roles';
import { GenericRoleCard } from './GenericRoleCard';
import { PlayerSelection } from '../PlayerSelection';
import { submitNightAction } from '@/lib/actions/mafia';
import { useToast } from '@/hooks/use-toast';

interface DoctorCardProps {
    roleDetails: RoleDetails;
    game: Game;
    self: Player;
}

export function DoctorCard({ roleDetails, game, self }: DoctorCardProps) {
    const { toast } = useToast();
    const nightActions = game.mafiaState?.nightActions || {};
    const myAction = nightActions[self.id];
    const lastHealedId = game.mafiaState?.lastHealed;
    const alivePlayers = game.players.filter(p => p.status === 'alive');
    
    // Filter out the player who was healed last night, if any
    const selectablePlayers = alivePlayers.filter(p => p.id !== lastHealedId);

    const handleSelect = (targetId: string) => {
        submitNightAction({
            gameId: game.id,
            actorId: self.id,
            action: 'heal',
            targetId: targetId
        }).then(() => {
            toast({ title: 'تم اختيار المريض للعلاج.' });
        }).catch((e) => {
            toast({ title: 'خطأ', description: e.message, variant: 'destructive' });
        });
    };
    
    return (
        <GenericRoleCard roleDetails={roleDetails} game={game} self={self}>
            <PlayerSelection
                players={selectablePlayers}
                actionPrompt="اختر لاعبًا لحمايته هذه الليلة:"
                onSelect={handleSelect}
                selectedId={myAction?.targetId}
                selfId={self.id}
                disabled={!!myAction}
                disabledIds={lastHealedId ? [lastHealedId] : []}
                disabledReason="لا يمكنك علاج نفس الشخص مرتين متتاليتين"
            />
        </GenericRoleCard>
    );
}
