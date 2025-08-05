
"use client";
import StoreClient from "./client";
import { Suspense } from 'react';

export default function StorePage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
            <StoreClient />
        </Suspense>
    );
}
