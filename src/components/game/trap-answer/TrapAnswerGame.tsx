'use client';

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  memo,
} from 'react';
import { useRouter } from 'next/navigation';
import type { Game, Player, EmojiReaction, EmojiReactionType } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import {
  selectCategoryAndGetQuestion,
  submitTrapAnswer,
  submitGuess,
  nextTrapAnswerRound,
  sendReaction,
  tickGame,
} from '@/lib/actions/trap-answer';
import {
  Award,
  CheckCircle2,
  Loader2,
  Send,
  Trophy,
  ArrowRight,
  TimerIcon,
  Laugh,
  MessageCircleOff,
  Handshake,
  Drama,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { CountdownTimer } from '@/components/game/CountdownTimer';
import { TrapAnswerLobby } from './lobby/Lobby';
import { CategorySelectionPhase } from './phases/CategorySelectionPhase';
import { AnswerSubmissionPhase } from './phases/AnswerSubmissionPhase';
import { GuessingPhase } from './phases/GuessingPhase';
import { RoundResultsPhase } from './phases/RoundResultsPhase';
import { FinalResultsPhase } from './phases/FinalResultsPhase';


/** ---------- Main ---------- */
interface TrapAnswerGameProps {
  game: Game;
  self: Player;
}

export function TrapAnswerGame({ game, self }: TrapAnswerGameProps) {
  const isHost = game.hostId === self.id;
  
  switch (game.gameState) {
    case 'lobby':
      return <TrapAnswerLobby game={game} self={self} />;
    case 'category-selection':
      return <CategorySelectionPhase game={game} self={self} isHost={isHost} />;
    case 'answer-submission':
        return <AnswerSubmissionPhase game={game} self={self} />;
    case 'guessing':
        return <GuessingPhase game={game} self={self} />;
    case 'round-results':
        return <RoundResultsPhase game={game} self={self} isHost={isHost} />;
    case 'final_results':
        return <FinalResultsPhase game={game} self={self} />;
    default:
      return (
        <Card>
          <CardHeader>
            <CardTitle>لعبة الجواب المفخخ</CardTitle>
          </CardHeader>
          <CardContent>
            <p>حالة غير معروفة: {String(game.gameState)}</p>
            <Loader2 className="animate-spin" />
          </CardContent>
        </Card>
      );
  }
}
TrapAnswerGame.displayName = 'TrapAnswerGame';

    