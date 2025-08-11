
"use client";

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

    const isMyTurn = game.educatedMerchantState?.turnOrder[game.educatedMerchantState.currentTurnIndex] === self.id;
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
                <PlayerHUD players={game.players} balances={game.playerScores || {}} currentTurnPlayerId={game.educatedMerchantState?.turnOrder[game.educatedMerchantState.currentTurnIndex]} />
            </div>

            {/* Game Board and Actions */}
            <div className="w-full md:w-3/4 h-full flex flex-col items-center justify-center relative">
                <GameBoard 
                    board={game.educatedMerchantState?.board || []} 
                    players={game.players}
                />
                
                {canRoll && <DiceRoll gameId={game.id} selfId={self.id} />}
                {showPropertyInteraction && <PropertyCard game={game} self={self} />}
                {showQuestion && <QuestionModal game={game} self={self} />}

            </div>
        </div>
    );
}
