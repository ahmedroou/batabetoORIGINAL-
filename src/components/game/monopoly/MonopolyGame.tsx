
"use client";

import type { Game, Player } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { LobbyPhase } from './LobbyPhase';
import { GameBoard } from './GameBoard'; 
import { PlayerHUD } from './PlayerHUD';
import { ActionPanel } from './ActionPanel';
import * as monopolyActions from '@/lib/actions/monopoly';
import { useToast } from '@/hooks/use-toast';

interface MonopolyGameProps {
    game: Game;
    self: Player;
}

export function MonopolyGame({ game, self }: MonopolyGameProps) {
    const isHost = game.hostId === self.id;
    const { toast } = useToast();

    const handleRollDice = async () => {
        try {
            await monopolyActions.rollDice(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        }
    };
    
    const handleEndTurn = async () => {
        try {
            await monopolyActions.endTurn(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        }
    };

    const renderContent = () => {
        switch (game.gameState) {
            case 'lobby':
                return <LobbyPhase game={game} self={self} isHost={isHost} />;
            case 'game_play':
                if (!game.monopolyState) return <div>جاري تحميل بيانات اللعبة...</div>;
                return (
                    <div className="w-full h-full flex flex-col md:flex-row gap-4 p-4 bg-gray-50">
                        <div className="w-full md:w-1/5 space-y-2 order-2 md:order-1">
                           {game.players.map(p => (
                               <PlayerHUD 
                                   key={p.id}
                                   player={p}
                                   isCurrentTurn={game.monopolyState!.turnOrder[game.monopolyState!.currentTurnIndex] === p.id}
                                   game={game}
                               />
                           ))}
                        </div>
                        <div className="flex-grow flex items-center justify-center order-1 md:order-2">
                            <GameBoard game={game} />
                        </div>
                         <div className="w-full md:w-1/5 order-3 md:order-3">
                            <ActionPanel 
                                game={game} 
                                self={self} 
                                onRollDice={handleRollDice} 
                                onEndTurn={handleEndTurn}
                                onManageProperties={() => { /* Implement this */ }}
                            />
                        </div>
                    </div>
                );
            // case 'final_results':
            //     return <FinalResultsPhase game={game} self={self} />;
            default:
                return (
                    <div className="text-center">
                        <h1 className="text-xl font-bold">حالة لعبة غير معروفة</h1>
                        <p>{game.gameState}</p>
                    </div>
                );
        }
    };
    
    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={game.gameState}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4 }}
                className="w-full h-screen flex items-center justify-center"
            >
                {renderContent()}
            </motion.div>
        </AnimatePresence>
    );
}
