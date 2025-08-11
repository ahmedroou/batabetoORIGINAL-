
"use client";

import { useState } from 'react';
import type { Game, Player } from '@/types';
import { GameBoard } from './GameBoard';
import { PlayerHUD } from './PlayerHUD';
import { DiceRoll } from './DiceRoll';
import { PropertyCard } from './PropertyCard';
import { QuestionModal } from './QuestionModal';
import { FinalResults } from './FinalResults';
import { Lobby } from './Lobby';
import { ScrollArea } from '@/components/ui/scroll-area';

interface EducatedMerchantGameProps {
    game: Game;
    self: Player;
}

export function EducatedMerchantGame({ game, self }: EducatedMerchantGameProps) {
    const es = game.educatedMerchantState;
    if (!es) return <Lobby game={game} self={self} />; // Fallback to lobby if state is missing

    const isMyTurn = es.turnOrder && es.turnOrder[es.currentTurnIndex] === self.id;
    const canRoll = game.gameState === 'rolling' && isMyTurn;
    const showPropertyInteraction = game.gameState === 'property_action' && isMyTurn;
    const showQuestion = game.gameState === 'question' && isMyTurn;
    
    if (game.gameState === 'lobby') {
        return <Lobby game={game} self={self} />;
    }

    if(game.gameState === 'final_results') {
        return <FinalResults game={game} />
    }
    
    if (!es.board || es.board.length === 0) {
        return <div>جاري تحميل لوحة اللعب...</div>
    }

    return (
        <div className="w-full h-screen flex flex-col md:flex-row p-2 gap-4 bg-gray-100 dark:bg-gray-900">
            {/* Player HUD */}
            <div className="w-full md:w-[350px] shrink-0">
                <PlayerHUD 
                    players={game.players} 
                    balances={game.playerScores || {}} 
                    currentTurnPlayerId={es.turnOrder[es.currentTurnIndex]}
                    activityLog={es.activityLog || []}
                />
            </div>

            {/* Game Board and Actions */}
            <div className="flex-grow flex flex-col items-center justify-center relative min-h-0">
                 <ScrollArea className="w-full h-full">
                    <div className="w-full h-full flex items-center justify-center p-4">
                        <GameBoard 
                            board={es.board || []} 
                            players={game.players}
                            gameId={game.id}
                            diceRoll={game.gameState === 'movement' ? es.lastDiceRoll || null : null}
                            isMyTurn={isMyTurn}
                            activePlayerId={es.turnOrder[es.currentTurnIndex]}
                        />
                    </div>
                </ScrollArea>
                
                {canRoll && <DiceRoll gameId={game.id} selfId={self.id} onRollComplete={() => {}} />}
                {showPropertyInteraction && <PropertyCard game={game} self={self} />}
                {showQuestion && <QuestionModal game={game} self={self} />}

            </div>
        </div>
    );
}
