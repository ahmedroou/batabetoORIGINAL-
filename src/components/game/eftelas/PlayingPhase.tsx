"use client";

import type { Game, Player, BoardProperty } from '@/types';
import { Board } from './Board';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Banknote, LandPlot, Landmark, Dices, ShoppingCart, Gavel, KeyRound, Hammer, X, Castle, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { rollDiceAndMove, purchaseProperty, attemptToLeaveJail } from '@/lib/actions/eftelas';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';

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
        className="w-10 h-10 bg-white rounded-lg shadow-md flex items-center justify-center text-2xl font-bold text-black"
    >
        {value}
    </motion.div>
)

const PlayerInfoCard = ({ player, state, isTurn }: { player: Player, state: Game['eftelasState']['playerStates'][string], isTurn: boolean }) => (
     <div className={cn("p-2 rounded-lg border-2 bg-gray-800/50 border-gray-700 transition-all duration-300", isTurn && "border-primary shadow-lg shadow-primary/30 scale-105")}>
        <div className="flex items-center gap-2">
            <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" />
            <div className='flex-grow'>
                <p className="font-bold">{player.name}</p>
                {state.inJail && <span className="text-xs font-bold text-red-400 flex items-center gap-1"><Gavel className="w-3 h-3"/> في السجن</span>}
            </div>
            <div className="flex flex-col items-end">
                <div className="flex items-center gap-1 text-sm"><Banknote className="w-4 h-4 text-green-400"/> {state.money}</div>
                <div className="flex items-center gap-1 text-sm"><Landmark className="w-4 h-4 text-blue-400"/> {state.properties.length}</div>
            </div>
        </div>
    </div>
);

const PropertyInfoCard = ({ property, owner, onClose }: { property: BoardProperty, owner: Player | null, onClose: () => void }) => {
    return (
        <motion.div
             initial={{ opacity: 0, x: 50 }}
             animate={{ opacity: 1, x: 0 }}
             exit={{ opacity: 0, x: 50 }}
        >
            <Card className={cn("bg-slate-800/80 backdrop-blur-sm border-slate-600 text-white", property.color && 'border-t-8')} style={{ borderTopColor: property.color }}>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">{property.name} <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}><X/></Button></CardTitle>
                    <CardDescription>{property.type}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                     {owner && <p>المالك: <span className="font-bold">{owner.name}</span></p>}
                    {property.price && <p>السعر: <span className="font-bold">{property.price} ريال</span></p>}
                    {property.rent && <p>الإيجار الأساسي: <span className="font-bold">{property.rent[0]} ريال</span></p>}
                     {property.rent && property.rent.length > 1 && (
                        <ul className="text-xs list-disc pr-4">
                             {property.rent.slice(1).map((r, i) => <li key={i}>{i < 4 ? `مع ${i + 1} منزل` : `مع فندق`}: {r} ريال</li>)}
                        </ul>
                    )}
                    {property.houseCost && <p>سعر المنزل: <span className="font-bold">{property.houseCost} ريال</span></p>}
                </CardContent>
            </Card>
        </motion.div>
    )
};


export function PlayingPhase({ game, self }: PlayingPhaseProps) {
    const { toast } = useToast();
    const eftelasState = game.eftelasState;
    const [isSubmitting, setIsSubmitting] = useState(false);
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
        myPlayerState.money >= (currentTile.price || 0) &&
        !eftelasState.hasRolled;

    const handleAction = async (action: () => Promise<any>) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await action();
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleJailAction = (method: 'pay' | 'card' | 'roll') => {
        if(!isMyTurn || !myPlayerState?.inJail) return;
        handleAction(() => attemptToLeaveJail(game.id, self.id, method));
    }

    const handleTileClick = (tileIndex: number) => {
        setSelectedTile(tileIndex);
    }
    const selectedProperty = selectedTile !== null ? eftelasState.board[selectedTile] : null;
    const selectedPropertyOwner = selectedProperty?.ownerId ? game.players.find(p => p.id === selectedProperty.ownerId) : null;
    
    const renderActionPanel = () => {
        return (
             <Card className="bg-slate-800/80 backdrop-blur-sm border-slate-700 text-white flex-grow flex flex-col">
                <CardHeader>
                    <CardTitle className="text-center">{isMyTurn ? "دورك الآن!" : "في انتظار..."}</CardTitle>
                </CardHeader>
                <CardContent className="flex-grow flex flex-col justify-center items-center gap-2">
                     <div className="flex justify-center items-center gap-4">
                        <Dice value={eftelasState.dice[0]} />
                        <Dice value={eftelasState.dice[1]} />
                    </div>
                     <p className="text-sm text-center text-gray-300 mt-1 h-10">
                        {eftelasState.lastActivity}
                    </p>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    {isMyTurn && myPlayerState?.inJail ? (
                         <div className="w-full space-y-2">
                            <h3 className="text-center font-bold text-red-400">أنت في السجن!</h3>
                            <Button className="w-full bg-red-600 hover:bg-red-700" onClick={() => handleJailAction('pay')} disabled={isSubmitting || myPlayerState.money < 50}>ادفع كفالة (50 ريال)</Button>
                            <Button className="w-full" variant="secondary" onClick={() => handleJailAction('card')} disabled={isSubmitting || myPlayerState.getOutOfJailCards < 1}><KeyRound className="ml-2"/> استخدم بطاقة ({myPlayerState.getOutOfJailCards})</Button>
                            <Button className="w-full" variant="outline" onClick={() => handleJailAction('roll')} disabled={isSubmitting}><Dices className="ml-2"/>ارمِ النرد (محاولة دبل)</Button>
                         </div>
                    ) : (
                         <div className="w-full space-y-2">
                            <Button className="w-full text-lg h-12" disabled={!isMyTurn || isSubmitting || eftelasState.hasRolled} onClick={() => handleAction(() => rollDiceAndMove(game.id, self.id))}>
                                <Dices className="ml-2" /> {isSubmitting ? "جاري الرمي..." : "ارمِ النرد"}
                            </Button>
                            <AnimatePresence>
                            {canBuyProperty && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                                <Button className="w-full text-lg h-12 mt-2" variant="secondary" disabled={isSubmitting} onClick={() => handleAction(() => purchaseProperty(game.id, self.id))}>
                                    <ShoppingCart className="ml-2" /> {isSubmitting ? "جاري الشراء..." : `شراء (${currentTile?.price} ريال)`}
                                </Button>
                                </motion.div>
                            )}
                            </AnimatePresence>
                         </div>
                     )}
                </CardFooter>
            </Card>
        );
    }


    return (
        <div className="w-full h-screen flex flex-col md:flex-row gap-4 p-4 bg-gray-900 text-white">
            {/* Left Panel: Players Info - Condensed */}
            <div className="w-full md:w-72 flex-shrink-0 flex flex-col gap-4">
                 <Card className="flex-grow flex flex-col bg-slate-800/80 backdrop-blur-sm border-slate-700">
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
                                    return <PlayerInfoCard key={player.id} player={player} state={playerState} isTurn={isCurrentPlayer} />
                                })}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
            
            {/* Main Area: Board */}
            <div className="flex-grow flex items-center justify-center min-h-0">
                <div className="w-full max-w-[85vh] aspect-square">
                    <Board game={game} onTileClick={handleTileClick}/>
                </div>
            </div>

            {/* Right Panel: Actions and Info - Condensed */}
             <div className="w-full md:w-80 flex-shrink-0 flex flex-col gap-4">
                <AnimatePresence>
                    {selectedProperty && (
                        <PropertyInfoCard property={selectedProperty} owner={selectedPropertyOwner} onClose={() => setSelectedTile(null)} />
                    )}
                </AnimatePresence>
                 <div className="flex-grow" />
                 {renderActionPanel()}
            </div>
        </div>
    );
}
