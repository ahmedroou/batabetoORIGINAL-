import React from 'react';
import type { Game, Player } from '@/types';
import { RoleDetails } from '@/data/mafia-roles';
import { GenericRoleCard } from './GenericRoleCard';
import { PlayerSelection } from '../PlayerSelection';
import { submitNightAction } from '@/lib/actions/mafia';
import { useToast } from '@/hooks/use-toast';

interface BomberCardProps {
    roleDetails: RoleDetails;
    game: Game;
    self: Player;
}

export function BomberCard({ roleDetails, game, self }: BomberCardProps) {
    const { toast } = useToast();
    const nightActions = game.mafiaState?.nightActions || {};
    const myAction = nightActions[self.id];
    const alivePlayers = game.players.filter(p => p.status === 'alive' && p.id !== self.id);

    const handleSelect = (targetId: string) => {
        submitNightAction({
            gameId: game.id,
            actorId: self.id,
            action: 'bomb',
            targetId: targetId
        }).then(() => {
            toast({ title: 'تم تحديد هدفك الانتحاري.' });
        }).catch((e) => {
            toast({ title: 'خطأ', description: e.message, variant: 'destructive' });
        });
    };

    return (
        <GenericRoleCard roleDetails={roleDetails} game={game} self={self}>
            <PlayerSelection
                players={alivePlayers}
                actionPrompt="اختر هدفك الذي سينفجر معك:"
                onSelect={handleSelect}
                selectedId={myAction?.targetId}
                selfId={self.id}
                disabled={!!myAction}
            />
        </GenericRoleCard>
    );
}
