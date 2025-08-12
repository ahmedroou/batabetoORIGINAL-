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
                return <EducatedMerchantLobby game={game} self={self} />;
            
            case 'rolling':
            case 'movement':
            case 'property_action':
            case 'question':
            case 'turn_end':
                return <GameBoard game={game} self={self} />;

            case 'final_results':
                return <FinalResults game={game} self={self} />;
                
            default:
                return <LoadingState text={`حالة غير معروفة: ${game.gameState}`} />;
        }
    };

    return (
        <div className="w-full h-screen flex items-center justify-center relative bg-gray-100 dark:bg-gray-900">
            {/* The AnimatePresence component is now wrapping a div that will always be present,
                and the content inside it will change. This prevents the whole screen from exiting. */}
            <div className="w-full h-full flex items-center justify-center">
                 <AnimatePresence mode="wait">
                    <motion.div
                        key={game.gameState}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.4 }}
                        className="w-full h-full flex items-center justify-center"
                    >
                        {renderContent()}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
