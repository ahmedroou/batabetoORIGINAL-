import React from 'react';
import type { Player } from '@/types';
import type { RoleDetails } from '@/data/mafia-roles';
import { motion } from 'framer-motion';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import Image from 'next/image';
import { cn } from '@/lib/utils';


interface PlayerCardProps {
    player?: Player;
    roleDetails?: RoleDetails | null;
    isFlipped: boolean;
    onFlip: () => void;
}

export function PlayerCard({ player, roleDetails, isFlipped, onFlip }: PlayerCardProps) {

    const cardContent = isFlipped && roleDetails ? (
        <div className="absolute w-full h-full bg-slate-900 border-4 border-primary rounded-2xl flex flex-col items-center p-4 shadow-2xl shadow-primary/30">
            <div className="relative w-full h-48 mb-4 rounded-lg overflow-hidden">
                <Image src={roleDetails.imagePath} alt={roleDetails.name} layout="fill" objectFit="cover" />
            </div>
            <h2 className="text-3xl font-bold text-primary">{roleDetails.name}</h2>
            <p className={`text-sm font-semibold px-3 py-1 rounded-full mt-1 mb-3 ${roleDetails.team === 'mafia' ? 'bg-red-500/20 text-red-400' : roleDetails.team === 'good' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                فريق {roleDetails.team === 'mafia' ? 'الشر' : roleDetails.team === 'good' ? 'الخير' : 'محايد'}
            </p>
            <p className="text-center text-sm text-slate-300 leading-relaxed">
                {roleDetails.description}
            </p>
        </div>
    ) : (
         <div className="absolute w-full h-full bg-slate-800 border-4 border-slate-600 rounded-2xl flex items-center justify-center p-4">
            <Image src="/roles/card-back.png" alt="Card Back" layout="fill" objectFit="cover" className="rounded-xl"/>
        </div>
    );
    
    return (
        <motion.div
            className="w-80 h-[28rem] relative cursor-pointer"
            onClick={onFlip}
            style={{ perspective: 1000 }}
        >
            <motion.div 
                className="relative w-full h-full"
                style={{ transformStyle: 'preserve-3d' }}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.6 }}
            >
                {/* Back */}
                <div className="absolute w-full h-full" style={{ backfaceVisibility: 'hidden' }}>
                    <div className="absolute w-full h-full bg-slate-800 border-4 border-slate-600 rounded-2xl flex items-center justify-center p-4">
                        <Image src="/roles/card-back.png" alt="Card Back" layout="fill" objectFit="cover" className="rounded-xl"/>
                    </div>
                </div>
                {/* Front */}
                <div className="absolute w-full h-full" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                     {roleDetails && (
                         <div className="absolute w-full h-full bg-slate-900 border-4 border-primary rounded-2xl flex flex-col items-center p-4 shadow-2xl shadow-primary/30">
                            <div className="relative w-full h-48 mb-4 rounded-lg overflow-hidden">
                                <Image src={roleDetails.imagePath} alt={roleDetails.name} layout="fill" objectFit="cover" />
                            </div>
                            <h2 className="text-3xl font-bold text-primary">{roleDetails.name}</h2>
                            <p className={`text-sm font-semibold px-3 py-1 rounded-full mt-1 mb-3 ${roleDetails.team === 'mafia' ? 'bg-red-500/20 text-red-400' : roleDetails.team === 'good' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                فريق {roleDetails.team === 'mafia' ? 'الشر' : roleDetails.team === 'good' ? 'الخير' : 'محايد'}
                            </p>
                            <p className="text-center text-sm text-slate-300 leading-relaxed">
                                {roleDetails.description}
                            </p>
                        </div>
                     )}
                </div>
            </motion.div>
        </motion.div>
    );
}
