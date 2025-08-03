
"use client";

import React, { useCallback, useMemo } from 'react';
import type { Game, Player } from '@/types';
import { cn } from '@/lib/utils';
import { KeyRound, Gem, Flag, BombIcon, VenetianMask, Hammer } from 'lucide-react';
import { PlayerAvatar } from '../PlayerAvatar';
import { motion } from 'framer-motion';


// --- 2D Components with 3D-like styling ---

const Wall = () => (
    <div className="w-full h-full bg-gray-600 border-2 border-t-gray-500 border-l-gray-500 border-b-gray-800 border-r-gray-800 rounded-sm shadow-inner flex items-center justify-center">
        <div className="w-3/4 h-3/4 bg-gray-500 rounded-sm border-2 border-gray-600"></div>
    </div>
);

const Trap = ({ isOwner }: { isOwner: boolean }) => {
    if (!isOwner) return null;
    return (
        <div className="w-full h-full flex items-center justify-center">
            <VenetianMask className="w-6 h-6 text-indigo-400 drop-shadow-lg" />
        </div>
    );
};

const Bomb = ({ timer }: { timer: number }) => (
    <div className="relative w-full h-full flex items-center justify-center">
        <BombIcon className="w-8 h-8 text-red-500 animate-pulse" />
        <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-xs font-bold border-2 border-white">
            {timer}
        </span>
    </div>
);

const Key = ({ team }: { team: 'red' | 'blue' }) => (
    <div className="w-full h-full flex items-center justify-center">
        <KeyRound className={cn("w-6 h-6 drop-shadow-lg", team === 'red' ? 'text-red-400' : 'text-blue-400')} />
    </div>
);

const PowerUp = ({ moves }: { moves: number }) => (
    <div className="relative w-full h-full flex items-center justify-center">
        <Gem className="w-7 h-7 text-yellow-400 animate-pulse" />
        <span className="absolute -top-1 right-0 text-white font-bold text-sm drop-shadow-md">+{moves}</span>
    </div>
);

const CastleGate = ({ team }: { team: 'red' | 'blue' }) => (
    <div className={cn("w-full h-full flex items-center justify-center rounded-md", team === 'red' ? 'bg-red-800/50' : 'bg-blue-800/50')}>
        <Flag className={cn("w-8 h-8", team === 'red' ? 'text-red-300' : 'text-blue-300')} />
    </div>
)

// --- Main Board Component ---

interface CastleBoardProps {
  game: Game;
  self: Player;
  onTileClick: (x: number, y: number) => void;
  buildMode: 'wall' | 'trap' | 'bomb' | 'long_range_wall' | null;
}

export function CastleBoard({ game, self, onTileClick, buildMode }: CastleBoardProps) {
  const { settings, playersState, walls, turn, traps, bombs, keys, powerUps } = game.theCastleState!;
  const { width, height } = settings.mapSize;
  const isMyTurn = self.id === turn;
  const selfState = playersState[self.id];

  const getPossibleMoves = useCallback(() => {
    if (!isMyTurn || buildMode || !selfState || selfState.movesLeft <= 0) return new Set<string>();
    const possible = new Set<string>();
    const queue: [{ pos: { x: number; y: number }; dist: number }] = [{ pos: selfState.position, dist: 0 }];
    const visited = new Set<string>([`${selfState.position.x},${selfState.position.y}`]);
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current.dist < selfState.movesLeft) {
            const directions = [{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }];
            for (const dir of directions) {
                const newX = current.pos.x + dir.dx;
                const newY = current.pos.y + dir.dy;
                const newKey = `${newX},${newY}`;
                const isWall = walls?.some(w => w.x === newX && w.y === newY);
                const isOccupied = Object.values(playersState).some(p => p.position.x === newX && p.position.y === newY);
                if (newX >= 0 && newX < width && newY >= 0 && newY < height && !visited.has(newKey) && !isWall && !isOccupied) {
                    visited.add(newKey);
                    possible.add(newKey);
                    queue.push({ pos: { x: newX, y: newY }, dist: current.dist + 1 });
                }
            }
        }
    }
    return possible;
  }, [width, height, isMyTurn, walls, playersState, buildMode, selfState]);

  const getPossibleBuilds = useCallback(() => {
       if (!isMyTurn || !buildMode || !selfState) return new Set<string>();
       const builds = new Set<string>();
       const isLongRange = buildMode === 'long_range_wall';
       const cost = isLongRange ? 3 : (buildMode === 'bomb' ? 3 : 1);
       if (selfState.movesLeft < cost) return builds;

       const isWallAt = (x:number, y:number) => walls?.some(w => w.x === x && w.y === y);
       const isOccupied = (x:number, y:number) => Object.values(playersState).some(p => p.position.x === x && p.position.y === y);
       const isTrapAt = (x:number, y:number) => traps?.some(t => t.position.x === x && t.position.y === y);
       const isBombAt = (x:number, y:number) => bombs?.some(b => b.position.x === x && b.position.y === y);

       if (isLongRange) {
           for (let y = 0; y < height; y++) {
               for (let x = 0; x < width; x++) {
                   if (!isWallAt(x, y) && !isOccupied(x,y)) builds.add(`${x},${y}`);
               }
           }
           return builds;
       }
       
       const pos = selfState.position;
       const directions = [{dx:0, dy:1}, {dx:0, dy:-1}, {dx:1, dy:0}, {dx:-1, dy:0}, {dx:0, dy:0}];

       for(const dir of directions) {
            const newX = pos.x + dir.dx;
            const newY = pos.y + dir.dy;
            if (newX >= 0 && newX < width && newY >= 0 && newY < height && !isOccupied(newX, newY)) {
                if (buildMode === 'wall' && !isWallAt(newX, newY)) builds.add(`${newX},${newY}`);
                if (buildMode === 'trap' && !isTrapAt(newX, newY)) builds.add(`${newX},${newY}`);
                if (buildMode === 'bomb' && !isBombAt(newX, newY)) builds.add(`${newX},${newY}`);
            }
       }
       return builds;
  }, [isMyTurn, buildMode, width, height, walls, traps, bombs, playersState, selfState]);
  

  const possibleMoves = useMemo(() => getPossibleMoves(), [getPossibleMoves]);
  const possibleBuilds = useMemo(() => getPossibleBuilds(), [getPossibleBuilds]);

  return (
    <div className="relative w-full max-w-[75vh] mx-auto bg-gray-800 p-1 rounded-lg shadow-2xl">
      <div className="grid gap-0" style={{ gridTemplateColumns: `repeat(${width}, 1fr)` }}>
        {Array.from({ length: width * height }).map((_, i) => {
          const x = i % width;
          const y = Math.floor(i / height);
          const tileKey = `${x},${y}`;
          const isClickable = isMyTurn && (possibleMoves.has(tileKey) || possibleBuilds.has(tileKey));

          const playerOnTile = game.players.find(p => playersState[p.id]?.position.x === x && playersState[p.id]?.position.y === y);
          const wallOnTile = walls?.some(w => w.x === x && w.y === y);
          const trapOnTile = traps?.find(t => t.position.x === x && t.position.y === y);
          const bombOnTile = bombs?.find(b => b.position.x === x && b.position.y === y);
          const keyOnTile = keys?.find(k => k.position.x === x && k.position.y === y);
          const powerUpOnTile = powerUps?.find(p => p.position.x === x && p.position.y === y);
          
          const isBlueBase = x === 0;
          const isRedBase = x === width - 1;
          const isCastleGate = (isBlueBase || isRedBase) && (y >= Math.floor(height/2) -1 && y <= Math.floor(height/2) + 1);

          return (
            <div
              key={tileKey}
              className={cn(
                'aspect-square flex items-center justify-center relative transition-all duration-200 border-t border-l border-black/10',
                (x + y) % 2 === 0 ? 'bg-green-900/40' : 'bg-green-800/40',
                possibleMoves.has(tileKey) && 'bg-green-500/50 ring-2 ring-green-400 z-10',
                possibleBuilds.has(tileKey) && 'bg-yellow-500/50 ring-2 ring-yellow-400 z-10',
                isClickable && 'cursor-pointer hover:scale-105 hover:z-20',
              )}
              onClick={() => isClickable && onTileClick(x, y)}
            >
              {isCastleGate && <CastleGate team={isBlueBase ? 'blue' : 'red'} />}
              {wallOnTile && <Wall />}
              {trapOnTile && <Trap isOwner={trapOnTile.ownerId === self.id}/>}
              {bombOnTile && <Bomb timer={bombOnTile.timer} />}
              {keyOnTile && <Key team={keyOnTile.team} />}
              {powerUpOnTile && <PowerUp moves={powerUpOnTile.moves}/>}
              {playerOnTile && <PlayerAvatar avatarId={playerOnTile.avatarId} className={cn('w-11/12 h-11/12 rounded-full border-4', playerOnTile.team === 'red' ? 'border-red-500' : 'border-blue-500', playerOnTile.id === turn && 'ring-4 ring-yellow-400 shadow-lg')}/>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
