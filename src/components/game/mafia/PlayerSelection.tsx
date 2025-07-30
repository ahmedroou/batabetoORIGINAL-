import React from 'react';
import { PlayerAvatar } from '../PlayerAvatar';
import { CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface PlayerSelectionProps {
    players: (Partial<any> & { id: string; name: string; avatarId: string; } )[];
    actionPrompt: string;
    onSelect: (targetId: string) => void;
    selectedId?: string | null;
    selfId: string;
    disabled?: boolean;
    disabledIds?: string[];
    disabledReason?: string;
    isRoleSelection?: boolean;
}

export function PlayerSelection({ players, actionPrompt, onSelect, selectedId, selfId, disabled, disabledIds = [], disabledReason, isRoleSelection = false }: PlayerSelectionProps) {
    return (
        <div>
            <h3 className="font-bold text-center mb-4">{actionPrompt}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <AnimatePresence>
                {players.map((player) => {
                    const isDisabled = disabledIds.includes(player.id);
                    return (
                        <TooltipProvider key={player.id}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <motion.div
                                        layout
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        className="relative"
                                    >
                                        <button
                                            onClick={() => onSelect(player.id)}
                                            disabled={disabled || isDisabled}
                                            className={cn(
                                                "w-full p-2 rounded-lg border-2 flex flex-col items-center gap-2 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
                                                selectedId === player.id 
                                                    ? 'border-green-500 bg-green-500/10 shadow-lg' 
                                                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
                                            )}
                                        >
                                            <div className="relative">
                                                <PlayerAvatar avatarId={player.avatarId} className={cn("w-16 h-16", isRoleSelection && "rounded-lg")} />
                                                 {selectedId === player.id && (
                                                    <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-1 border-2 border-slate-800">
                                                        <CheckCircle className="w-5 h-5 text-white"/>
                                                    </div>
                                                )}
                                            </div>
                                            <span className="font-semibold truncate text-sm">{player.name}</span>
                                        </button>
                                        {isDisabled && <div className="absolute inset-0 bg-black/50 rounded-lg"/>}
                                    </motion.div>
                                </TooltipTrigger>
                                {isDisabled && disabledReason && (
                                    <TooltipContent>
                                        <p>{disabledReason}</p>
                                    </TooltipContent>
                                )}
                            </Tooltip>
                        </TooltipProvider>
                    )
                })}
                </AnimatePresence>
            </div>
        </div>
    );
}
