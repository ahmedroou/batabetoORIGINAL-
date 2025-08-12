
'use client';

import type { Game, Player, Property } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { purchaseProperty, endTurn } from '@/lib/actions/educated-merchant';
import { Loader2, Banknote, Building } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '../PlayerAvatar';

interface PropertyCardProps {
    game: Game | null;
    self: Player | null;
    property: Property;
    isPopover?: boolean;
    // new prop: whether the current session is allowed to act (used by GameBoard)
    allowActions?: boolean;
}

export function PropertyCard({ game, self, property, isPopover = false, allowActions = false }: PropertyCardProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    
    const turnOrder = game?.educatedMerchantState?.turnOrder || [];
    const currentTurnPlayerId = turnOrder[game?.educatedMerchantState?.currentTurnIndex || 0];
    const currentPlayer = game?.players.find(p => p.id === currentTurnPlayerId);
    const isMyTurn = self?.id === currentTurnPlayerId;

    // Only consider affordability for actual property tiles
    const canAfford = property.type === 'property' ? ((self?.money || 0) >= (property.price || 0)) : false;
    const owner = game?.players.find(p => p.id === property.ownerId);

    const handlePurchase = async () => {
        if (!game || !self) return;
        if (!isMyTurn || !allowActions) {
            toast({ title: "غير مسموح", description: "ليس دورك الآن.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            await purchaseProperty(game.id, self.id);
            // Optionally show a success toast — server will move to question state
            toast({ title: "تم", description: "تم سحب المبلغ. أجب عن السؤال لكسب الملكية.", variant: "default" });
            // do not forcibly set isSubmitting=false here immediately if you expect a fast server update,
            // but clearing it prevents stuck spinner if realtime update is delayed:
        } catch (error: any) {
            toast({ title: "خطأ", description: error?.message || 'فشل تنفيذ العملية', variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleSkip = async () => {
        if (!game || !self) return;
        if (!isMyTurn || !allowActions) {
            toast({ title: "غير مسموح", description: "ليس دورك الآن.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            await endTurn(game.id, self.id);
            // success toast optional
        } catch (error: any) {
             toast({ title: "خطأ", description: error?.message || 'فشل تنفيذ العملية', variant: "destructive" });
        } finally {
             setIsSubmitting(false);
        }
    }
    
    const cardBody = (
         <Card className={cn("w-64 text-center bg-slate-800 border-primary text-white")}>
            <CardHeader className="pb-2">
                 <Building className="w-10 h-10 mx-auto text-primary" />
                <CardTitle className="text-base">{property.name}</CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                    قسم: {property.category || 'عام'}
                </CardDescription>
            </CardHeader>
            <CardContent className="pb-3">
                {owner ? (
                     <div className="flex flex-col items-center gap-1">
                        <p className="text-xs text-slate-400">مملوكة من قبل:</p>
                        <PlayerAvatar avatarId={owner.avatarId} className="w-12 h-12" />
                        <p className="font-bold">{owner.name}</p>
                    </div>
                ) : property.type === 'property' ? (
                    <div className="text-3xl font-bold text-yellow-400 flex items-center justify-center gap-2">
                        <Banknote />
                        {property.price}
                    </div>
                ) : property.type === 'fine' ? (
                    <div className="text-lg font-medium text-rose-300">غرامة: {property.fineAmount} دينار</div>
                ) : null}
                 {property.type === 'property' && <p className="text-sm text-slate-500 mt-1">الإيجار: {property.rent} دينار</p>}
            </CardContent>
        </Card>
    );

    // If this is rendered inside a popover, but the current session can act, show footer there too.
    if (isPopover) {
        return (
            <div>
                {cardBody}
                {allowActions ? (
                    <CardFooter className="flex gap-2 mt-2">
                        <Button className="flex-1" onClick={handlePurchase} disabled={isSubmitting || !canAfford || !!property.ownerId}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'شراء'}
                        </Button>
                        <Button className="flex-1" variant="secondary" onClick={handleSkip} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'تخطي'}
                        </Button>
                    </CardFooter>
                ) : owner ? null : (
                    <CardFooter>
                        <p className="text-center w-full text-muted-foreground animate-pulse">في انتظار قرار {currentPlayer?.name}...</p>
                    </CardFooter>
                )}
                {allowActions && !canAfford && !property.ownerId && <p className="text-xs text-destructive text-center pb-2">لا تملك ما يكفي من المال لشراء هذا العقار.</p>}
            </div>
        );
    }

    // default non-popover rendering (standalone)
    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.96 }} 
            animate={{ opacity: 1, scale: 1 }} 
            transition={{ type: "spring" }}
            className="transform-style-3d"
        >
            {cardBody}
            {isMyTurn ? (
                <CardFooter className="flex gap-2">
                    <Button className="flex-1" onClick={handlePurchase} disabled={isSubmitting || !canAfford || !!property.ownerId}>
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'شراء'}
                    </Button>
                    <Button className="flex-1" variant="secondary" onClick={handleSkip} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'تخطي'}
                    </Button>
                </CardFooter>
            ) : (
                 <CardFooter>
                    <p className="text-center w-full text-muted-foreground animate-pulse">في انتظار قرار {currentPlayer?.name}...</p>
                 </CardFooter>
            )}

            {isMyTurn && !canAfford && !property.ownerId && <p className="text-xs text-destructive text-center pb-2">لا تملك ما يكفي من المال لشراء هذا العقار.</p>}
        </motion.div>
    );
}
