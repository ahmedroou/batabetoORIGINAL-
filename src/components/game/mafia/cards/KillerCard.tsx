import React from 'react';
import type { Game, Player } from '@/types';
import { RoleDetails } from '@/data/mafia-roles';
import { GenericRoleCard } from './GenericRoleCard';
import { PlayerSelection } from '../PlayerSelection';
import { submitNightAction } from '@/lib/actions/mafia';
import { useToast } from '@/hooks/use-toast';
import { PrivateChatBox } from '../PrivateChatBox';

interface KillerCardProps {
    roleDetails: RoleDetails;
    game: Game;
    self: Player;
}

export function KillerCard({ roleDetails, game, self }: KillerCardProps) {
    const { toast } = useToast();
    const nightActions = game.mafiaState?.nightActions || {};
    const myAction = nightActions[self.id];
    
    // The killer cannot kill themselves
    const alivePlayers = game.players.filter(p => p.status === 'alive' && p.id !== self.id);

    const handleSelect = (targetId: string) => {
        submitNightAction({
            gameId: game.id,
            actorId: self.id,
            action: 'kill',
            targetId: targetId
        }).then(() => {
            toast({ title: 'تم تحديد الهدف.' });
        }).catch((e) => {
            toast({ title: 'خطأ', description: e.message, variant: 'destructive' });
        });
    };

    return (
        <GenericRoleCard roleDetails={roleDetails} game={game} self={self}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                     <PlayerSelection
                        players={alivePlayers}
                        actionPrompt="اختر ضحيتك لهذه الليلة:"
                        onSelect={handleSelect}
                        selectedId={myAction?.targetId}
                        selfId={self.id}
                        disabled={!!myAction}
                    />
                </div>
                <div>
                    <PrivateChatBox game={game} self={self} />
                </div>
            </div>
        </GenericRoleCard>
    );
}
