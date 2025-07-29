
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export function CivilianCard() {
    return (
        <Card className="w-full max-w-md text-center border-gray-300">
            <CardHeader>
                <CardTitle>مهمتك في الليل</CardTitle>
                <CardDescription>
                    ليس لديك مهمة خاصة في الليل. انتظر طلوع النهار!
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                <p className="mt-2 text-muted-foreground">في انتظار بقية اللاعبين...</p>
            </CardContent>
        </Card>
    );
}
