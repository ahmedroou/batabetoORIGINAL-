
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
  brown: 'bg-[#955436]',
  lightblue: 'bg-[#aae0fa]',
  pink: 'bg-[#d93a96]',
  orange: 'bg-[#f7941d]',
  red: 'bg-[#ed1b24]',
  yellow: 'bg-[#ffef00]',
  green: 'bg-[#1fb25a]',
  darkblue: 'bg-[#0072bb]',
};


const CornerTile = ({ tile, position }: { tile: MonopolyTile; position: 'bottom-left' | 'top-left' | 'top-right' | 'bottom-right' }) => {
    const Icon = TILE_COMPONENTS[tile.type] || HelpCircle;
    const rotationClasses = {
        'bottom-left': 'rotate-45',
        'top-left': '-rotate-45',
        'top-right': '-rotate-[135deg]',
        'bottom-right': 'rotate-[135deg]'
    };

    return (
        <div className="w-full h-full bg-slate-200 border border-black flex items-center justify-center">
            <div className={cn("flex flex-col items-center justify-center text-center w-full h-full p-2", rotationClasses[position])}>
                 <p className="font-bold text-sm uppercase whitespace-nowrap">{tile.name}</p>
                 <Icon className="w-12 h-12 my-2" />
            </div>
        </div>
    );
};

const SideTile = ({ tile, houseCount = 0, position }: { tile: MonopolyTile; houseCount: number; position: 'bottom' | 'top' | 'left' | 'right' }) => {
    const Icon = TILE_COMPONENTS[tile.type] || HelpCircle;
    const isHorizontal = position === 'bottom' || position === 'top';
    const colorBarClass = tile.color ? TILE_COLORS[tile.color] : 'bg-transparent';

    const houseIcons = Array(houseCount).fill(0).map((_, i) => (
        <Home key={i} className="w-3 h-3 text-white" fill="white" />
    ));

    return (
        <div className={cn(
            "w-full h-full bg-slate-200 border border-black flex relative",
            isHorizontal ? 'flex-col' : 'flex-row'
        )}>
            {tile.type === 'property' && (
                <div className={cn(
                    "shrink-0 flex justify-center items-center gap-0.5 p-0.5",
                    colorBarClass,
                    isHorizontal ? 'h-6 w-full' : 'w-6 h-full flex-col'
                )}>
                    {houseIcons}
                </div>
            )}
            
            <div className={cn(
                "flex-grow flex items-center justify-around p-1 text-center",
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
  const propertyLevels = game.monopolyState?.playerData ? Object.values(game.monopolyState.playerData).reduce((acc, data) => ({ ...acc, ...data.propertyLevels }), {}) : {};

  if (board.length === 0) {
      return <div className="w-full h-full flex items-center justify-center bg-slate-100"><p>جاري تحميل اللوحة...</p></div>
  }
  
  const getPlayerPosition = (position: number) => {
    // This defines the size of the corner and side tiles in grid units
    const CORNER_SIZE = 1.5;
    const SIDE_SIZE = 1;
    const TOTAL_SIDE_UNITS = 9 * SIDE_SIZE;
    
    // Calculate total board dimension in abstract units
    const BOARD_DIMENSION = (2 * CORNER_SIZE) + TOTAL_SIDE_UNITS;

    let x_percent = 0;
    let y_percent = 0;

    if (position >= 0 && position <= 10) { // Bottom row
        y_percent = 100;
        if (position === 0) {
            x_percent = 100;
        } else if (position === 10) {
            x_percent = 0;
        } else {
            x_percent = 100 - ((CORNER_SIZE + (position - 1) * SIDE_SIZE + SIDE_SIZE / 2) / BOARD_DIMENSION * 100);
        }
    } else if (position > 10 && position <= 20) { // Left row
        x_percent = 0;
        if (position === 20) {
            y_percent = 0;
        } else {
            y_percent = 100 - ((CORNER_SIZE + (position - 11) * SIDE_SIZE + SIDE_SIZE / 2) / BOARD_DIMENSION * 100);
        }
    } else if (position > 20 && position <= 30) { // Top row
        y_percent = 0;
        if (position === 30) {
            x_percent = 100;
        } else {
            x_percent = ((CORNER_SIZE + (position - 21) * SIDE_SIZE + SIDE_SIZE / 2) / BOARD_DIMENSION * 100);
        }
    } else { // Right row
        x_percent = 100;
        y_percent = ((CORNER_SIZE + (position - 31) * SIDE_SIZE + SIDE_SIZE / 2) / BOARD_DIMENSION * 100);
    }

    return { top: `${y_percent}%`, left: `${x_percent}%` };
  };


  const renderBoard = () => {
    const tiles = [];
    // Bottom Row
    for (let i = 10; i >= 0; i--) { tiles.push(board[i]); }
    // Left Row
    for (let i = 20; i > 10; i--) { tiles.push(board[i]); }
    // Top Row
    for (let i = 20; i <= 30; i++) { tiles.push(board[i]); }
    // Right Row
    for (let i = 39; i > 30; i--) { tiles.push(board[i]); }
    
    return (
        <div className="w-full h-full grid grid-cols-11 grid-rows-11 gap-0.5">
           {/* Corners */}
           <div className="col-span-2 row-span-2"><CornerTile tile={board[0]} position="bottom-left" /></div>
           <div className="col-span-2 row-span-2 col-start-10"><CornerTile tile={board[10]} position="bottom-right" /></div>
           <div className="col-span-2 row-span-2 row-start-10"><CornerTile tile={board[30]} position="top-right" /></div>
           <div className="col-span-2 row-span-2 col-start-1 row-start-10"><CornerTile tile={board[20]} position="top-left" /></div>
           
           {/* Bottom Row */}
           {board.slice(1, 10).reverse().map((tile, i) => (
                <div key={`bottom-${i}`} className="col-span-1 row-span-2 col-start-[var(--col-start)]" style={{ '--col-start': 2 + i }}>
                    <SideTile tile={tile} houseCount={propertyLevels[9-i] || 0} position="bottom" />
                </div>
           ))}
           {/* Left Row */}
            {board.slice(11, 20).reverse().map((tile, i) => (
                <div key={`left-${i}`} className="col-span-2 row-span-1 row-start-[var(--row-start)]" style={{ '--row-start': 2 + i }}>
                    <SideTile tile={tile} houseCount={propertyLevels[19-i] || 0} position="left" />
                </div>
            ))}
            {/* Top Row */}
            {board.slice(21, 30).map((tile, i) => (
                 <div key={`top-${i}`} className="col-span-1 row-span-2 row-start-10 col-start-[var(--col-start)]" style={{ '--col-start': 2 + i }}>
                    <SideTile tile={tile} houseCount={propertyLevels[21+i] || 0} position="top" />
                </div>
            ))}
            {/* Right Row */}
            {board.slice(31, 40).map((tile, i) => (
                <div key={`right-${i}`} className="col-span-2 row-span-1 col-start-10 row-start-[var(--row-start)]" style={{ '--row-start': 2 + i }}>
                    <SideTile tile={tile} houseCount={propertyLevels[31+i] || 0} position="right" />
                </div>
            ))}
        </div>
    )
  }

  return (
    <div className="relative w-full h-full max-w-[95vh] aspect-square bg-slate-100 p-2 border-8 border-gray-700 rounded-lg">
        {/* Center Content */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-24 transform -rotate-45 z-0">
            <CommunityChestDeck />
            <ChanceDeck />
        </div>
        {renderBoard()}
        {/* Player Pawns */}
        {players.map((p, playerIndex) => {
            const pos = playerData[p.id]?.position || 0;
            const { top, left } = getPlayerPosition(pos);
            const playersOnSameTile = players.filter(pl => (playerData[pl.id]?.position || 0) === pos).length;
            const myIndexOnTile = players.filter(pl => (playerData[pl.id]?.position || 0) === pos).findIndex(pl => pl.id === p.id);
            const offset = (myIndexOnTile - (playersOnSameTile - 1) / 2) * 12;

            return (
                <div 
                    key={p.id} 
                    className="absolute player-pawn z-20"
                    style={{ top, left, transform: `translate(-50%, -50%) translate(${offset}px, ${offset}px)` }}
                >
                    <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 border-2 rounded-full border-white shadow-lg" />
                </div>
            )
        })}
    </div>
  );
}
