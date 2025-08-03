
"use client";

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import CityClient from './client';

export default function CityPage() {
    const { user, userProfile, loading } = useAuth();
    const router = useRouter();

    if (loading) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-slate-900">
                <Loader2 className="h-10 w-10 animate-spin text-white" />
            </div>
        );
    }

    if (!user || !userProfile) {
        router.push('/login');
        return null; // or a loading spinner
    }

    return <CityClient user={user} userProfile={userProfile} />;
}
