
"use client";

import ClansClient from './client';
import { Suspense } from 'react';

export default function ClansPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ClansClient />
        </Suspense>
    );
}
