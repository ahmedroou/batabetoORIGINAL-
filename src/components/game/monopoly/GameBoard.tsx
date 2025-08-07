
"use client";

import type { Game, Player, MonopolyState, MonopolyTile } from '@/types';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Dices, Landmark, Train, Zap, HelpCircle, Diamond, Banknote, VenetianMask, Gavel, Cog, Home, Hotel, ArrowUpLeft } from 'lucide-react';
import './GameBoard.css';

const TILE_ICONS: Record<string, React.ElementType> = {
    go: ArrowUpLeft,
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
  brown: 'bg-yellow-900',
  lightblue: 'bg-sky-400',
  pink: 'bg-pink-500',
  orange: 'bg-orange-500',
  red: 'bg-red-600',
  yellow: 'bg-yellow-400',
  green: 'bg-green-600',
  darkblue: 'bg-blue-800',
};

const TileContent = ({ tile, rotationClass }: { tile: MonopolyTile; rotationClass: string }) => {
    const Icon = TILE_ICONS[tile.type] || HelpCircle;
    const colorBarClass = tile.color ? TILE_COLORS[tile.color] : 'bg-transparent';

    return (
        <div className={cn("w-full h-full flex p-1", rotationClass)}>
             {tile.type === 'property' && (
                <div className={cn("absolute top-0 left-0 right-0 h-1/4", colorBarClass)}></div>
            )}
             <div className="flex flex-col items-center justify-between w-full h-full pt-6">
                <Icon className="w-5 h-5 shrink-0" />
                <p className="font-bold text-[8px] leading-tight break-words">{tile.name}</p>
                {tile.price && <p className="text-xs">${tile.price}</p>}
            </div>
        </div>
    )
}

const CornerTileContent = ({ tile }: { tile: MonopolyTile }) => {
    const Icon = TILE_ICONS[tile.type] || HelpCircle;
    return (
        <div className="w-full h-full flex items-center justify-center p-1">
             <div className="flex flex-col items-center justify-center -rotate-45 space-y-1">
                 <p className="font-bold text-xs uppercase whitespace-nowrap">{tile.name}</p>
                 <Icon className="w-10 h-10" />
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
  
  if (board.length === 0) {
      return <div className="w-full h-full flex items-center justify-center bg-slate-100"><p>جاري تحميل اللوحة...</p></div>
  }
  
  const getRotationClass = (index: number) => {
    if (index > 10 && index < 20) return 'rotate-90';
    if (index > 20 && index < 30) return 'rotate-180';
    if (index > 30 && index < 40) return '-rotate-90';
    return '';
  };
  
  const getOwnerColor = (propertyIndex: number) => {
      const ownerId = Object.keys(playerData).find(pid => playerData[pid]?.properties?.includes(propertyIndex));
      if (!ownerId) return undefined;
      const playerIndex = game.players.findIndex(p => p.id === ownerId);
      const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#8b5cf6', '#ec4899'];
      return colors[playerIndex % colors.length];
  }

  return (
    <div className="w-full h-full max-w-[95vh] aspect-square">
        <div className="game-board">
           {board.map((tile, index) => {
               const isCorner = index % 10 === 0;
               const ownerColor = getOwnerColor(index);
               return (
                   <div key={index} className={cn('tile', `tile-pos-${index}`, isCorner && 'corner')} style={{borderColor: ownerColor}}>
                        {isCorner ? <CornerTileContent tile={tile} /> : <TileContent tile={tile} rotationClass={getRotationClass(index)} />}
                        <div className="player-pawns-container">
                            {players.filter(p => p.position === index).map(p => (
                                <div key={p.id} className="player-pawn">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-full h-full" />
                                </div>
                            ))}
                        </div>
                   </div>
               )
           })}

            <div className="center-area">
                 <h1 className="text-5xl font-extrabold text-black" style={{ fontFamily: 'serif' }}>مونوبولي</h1>
                <div className="w-full flex justify-around">
                     <ChanceDeck />
                    <CommunityChestDeck />
                </div>
            </div>
        </div>
    </div>
  );
}
