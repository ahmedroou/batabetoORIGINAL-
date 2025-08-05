"use client";

import SocietyClient from './client';
import { Suspense } from 'react';

export default function SocietyPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen w-full items-center justify-center bg-gray-900">Loading...</div>}>
            <SocietyClient />
        </Suspense>
    );
}
