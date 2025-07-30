import React from 'react';
import type { Game, Player } from '@/types';
import { RoleDetails } from '@/data/mafia-roles';
import { GenericRoleCard } from './GenericRoleCard';
import { PlayerSelection } from '../PlayerSelection';
import { submitNightAction } from '@/lib/actions/mafia';
import { useToast } from '@/hooks/use-toast';

interface DetectiveCardProps {
    roleDetails: RoleDetails;
    game: Game;
    self: Player;
}

export function DetectiveCard({ roleDetails, game, self }: DetectiveCardProps) {
    const { toast } = useToast();
    const nightActions = game.mafiaState?.nightActions || {};
    const myAction = nightActions[self.id];
    const alivePlayers = game.players.filter(p => p.status === 'alive' && p.id !== self.id);

    const handleSelect = (targetId: string) => {
        submitNightAction({
            gameId: game.id,
            actorId: self.id,
            action: 'investigate',
            targetId: targetId
        }).then(() => {
            toast({ title: 'بدأ التحقيق...' });
        }).catch((e) => {
            toast({ title: 'خطأ', description: e.message, variant: 'destructive' });
        });
    };

    return (
        <GenericRoleCard roleDetails={roleDetails} game={game} self={self}>
            <PlayerSelection
                players={alivePlayers}
                actionPrompt="اختر لاعبًا للتحقيق في هويته:"
                onSelect={handleSelect}
                selectedId={myAction?.targetId}
                selfId={self.id}
                disabled={!!myAction}
            />
        </GenericRoleCard>
    );
}
