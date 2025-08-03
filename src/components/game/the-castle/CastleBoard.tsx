
"use client";

import type { Game, Player, CastlePlayerState } from '@/types';
import { motion } from 'framer-motion';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Flag, Shield, Hammer } from 'lucide-react';
import { useCallback, useMemo } from 'react';

interface CastleBoardProps {
  game: Game;
  self: Player;
  onTileClick: (x: number, y: number) => void;
  buildMode: boolean;
}

export function CastleBoard({ game, self, onTileClick, buildMode }: CastleBoardProps) {
  const { settings, playersState, walls, turn } = game.theCastleState!;
  const { width, height } = settings.mapSize;
  const isMyTurn = self.id === turn;

  const getPlayerAt = useCallback((x: number, y: number): (Player & { team: 'red' | 'blue' }) | null => {
    for (const player of game.players) {
      const playerState = playersState[player.id];
      if (playerState && playerState.position.x === x && playerState.position.y === y) {
        return player as (Player & { team: 'red' | 'blue' });
      }
    }
    return null;
  }, [game.players, playersState]);

  const isWallAt = useCallback((x: number, y: number) => {
    return walls?.some(wall => wall.x === x && wall.y === y);
  }, [walls]);
  
  const selfState = playersState[self.id];

  const getPossibleMoves = useCallback((pos: { x: number; y: number }, movesLeft: number) => {
    if (!isMyTurn || buildMode || movesLeft <= 0) return new Set<string>();
    
    const possible = new Set<string>();
    const queue: [{ pos: { x: number; y: number }; dist: number }] = [{ pos, dist: 0 }];
    const visited = new Set<string>([`${pos.x},${pos.y}`]);

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current.dist < movesLeft) {
            const directions = [{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }];
            for (const dir of directions) {
                const newX = current.pos.x + dir.dx;
                const newY = current.pos.y + dir.dy;
                const newKey = `${newX},${newY}`;

                if (newX >= 0 && newX < width && newY >= 0 && newY < height && !visited.has(newKey) && !isWallAt(newX, newY) && !getPlayerAt(newX, newY)) {
                    visited.add(newKey);
                    possible.add(newKey);
                    queue.push({ pos: { x: newX, y: newY }, dist: current.dist + 1 });
                }
            }
        }
    }
    return possible;
  }, [width, height, isMyTurn, isWallAt, getPlayerAt, buildMode]);


  const getPossibleBuilds = useCallback((pos: {x:number, y:number}) => {
       if (!isMyTurn || !buildMode) return new Set<string>();
       const builds = new Set<string>();
       const directions = [{dx:0, dy:1}, {dx:0, dy:-1}, {dx:1, dy:0}, {dx:-1, dy:0}];
       for(const dir of directions) {
            const newX = pos.x + dir.dx;
            const newY = pos.y + dir.dy;
            if (newX >= 0 && newX < width && newY >= 0 && newY < height && !isWallAt(newX, newY) && !getPlayerAt(newX, newY)) {
                builds.add(`${newX},${newY}`);
            }
       }
       return builds;
  }, [isMyTurn, buildMode, width, height, isWallAt, getPlayerAt]);

  const possibleMoves = useMemo(() => selfState ? getPossibleMoves(selfState.position, selfState.movesLeft) : new Set<string>(), [selfState, getPossibleMoves]);
  const possibleBuilds = useMemo(() => selfState ? getPossibleBuilds(selfState.position) : new Set<string>(), [selfState, getPossibleBuilds, buildMode]);


  return (
    <div
      className="grid gap-1 bg-gray-900/50 p-2 rounded-lg"
      style={{
        gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`,
        width: 'min(90vw, 80vh)',
        aspectRatio: `${width} / ${height}`,
      }}
    >
      {Array.from({ length: width * height }).map((_, i) => {
        const x = i % width;
        const y = Math.floor(i / width);
        const tileKey = `${x},${y}`;
        
        const playerAtTile = getPlayerAt(x, y);
        const isWallTile = isWallAt(x, y);
        const isRedBase = x === width - 1;
        const isBlueBase = x === 0;
        
        const isPossibleMove = possibleMoves.has(tileKey);
        const isPossibleBuild = possibleBuilds.has(tileKey);
        const isClickable = isMyTurn && (isPossibleMove || isPossibleBuild);

        return (
          <motion.div
            key={tileKey}
            className={cn(
              "w-full h-full rounded-md flex items-center justify-center transition-all duration-200 relative",
              isRedBase && 'bg-red-900/30',
              isBlueBase && 'bg-blue-900/30',
              !isRedBase && !isBlueBase && 'bg-gray-700/50',
              isClickable && 'cursor-pointer',
              isPossibleMove && 'bg-green-500/30 hover:bg-green-500/50',
              isPossibleBuild && 'bg-yellow-500/30 hover:bg-yellow-500/50',
              isWallTile && 'bg-gray-500'
            )}
            onClick={() => isClickable && onTileClick(x, y)}
            whileHover={isClickable ? { scale: 1.1, zIndex: 10 } : {}}
            whileTap={isClickable ? { scale: 0.9 } : {}}
            initial={{opacity: 0, scale: 0.8}}
            animate={{opacity: 1, scale: 1}}
            transition={{delay: (x + y) * 0.01}}
          >
            {playerAtTile && (
              <motion.div 
                layoutId={`player-${playerAtTile.id}`}
                className={cn(
                  "w-[90%] h-[90%] rounded-full flex items-center justify-center transition-all duration-300", 
                  playerAtTile.team === 'red' ? 'bg-red-600' : 'bg-blue-600',
                  playerAtTile.id === turn && 'ring-4 ring-yellow-400'
                )}
              >
                 <PlayerAvatar avatarId={playerAtTile.avatarId} className="w-8 h-8 md:w-10 md:h-10" />
              </motion.div>
            )}
            {!playerAtTile && isRedBase && <Flag className="text-red-300 opacity-20" />}
            {!playerAtTile && isBlueBase && <Flag className="text-blue-300 opacity-20" />}
            {isWallTile && <Shield className="text-gray-900"/>}
            {isPossibleBuild && <Hammer className="text-yellow-900 opacity-50"/>}
          </motion.div>
        );
      })}
    </div>
  );
}
