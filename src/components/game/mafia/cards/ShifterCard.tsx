
import React from 'react';
import type { MafiaRole } from '@/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MAFIA_ROLES } from '@/data/mafia-roles';

interface ShifterCardProps {
    hasActed: boolean;
    handleAction: (targetId: string | undefined, disguiseAs?: MafiaRole) => void;
}

export function ShifterCard({ hasActed, handleAction }: ShifterCardProps) {
    if (hasActed) {
        return <p className="text-center text-green-400 font-bold">لقد اخترت تنكرك. انتظر الصباح.</p>;
    }
    const possibleDisguises = MAFIA_ROLES.filter(r => r.id !== 'shifter');

    return (
        <div className="space-y-4">
            <p className="font-bold text-center text-gray-300">اختر دورًا لتنتحله هذه الليلة.</p>
            <ScrollArea className="h-48">
                <div className="grid grid-cols-2 gap-2">
                    {possibleDisguises.map(role => (
                        <Button key={role.id} variant="outline" className="bg-gray-800 text-white hover:bg-gray-700" onClick={() => handleAction(undefined, role.id)}>
                            {role.name}
                        </Button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
