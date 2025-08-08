
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

const SIDE_LENGTH = 7; // حجم الشبكة
const TILE_COUNT = (SIDE_LENGTH - 1) * 4; // عدد البلاطات
const TILE_SIZE_PERCENT = 100 / SIDE_LENGTH;

// تحديد موقع كل بلاطة بناءً على رقمها
const getTilePosition = (index: number) => {
    const size = `${TILE_SIZE_PERCENT}%`;
    const maxIndex = SIDE_LENGTH - 1;

    let top = "0%";
    let left = "0%";

    if (index <= maxIndex) {
        // الصف العلوي
        top = "0%";
        left = `${index * TILE_SIZE_PERCENT}%`;
    } else if (index <= maxIndex * 2) {
        // العمود الأيمن
        top = `${(index - maxIndex) * TILE_SIZE_PERCENT}%`;
        left = `${100 - TILE_SIZE_PERCENT}%`;
    } else if (index <= maxIndex * 3) {
        // الصف السفلي
        top = `${100 - TILE_SIZE_PERCENT}%`;
        left = `${100 - (index - maxIndex * 2) * TILE_SIZE_PERCENT}%`;
    } else {
        // العمود الأيسر
        top = `${100 - (index - maxIndex * 3) * TILE_SIZE_PERCENT}%`;
        left = "0%";
    }

    return { top, left, width: size, height: size };
};

// توزيع اللاعبين على البلاطة
const getPlayerPosition = (playerIndex: number) => {
    const offset = 15; // المسافة بين القطع
    const row = Math.floor(playerIndex / 2);
    const col = playerIndex % 2;
    return {
        top: `${10 + row * offset}%`,
        left: `${10 + col * offset}%`,
    };
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
        <div className="board-tile" style={getTilePosition(index)}>
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
