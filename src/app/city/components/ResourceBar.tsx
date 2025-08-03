
'use client';

import type { City, UserProfile } from '@/types';
import { motion } from 'framer-motion';
import { Coins, Heart, Users, Zap, Hammer, Droplets, Utensils } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const resourceIcons: Record<string, { icon: React.ElementType, name: string, color: string }> = {
    coins: { icon: Coins, name: 'كوينز', color: 'text-amber-400' },
    population: { icon: Users, name: 'سكان', color: 'text-teal-300' },
    happiness: { icon: Heart, name: 'سعادة', color: 'text-pink-400' },
    energy: { icon: Zap, name: 'طاقة', color: 'text-yellow-400' },
    wood: { icon: Hammer, name: 'خشب', color: 'text-orange-400' },
    food: { icon: Utensils, name: 'غذاء', color: 'text-lime-400' },
    water: { icon: Droplets, name: 'ماء', color: 'text-blue-400' },
};

interface ResourceBarProps {
    city: City;
    userProfile: UserProfile;
}

export function ResourceBar({ city, userProfile }: ResourceBarProps) {
    const allResources = {
        coins: userProfile.coins,
        ...city.resources,
    };
    
    const resourceOrder = ['coins', 'population', 'happiness', 'energy', 'wood', 'food', 'water'];


    const renderResource = (key: string) => {
        const resourceConfig = resourceIcons[key];
        if (!resourceConfig) return null;

        const { icon: Icon, name, color } = resourceConfig;
        const value = (allResources as any)[key] ?? 0;

        return (
            <TooltipProvider key={key}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <motion.div
                            className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700"
                            whileHover={{ scale: 1.05, y: -2 }}
                        >
                            <Icon className={`w-5 h-5 ${color}`} />
                            <span className="font-bold font-mono text-lg">{value.toLocaleString()}</span>
                        </motion.div>
                    </TooltipTrigger>
                    <TooltipContent className="bg-slate-900 text-white border-slate-700">
                        <p>{name}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return (
        <header className="absolute top-0 left-0 right-0 z-10 p-4">
            <div className="max-w-4xl mx-auto flex justify-center items-center gap-2 p-2 bg-black/20 backdrop-blur-sm rounded-2xl shadow-lg border border-white/10">
                {resourceOrder.map(key => renderResource(key))}
            </div>
        </header>
    );
}
