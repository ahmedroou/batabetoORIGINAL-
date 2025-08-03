
"use client";

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamically import the CityClient to avoid SSR issues with react-dnd
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

    if (loading) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-slate-900">
                <Loader2 className="h-10 w-10 animate-spin text-white" />
            </div>
        );
    }

    if (!user || !userProfile) {
        return null; // or a loading spinner, router.push will handle redirection
    }

    return <CityClient user={user} userProfile={userProfile} />;
}
