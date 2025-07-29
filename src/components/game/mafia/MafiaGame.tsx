
"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Game, Player, MafiaRole, Role, NightResult, Team } from '@/types';
import { useToast } from '@/hooks/use-toast';
import * as roomActions from '@/lib/actions/room';
import * as mafiaActions from '@/lib/actions/mafia';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowRight, Check, Copy, LogOut, Settings, UserX, Sun, Vote, Users, Skull, Loader2, VenetianMask, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { MAFIA_ROLES } from '@/data/mafia-roles';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { getSocialRankForUser } from '@/lib/actions/user';
import { RoleCard } from './cards/RoleCard';
import { Lobby } from './phases/Lobby';
import { NightPhase } from './phases/NightPhase';
import { DayPhase } from './phases/DayPhase';
import { FinalResultsPhase } from './phases/FinalResultsPhase';

// --- Main Component ---

interface MafiaGameProps {
  game: Game;
  self: Player;
}

export function MafiaGame({ game, self }: MafiaGameProps) {
  const isHost = game.hostId === self.id;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLeaveGame = useCallback(async () => {
    setIsSubmitting(true);
    const result = await roomActions.leaveGame(game.id, self.id);
    if (result.success) {
      sessionStorage.removeItem(`player-${game.id}`);
      router.push('/');
      toast({ title: "لقد غادرت الغرفة." })
    } else {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
  }, [game.id, self.id, router, toast]);

  const renderContent = () => {
    switch (game.gameState) {
      case 'lobby':
        return <Lobby game={game} self={self} isHost={isHost} isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting} handleLeaveGame={handleLeaveGame} />;
      case 'night':
        return <NightPhase game={game} self={self} isHost={isHost} isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting} />;
      case 'discussion':
      case 'voting':
      case 'voting_results':
        return <DayPhase game={game} self={self} isHost={isHost} isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting} />;
      case 'final_results':
        return <FinalResultsPhase game={game} handleLeaveGame={handleLeaveGame} />;
      default:
        return (
             <Card className="w-full max-w-md text-center">
                <CardHeader><CardTitle>جاري تحميل اللعبة...</CardTitle></CardHeader>
                <CardContent><Loader2 className="w-12 h-12 mx-auto animate-spin" /></CardContent>
            </Card>
        )
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div key={game.gameState} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5, ease: 'easeInOut' }} className="w-full h-full flex items-center justify-center">
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
