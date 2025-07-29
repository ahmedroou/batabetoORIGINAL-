
import React from 'react';
import type { Role } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { VenetianMask, Shield } from 'lucide-react';

interface RoleCardProps {
    role: Role;
    children?: React.ReactNode;
}

export const RoleCard = ({ role, children }: RoleCardProps) => {
    const isMafia = role.team === 'mafia';
    
    return (
        <Card className={cn(
            "w-full h-full flex flex-col items-center justify-center text-center border-4 shadow-xl",
            isMafia ? "border-red-500 bg-red-50" : "border-blue-500 bg-blue-50"
        )}>
            <CardHeader>
                <div className={cn(
                    "w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center",
                     isMafia ? "bg-red-500" : "bg-blue-500"
                )}>
                    {isMafia ? <VenetianMask className="w-12 h-12 text-white" /> : <Shield className="w-12 h-12 text-white" />}
                </div>
                <CardTitle className={cn("text-3xl", isMafia ? "text-red-800" : "text-blue-800")}>
                    {role.name}
                </CardTitle>
                <CardDescription className="font-semibold">
                    أنت من فريق: {isMafia ? 'المافيا' : 'الخير'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">{role.description}</p>
                {children && <div className="mt-4 pt-4 border-t">{children}</div>}
            </CardContent>
        </Card>
    );
};
