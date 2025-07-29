
import React from 'react';
import type { Role } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface RoleCardProps {
    role: Role;
    children?: React.ReactNode;
}

export const RoleCard = ({ role, children }: RoleCardProps) => {
    const isMafia = role.team === 'mafia';
    
    return (
        <Card className={cn(
            "w-full h-full flex flex-col items-center justify-start text-center border-4 shadow-xl overflow-hidden",
            isMafia ? "border-red-500 bg-red-50" : "border-blue-500 bg-blue-50"
        )}>
            <div className="relative w-full h-48">
                 <Image 
                    src={role.image} 
                    alt={role.name} 
                    layout="fill" 
                    objectFit="cover" 
                    className="opacity-90"
                />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                 <div className="absolute bottom-2 right-2 p-2 bg-black/50 rounded-lg">
                    <CardTitle className={cn("text-2xl", isMafia ? "text-red-300" : "text-blue-300")}>
                        {role.name}
                    </CardTitle>
                    <CardDescription className={cn("font-semibold", isMafia ? "text-red-400" : "text-blue-400")}>
                        فريق: {isMafia ? 'المافيا' : 'الخير'}
                    </CardDescription>
                 </div>
            </div>
            <CardContent className="p-4 flex-grow">
                <p className="text-muted-foreground text-sm">{role.description}</p>
                {children && <div className="mt-4 pt-4 border-t">{children}</div>}
            </CardContent>
        </Card>
    );
};
