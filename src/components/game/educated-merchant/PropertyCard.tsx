
'use client';

import type { Game, Player, Property } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { purchaseProperty, endTurn } from '@/lib/actions/educated-merchant';
import { Loader2, Banknote, Building } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

interface PropertyCardProps {
    game: Game;
    self: Player;
    property: Property;
}

export function PropertyCard({ game, self, property }: PropertyCardProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    
    const canAfford = (self.money || 0) >= property.price;

    const handlePurchase = async () => {
        setIsSubmitting(true);
        try {
            await purchaseProperty(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleSkip = async () => {
        setIsSubmitting(true);
        try {
            await endTurn(game.id, self.id);
        } catch (error: any) {
             toast({ title: "خطأ", description: error.message, variant: "destructive" });
        } finally {
             setIsSubmitting(false);
        }
    }

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.8 }} 
            animate={{ opacity: 1, scale: 1 }} 
            transition={{ type: "spring" }}
            className="transform-style-3d"
        >
        <Card className="w-full max-w-sm text-center bg-slate-800 border-primary text-white">
            <CardHeader>
                 <Building className="w-12 h-12 mx-auto text-primary" />
                <CardTitle>{property.name}</CardTitle>
                <CardDescription className="text-slate-400">
                    قسم: {property.category}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="text-4xl font-bold text-yellow-400 flex items-center justify-center gap-2">
                    <Banknote />
                    {property.price}
                </div>
                 <p className="text-sm text-slate-500 mt-1">الإيجار: {property.rent} دينار</p>
            </CardContent>
            <CardFooter className="flex gap-2">
                <Button className="flex-1" onClick={handlePurchase} disabled={isSubmitting || !canAfford}>
                    {isSubmitting ? <Loader2 className="animate-spin" /> : 'شراء'}
                </Button>
                <Button className="flex-1" variant="secondary" onClick={handleSkip} disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="animate-spin" /> : 'تخطي'}
                </Button>
            </CardFooter>
             {!canAfford && <p className="text-xs text-destructive text-center pb-2">لا تملك ما يكفي من المال لشراء هذا العقار.</p>}
        </Card>
        </motion.div>
    );
}
