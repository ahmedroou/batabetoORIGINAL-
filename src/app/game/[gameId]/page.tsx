
"use client";

import { ChunkLoadErrorHandler } from "@/components/ChunkLoadErrorHandler";
import GameClient from "./client";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function GamePage() {
    return (
        <ChunkLoadErrorHandler>
            <Suspense fallback={<LoadingState />}>
              <GameClient />
            </Suspense>
        </ChunkLoadErrorHandler>
    );
}

const LoadingState = () => (
  <main className="flex min-h-screen flex-col items-center justify-center p-4">
    <Skeleton className="w-64 h-32" />
    <Skeleton className="w-32 h-8 mt-4" />
  </main>
);
