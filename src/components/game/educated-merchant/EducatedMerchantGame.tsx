
'use client';

import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { EducatedMerchantLobby } from './Lobby';
import { GameBoard } from './GameBoard';
import { FinalResults } from './FinalResults';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface EducatedMerchantGameProps {
    game: Game;
    self: Player;
}

const LoadingState = ({ text }: { text: string }) => (
    <Card className="w-full max-w-md text-center bg-white/90 backdrop-blur-sm">
        <CardHeader>
            <CardTitle className="text-2xl text-primary">{text}</CardTitle>
        </CardHeader>
        <CardContent>
            <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
        </CardContent>
    </Card>
);

export function EducatedMerchantGame({ game, self }: EducatedMerchantGameProps) {
    const gameState = game.gameState;

    // Helper to determine if we are in an active game state
    const isActiveGamePhase = (state: Game['gameState']) => 
        ['rolling', 'movement', 'property_action', 'question', 'turn_end'].includes(state);

    return (
        <div className="w-full h-screen flex items-center justify-center relative bg-gray-100 dark:bg-gray-900">
             <AnimatePresence mode="wait">
                {gameState === 'lobby' && (
                     <motion.div
                        key="lobby"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.4 }}
                        className="w-full h-full flex items-center justify-center"
                    >
                        <EducatedMerchantLobby game={game} self={self} />
                    </motion.div>
                )}
                {isActiveGamePhase(gameState) && (
                     <motion.div
                        key="game_board" // This key is now stable across all active game phases
                        initial={{ opacity: 0, scale: 1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="w-full h-full flex items-center justify-center"
                    >
                        <GameBoard game={game} self={self} />
                    </motion.div>
                )}
                 {gameState === 'final_results' && (
                     <motion.div
                        key="final_results"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.4 }}
                        className="w-full h-full flex items-center justify-center"
                    >
                        <FinalResults game={game} self={self} />
                    </motion.div>
                )}
                {!['lobby', 'final_results'].includes(gameState) && !isActiveGamePhase(gameState) && (
                     <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                         <LoadingState text={`حالة غير معروفة: ${game.gameState}`} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
