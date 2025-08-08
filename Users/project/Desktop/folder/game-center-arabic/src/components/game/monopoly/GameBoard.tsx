"use client";

import React from "react";
import type { Game, Player, BoardProperty } from "@/types";
import { PlayerAvatar } from "../PlayerAvatar";
import { Banknote, Building, Gavel, Flag } from "lucide-react";
import "./GameBoard.css";

interface GameBoardProps {
    game: Game;
    self: Player;
}

const SIDE_LENGTH = 7; // حجم الشبكة 7x7
const TILE_SIZE_PERCENT = 100 / SIDE_LENGTH;

// تحديد موقع كل بلاطة بناءً على رقمها
const getTileGridPosition = (index: number) => {
    const maxCoord = SIDE_LENGTH - 1;
    let row, col;

    if (index <= maxCoord) {
        // الصف العلوي (من اليسار لليمين)
        row = 0;
        col = index;
    } else if (index <= maxCoord * 2) {
        // العمود الأيمن (من الأعلى للأسفل)
        row = index - maxCoord;
        col = maxCoord;
    } else if (index <= maxCoord * 3) {
        // الصف السفلي (من اليمين لليسار)
        row = maxCoord;
        col = maxCoord - (index - maxCoord * 2);
    } else {
        // العمود الأيسر (من الأسفل للأعلى)
        row = maxCoord - (index - maxCoord * 3);
        col = 0;
    }
    
    return {
        gridColumnStart: col + 1,
        gridRowStart: row + 1,
    };
};

// توزيع اللاعبين على البلاطة
const getPlayerPosition = (playerIndex: number) => {
    const offset = 25; // نسبة مئوية
    const positions = [
        { top: '10%', left: '10%' },
        { top: '10%', left: `calc(100% - 10% - 20px)` }, // 20px هو حجم اللاعب
        { top: `calc(100% - 10% - 20px)`, left: '10%' },
        { top: `calc(100% - 10% - 20px)`, left: `calc(100% - 10% - 20px)` }
    ];
    return positions[playerIndex % 4] || positions[0];
};


// تحديد لون البلاطة
const getTileColor = (property: BoardProperty, owner?: Player) => {
    if (property.color) return property.color;
    if (owner) {
        if (owner.team === "A") return "#3b82f6";
        if (owner.team === "B") return "#ec4899";
    }
    return "#6b7280"; // لون افتراضي
};

const Tile = ({
    property,
    index,
    players,
}: {
    property: BoardProperty;
    index: number;
    players: Player[];
}) => {
    const playersOnTile = players.filter((p) => p.position === index);
    const owner = players.find((p) => p.id === property.ownerId);

    return (
        <div className="board-tile" style={getTileGridPosition(index)}>
            <div className="tile-number">{index + 1}</div>
            <div className="tile-content">
                <div
                    className="tile-header"
                    style={{ backgroundColor: getTileColor(property, owner) }}
                ></div>
                <div className="tile-body">
                    <div className="tile-icon">
                        {property.type === "start" ? (
                            <Flag />
                        ) : property.type === "fine" ? (
                            <Gavel />
                        ) : (
                            <Building />
                        )}
                    </div>
                    <div className="tile-name">{property.name}</div>
                    {property.type === "property" && (
                        <div className="tile-price">
                            <Banknote className="w-3 h-3" /> {property.price}
                        </div>
                    )}
                </div>
            </div>
            {/* عرض اللاعبين على البلاطة */}
            <div className="player-pieces">
                {playersOnTile.map((p, i) => (
                    <PlayerAvatar
                        key={p.id}
                        avatarId={p.avatarId}
                        className="player-piece border-white dark:border-gray-950"
                        style={getPlayerPosition(i)}
                        temporaryTitle={p.temporaryTitle}
                    />
                ))}
            </div>
        </div>
    );
};

export const GameBoard: React.FC<GameBoardProps> = ({ game, self }) => {
    const board = game.snakesAndScissorsState?.board || [];
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
                    />
                ))}
                {/* مركز اللوحة */}
                <div className="board-center">
                    <h2 className="board-title">بنك الحظ</h2>
                </div>
            </div>
        </div>
    );
};
