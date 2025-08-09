

'use client';

import type { Game, Player, SnakesAndScissorsQuestion } from '@/types';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { PlayerAvatar } from '../../PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dice } from './Dice';
import * as actions from '@/lib/actions/smart-merchant';

interface ActionPanelProps {
    game: Game;
    self: Player;
    isMyTurn: boolean;
}

export function ActionPanel({ game, self, isMyTurn }: ActionPanelProps) {
    const { toast } = useToast();
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

    const handleRollDice = async () => {
        try {
            await actions.rollDiceAndMove(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: 'destructive' });
        }
    };
    
    const handleBuyDecision = async (decision: 'buy' | 'pass') => {
        try {
            await actions.handleBuyDecision(game.id, self.id, decision);
        } catch (error: any) {
             toast({ title: "خطأ", description: error.message, variant: 'destructive' });
        }
    };
    
    const handleAnswerQuestion = async () => {
        if (!selectedAnswer) return;
        try {
             await actions.answerQuestion(game.id, self.id, selectedAnswer);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: 'destructive' });
        }
    }
    
    const handleEndTurn = async () => {
        try {
            await actions.endTurn(game.id, self.id);
        } catch (error: any) {
            toast({ title: "خطأ", description: error.message, variant: 'destructive' });
        }
    }
    
    const question = game.smartMerchantState?.questionState?.question;
    const property = game.smartMerchantState?.board[self.position];

    return (
        <Card className="h-full flex flex-col">
            <CardHeader>
                <CardTitle>لوحة التحكم</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow space-y-4">
                 <div className="space-y-2">
                    <h4 className="font-bold">اللاعبون</h4>
                     {game.players.map(p => (
                        <div key={p.id} className="flex justify-between items-center p-2 bg-muted rounded-md">
                           <div className="flex items-center gap-2">
                             <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                             <span>{p.name}</span>
                           </div>
                           <span className="font-bold text-primary">{p.balance || 0} دينار</span>
                        </div>
                     ))}
                </div>
                 <div className="text-center space-y-2 p-4 border rounded-md min-h-[150px]">
                    <h4 className="font-bold">دور {game.players.find(p => p.id === game.smartMerchantState?.turnOrder[game.smartMerchantState.currentTurnIndex])?.name}</h4>
                    {isMyTurn && (
                        <>
                         {game.smartMerchantState?.turnPhase === 'roll' && <Dice onRoll={handleRollDice} />}
                         {game.smartMerchantState?.turnPhase === 'buy_or_pass' && property && (
                             <div className="space-y-2">
                                <p>عقار {property.name} متاح للشراء مقابل {property.price} دينار. هل تريد الشراء؟</p>
                                <Button onClick={() => handleBuyDecision('buy')}>شراء</Button>
                                <Button onClick={() => handleBuyDecision('pass')} variant="secondary">تخطي</Button>
                             </div>
                         )}
                         {game.smartMerchantState?.turnPhase === 'question' && question && (
                            <div className="space-y-2">
                                <p>{question.text}</p>
                                {question.options.map(opt => (
                                    <Button key={opt} variant={selectedAnswer === opt ? 'default' : 'outline'} onClick={() => setSelectedAnswer(opt)}>{opt}</Button>
                                ))}
                                <Button onClick={handleAnswerQuestion} disabled={!selectedAnswer}>تأكيد الإجابة</Button>
                            </div>
                         )}
                         {game.smartMerchantState?.turnPhase === 'end_turn' && (
                             <Button onClick={handleEndTurn}>إنهاء الدور</Button>
                         )}
                        </>
                    )}
                 </div>
                 <div className="space-y-2">
                     <h4 className="font-bold">سجل الأحداث</h4>
                     <ScrollArea className="h-40 p-2 border rounded-md">
                         {game.smartMerchantState?.eventLog?.map((log, i) => <p key={i} className="text-sm">{log}</p>)}
                     </ScrollArea>
                 </div>
            </CardContent>
        </Card>
    );
}
