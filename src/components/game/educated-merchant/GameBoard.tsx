"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Player, Property } from '@/types';
import { motion, useAnimate } from 'framer-motion';
import { PlayerAvatar } from '../PlayerAvatar';
import { Home, Building2, Gavel } from 'lucide-react';
import { cn } from '@/lib/utils';
import { handlePropertyAction } from '@/lib/actions/educated-merchant';
import { ScrollArea } from '@/components/ui/scroll-area';


const Tile = React.forwardRef<HTMLDivElement, { property: Property }>(({ property }, ref) => {
    const ownerColor = undefined; // No color property on player object yet

    return (
        <div 
            ref={ref}
            className={cn(
                'relative rounded-lg border-2 flex flex-col items-center justify-center text-center p-1 transition-all duration-300 hover:bg-gray-300 dark:hover:bg-gray-700',
                 'aspect-square basis-20 md:basis-24 lg:basis-28 shrink-0', // Use flex-basis for responsive sizing
                ownerColor ? 'shadow-lg' : 'bg-gray-200 dark:bg-gray-800 border-gray-300 dark:border-gray-700'
            )} 
            style={{ borderColor: ownerColor || undefined }}
            id={`tile-${property.id}`}
        >
            <div className="flex-grow flex flex-col items-center justify-center">
                {property.type === 'start' && <Home className="w-6 h-6 md:w-8 md:h-8 text-green-500"/>}
                {property.type === 'property' && <Building2 className="w-6 h-6 md:w-8 md:h-8 text-gray-500"/>}
                {property.type === 'fine' && <Gavel className="w-6 h-6 md:w-8 md:h-8 text-red-500"/>}
                <p className="text-xs font-bold truncate w-full mt-1">{property.name}</p>
                {property.type === 'property' && property.price > 0 && <p className="text-[10px] md:text-xs font-semibold text-green-600 dark:text-green-400">{property.price} د.ع</p>}
                {property.type === 'fine' && property.fineAmount && <p className="text-[10px] md:text-xs font-semibold text-red-600 dark:text-red-400">{property.fineAmount} د.ع</p>}
            </div>
            {ownerColor && (
                <div className="absolute bottom-0 w-full h-2 rounded-b-md" style={{ backgroundColor: ownerColor }}/>
            )}
        </div>
    );
});
Tile.displayName = 'Tile';


export function GameBoard({ board, players, gameId, diceRoll, isMyTurn, activePlayerId }: { board: Property[], players: Player[], gameId: string, diceRoll: number | null, isMyTurn: boolean, activePlayerId: string }) {
    const gridRef = useRef<HTMLDivElement>(null);
    const tileRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const [tilePositions, setTilePositions] = useState<Record<number, {x: number, y: number}>>({});
    const [playerScopes, setPlayerScopes] = useState<Record<string, any>>({});
    const [isAnimating, setIsAnimating] = useState(false);
    const [scope, animate] = useAnimate();

    const sideLength = Math.ceil(board.length / 4) + 1;
    const perimeter = (sideLength - 1) * 4;

    const getTilePositionOnPerimeter = (index: number) => {
        const effectiveIndex = index % perimeter;
        if (effectiveIndex < sideLength) return { row: 0, col: effectiveIndex }; // Top row
        if (effectiveIndex < sideLength * 2 - 1) return { row: effectiveIndex - (sideLength - 1), col: sideLength - 1 }; // Right column
        if (effectiveIndex < sideLength * 3 - 2) return { row: sideLength - 1, col: sideLength - 1 - (effectiveIndex - (sideLength * 2 - 2)) }; // Bottom row
        return { row: sideLength - 1 - (effectiveIndex - (sideLength * 3 - 3)), col: 0 }; // Left column
    };

    const calculatePositions = useCallback(() => {
        if (!scope.current) return;
        const newPositions: Record<number, { x: number, y: number }> = {};
        const gridRect = scope.current.getBoundingClientRect();

        board.forEach(property => {
            const tileEl = tileRefs.current[property.id];
            if (tileEl) {
                const tileRect = tileEl.getBoundingClientRect();
                 newPositions[property.id] = {
                    x: tileRect.left - gridRect.left,
                    y: tileRect.top - gridRect.top
                };
            }
        });
        setTilePositions(newPositions);
    }, [board, scope]);

    useEffect(() => {
        calculatePositions();
        window.addEventListener('resize', calculatePositions);
        return () => window.removeEventListener('resize', calculatePositions);
    }, [calculatePositions]);

    useEffect(() => {
        const movePlayer = async () => {
            if (isAnimating || diceRoll === null || !isMyTurn || Object.keys(tilePositions).length === 0) return;
            
            setIsAnimating(true);
            const player = players.find(p => p.id === activePlayerId);
            const playerScope = playerScopes[activePlayerId];

            if (!player || !playerScope) {
                 setIsAnimating(false);
                 return;
            };
            
            const startPos = player.position;
            
            for (let i = 1; i <= diceRoll; i++) {
                const nextPosIndex = (startPos + i) % board.length;
                const nextPosCoords = tilePositions[nextPosIndex];
                if (nextPosCoords) {
                    const tileWidth = tileRefs.current[nextPosIndex]?.offsetWidth || 0;
                    const tileHeight = tileRefs.current[nextPosIndex]?.offsetHeight || 0;
                     await animate(playerScope.current, 
                        { x: nextPosCoords.x + tileWidth / 4, y: nextPosCoords.y + tileHeight / 4 }, 
                        { duration: 0.4, type: 'spring', stiffness: 200, damping: 15 }
                    );
                }
            }

            await handlePropertyAction(gameId, activePlayerId);
            setIsAnimating(false);
        };

        movePlayer();
    }, [diceRoll, isMyTurn, tilePositions, players, activePlayerId, playerScopes, board.length, gameId, isAnimating, animate]);
    
    const renderGrid = () => {
        const grid: JSX.Element[][] = Array(sideLength).fill(null).map(() => []);

        for (let i = 0; i < sideLength; i++) {
            for (let j = 0; j < sideLength; j++) {
                grid[i][j] = <div key={`empty-${i}-${j}`} className="basis-20 md:basis-24 lg:basis-28 shrink-0" />;
            }
        }
        
        board.forEach((property, index) => {
            const { row, col } = getTilePositionOnPerimeter(index);
            if (grid[row] && grid[row][col]) {
                grid[row][col] = (
                    <Tile
                        key={property.id}
                        property={property}
                        ref={el => tileRefs.current[property.id] = el}
                    />
                );
            }
        });

        return grid.map((rowItems, rowIndex) => (
             <div key={rowIndex} className="flex gap-1">
                {rowItems.map((item) => item)}
            </div>
        ));
    };

    return (
        <div className="w-full h-full flex items-center justify-center">
            <div ref={scope} className="relative inline-flex flex-col gap-1 p-2 bg-gray-300 dark:bg-gray-800/50 rounded-2xl shadow-2xl">
                {renderGrid()}

                <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                    {players.map((player) => {
                        const initialPos = tilePositions[player.position] || {x: 0, y: 0};
                        const playerRef = useRef(null);
                        
                        // eslint-disable-next-line react-hooks/rules-of-hooks
                        useEffect(() => {
                            if (playerRef.current) {
                                setPlayerScopes(prev => ({...prev, [player.id]: playerRef}));
                            }
                        }, [player.id]);

                        return (
                            <motion.div
                                key={player.id}
                                ref={playerRef}
                                className="absolute z-10"
                                initial={{ x: initialPos.x + 20, y: initialPos.y + 20 }}
                                style={{ x: initialPos.x + 20, y: initialPos.y + 20 }}
                            >
                                <PlayerAvatar avatarId={player.avatarId} className="w-10 h-10 md:w-12 md:h-12 border-2 rounded-full shadow-lg" />
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
