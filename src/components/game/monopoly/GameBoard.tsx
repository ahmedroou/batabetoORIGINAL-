
"use client";

import type { Game, Player, MonopolyState, MonopolyTile } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Dices, Landmark, Train, Zap, HelpCircle, Diamond, Banknote, VenetianMask, Gavel, Cog, Home, Hotel } from 'lucide-react';
import './GameBoard.css';

interface GameBoardProps {
  game: Game;
}

const TILE_ICONS: Record<string, React.ElementType> = {
    go: Banknote,
    property: Landmark,
    railroad: Train,
    utility: Zap,
    community_chest: HelpCircle,
    chance: Diamond,
    tax: Banknote,
    jail: Gavel,
    free_parking: Banknote,
    go_to_jail: VenetianMask,
};

const TILE_COLORS: Record<string, string> = {
  brown: 'bg-[#955436]',
  lightblue: 'bg-[#aae0fa]',
  pink: 'bg-[#d93a96]',
  orange: 'bg-[#f7941d]',
  red: 'bg-[#ed1b24]',
  yellow: 'bg-[#ffef00]',
  green: 'bg-[#1fb25a]',
  darkblue: 'bg-[#0072bb]',
};

const CornerTile = ({ tile }: { tile: MonopolyTile }) => {
    const Icon = TILE_ICONS[tile.type] || HelpCircle;
    return (
        <div className="w-full h-full bg-slate-200 border border-black flex items-center justify-center text-center p-1">
             <div className="flex flex-col items-center justify-center transform -rotate-45">
                 <p className="font-bold text-xs uppercase whitespace-nowrap">{tile.name}</p>
                 <Icon className="w-10 h-10 my-1" />
            </div>
        </div>
    );
};

const SideTile = ({ tile, houseCount = 0, position, ownerColor }: { tile: MonopolyTile; houseCount: number; position: 'bottom' | 'top' | 'left' | 'right', ownerColor?: string }) => {
    const Icon = TILE_ICONS[tile.type] || HelpCircle;
    const isHorizontal = position === 'bottom' || position === 'top';
    const colorBarClass = tile.color ? TILE_COLORS[tile.color] : 'bg-transparent';
    const houseIcons = Array(houseCount > 0 && houseCount < 5 ? houseCount : 0).fill(0).map((_, i) => (
        <Home key={i} className="w-3 h-3 text-white" fill="white" />
    ));
    const hotelIcon = houseCount === 5 ? <Hotel className="w-4 h-4 text-white" /> : null;

    return (
        <div className={cn(
            "w-full h-full bg-slate-200 border border-black flex relative",
            isHorizontal ? 'flex-col' : 'flex-row'
        )}>
             {ownerColor && (
                 <div className="absolute inset-0 border-4" style={{ borderColor: ownerColor }}></div>
             )}
            {tile.type === 'property' && (
                <div className={cn(
                    "shrink-0 flex justify-center items-center gap-0.5 p-0.5 z-10",
                    colorBarClass,
                    isHorizontal ? 'h-6 w-full' : 'w-6 h-full flex-col'
                )}>
                    {houseIcons}
                    {hotelIcon}
                </div>
            )}
            
            <div className={cn(
                "flex-grow flex items-center justify-around p-1 text-center z-10",
                 isHorizontal ? 'flex-col' : 'flex-row'
            )}>
                {tile.type !== 'property' && <Icon className={cn("shrink-0", isHorizontal ? 'w-6 h-6' : 'w-8 h-8')} />}
                <p className={cn(
                    "font-bold leading-tight", 
                    isHorizontal ? 'text-xs' : 'text-xs writing-sideways'
                )}>{tile.name}</p>
                {tile.price && <p className="font-bold text-sm mt-auto">${tile.price}</p>}
            </div>
        </div>
    );
};


const ChanceDeck = () => (
    <div className="card-deck">
        {[...Array(5)].map((_, i) => (
            <div key={i} className="card-deck-card chance-card">فرصة</div>
        ))}
    </div>
);

const CommunityChestDeck = () => (
    <div className="card-deck">
        {[...Array(5)].map((_, i) => (
            <div key={i} className="card-deck-card community-chest-card">صندوق المجتمع</div>
        ))}
    </div>
);

export function GameBoard({ game }: GameBoardProps) {
  const board = game.monopolyState?.board || [];
  const players = game.players;
  const playerData = game.monopolyState?.playerData || {};
  
  const getOwnerColor = (propertyIndex: number) => {
      const ownerId = Object.keys(playerData).find(pid => playerData[pid]?.properties?.includes(propertyIndex));
      if (!ownerId) return undefined;
      const playerIndex = game.players.findIndex(p => p.id === ownerId);
      const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#8b5cf6', '#ec4899'];
      return colors[playerIndex % colors.length];
  }

  if (board.length === 0) {
      return <div className="w-full h-full flex items-center justify-center bg-slate-100"><p>جاري تحميل اللوحة...</p></div>
  }
  
  const getPlayerPositionOnBoard = (position: number) => {
    const TILE_WIDTH = 100 / 11; // 11 tiles in a row/col
    const CORNER_SIZE = TILE_WIDTH * 1.5; // Adjusted corner size
    const SIDE_SIZE_H = (100 - 2 * CORNER_SIZE) / 9;
    const SIDE_SIZE_V = (100 - 2 * CORNER_SIZE) / 9;

    let top = 0, left = 0;

    if (position >= 0 && position <= 10) { // Bottom row
      top = 100 - CORNER_SIZE;
      if (position === 0) left = 100 - CORNER_SIZE;
      else if (position === 10) left = 0;
      else left = CORNER_SIZE + (9 - position) * SIDE_SIZE_H;
    } else if (position > 10 && position < 20) { // Left row
      left = 0;
      top = CORNER_SIZE + (9 - (position - 10)) * SIDE_SIZE_V;
    } else if (position >= 20 && position <= 30) { // Top row
      top = 0;
      if (position === 20) left = 0;
      else if (position === 30) left = 100 - CORNER_SIZE;
      else left = CORNER_SIZE + (position - 21) * SIDE_SIZE_H;
    } else { // Right row
      left = 100 - CORNER_SIZE;
      top = CORNER_SIZE + (position - 31) * SIDE_SIZE_V;
    }

    return { top: `${top}%`, left: `${left}%` };
};


  return (
    <div className="relative w-full h-full max-w-[95vh] aspect-square bg-slate-300 p-2 border-8 border-gray-700 rounded-lg">
        <div className="w-full h-full grid grid-cols-11 grid-rows-11 gap-0.5">
           {/* Corners */}
           <div className="col-start-1 row-start-1 col-span-2 row-span-2"><CornerTile tile={board[20]} /></div>
           <div className="col-start-10 row-start-1 col-span-2 row-span-2"><CornerTile tile={board[30]} /></div>
           <div className="col-start-10 row-start-10 col-span-2 row-span-2"><CornerTile tile={board[0]} /></div>
           <div className="col-start-1 row-start-10 col-span-2 row-span-2"><CornerTile tile={board[10]} /></div>

            {/* Top Row (21-29) */}
            {board.slice(21, 30).map((tile, i) => (
                <div key={tile.name} className="col-span-1 row-span-2" style={{ gridColumnStart: 3 + i }}>
                    <SideTile tile={tile} houseCount={playerData[game.hostId]?.propertyLevels?.[21+i] || 0} position="top" ownerColor={getOwnerColor(21+i)} />
                </div>
            ))}

            {/* Bottom Row (9-1) */}
            {board.slice(1, 10).reverse().map((tile, i) => (
                <div key={tile.name} className="col-span-1 row-span-2 row-start-10" style={{ gridColumnStart: 3 + i }}>
                    <SideTile tile={tile} houseCount={playerData[game.hostId]?.propertyLevels?.[9-i] || 0} position="bottom" ownerColor={getOwnerColor(9-i)} />
                </div>
            ))}
            
            {/* Left Row (19-11) */}
             {board.slice(11, 20).reverse().map((tile, i) => (
                <div key={tile.name} className="col-span-2 row-span-1" style={{ gridRowStart: 3 + i }}>
                     <SideTile tile={tile} houseCount={playerData[game.hostId]?.propertyLevels?.[19-i] || 0} position="left" ownerColor={getOwnerColor(19-i)} />
                </div>
            ))}
            
             {/* Right Row (31-39) */}
            {board.slice(31, 40).map((tile, i) => (
                <div key={tile.name} className="col-span-2 row-span-1 col-start-10" style={{ gridRowStart: 3 + i }}>
                    <SideTile tile={tile} houseCount={playerData[game.hostId]?.propertyLevels?.[31+i] || 0} position="right" ownerColor={getOwnerColor(31+i)} />
                </div>
            ))}
            
            {/* Center Area */}
            <div className="col-start-3 row-start-3 col-span-7 row-span-7 bg-slate-200 flex flex-col items-center justify-around p-4">
                 <h1 className="text-5xl font-extrabold text-black" style={{ fontFamily: 'serif' }}>مونوبولي</h1>
                <div className="w-full flex justify-around">
                     <ChanceDeck />
                    <CommunityChestDeck />
                </div>
            </div>
        </div>
        
        {/* Player Pawns */}
        {players.map((p) => {
            if (!playerData[p.id]) return null;
            const pos = playerData[p.id]!.position;
            const { top, left } = getPlayerPositionOnBoard(pos);
            const playersOnSameTile = players.filter(pl => playerData[pl.id]?.position === pos).length;
            const myIndexOnTile = players.filter(pl => playerData[pl.id]?.position === pos).findIndex(pl => pl.id === p.id);
            const offset = (myIndexOnTile - (playersOnSameTile - 1) / 2) * 12;

            return (
                <div 
                    key={p.id} 
                    className="absolute player-pawn z-20"
                    style={{ top, left, transform: `translate(${offset}px, ${offset}px)` }}
                >
                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 border-2 rounded-full border-white shadow-lg" />
                </div>
            )
        })}
    </div>
  );
}
