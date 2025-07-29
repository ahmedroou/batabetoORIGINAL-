
"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Game, Player, Role, MafiaRole } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import * as roomActions from '@/lib/actions/room';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Lobby } from './phases/Lobby';
import { RoleRevealPhase } from './phases/RoleRevealPhase';
import { NightPhase } from './phases/NightPhase';
import { DayPhase } from './phases/DayPhase';
import { FinalResultsPhase } from './phases/FinalResultsPhase';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// --- Shared Components ---

const LoadingState = ({ text }: { text: string }) => (
    <Card className="w-full max-w-md text-center bg-transparent border-none text-white">
        <CardHeader><CardTitle className="text-2xl">{text}</CardTitle></CardHeader>
        <CardContent><Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" /></CardContent>
    </Card>
);

// --- Main Game Component ---

export function MafiaGame({ game, self }: { game: Game; self: Player; }) {
  const isHost = game.hostId === self.id;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  
  const handleLeaveGame = useCallback(async () => {
    if (!self) return;
    setIsSubmitting(true);
    const result = await roomActions.leaveGame(game.id, self.id);
    if (result.success) {
      sessionStorage.removeItem(`player-${game.id}`);
      router.push('/');
      toast({ title: "لقد غادرت الغرفة." });
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
      setIsSubmitting(false); // Only reset if there's an error, otherwise the component will unmount
    }
  }, [game.id, self, router, toast]);

  const renderContent = () => {
    switch (game.gameState) {
      case 'lobby': return <Lobby game={game} self={self} isHost={isHost} isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting} handleLeaveGame={handleLeaveGame} />;
      case 'role_reveal': return <RoleRevealPhase game={game} self={self} isHost={isHost} />;
      case 'night': return <NightPhase game={game} self={self} isHost={isHost} isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting} />;
      case 'discussion':
      case 'voting':
      case 'voting_results': return <DayPhase game={game} self={self} isHost={isHost} isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting} />;
      case 'final_results': return <FinalResultsPhase game={game} handleLeaveGame={handleLeaveGame}/>;
      default: return <LoadingState text={`حالة غير معروفة: ${game.gameState}`} />;
    }
  };
  
  const isNight = game.gameState === 'night';
  const isDay = game.gameState === 'discussion' || game.gameState === 'voting' || game.gameState === 'voting_results';

  return (
    <div className={cn(
      "w-full h-full flex items-center justify-center transition-colors duration-1000",
      isDay ? 'bg-blue-50' : 'bg-gray-100'
    )}>
        {isNight && (
            <div className="absolute inset-0 z-0 overflow-hidden">
                <div className="stars"></div>
                <div className="twinkling"></div>
            </div>
        )}
      <AnimatePresence mode="wait">
        <motion.div key={game.gameState} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5, ease: 'easeInOut' }} className="z-10 w-full h-full flex items-center justify-center p-4">
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
