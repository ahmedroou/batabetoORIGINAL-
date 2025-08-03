
'use client';

import type { CityResources } from '@/types';
import { motion } from 'framer-motion';
import { Coins, Heart, Users, Zap, Diamond, Hammer, Droplets, Utensils } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


const resourceIcons = {
    wood: { icon: Hammer, name: 'خشب', color: 'text-orange-400' },
    stone: { icon: Diamond, name: 'حجر', color: 'text-slate-400' },
    energy: { icon: Zap, name: 'طاقة', color: 'text-yellow-400' },
    gold: { icon: Coins, name: 'ذهب', color: 'text-amber-400' },
    food: { icon: Utensils, name: 'غذاء', color: 'text-lime-400' },
    water: { icon: Droplets, name: 'ماء', color: 'text-blue-400' },
    happiness: { icon: Heart, name: 'سعادة', color: 'text-pink-400' },
    population: { icon: Users, name: 'سكان', color: 'text-teal-300' },
};

interface ResourceBarProps {
    resources: CityResources;
}

export function ResourceBar({ resources }: ResourceBarProps) {
    const mainResources = ['wood', 'stone', 'energy', 'population'];
    const secondaryResources = ['gold', 'food', 'water', 'happiness'];

    const renderResource = (key: keyof CityResources) => {
        const Icon = resourceIcons[key].icon;
        const name = resourceIcons[key].name;
        const color = resourceIcons[key].color;
        const value = resources[key] || 0;

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
                {mainResources.map(key => renderResource(key as keyof CityResources))}
            </div>
        </header>
    );
}

