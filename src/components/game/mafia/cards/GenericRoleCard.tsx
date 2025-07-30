import React from 'react';
import type { Game, Player } from '@/types';
import type { RoleDetails } from '@/data/mafia-roles';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';

interface GenericRoleCardProps {
    roleDetails: Pick<RoleDetails, 'name' | 'description'>;
    game: Game;
    self: Player;
    children: React.ReactNode;
}

export function GenericRoleCard({ roleDetails, game, self, children }: GenericRoleCardProps) {
    return (
        <Card className="w-full max-w-lg bg-slate-800/80 backdrop-blur-sm border-slate-700 text-white">
            <CardHeader>
                <CardTitle className="text-2xl">دورك: {roleDetails.name}</CardTitle>
                <CardDescription>{roleDetails.description}</CardDescription>
            </CardHeader>
            <CardContent>
                {children}
            </CardContent>
        </Card>
    );
}
