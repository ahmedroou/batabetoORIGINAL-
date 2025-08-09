

"use client";

import React from "react";
import type { Game, Player, BoardProperty } from "@/types";
import { PlayerAvatar } from "../PlayerAvatar";
import { Banknote, Building, Gavel, Flag, HelpCircle } from "lucide-react";
import "./GameBoard.css";
import * as actions from '@/lib/actions/smart-merchant';
import { cn } from "@/lib/utils";

interface GameBoardProps {
    game: Game;
    self: Player;
}

const SIDE_LENGTH = 7; 

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

const getPlayerPosition = (playerIndex: number) => {
    const positions = [
        { top: '10%', left: '10%' },
        { top: '10%', right: '10%' },
        { bottom: '10%', left: '10%' },
        { bottom: '10%', right: '10%' }
    ];
    return positions[playerIndex % 4] || positions[0];
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
    players,
    game,
    self
}: {
    property: BoardProperty;
    index: number;
    players: Player[];
    game: Game;
    self: Player;
}) => {
    const playersOnTile = players.filter((p) => p.position === index);
    const owner = players.find((p) => p.id === property.ownerId);

    const smartMerchantState = game.smartMerchantState;
    
    const isMyMove = smartMerchantState?.turnPhase === 'moving' && smartMerchantState.movementState?.playerId === self.id;
    const fromPosition = smartMerchantState?.movementState?.from || 0;
    const diceValue = smartMerchantState?.movementState?.diceValue || 0;
    const targetPosition = (fromPosition + diceValue) % smartMerchantState.board.length;
    const isTargetTile = isMyMove && targetPosition === index;


    const handleTileClick = () => {
        if (isTargetTile) {
            actions.handleMoveEnd(game.id, self.id);
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
                        {property.type === "start" ? <Flag /> : 
                         property.type === "fine" ? <Gavel /> : 
                         property.type === "chance" ? <HelpCircle /> :
                         <Building />}
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
            <div className="player-pieces">
                {playersOnTile.map((p, i) => (
                    <PlayerAvatar
                        key={p.id}
                        avatarId={p.avatarId}
                        className="player-piece"
                        style={getPlayerPosition(i)}
                        temporaryTitle={p.temporaryTitle}
                    />
                ))}
            </div>
        </div>
    );
};

export const GameBoard: React.FC<GameBoardProps> = ({ game, self }) => {
    const board = game.smartMerchantState?.board || [];
    const players = game.players.filter((p) => p.status !== "bankrupt");

    return (
        <div className="game-board-container">
            <div className="game-board">
                {board.map((property, index) => (
                    <Tile
                        key={property.id}
                        property={property}
                        index={index}
                        players={players}
                        game={game}
                        self={self}
                    />
                ))}
                <div className="board-center">
                    <h2 className="board-title">التاجر الذكي</h2>
                </div>
            </div>
        </div>
    );
};
