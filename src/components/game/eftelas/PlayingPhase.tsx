
"use client";

import type { Game, Player } from '@/types';
import { Board } from './Board';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Banknote, Land, Landmark } from 'lucide-react';

interface PlayingPhaseProps {
    game: Game;
    self: Player;
}

export function PlayingPhase({ game, self }: PlayingPhaseProps) {
    const eftelasState = game.eftelasState;
    if (!eftelasState) return <div>جاري تحميل حالة اللعبة...</div>;
    
    return (
        <div className="w-full h-full flex flex-col md:flex-row gap-4 p-4 bg-gray-900 text-white">
            {/* Player Info Panel */}
            <div className="w-full md:w-64 flex-shrink-0 space-y-3">
                <h2 className="text-xl font-bold text-center">اللاعبون</h2>
                {game.players.map((player, index) => {
                     const playerState = eftelasState.playerStates[player.id];
                     if (!playerState) return null;
                     const isMyTurn = eftelasState.currentTurnPlayerId === player.id;
                    return (
                        <div key={player.id} className={cn("p-2 rounded-lg border-2 bg-gray-800 border-gray-700", isMyTurn && "border-primary shadow-lg shadow-primary/30")}>
                            <div className="flex items-center gap-2">
                                <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" />
                                <p className="font-bold">{player.name}</p>
                            </div>
                            <div className="mt-2 flex justify-between items-center text-sm">
                                <div className="flex items-center gap-1"><Banknote /> {playerState.money} ريال</div>
                                <div className="flex items-center gap-1"><Landmark /> {playerState.properties.length}</div>
                            </div>
                        </div>
                    )
                })}
            </div>
            
            {/* Main Board */}
            <div className="flex-grow flex items-center justify-center">
                <div className="w-full max-w-[80vh] aspect-square">
                    <Board game={game} />
                </div>
            </div>

            {/* Action/Dice Panel */}
            <div className="w-full md:w-64 flex-shrink-0">
                <div className="bg-gray-800 p-4 rounded-lg">
                    <h3 className="text-lg font-bold text-center">الإجراءات</h3>
                    {/* Dice rolling and action buttons will go here */}
                </div>
            </div>
        </div>
    );
}

