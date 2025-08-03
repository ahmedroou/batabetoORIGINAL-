
"use client";

import type { Game, Player, CastlePlayerState } from '@/types';
import { motion } from 'framer-motion';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Flag, Shield } from 'lucide-react';

interface CastleBoardProps {
  game: Game;
  self: Player;
  onTileClick: (x: number, y: number) => void;
}

export function CastleBoard({ game, self, onTileClick }: CastleBoardProps) {
  const { settings, playersState, walls, turn } = game.theCastleState!;
  const { width, height } = settings.mapSize;

  const getPlayerAt = (x: number, y: number): (Player & { team: 'red' | 'blue' }) | null => {
    for (const player of game.players) {
      const playerState = playersState[player.id];
      if (playerState && playerState.position.x === x && playerState.position.y === y) {
        return player as (Player & { team: 'red' | 'blue' });
      }
    }
    return null;
  };

  const isWallAt = (x: number, y: number) => {
    return walls?.some(wall => wall.position.x === x && wall.position.y === y);
  };
  
  const selfState = playersState[self.id];
  const possibleMoves = selfState ? getPossibleMoves(selfState.position, selfState.movesLeft) : [];

  function getPossibleMoves(pos: {x: number, y: number}, movesLeft: number) {
      if (movesLeft <= 0) return [];
      const moves: {x: number, y: number}[] = [];
      // This is a simple implementation. A proper one would use BFS/DFS and consider walls.
      for(let i = -movesLeft; i <= movesLeft; i++) {
          for (let j = -movesLeft; j <= movesLeft; j++) {
                if (Math.abs(i) + Math.abs(j) <= movesLeft) {
                    const newX = pos.x + i;
                    const newY = pos.y + j;
                    if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
                         moves.push({ x: newX, y: newY });
                    }
                }
          }
      }
      return moves;
  }
   const isMyTurn = self.id === turn;

  return (
    <div
      className="grid gap-1 bg-gray-800 p-2 rounded-lg"
      style={{
        gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`,
        width: 'min(90vw, 90vh)',
        aspectRatio: `${width} / ${height}`,
      }}
    >
      {Array.from({ length: width * height }).map((_, i) => {
        const x = i % width;
        const y = Math.floor(i / width);
        
        const playerAtTile = getPlayerAt(x, y);
        const isWallTile = isWallAt(x, y);
        const isRedBase = x === width - 1;
        const isBlueBase = x === 0;
        const isPossibleMove = isMyTurn && possibleMoves.some(p => p.x === x && p.y === y);


        return (
          <motion.div
            key={`${x}-${y}`}
            className={cn(
              "w-full h-full rounded-md flex items-center justify-center transition-colors duration-200",
              isRedBase && 'bg-red-900/50',
              isBlueBase && 'bg-blue-900/50',
              !isRedBase && !isBlueBase && 'bg-gray-700/50',
              isMyTurn && isPossibleMove && !playerAtTile && 'bg-green-500/50 cursor-pointer hover:bg-green-500/80',
              isWallTile && 'bg-gray-500'
            )}
            onClick={() => isPossibleMove && onTileClick(x, y)}
            whileHover={isPossibleMove ? { scale: 1.1 } : {}}
            whileTap={isPossibleMove ? { scale: 0.9 } : {}}
          >
            {playerAtTile && (
              <div className={cn("w-full h-full rounded-full flex items-center justify-center", playerAtTile.team === 'red' ? 'bg-red-500' : 'bg-blue-500')}>
                 <PlayerAvatar avatarId={playerAtTile.avatarId} className="w-8 h-8 md:w-10 md:h-10" />
              </div>
            )}
            {!playerAtTile && isRedBase && <Flag className="text-red-300 opacity-50" />}
            {!playerAtTile && isBlueBase && <Flag className="text-blue-300 opacity-50" />}
            {isWallTile && <Shield className="text-gray-900"/>}
          </motion.div>
        );
      })}
    </div>
  );
}
