
"use client";

import { useState } from 'react';
import type { Game, Player } from '@/types';
import { GameBoard } from './GameBoard';
import { PlayerHUD } from './PlayerHUD';
import { DiceRoll } from './DiceRoll';
import { PropertyCard } from './PropertyCard';
import { QuestionModal } from './QuestionModal';
import { FinalResults } from './FinalResults';

interface EducatedMerchantGameProps {
    game: Game;
    self: Player;
}

export function EducatedMerchantGame({ game, self }: EducatedMerchantGameProps) {

    const es = game.educatedMerchantState;
    if (!es) return <div>جاري تحميل حالة اللعبة...</div>;
    
    const [diceRollResult, setDiceRollResult] = useState<number | null>(null);

    const isMyTurn = es.turnOrder[es.currentTurnIndex] === self.id;
    const canRoll = game.gameState === 'rolling' && isMyTurn;
    const showPropertyInteraction = game.gameState === 'property_action' && isMyTurn;
    const showQuestion = game.gameState === 'question' && isMyTurn;

    if(game.gameState === 'final_results') {
        return <FinalResults game={game} />
    }

    return (
        <div className="w-full h-screen flex flex-col md:flex-row items-center justify-center p-2 gap-4 bg-gray-100 dark:bg-gray-900">
            {/* Player HUD */}
            <div className="w-full md:w-1/4 h-full">
                <PlayerHUD 
                    players={game.players} 
                    balances={game.playerScores || {}} 
                    currentTurnPlayerId={es.turnOrder[es.currentTurnIndex]}
                    activityLog={es.activityLog || []}
                />
            </div>

            {/* Game Board and Actions */}
            <div className="w-full md:w-3/4 h-full flex flex-col items-center justify-center relative">
                <GameBoard 
                    board={es.board || []} 
                    players={game.players}
                    gameId={game.id}
                    diceRoll={game.gameState === 'movement' ? es.lastDiceRoll || null : null}
                    isMyTurn={isMyTurn}
                    activePlayerId={es.turnOrder[es.currentTurnIndex]}
                />
                
                {canRoll && <DiceRoll gameId={game.id} selfId={self.id} onRollComplete={setDiceRollResult} />}
                {showPropertyInteraction && <PropertyCard game={game} self={self} />}
                {showQuestion && <QuestionModal game={game} self={self} />}

            </div>
        </div>
    );
}
