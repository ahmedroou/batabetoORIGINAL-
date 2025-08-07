
"use client";

import type { Game, Player, MonopolyState, MonopolyTile } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Dices, Landmark, Train, Zap, HelpCircle, Diamond, Banknote, VenetianMask, Gavel, Cog, Home } from 'lucide-react';
import './GameBoard.css';

interface GameBoardProps {
  game: Game;
}

const TILE_COMPONENTS: Record<string, React.ElementType> = {
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
  brown: 'bg-black',
  lightblue: 'bg-black',
  pink: 'bg-black',
  orange: 'bg-black',
  red: 'bg-black',
  yellow: 'bg-black',
  green: 'bg-black',
  darkblue: 'bg-black',
};


const CornerTile = ({ tile, position }: { tile: MonopolyTile; position: 'bottom-left' | 'top-left' | 'top-right' | 'bottom-right' }) => {
    const Icon = TILE_COMPONENTS[tile.type] || HelpCircle;
    const rotationClasses = {
        'bottom-left': 'rotate-45',
        'top-left': '-rotate-45',
        'top-right': '-rotate-135',
        'bottom-right': 'rotate-135'
    };

    return (
        <div className="w-full h-full bg-slate-200 border border-black flex items-center justify-center">
            <div className={cn("flex flex-col items-center justify-center text-center w-full h-full", rotationClasses[position])}>
                 <p className="font-bold text-sm uppercase">{tile.name}</p>
                 <Icon className="w-10 h-10 my-2" />
            </div>
        </div>
    );
};

const SideTile = ({ tile, houseCount = 0, position }: { tile: MonopolyTile; houseCount: number; position: 'bottom' | 'top' | 'left' | 'right' }) => {
    const Icon = TILE_COMPONENTS[tile.type] || HelpCircle;
    const isHorizontal = position === 'bottom' || position === 'top';
    const colorBarClass = 'bg-black'; // Simplified to black as per new design

    const houseIcons = Array(houseCount).fill(0).map((_, i) => (
        <Home key={i} className="w-3 h-3 text-green-600" />
    ));

    return (
        <div className={cn(
            "w-full h-full bg-slate-200 border border-black flex relative",
            isHorizontal ? 'flex-col' : 'flex-row'
        )}>
            {tile.type === 'property' && (
                <div className={cn(
                    "shrink-0",
                    colorBarClass,
                    isHorizontal ? 'h-5 w-full' : 'w-5 h-full'
                )}>
                    {isHorizontal && <div className="flex justify-center items-center h-full gap-0.5">{houseIcons}</div>}
                </div>
            )}
             {!isHorizontal && tile.type === 'property' && (
                <div className="absolute top-1 left-1/2 -translate-x-1/2 flex flex-col gap-0.5">{houseIcons}</div>
             )}

            <div className="flex-grow flex flex-col items-center justify-around p-1 text-center">
                 {tile.type !== 'property' && <Icon className={cn("shrink-0", isHorizontal ? 'w-5 h-5' : 'w-7 h-7')} />}
                <p className={cn("font-bold leading-tight", isHorizontal ? 'text-xs' : 'text-[9px] writing-sideways')}>{tile.name}</p>
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
  const propertyLevels = game.monopolyState?.playerData ? Object.values(game.monopolyState.playerData).reduce((acc, data) => ({ ...acc, ...data.propertyLevels }), {}) : {};


  if (board.length === 0) {
      return <div className="w-full h-full flex items-center justify-center bg-slate-100"><p>جاري تحميل اللوحة...</p></div>
  }

  const boardGrid = Array(11 * 11).fill(null);

  // Place corners
  boardGrid[10 * 11 + 0] = <CornerTile tile={board[0]} position="bottom-left" />;
  boardGrid[0 * 11 + 0] = <CornerTile tile={board[10]} position="top-left" />;
  boardGrid[0 * 11 + 10] = <CornerTile tile={board[20]} position="top-right" />;
  boardGrid[10 * 11 + 10] = <CornerTile tile={board[30]} position="bottom-right" />;
  
  // Place bottom row (1-9)
  for (let i = 1; i < 10; i++) {
    const tile = board[i];
    const houseCount = tile ? propertyLevels[i] || 0 : 0;
    boardGrid[10 * 11 + (10 - i)] = <SideTile tile={tile} houseCount={houseCount} position="bottom" />;
  }
  // Place left row (11-19)
  for (let i = 1; i < 10; i++) {
     const tile = board[i+10];
     const houseCount = tile ? propertyLevels[i+10] || 0 : 0;
    boardGrid[(10 - i) * 11 + 0] = <SideTile tile={tile} houseCount={houseCount} position="left" />;
  }
  // Place top row (21-29)
  for (let i = 1; i < 10; i++) {
     const tile = board[i+20];
     const houseCount = tile ? propertyLevels[i+20] || 0 : 0;
    boardGrid[0 * 11 + i] = <SideTile tile={tile} houseCount={houseCount} position="top" />;
  }
  // Place right row (31-39)
  for (let i = 1; i < 10; i++) {
     const tile = board[i+30];
     const houseCount = tile ? propertyLevels[i+30] || 0 : 0;
    boardGrid[i * 11 + 10] = <SideTile tile={tile} houseCount={houseCount} position="right" />;
  }
  
  const getPlayerPosition = (position: number) => {
    let row, col;
    if (position >= 0 && position <= 10) { // Bottom row
        row = 10;
        col = 10 - position;
    } else if (position > 10 && position <= 20) { // Left row
        row = 10 - (position - 10);
        col = 0;
    } else if (position > 20 && position <= 30) { // Top row
        row = 0;
        col = position - 20;
    } else { // Right row
        row = position - 30;
        col = 10;
    }
    return { row, col };
  };


  return (
    <div className="relative w-[900px] h-[900px] bg-slate-100 p-5 border-8 border-gray-700 rounded-lg">
        <div className="w-full h-full grid grid-cols-11 grid-rows-11 gap-0.5">
           {boardGrid.map((tile, index) => (
                <div key={index} className="bg-slate-50">
                    {tile}
                </div>
            ))}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-24 transform -rotate-45">
                <CommunityChestDeck />
                <ChanceDeck />
            </div>
        </div>
         

        {/* Player Pawns */}
        {players.map((p, playerIndex) => {
            const pos = playerData[p.id]?.position || 0;
            const { row, col } = getPlayerPosition(pos);
            const playersOnSameTile = players.filter(pl => playerData[pl.id]?.position === pos).length;
            const myIndexOnTile = players.filter(pl => playerData[pl.id]?.position === pos).findIndex(pl => pl.id === p.id);
            
            // Stagger pawns on the same tile
            const offset = (myIndexOnTile - (playersOnSameTile - 1) / 2) * 15;

            return (
                <div 
                    key={p.id} 
                    className="absolute player-pawn"
                    style={{
                        top: `calc(${row * (100/11)}% + 15px)`,
                        left: `calc(${col * (100/11)}% + 15px)`,
                        transform: `translate(${offset}px, ${offset}px)`,
                    }}
                >
                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 border-2 rounded-full border-white shadow-lg" />
                </div>
            )
        })}
    </div>
  );
}
