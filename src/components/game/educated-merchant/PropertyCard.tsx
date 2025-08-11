
"use client";

import type { Game, Player, Property } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { buyPropertyAttempt, endTurn } from '@/lib/actions/educated-merchant';
import { Building2, CircleDollarSign, Tag, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface PropertyCardProps {
    game: Game;
    self: Player;
}

export function PropertyCard({ game, self }: PropertyCardProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const es = game.educatedMerchantState;
    
    if (!es || !es.board) return null;

    const currentProperty = es.board.find(p => p.id === self.position);

    if (!currentProperty || currentProperty.type !== 'property' || currentProperty.ownerId) {
        return null;
    }

    const handleBuy = async () => {
        setIsSubmitting(true);
        const result = await buyPropertyAttempt(game.id, self.id);
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
            setIsSubmitting(false);
        }
    };

    const handleSkip = async () => {
        setIsSubmitting(true);
        const result = await endTurn(game.id, self.id);
        if (result.error) {
            toast({ title: "خطأ", description: result.error, variant: 'destructive' });
             setIsSubmitting(false);
        }
    };

    const canAfford = (game.playerScores?.[self.id] || 0) >= currentProperty.price;

    return (
        <div className="absolute z-20 flex flex-col items-center gap-4 animate-pop-in">
            <Card className="w-80 shadow-2xl border-primary">
                <CardHeader className="text-center pb-2">
                    <Building2 className="w-12 h-12 mx-auto text-primary" />
                    <CardTitle className="text-2xl">{currentProperty.name}</CardTitle>
                    <CardDescription>فئة: {currentProperty.category}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex justify-between items-center text-lg p-2 bg-muted rounded-md">
                        <span className="flex items-center gap-2"><CircleDollarSign className="text-green-500" /> السعر:</span>
                        <span className="font-bold">{currentProperty.price} د.ع</span>
                    </div>
                     <div className="flex justify-between items-center text-lg p-2 bg-muted rounded-md">
                        <span className="flex items-center gap-2"><Tag className="text-red-500"/> الإيجار:</span>
                        <span className="font-bold">{currentProperty.rent} د.ع</span>
                    </div>
                </CardContent>
                <CardFooter className="grid grid-cols-2 gap-2">
                     <Button 
                        onClick={handleBuy} 
                        disabled={isSubmitting || !canAfford}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'شراء العقار'}
                    </Button>
                    <Button 
                        onClick={handleSkip} 
                        disabled={isSubmitting}
                        variant="outline"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'تخطي'}
                    </Button>
                </CardFooter>
            </Card>
             {!canAfford && (
                <p className="text-sm font-bold text-destructive bg-destructive/20 px-4 py-1 rounded-full">
                    لا تملك ما يكفي من المال لشراء هذا العقار!
                </p>
            )}
        </div>
    );
}

