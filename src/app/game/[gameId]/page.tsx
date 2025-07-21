"use client";

import { ChunkLoadErrorHandler } from "@/components/ChunkLoadErrorHandler";
import GameClient from "./client";

export default function GamePage() {
    return (
        <ChunkLoadErrorHandler>
            <GameClient />
        </ChunkLoadErrorHandler>
    );
}
