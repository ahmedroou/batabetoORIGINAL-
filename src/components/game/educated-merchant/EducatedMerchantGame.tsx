
"use client";

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
    const renderContent = () => {
        switch (game.gameState) {
            case 'lobby':
                return (
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
                );
            case 'final_results':
                return (
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
                );
            case 'rolling':
            case 'movement':
            case 'property_action':
            case 'question':
            case 'turn_end':
                 return (
                    // We now use a consistent key here to prevent the GameBoard from unmounting and remounting
                    // between active game states. The logic inside GameBoard will handle showing/hiding modals.
                     <motion.div
                        key="game_board"
                        initial={{ opacity: 0, scale: 1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="w-full h-full flex items-center justify-center"
                    >
                        <GameBoard game={game} self={self} />
                    </motion.div>
                );
            default:
                return (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                         <LoadingState text={`حالة غير معروفة: ${game.gameState}`} />
                    </motion.div>
                );
        }
    };

    return (
        <div className="w-full h-screen flex items-center justify-center relative bg-gray-100 dark:bg-gray-900">
             <AnimatePresence mode="wait">
                {renderContent()}
            </AnimatePresence>
        </div>
    );
}
