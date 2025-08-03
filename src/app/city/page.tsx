
"use client";

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

const CityClient = dynamic(() => import('./client'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-900">
      <Loader2 className="h-10 w-10 animate-spin text-white" />
    </div>
  ),
});


export default function CityPage() {
    const { user, userProfile, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [loading, user, router]);

    if (loading || !user || !userProfile) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-slate-900">
                <Loader2 className="h-10 w-10 animate-spin text-white" />
            </div>
        );
    }
    

    return <CityClient user={user} userProfile={userProfile} />;
}
