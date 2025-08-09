
"use client";

import React from "react";
import type { Game, Player, BoardProperty } from "@/types";
import { PlayerAvatar } from "../../PlayerAvatar";
import { Banknote, Building, Gavel, Flag, HelpCircle } from "lucide-react";
import "../GameBoard.css";
import * as actions from '@/lib/actions/bank-of-luck';
import { cn } from "@/lib/utils";

interface GameBoardProps {
    game: Game;
    self: Player;
}

const SIDE_LENGTH = 7; 

// Helper to calculate the pixel position of the center of a tile
const getTileCenterPosition = (index: number, boardSize: number) => {
    const tileSize = boardSize / SIDE_LENGTH;
    const maxCoord = SIDE_LENGTH - 1;
    let row, col;

    if (index <= maxCoord) { // Top row
        row = 0;
        col = index;
    } else if (index <= maxCoord * 2) { // Right column
        row = index - maxCoord;
        col = maxCoord;
    } else if (index <= maxCoord * 3) { // Bottom row
        row = maxCoord;
        col = maxCoord - (index - maxCoord * 2);
    } else { // Left column
        row = maxCoord - (index - maxCoord * 3);
        col = 0;
    }
    
    // Calculate center coordinates
    const x = col * tileSize + tileSize / 2;
    const y = row * tileSize + tileSize / 2;

    return { x, y };
};


// Helper to get the top/left percentage for a tile's grid position
const getTileGridPosition = (index: number) => {
    const maxCoord = SIDE_LENGTH - 1;
    let row, col;

    if (index <= maxCoord) {
        row = 0;
        col = index;
    } else if (index <= maxCoord * 2) {
        row = index - maxCoord;
        col = maxCoord;
    } else if (index <= maxCoord * 3) {
        row = maxCoord;
        col = maxCoord - (index - maxCoord * 2);
    } else {
        row = maxCoord - (index - maxCoord * 3);
        col = 0;
    }
    
    return {
        gridColumnStart: col + 1,
        gridRowStart: row + 1,
    };
};

const getPlayerOffset = (playerIndex: number, totalPlayersOnTile: number) => {
    const angle = (360 / totalPlayersOnTile) * playerIndex;
    const radius = 15; // pixels
    const x = Math.cos(angle * (Math.PI / 180)) * radius;
    const y = Math.sin(angle * (Math.PI / 180)) * radius;
    return { x, y };
};


const getTileColor = (property: BoardProperty, owner?: Player) => {
    if (property.color) return property.color;
    if (owner) {
        // You can define team colors or player-specific colors here
        return owner.team === "A" ? "#3b82f6" : "#ec4899";
    }
    return "#6b7280"; // Default color
};

const Tile = ({
    property,
    index,
    game,
    self
}: {
    property: BoardProperty;
    index: number;
    game: Game;
    self: Player;
}) => {
    const owner = game.players.find((p) => p.id === property.ownerId);
    const bgs = game.bankOfLuckState;
    
    // Guard against undefined state
    if (!bgs) return null;

    const isMyMove = bgs?.turnPhase === 'moving' && bgs.movementState?.playerId === self.id;
    const fromPosition = bgs?.movementState?.from || 0;
    const diceValue = bgs?.movementState?.diceValue || 0;
    const targetPosition = (fromPosition + diceValue) % bgs.board.length;
    const isTargetTile = isMyMove && targetPosition === index;


    const handleTileClick = () => {
        if (isTargetTile) {
            actions.handleMoveEnd(game.id, self.id);
        }
    };
    
    const TileIcon = () => {
        switch (property.type) {
            case "start": return <Flag />;
            case "fine": return <Gavel />;
            case "chance": return <HelpCircle />;
            case "property": return <Building />;
            default: return null;
        }
    };
    
    return (
        <div 
            className={cn(
                "board-tile",
                 property.type === "start" && "tile-start",
                 isTargetTile && "animate-pulse border-4 border-yellow-400 cursor-pointer"
            )} 
            style={getTileGridPosition(index)}
            onClick={handleTileClick}
        >
            <div className="tile-number">{index + 1}</div>
            <div className="tile-content">
                <div
                    className="tile-header"
                    style={{ backgroundColor: getTileColor(property, owner) }}
                ></div>
                <div className="tile-body">
                    <div className="tile-icon">
                        <TileIcon />
                    </div>
                    <div className="tile-name">{property.name}</div>
                    {property.type === "property" && (
                        <div className="tile-price">
                            <Banknote className="w-3 h-3" /> {property.price}
                        </div>
                    )}
                </div>
            </div>
             {property.type === "start" && (
                <div className="start-label">🏁 بداية</div>
            )}
        </div>
    );
};

export const GameBoard: React.FC<GameBoardProps> = ({ game, self }) => {
    const boardRef = React.useRef<HTMLDivElement>(null);
    const board = game.bankOfLuckState?.board || [];
    const players = game.players.filter((p) => p.status !== "bankrupt");

    return (
        <div className="game-board-container">
            <div className="game-board" ref={boardRef}>
                {board.map((property, index) => (
                    <Tile
                        key={property.id}
                        property={property}
                        index={index}
                        game={game}
                        self={self}
                    />
                ))}
                <div className="board-center">
                    <h2 className="board-title">بنك الحظ</h2>
                </div>
                {/* Player pieces are rendered on top of the board */}
                 <div className="player-pieces-container">
                    {players.map(p => {
                        const playersOnSameTile = players.filter(other => other.position === p.position);
                        const myIndexOnTile = playersOnSameTile.findIndex(other => other.id === p.id);
                        
                        if (!boardRef.current) return null;
                        
                        const { x, y } = getTileCenterPosition(p.position, boardRef.current.offsetWidth);
                        const { x: offsetX, y: offsetY } = getPlayerOffset(myIndexOnTile, playersOnSameTile.length);
                        
                        return (
                             <PlayerAvatar
                                key={p.id}
                                avatarId={p.avatarId}
                                className="player-piece"
                                style={{
                                    top: `calc(${y}px - 12px)`, // Adjust for half of piece size
                                    left: `calc(${x}px - 12px)`, // Adjust for half of piece size
                                    transform: `translate(${offsetX}px, ${offsetY}px)`,
                                }}
                                temporaryTitle={p.temporaryTitle}
                            />
                        )
                    })}
                </div>
            </div>
        </div>
    );
};
