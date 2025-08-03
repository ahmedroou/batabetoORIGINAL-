
'use client';

import type { City, UserProfile, CityResource } from '@/types';
import { motion } from 'framer-motion';
import { Coins, Heart, Users, Zap, Hammer, Droplets, Utensils, Warehouse, Mountain, TreeDeciduous, Package, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const resourceIcons: Record<CityResource, { icon: React.ElementType, name: string, color: string }> = {
    coins: { icon: Coins, name: 'الذهب', color: 'text-amber-400' },
    population: { icon: Users, name: 'السكان', color: 'text-teal-300' },
    happiness: { icon: Heart, name: 'السعادة', color: 'text-pink-400' },
    energy: { icon: Zap, name: 'الطاقة', color: 'text-yellow-400' },
    wood: { icon: TreeDeciduous, name: 'الخشب', color: 'text-orange-400' },
    food: { icon: Utensils, name: 'الغذاء', color: 'text-lime-400' },
    water: { icon: Droplets, name: 'الماء', color: 'text-blue-400' },
    stone: { icon: Mountain, name: 'الحجر', color: 'text-gray-400' },
    iron: { icon: Package, name: 'الحديد', color: 'text-slate-300' },
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
    
    const resourceOrder: CityResource[] = ['coins', 'population', 'happiness', 'energy', 'wood', 'stone', 'iron', 'food', 'water'];

    const renderResource = (key: CityResource) => {
        const resourceConfig = resourceIcons[key];
        if (!resourceConfig) return null;

        const { icon: Icon, name, color } = resourceConfig;
        const value = (allResources as any)[key] ?? 0;
        
        const productionRate = city.productionRates?.[key] || 0;
        const consumptionRate = city.consumptionRates?.[key] || 0;
        const netRate = productionRate - consumptionRate;
        const capacity = city.storageCapacity?.[key] || 0;

        const rateColor = netRate > 0 ? 'text-green-500' : netRate < 0 ? 'text-red-500' : 'text-gray-500';

        return (
            <TooltipProvider key={key} delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <motion.div
                            className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700 cursor-help"
                            whileHover={{ scale: 1.05, y: -2 }}
                        >
                            <Icon className={`w-5 h-5 ${color}`} />
                            <span className="font-bold font-mono text-lg">{value.toLocaleString()}</span>
                            {key !== 'coins' && key !== 'population' && key !== 'happiness' && (
                                <span className={`font-mono text-xs ${rateColor}`}>
                                    ({netRate > 0 ? '+' : ''}{netRate})
                                </span>
                            )}
                        </motion.div>
                    </TooltipTrigger>
                    <TooltipContent className="bg-slate-900 text-white border-slate-700">
                        <p className='font-bold text-lg'>{name}</p>
                        {key !== 'coins' && key !== 'population' && key !== 'happiness' && (
                            <div className='text-sm space-y-1 mt-2'>
                                <p>السعة التخزينية: {capacity.toLocaleString()}</p>
                                <p>الإنتاج/ساعة: <span className='text-green-400'>{productionRate.toLocaleString()}</span></p>
                                <p>الاستهلاك/ساعة: <span className='text-red-400'>{consumptionRate.toLocaleString()}</span></p>
                                <p>صافي/ساعة: <span className={rateColor}>{netRate.toLocaleString()}</span></p>
                            </div>
                        )}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return (
        <header className="absolute top-0 left-0 right-0 z-10 p-4">
            <div className="max-w-5xl mx-auto flex justify-center items-center flex-wrap gap-2 p-2 bg-black/20 backdrop-blur-sm rounded-2xl shadow-lg border border-white/10">
                {resourceOrder.map(key => renderResource(key))}
            </div>
        </header>
    );
}
