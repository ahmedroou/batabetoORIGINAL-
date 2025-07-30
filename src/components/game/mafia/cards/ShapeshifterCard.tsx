import React from 'react';
import type { Game, Player } from '@/types';
import { RoleDetails, ROLES } from '@/data/mafia-roles';
import { GenericRoleCard } from './GenericRoleCard';
import { PlayerSelection } from '../PlayerSelection';
import { submitNightAction } from '@/lib/actions/mafia';
import { useToast } from '@/hooks/use-toast';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';

interface ShapeshifterCardProps {
    roleDetails: RoleDetails;
    game: Game;
    self: Player;
}

export function ShapeshifterCard({ roleDetails, game, self }: ShapeshifterCardProps) {
    const { toast } = useToast();
    const nightActions = game.mafiaState?.nightActions || {};
    const myAction = nightActions[self.id];
    
    // Shapeshifter can appear as any other role except another shapeshifter.
    const possibleRoles = Object.values(ROLES).filter(r => r.id !== 'shapeshifter');

    const handleSelect = (targetId: string) => {
        submitNightAction({
            gameId: game.id,
            actorId: self.id,
            action: 'shapeshift', // This action is unique to the shapeshifter
            targetId: targetId // Here, targetId is the role name (e.g., 'doctor')
        }).then(() => {
            toast({ title: 'تم تغيير مظهرك بنجاح.' });
        }).catch((e) => {
            toast({ title: 'خطأ', description: e.message, variant: 'destructive' });
        });
    };

    return (
        <GenericRoleCard roleDetails={roleDetails} game={game} self={self}>
            <PlayerSelection
                players={possibleRoles.map(r => ({
                    id: r.id,
                    name: r.name,
                    avatarId: r.imagePath, // Use role image as avatar
                    status: 'alive',
                    leaderboardPoints: 0
                }))}
                actionPrompt="اختر الهيئة التي ستظهر بها الليلة:"
                onSelect={handleSelect}
                selectedId={myAction?.targetId}
                selfId={self.id}
                disabled={!!myAction}
                isRoleSelection={true}
            />
        </GenericRoleCard>
    );
}
