
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { Game, Player } from '@/types';
import { Skull, Heart, Eye, Search, Shield } from 'lucide-react';

interface NightResultsDialogProps {
    game: Game;
    self: Player;
    onClose: () => void;
}

export const NightResultsDialog = ({ game, self, onClose }: NightResultsDialogProps) => {
    const { nightResults } = game;
    if (!nightResults) return null;

    const { killedPlayerName, wasSaved, detectiveCheckResult, spyCheckResult, spyWasSpotted } = nightResults;

    const shouldShow = killedPlayerName || wasSaved ||
        (self.role === 'detective' && detectiveCheckResult) ||
        (self.role === 'spy' && (spyCheckResult || spyWasSpotted));

    return (
        <Dialog open={shouldShow} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="text-center text-2xl">أحداث الليلة الماضية</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-4">
                    {killedPlayerName && (
                        <Alert variant="destructive">
                            <Skull className="h-4 w-4" />
                            <AlertTitle>جريمة قتل!</AlertTitle>
                            <AlertDescription>
                                تم العثور على <strong>{killedPlayerName}</strong> مقتولاً هذا الصباح.
                            </AlertDescription>
                        </Alert>
                    )}
                    {wasSaved && (
                         <Alert>
                            <Heart className="h-4 w-4" />
                            <AlertTitle>محاولة قتل فاشلة!</AlertTitle>
                            <AlertDescription>
                                تم إنقاذ أحد اللاعبين من هجوم القاتل بفضل الطبيب.
                            </AlertDescription>
                        </Alert>
                    )}
                     {self.role === 'detective' && detectiveCheckResult && (
                        <Alert>
                            <Search className="h-4 w-4" />
                            <AlertTitle>تقريرك السري كمحقق</AlertTitle>
                            <AlertDescription>
                                الشخص الذي استهدفته ({detectiveCheckResult.targetName}) هو: <strong>{detectiveCheckResult.role}</strong>.
                            </AlertDescription>
                        </Alert>
                    )}
                    {self.role === 'spy' && spyWasSpotted && (
                         <Alert variant="destructive">
                            <Shield className="h-4 w-4" />
                            <AlertTitle>تم كشفك!</AlertTitle>
                            <AlertDescription>
                                لقد حاولت التجسس على الجندي. لقد تم كشف هويتك له!
                            </AlertDescription>
                        </Alert>
                    )}
                     {self.role === 'spy' && spyCheckResult && (
                        <Alert>
                            <Eye className="h-4 w-4" />
                            <AlertTitle>تقريرك السري كجاسوس</AlertTitle>
                            <AlertDescription>
                                الشخص الذي استهدفته ({spyCheckResult.targetName}) هو: <strong>{spyCheckResult.role}</strong>.
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
