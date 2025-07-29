
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export function CivilianCard() {
    return (
        <div className="w-full max-w-md text-center text-gray-300">
            <CardHeader className='p-2'>
                <CardTitle className="text-xl">مهمتك في الليل</CardTitle>
                <CardDescription className="text-gray-400">ليس لديك مهمة خاصة في الليل. انتظر طلوع النهار!</CardDescription>
            </CardHeader>
            <CardContent>
                <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                <p className="mt-2 text-gray-500">في انتظار بقية اللاعبين...</p>
            </CardContent>
        </div>
    );
}
