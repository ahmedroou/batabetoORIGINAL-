
"use client";

import type { Game, Player } from '@/types';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Rect, Circle, Text, Star, Image as KonvaImage } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import useImage from 'use-image';
import { Button } from '@/components/ui/button';
import * as castleActions from '@/lib/actions/the-castle';
import { useToast } from '@/hooks/use-toast';
import { Hammer, Shield, Bomb, KeyRound, Move, Timer, Check, Info, Ban, X, Swords } from 'lucide-react';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface PlayingPhaseProps {
  game: Game;
  self: Player;
}

type Tool = 'move' | 'wall' | 'trap' | 'bomb';

export function PlayingPhase({ game, self }: PlayingPhaseProps) {
    const { toast } = useToast();
    const castleState = game.theCastleState;

    if (!castleState) {
        return <div>خطأ: حالة اللعبة غير موجودة.</div>;
    }

    const { mapSize } = castleState.settings;
    const [canvasSize, setCanvasSize] = useState({ width: 500, height: 400 });
    const containerRef = useRef<HTMLDivElement>(null);
    
    const [selectedTool, setSelectedTool] = useState<Tool>('move');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [timeLeft, setTimeLeft] = useState(60);

    const isMyTurn = castleState.turn === self.team;
    const myPlayerState = castleState.playersState[self.id];

    // Preload images
    const [redKeyImage] = useImage('/keys/red-key.png');
    const [blueKeyImage] = useImage('/keys/blue-key.png');
    const [trapImage] = useImage('/traps/trap.png');
    const [bombImage] = useImage('/traps/bomb.png');
    const [powerupImage] = useImage('/traps/powerup.png');

    useEffect(() => {
        const checkSize = () => {
            if (containerRef.current) {
                setCanvasSize({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight,
                });
            }
        };
        checkSize();
        window.addEventListener('resize', checkSize);
        return () => window.removeEventListener('resize', checkSize);
    }, []);

    useEffect(() => {
        if (!castleState.turnEndsAt) return;
        const endTime = castleState.turnEndsAt.toMillis();

        const updateTimer = () => {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            setTimeLeft(remaining);
            if (remaining === 0 && isMyTurn) {
                // handle timeout if needed, e.g. auto end turn
            }
        };

        const timer = setInterval(updateTimer, 1000);
        updateTimer(); // Initial call
        return () => clearInterval(timer);
    }, [castleState.turnEndsAt, isMyTurn]);

    const handleAction = async (action: () => Promise<any>) => {
        if (!isMyTurn || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await action();
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGridClick = (x: number, y: number) => {
        if (!isMyTurn || isSubmitting) return;

        switch (selectedTool) {
            case 'move':
                handleAction(() => castleActions.movePlayer(game.id, self.id, { x, y }));
                break;
            case 'wall':
                handleAction(() => castleActions.buildWall(game.id, self.id, { x, y }));
                break;
             case 'trap':
                handleAction(() => castleActions.placeTrap(game.id, self.id, { x, y }));
                break;
            case 'bomb':
                handleAction(() => castleActions.placeBomb(game.id, self.id, { x, y }));
                break;
        }
    };

    const cellSize = Math.min(canvasSize.width / mapSize.width, canvasSize.height / mapSize.height);

    const renderActionPanel = () => {
        if (!isMyTurn) return <div className="text-center p-4 bg-muted rounded-lg animate-pulse">في انتظار دور الخصم...</div>;

        return (
            <div className="p-4 bg-muted rounded-lg space-y-4">
                <div className="flex justify-between items-center">
                     <h3 className="text-xl font-bold">دورك الآن!</h3>
                     <div className="flex items-center gap-2 font-mono text-lg p-2 bg-background rounded-full">
                        <Timer className="w-5 h-5"/> {timeLeft}
                     </div>
                </div>
                 <div className="flex items-center justify-between bg-background p-2 rounded-lg">
                    <p>الحركات المتبقية: <span className="font-bold text-primary">{myPlayerState.movesLeft}</span></p>
                    <p>الفخاخ المتبقية: <span className="font-bold text-primary">{myPlayerState.trapsLeft}</span></p>
                </div>
                 <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => setSelectedTool('move')} variant={selectedTool === 'move' ? 'default' : 'outline'} className="flex-1"><Move className="ml-2"/>تحريك</Button>
                    <Button onClick={() => setSelectedTool('wall')} variant={selectedTool === 'wall' ? 'default' : 'outline'} className="flex-1" disabled={myPlayerState.movesLeft < 1}><Hammer className="ml-2"/>بناء جدار (1)</Button>
                    <Button onClick={() => setSelectedTool('trap')} variant={selectedTool === 'trap' ? 'default' : 'outline'} className="flex-1" disabled={myPlayerState.movesLeft < 1 || myPlayerState.trapsLeft < 1}><Shield className="ml-2"/>وضع فخ (1)</Button>
                    <Button onClick={() => setSelectedTool('bomb')} variant={selectedTool === 'bomb' ? 'default' : 'outline'} className="flex-1" disabled={myPlayerState.movesLeft < 3}><Bomb className="ml-2"/>زرع قنبلة (3)</Button>
                </div>
                <Button onClick={() => handleAction(() => castleActions.endTurn(game.id, self.id))} variant="destructive" className="w-full">
                    إنهاء الدور
                </Button>
            </div>
        );
    };

    const renderPlayerInfo = (player: Player) => {
        const state = castleState.playersState[player.id];
        return (
            <div key={player.id} className={cn("p-2 rounded-lg border-2", player.team === 'red' ? 'border-red-500' : 'border-blue-500', castleState.turn === player.team && 'bg-primary/10')}>
                <div className="flex items-center gap-2">
                    <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10" />
                    <div>
                        <p className="font-bold">{player.name}</p>
                        <div className="flex items-center gap-2 text-xs">
                             <TooltipProvider><Tooltip><TooltipTrigger>
                                <div className="flex items-center gap-1"><Move/>{state.movesLeft}</div>
                             </TooltipTrigger><TooltipContent><p>الحركات المتبقية</p></TooltipContent></Tooltip></TooltipProvider>
                            <TooltipProvider><Tooltip><TooltipTrigger>
                                <div className={cn("flex items-center gap-1", state.hasRedKey && "text-red-500")}><KeyRound />{state.hasRedKey ? '✓' : ''}</div>
                             </TooltipTrigger><TooltipContent><p>مفتاح أحمر</p></TooltipContent></Tooltip></TooltipProvider>
                              <TooltipProvider><Tooltip><TooltipTrigger>
                                <div className={cn("flex items-center gap-1", state.hasBlueKey && "text-blue-500")}><KeyRound />{state.hasBlueKey ? '✓' : ''}</div>
                             </TooltipTrigger><TooltipContent><p>مفتاح أزرق</p></TooltipContent></Tooltip></TooltipProvider>
                        </div>
                    </div>
                </div>
            </div>
        )
    };


    return (
        <div className="w-full h-full flex flex-col md:flex-row gap-4 p-4">
            <div className="md:w-1/4 space-y-4">
                <div className="p-2 bg-muted rounded-lg">
                    <h3 className="font-bold text-center mb-2">الفريق الأحمر</h3>
                    <div className="space-y-2">{game.players.filter(p => p.team === 'red').map(renderPlayerInfo)}</div>
                </div>
                 <div className="p-2 bg-muted rounded-lg">
                    <h3 className="font-bold text-center mb-2">الفريق الأزرق</h3>
                    <div className="space-y-2">{game.players.filter(p => p.team === 'blue').map(renderPlayerInfo)}</div>
                </div>
            </div>
            <div className="flex-grow flex flex-col gap-4">
                <div ref={containerRef} className="w-full h-full flex-grow bg-gray-800 rounded-lg">
                    <Stage width={canvasSize.width} height={canvasSize.height}>
                        <Layer>
                            {Array.from({ length: mapSize.width * mapSize.height }).map((_, i) => {
                                const x = i % mapSize.width;
                                const y = Math.floor(i / mapSize.width);
                                const isRedBase = x === 0;
                                const isBlueBase = x === mapSize.width - 1;
                                return (
                                    <Rect
                                        key={`${x}-${y}`}
                                        x={x * cellSize} y={y * cellSize}
                                        width={cellSize} height={cellSize}
                                        fill={isRedBase ? '#dc2626' : isBlueBase ? '#2563eb' : '#4b5563'}
                                        stroke="#6b7280" strokeWidth={1}
                                        onClick={() => handleGridClick(x, y)}
                                        onTap={() => handleGridClick(x, y)}
                                    />
                                );
                            })}

                            {castleState.walls.map((wall, i) => (
                                <Rect key={`wall-${i}`} x={wall.x * cellSize} y={wall.y * cellSize} width={cellSize} height={cellSize} fill="#9ca3af" />
                            ))}
                            
                             {castleState.traps.map((trap, i) => (
                                 trapImage && <KonvaImage key={`trap-${i}`} image={trapImage} x={trap.position.x * cellSize} y={trap.position.y * cellSize} width={cellSize} height={cellSize} />
                            ))}

                             {castleState.bombs.map((bomb, i) => (
                                 bombImage && <KonvaImage key={`bomb-${i}`} image={bombImage} x={bomb.position.x * cellSize} y={bomb.position.y * cellSize} width={cellSize} height={cellSize} />
                            ))}
                            
                            {castleState.keys.map((key, i) => (
                                 key.team === 'red' ? redKeyImage && <KonvaImage key={`key-${i}`} image={redKeyImage} x={key.position.x * cellSize} y={key.position.y * cellSize} width={cellSize} height={cellSize} />
                                 : blueKeyImage && <KonvaImage key={`key-${i}`} image={blueKeyImage} x={key.position.x * cellSize} y={key.position.y * cellSize} width={cellSize} height={cellSize} />
                            ))}
                            
                            {castleState.powerUps.map((pu, i) => (
                                powerupImage && <KonvaImage key={`pu-${i}`} image={powerupImage} x={pu.position.x * cellSize} y={pu.position.y * cellSize} width={cellSize} height={cellSize} />
                            ))}

                            {game.players.map(p => {
                                const state = castleState.playersState[p.id];
                                if (!state) return null;
                                return (
                                    <Circle
                                        key={p.id}
                                        x={state.position.x * cellSize + cellSize / 2}
                                        y={state.position.y * cellSize + cellSize / 2}
                                        radius={cellSize / 2.5}
                                        fill={p.team === 'red' ? '#ef4444' : '#3b82f6'}
                                        stroke={castleState.turn === p.team ? '#fBBF24' : '#ffffff'}
                                        strokeWidth={3}
                                    />
                                );
                            })}
                        </Layer>
                    </Stage>
                </div>
                {renderActionPanel()}
            </div>
        </div>
    );
}
