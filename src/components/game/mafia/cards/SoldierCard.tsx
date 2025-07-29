
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export function SoldierCard() {
    return (
        <Card className="w-full max-w-md text-center bg-transparent border-none shadow-none">
            <CardHeader>
                <CardTitle className="text-xl text-gray-300">مهمتك في الليل</CardTitle>
                <CardDescription className="text-gray-400">أنت في حالة تأهب. إذا حاول الجاسوس كشف هويتك، ستكتشفه!</CardDescription>
            </CardHeader>
            <CardContent>
                <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                <p className="mt-2 text-gray-500">في انتظار بقية اللاعبين...</p>
            </CardContent>
        </Card>
    );
}
