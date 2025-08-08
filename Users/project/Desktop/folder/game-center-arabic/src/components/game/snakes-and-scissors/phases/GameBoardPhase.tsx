

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Game, Player, SnakesAndScissorsQuestion } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '../../PlayerAvatar';
import * as actions from '@/lib/actions/snakes-and-scissors';
import { Swords, Check, X, Shield, Users, Radio, Loader2, GitCommitVertical, GitBranch, ArrowUpRight, ArrowDownLeft, Crown, Dices, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActionPanel } from '../../monopoly/ActionPanel';
import { GameBoard } from '../../monopoly/GameBoard';


export function GameBoardPhase({ game, self }: { game: Game, self: Player }) {
    const isMyTurn = game.snakesAndScissorsState?.turnOrder[game.snakesAndScissorsState.currentTurnIndex] === self.id;

    return (
        <div className="w-full h-screen p-4 flex flex-col md:flex-row gap-4 bg-gray-100 dark:bg-gray-900">
            <div className="flex-grow">
                <GameBoard game={game} self={self} />
            </div>
            <div className="w-full md:w-96 shrink-0">
                <ActionPanel game={game} self={self} isMyTurn={isMyTurn} />
            </div>
        </div>
    );
}
