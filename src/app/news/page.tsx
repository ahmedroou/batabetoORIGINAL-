"use client";

import NewsClient from './client';
import { Suspense } from 'react';

export default function NewsPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <NewsClient />
        </Suspense>
    );
}
