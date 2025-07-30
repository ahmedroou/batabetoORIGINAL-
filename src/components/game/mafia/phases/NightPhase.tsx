import React, { useState, useMemo } from 'react';
import type { Game, Player, PlayerRole } from '@/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Timer, Moon } from 'lucide-react';
import { ROLES } from '@/data/mafia-roles';
import { KillerCard } from '../cards/KillerCard';
import { DoctorCard } from '../cards/DoctorCard';
import { DetectiveCard } from '../cards/DetectiveCard';
import { SpyCard } from '../cards/SpyCard';
import { BomberCard } from '../cards/BomberCard';
import { ShapeshifterCard } from '../cards/ShapeshifterCard';
import { GenericRoleCard } from '../cards/GenericRoleCard';

interface NightPhaseProps {
    game: Game;
    self: Player;
}

const CountdownTimer = ({ expiryTimestamp }: { expiryTimestamp: number }) => {
    const calculateTimeLeft = () => Math.round((expiryTimestamp - Date.now()) / 1000);
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

    useEffect(() => {
        if (timeLeft <= 0) return;
        const interval = setInterval(() => {
            setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(interval);
    }, [timeLeft]);
    
    return (
        <div className="flex items-center gap-2 font-mono text-lg font-bold">
            <Timer className="w-5 h-5"/>
            <span>{timeLeft > 0 ? timeLeft : 0}</span>
        </div>
    );
};


export function NightPhase({ game, self }: NightPhaseProps) {
    const roleDetails = useMemo(() => self.role ? ROLES[self.role] : null, [self.role]);
    const timerEndsAt = game.mafiaState?.timerEndsAt;

    const renderRoleCard = () => {
        if (!roleDetails) {
            return <GenericRoleCard roleDetails={{name: "انتظار", description: "جاري تحميل دورك..."}} game={game} self={self} >
                 <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
            </GenericRoleCard>
        }
        
        switch(self.role) {
            case 'killer':
                return <KillerCard roleDetails={roleDetails} game={game} self={self} />;
            case 'doctor':
                return <DoctorCard roleDetails={roleDetails} game={game} self={self} />;
            case 'detective':
                return <DetectiveCard roleDetails={roleDetails} game={game} self={self} />;
            case 'spy':
                return <SpyCard roleDetails={roleDetails} game={game} self={self} />;
            case 'bomber':
                return <BomberCard roleDetails={roleDetails} game={game} self={self} />;
            case 'shapeshifter':
                return <ShapeshifterCard roleDetails={roleDetails} game={game} self={self} />;
            case 'soldier':
            case 'civilian':
                return <GenericRoleCard roleDetails={roleDetails} game={game} self={self}>
                     <p className="text-center text-muted-foreground">ليس لديك أي قدرات خاصة هذه الليلة. انتظر شروق الشمس.</p>
                </GenericRoleCard>;
            default:
                return <GenericRoleCard roleDetails={{name: "خطأ", description: "دور غير معروف."}} game={game} self={self}/>
        }
    };
    
    return (
         <div className="flex flex-col items-center gap-6 w-full max-w-4xl">
            <div className="text-center text-white">
                <Moon className="w-12 h-12 mx-auto text-yellow-300"/>
                <h1 className="text-4xl font-bold">حلّ الليل</h1>
                <p className="text-lg text-muted-foreground">الجميع نائم... استخدم قدرتك قبل شروق الشمس.</p>
                {timerEndsAt && <CountdownTimer expiryTimestamp={timerEndsAt.toMillis()} />}
            </div>

            {renderRoleCard()}
        </div>
    );
}
