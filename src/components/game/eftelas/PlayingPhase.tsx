
"use client";

import type { Game, Player } from '@/types';
import { Board } from './Board';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Banknote, LandPlot, Landmark, Dices, ShoppingCart, Gavel, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { rollDiceAndMove, purchaseProperty, attemptToLeaveJail } from '@/lib/actions/eftelas';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion } from 'framer-motion';

interface PlayingPhaseProps {
    game: Game;
    self: Player;
}

const Dice = ({ value }: { value: number }) => (
    <motion.div 
        key={value}
        initial={{ scale: 0.5, rotate: -45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        className="w-12 h-12 bg-white rounded-lg shadow-md flex items-center justify-center text-3xl font-bold text-black"
    >
        {value}
    </motion.div>
)

export function PlayingPhase({ game, self }: PlayingPhaseProps) {
    const { toast } = useToast();
    const eftelasState = game.eftelasState;
    const [isRolling, setIsRolling] = useState(false);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [isLeavingJail, setIsLeavingJail] = useState(false);
    const [selectedTile, setSelectedTile] = useState<number | null>(null);

    if (!eftelasState) return <div>جاري تحميل حالة اللعبة...</div>;
    
    const isMyTurn = eftelasState.currentTurnPlayerId === self.id;
    const myPlayerState = eftelasState.playerStates[self.id];
    const currentTileIndex = myPlayerState?.position ?? 0;
    const currentTile = eftelasState.board[currentTileIndex];

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

    const handleTileClick = (tileIndex: number) => {
        setSelectedTile(tileIndex);
    }
    const selectedProperty = selectedTile !== null ? eftelasState.board[selectedTile] : null;

    return (
        <div className="w-full h-full flex flex-col md:flex-row gap-4 p-4 bg-gray-900 text-white">
            {/* Main Area: Board and Info */}
            <div className="flex-grow flex flex-col gap-4">
                <div className="w-full h-full flex-grow flex items-center justify-center min-h-0">
                    <div className="w-full max-w-[80vh] aspect-square">
                        <Board game={game} onTileClick={handleTileClick}/>
                    </div>
                </div>

                <div className="bg-gray-800 p-4 rounded-lg flex flex-col items-center justify-center text-center">
                    <h3 className="text-lg font-bold">آخر الأحداث</h3>
                    <p className="text-sm text-center text-gray-400 mt-1 h-12">
                        {eftelasState.lastActivity}
                    </p>
                    <div className="flex justify-center items-center gap-4 mt-2">
                        <Dice value={eftelasState.dice[0]} />
                        <Dice value={eftelasState.dice[1]} />
                    </div>
                </div>
            </div>

            {/* Side Panel: Players and Actions */}
            <div className="w-full md:w-80 flex-shrink-0 flex flex-col gap-4">
                <Card className="flex-grow flex flex-col bg-gray-800 border-gray-700">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold text-center">اللاعبون</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-grow overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="space-y-3">
                                {game.players.map((player) => {
                                    const playerState = eftelasState.playerStates[player.id];
                                    if (!playerState || player.status === 'left') return null;
                                    const isCurrentPlayer = eftelasState.currentTurnPlayerId === player.id;
                                    return (
                                        <div key={player.id} className={cn("p-2 rounded-lg border-2 bg-gray-800/50 border-gray-700 transition-all duration-300", isCurrentPlayer && "border-primary shadow-lg shadow-primary/30 scale-105")}>
                                            <div className="flex items-center gap-2">
                                                <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" />
                                                <div className='flex-grow'>
                                                    <p className="font-bold">{player.name}</p>
                                                    {playerState.inJail && <span className="text-xs font-bold text-red-400 flex items-center gap-1"><Gavel className="w-3 h-3"/> في السجن</span>}
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <div className="flex items-center gap-1 text-sm"><Banknote className="w-4 h-4 text-green-400"/> {playerState.money}</div>
                                                    <div className="flex items-center gap-1 text-sm"><Landmark className="w-4 h-4 text-blue-400"/> {playerState.properties.length}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>

                { myPlayerState?.inJail && isMyTurn ? (
                    <Card className="bg-red-900/50 border-red-700">
                        <CardHeader><CardTitle className="text-center text-red-300">أنت في السجن!</CardTitle></CardHeader>
                        <CardContent className="space-y-2">
                             <Button className="w-full bg-red-600 hover:bg-red-700" onClick={() => handleJailAction('pay')} disabled={isLeavingJail || myPlayerState.money < 50}>ادفع كفالة (50 ريال)</Button>
                             <Button className="w-full" variant="secondary" onClick={() => handleJailAction('card')} disabled={isLeavingJail || myPlayerState.getOutOfJailCards < 1}><KeyRound className="ml-2"/> استخدم بطاقة ({myPlayerState.getOutOfJailCards})</Button>
                             <Button className="w-full" variant="outline" onClick={() => handleJailAction('roll')} disabled={isLeavingJail}><Dices className="ml-2"/>ارمِ النرد (محاولة دبل)</Button>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="bg-gray-800 border-gray-700">
                         <CardHeader>
                            <CardTitle className="text-center">{isMyTurn ? "دورك الآن!" : "في انتظار..."}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
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
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
