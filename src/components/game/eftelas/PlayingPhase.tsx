
"use client";

import type { Game, Player } from '@/types';
import { Board } from './Board';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Banknote, Land, Landmark, Dices, ShoppingCart, Gavel } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { rollDiceAndMove, purchaseProperty, attemptToLeaveJail } from '@/lib/actions/eftelas';
import { useToast } from '@/hooks/use-toast';


interface PlayingPhaseProps {
    game: Game;
    self: Player;
}

const Dice = ({ value }: { value: number }) => (
    <div className="w-12 h-12 bg-white rounded-lg shadow-md flex items-center justify-center text-3xl font-bold text-black">
        {value}
    </div>
)

export function PlayingPhase({ game, self }: PlayingPhaseProps) {
    const { toast } = useToast();
    const eftelasState = game.eftelasState;
    const [isRolling, setIsRolling] = useState(false);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [isLeavingJail, setIsLeavingJail] = useState(false);

    if (!eftelasState) return <div>جاري تحميل حالة اللعبة...</div>;
    
    const isMyTurn = eftelasState.currentTurnPlayerId === self.id;
    const myPlayerState = eftelasState.playerStates[self.id];
    const currentTile = myPlayerState ? eftelasState.board[myPlayerState.position] : null;

    const canBuyProperty = 
        isMyTurn && 
        currentTile && 
        (currentTile.type === 'property' || currentTile.type === 'station' || currentTile.type === 'utility') &&
        !currentTile.ownerId && 
        myPlayerState &&
        !myPlayerState.inJail &&
        myPlayerState.money >= (currentTile.price || 0);

    const handleRollDice = async () => {
        if (!isMyTurn || isRolling) return;
        setIsRolling(true);
        try {
            await rollDiceAndMove(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: 'destructive' });
        } finally {
            setIsRolling(false);
        }
    };
    
    const handlePurchaseProperty = async () => {
        if (!canBuyProperty || isPurchasing) return;
        setIsPurchasing(true);
        try {
            await purchaseProperty(game.id, self.id);
            toast({ title: "تم الشراء بنجاح!", description: `لقد اشتريت ${currentTile?.name}.` });
        } catch (error: any) {
             toast({ title: "خطأ في الشراء", description: error.message, variant: 'destructive' });
        } finally {
            setIsPurchasing(false);
        }
    }
    
    const handleJailAction = async (method: 'pay' | 'card' | 'roll') => {
        if(!isMyTurn || !myPlayerState?.inJail || isLeavingJail) return;
        setIsLeavingJail(true);
        try {
            await attemptToLeaveJail(game.id, self.id, method);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: 'destructive' });
        } finally {
            setIsLeavingJail(false);
        }
    }

    return (
        <div className="w-full h-full flex flex-col md:flex-row gap-4 p-4 bg-gray-900 text-white">
            {/* Player Info Panel */}
            <div className="w-full md:w-64 flex-shrink-0 space-y-3">
                <h2 className="text-xl font-bold text-center">اللاعبون</h2>
                {game.players.map((player, index) => {
                     const playerState = eftelasState.playerStates[player.id];
                     if (!playerState || player.status === 'left') return null;
                     const isCurrentPlayer = eftelasState.currentTurnPlayerId === player.id;
                    return (
                        <div key={player.id} className={cn("p-2 rounded-lg border-2 bg-gray-800 border-gray-700 transition-all duration-300", isCurrentPlayer && "border-primary shadow-lg shadow-primary/30 scale-105")}>
                            <div className="flex items-center gap-2">
                                <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" />
                                <div className='flex-grow'>
                                    <p className="font-bold">{player.name}</p>
                                    {playerState.inJail && <span className="text-xs font-bold text-red-400">في السجن</span>}
                                </div>
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
            <div className="w-full md:w-72 flex-shrink-0 flex flex-col gap-4">
                <div className="bg-gray-800 p-4 rounded-lg flex-grow flex flex-col justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-center">آخر الأحداث</h3>
                        <p className="text-sm text-center text-gray-400 mt-1 h-12">
                            {eftelasState.lastActivity}
                        </p>
                    </div>
                    { myPlayerState?.inJail && isMyTurn ? (
                        <div className="space-y-2">
                             <h4 className="text-center font-bold text-red-500">أنت في السجن!</h4>
                             <Button className="w-full" onClick={() => handleJailAction('pay')} disabled={isLeavingJail || myPlayerState.money < 50}>ادفع كفالة (50 ريال)</Button>
                             <Button className="w-full" variant="secondary" onClick={() => handleJailAction('card')} disabled={isLeavingJail || myPlayerState.getOutOfJailCards < 1}>استخدم بطاقة الخروج</Button>
                             <Button className="w-full" variant="outline" onClick={() => handleJailAction('roll')} disabled={isLeavingJail}>ارمِ النرد (محاولة دبل)</Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-center items-center gap-4">
                                <Dice value={eftelasState.dice[0]} />
                                <Dice value={eftelasState.dice[1]} />
                            </div>
                            <Button
                                className="w-full text-lg h-14"
                                disabled={!isMyTurn || isRolling || eftelasState.hasRolled}
                                onClick={handleRollDice}
                            >
                                <Dices className="ml-2" />
                                {isRolling ? "جاري الرمي..." : "ارمِ النرد"}
                            </Button>
                             {canBuyProperty && (
                                 <Button
                                    className="w-full text-lg h-14"
                                    variant="secondary"
                                    disabled={isPurchasing}
                                    onClick={handlePurchaseProperty}
                                >
                                    <ShoppingCart className="ml-2" />
                                    {isPurchasing ? "جاري الشراء..." : `شراء (${currentTile?.price} ريال)`}
                                </Button>
                             )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
