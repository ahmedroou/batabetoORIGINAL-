
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SocietyPyramid from './components/SocietyPyramid';
import SocietyClans from './components/SocietyClans';
import SocietyChallenges from './components/SocietyChallenges';


export default function SocietyClient() {
    const { user, loading } = useAuth();
    const router = useRouter();
    
    if (loading) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-gray-900">
                <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
            </div>
        );
    }
    
     if (!user) {
        router.push('/login');
        return null;
    }

    return (
        <div className="min-h-screen w-full bg-gray-900 bg-gradient-to-tr from-black via-gray-900 to-purple-900/50 text-white font-sans">
            <div className="fixed inset-0 stars z-0"></div>
            <div className="fixed inset-0 twinkling z-0"></div>
             <main className="relative z-10 container mx-auto px-4 py-8">
                 <header className="flex justify-between items-center mb-8">
                     <h1 className="text-4xl md:text-5xl font-bold text-purple-300 tracking-wider">
                       المجتمع
                    </h1>
                     <button onClick={() => router.push('/')} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                        <ArrowLeft className="h-6 w-6" />
                    </button>
                </header>

                <Tabs defaultValue="pyramid" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 bg-black/30 backdrop-blur-sm border border-purple-500/30 text-purple-300">
                        <TabsTrigger value="pyramid">الهرم الاجتماعي</TabsTrigger>
                        <TabsTrigger value="challenges">التحديات</TabsTrigger>
                        <TabsTrigger value="clans">الفرق</TabsTrigger>
                    </TabsList>
                    <TabsContent value="pyramid" className="mt-6">
                        <SocietyPyramid />
                    </TabsContent>
                    <TabsContent value="challenges" className="mt-6">
                        <SocietyChallenges />
                    </TabsContent>
                    <TabsContent value="clans" className="mt-6">
                        <SocietyClans />
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}
