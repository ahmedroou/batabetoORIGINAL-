
'use client';

import React, { useState } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitTrap } from '@/lib/actions/draw-and-deceive';
import { Loader2, PenSquare, Brain, Send } from 'lucide-react';
import Image from 'next/image';

interface TrappingPhaseProps {
    game: Game;
    self: Player;
}

export function TrappingPhase({ game, self }: TrappingPhaseProps) {
    const { toast } = useToast();
    const state = game.drawAndDeceiveState!;
    const isArtist = state.artistId === self.id;
    const [trap, setTrap] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const hasSubmitted = !!state.playerTraps[self.id];

    const handleSubmit = async () => {
        if (!trap.trim() || isArtist) return;
        setIsSubmitting(true);
        try {
            await submitTrap(game.id, self.id, trap);
            toast({ title: "تم إرسال فخك بنجاح!" });
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isArtist) {
        return (
            <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <CardTitle>مرحلة وضع الفخاخ</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="animate-pulse text-lg">
                        اللاعبون الآخرون يقومون بكتابة أوصاف مخادعة لرسمتك. انتظر من فضلك...
                    </p>
                    <div className="w-24 h-24 mx-auto mt-4">
                        <Brain className="w-full h-full text-muted-foreground animate-pulse" />
                    </div>
                </CardContent>
            </Card>
        );
    }
    
    if (hasSubmitted) {
         return (
             <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <CardTitle>تم استلام فخك!</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="animate-pulse text-lg">
                        في انتظار بقية اللاعبين...
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-2xl">
            <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                    <PenSquare /> ضع فخك
                </CardTitle>
                <CardDescription>
                    انظر إلى الرسمة واكتب وصفًا مخادعًا لها (كلمة أو كلمتين) لإيقاع اللاعبين الآخرين في الفخ.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {state.drawingDataUrl && (
                    <div className="relative aspect-video w-full max-w-md mx-auto rounded-lg overflow-hidden border">
                         <Image
                            src={state.drawingDataUrl}
                            alt="Drawing by the artist"
                            fill
                            className="object-contain bg-white"
                        />
                    </div>
                )}
                <div className="space-y-2">
                     <Input
                        placeholder="اكتب وصفًا مخادعًا..."
                        value={trap}
                        onChange={(e) => setTrap(e.target.value)}
                        maxLength={30}
                        disabled={isSubmitting}
                    />
                    <Button onClick={handleSubmit} disabled={isSubmitting || !trap.trim()} className="w-full">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send className="mr-2" /> إرسال الفخ</>}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
