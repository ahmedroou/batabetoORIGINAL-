

"use client";

import type { Game, Player, SnakesAndScissorsQuestion, BoardProperty } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Dices, HelpCircle, Send, Banknote, Building, X, Hand, Check, Gavel } from 'lucide-react';
import * as actions from '@/lib/actions/snakes-and-scissors';
import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import Dice, { DiceHandle } from './Dice';
import React from 'react';

interface ActionPanelProps {
    game: Game;
    self: Player;
    isMyTurn: boolean;
}

const QuestionDisplay = ({ question, onAnswer }: { question: SnakesAndScissorsQuestion, onAnswer: (answer: string) => void }) => {
    const [selected, setSelected] = useState('');
    return (
        <div className="space-y-2">
            <p className="font-bold text-center p-2 bg-slate-100 dark:bg-slate-800 rounded-md">{question.text}</p>
            {question.options.map(opt => (
                <Button key={opt} variant={selected === opt ? "default" : "outline"} className="w-full justify-start text-base h-12" onClick={() => setSelected(opt)}>
                    {opt}
                </Button>
            ))}
            <Button className="w-full" onClick={() => onAnswer(selected)} disabled={!selected}><Send className="ml-2"/> إرسال</Button>
        </div>
    )
}

export function ActionPanel({ game, self, isMyTurn }: ActionPanelProps) {
    const { toast } = useToast();
    const diceRef = React.useRef<DiceHandle>(null);
    const ssState = game.snakesAndScissorsState!;
    const players = game.players;
    const currentProperty = self.position < ssState.board.length ? ssState.board[self.position] : ssState.board[0];
    const turnPhase = ssState.turnPhase;
    const movement = ssState.movementState;

    const handleRoll = async () => {
        try {
            await actions.rollDiceAndMove(game.id, self.id);
        } catch (e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        }
    };
    
    const handleRollEnd = useCallback(async () => {
        try {
            await actions.handleMoveEnd(game.id, self.id);
        } catch (e: any) {
             toast({ title: "خطأ في الحركة", description: e.message, variant: "destructive" });
        }
    }, [game.id, self.id, toast]);


    const handleBuyDecision = async (decision: 'buy' | 'pass') => {
        try {
            await actions.handleBuyDecision(game.id, self.id, decision);
        } catch (e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        }
    };
    
    const handleAnswerQuestion = async (answer: string) => {
        try {
            await actions.answerQuestion(game.id, self.id, answer);
        } catch (e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        }
    };

    const handleEndTurn = async () => {
        try {
            await actions.endTurn(game.id, self.id);
        } catch(e: any) {
             toast({ title: "خطأ", description: e.message, variant: "destructive" });
        }
    };
    
     React.useEffect(() => {
        if (movement?.isRolling && movement.playerId === self.id) {
            diceRef.current?.roll(movement.diceValue);
        }
    }, [movement, self.id]);


    const renderTurnContent = () => {
        switch (turnPhase) {
            case 'roll':
                return (
                    <div className="text-center space-y-4">
                        <p className="font-bold text-lg animate-pulse">حان دورك لرمي النرد!</p>
                        <Dice ref={diceRef} isRolling={false} value={1} onRollEnd={handleRollEnd} />
                        <Button className="w-full" onClick={handleRoll}><Dices className="ml-2"/> ارم النرد</Button>
                    </div>
                );
            case 'moving':
                return (
                    <div className="text-center space-y-4">
                        <p className="font-bold text-lg animate-pulse">
                           انقر على المربع المضاء للتحرك...
                        </p>
                        <Dice ref={diceRef} isRolling={movement?.isRolling || false} value={movement?.diceValue || 1} onRollEnd={handleRollEnd}/>
                    </div>
                );
            case 'buy_or_pass':
                const questionForProperty = ssState.questionState?.question;
                return (
                     <div className="text-center space-y-2">
                        <p className='text-lg'>أنت على <span className="font-bold">{currentProperty.name}</span>.</p>
                        <p className='text-lg'>السعر: <span className='font-bold text-green-500'>{currentProperty.price} دينار.</span></p>
                        <p className='text-muted-foreground text-sm'>الإيجار: {currentProperty.rent} دينار.</p>
                        {questionForProperty && <p className="text-sm text-muted-foreground p-2 bg-slate-100 dark:bg-slate-800 rounded-md">للشراء، يجب الإجابة على سؤال من قسم: <strong className="text-amber-500">{questionForProperty.category}</strong></p>}
                        <div className="grid grid-cols-2 gap-2 pt-2">
                            <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => handleBuyDecision('buy')} disabled={(self.balance || 0) < currentProperty.price}>
                                <Banknote className="ml-2" /> شراء
                            </Button>
                            <Button className="w-full" variant="outline" onClick={() => handleBuyDecision('pass')}><X className="ml-2"/> تخطي</Button>
                        </div>
                    </div>
                );
            case 'question':
                 if (!ssState.questionState?.question) return <p>جاري تحميل السؤال...</p>;
                return <QuestionDisplay question={ssState.questionState.question} onAnswer={handleAnswerQuestion} />;
            case 'pay_rent':
            case 'end_turn':
                const owner = players.find(p => p.id === currentProperty.ownerId);
                let message;
                if (turnPhase === 'pay_rent') {
                    message = `ملكية! ادفع ${currentProperty.rent} دينار إلى ${owner?.name}.`;
                } else {
                    message = `انتهى دورك.`;
                }
                 return (
                    <div className="text-center p-4 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded-lg space-y-3">
                         <p className="font-semibold">{message}</p>
                        <Button onClick={handleEndTurn}>إنهاء الدور</Button>
                    </div>
                );
            default:
                return <p className="text-center text-muted-foreground animate-pulse">في انتظار اللاعبين الآخرين...</p>;
        }
    };
    
    const currentPlayerId = ssState.turnOrder[ssState.currentTurnIndex];
    const currentPlayer = players.find(p => p.id === currentPlayerId);

    return (
        <Card className="h-full flex flex-col bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
            <CardHeader>
                <CardTitle>لوحة التحكم</CardTitle>
                 <CardDescription>الجولة الحالية: {game.round} / {ssState.settings.rounds}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow space-y-4">
                <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg min-h-[250px] flex items-center justify-center">
                     {isMyTurn ? renderTurnContent() : <p className="text-center text-muted-foreground animate-pulse">دور اللاعب {currentPlayer?.name || '...'} حاليًا</p>}
                </div>
                 <div className="space-y-2">
                    <h3 className="font-bold text-lg text-center">اللاعبون</h3>
                    <ScrollArea className="h-64">
                         {players.map(p => {
                             if(p.status === 'bankrupt') return null; // Don't show bankrupt players
                             return (
                             <div key={p.id} className={cn("p-2 rounded-md flex justify-between items-center text-sm transition-all duration-300 border-l-4 mb-1", currentPlayerId === p.id ? 'bg-primary/20 border-primary' : 'bg-slate-100 dark:bg-slate-800/50 border-transparent')}>
                                <div className="flex items-center gap-2">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8" temporaryTitle={p.temporaryTitle} />
                                    <span className="font-bold">{p.name}</span>
                                </div>
                                <span className="font-mono font-bold text-lg text-green-500 dark:text-green-400">{p.balance || 0} دينار</span>
                             </div>
                         )})}
                    </ScrollArea>
                </div>
            </CardContent>
             <CardFooter>
                 <ScrollArea className="h-24 w-full">
                     <div className="space-y-1 text-xs text-muted-foreground">
                        {ssState.eventLog?.slice().reverse().map((log, i) => <p key={i}>{log}</p>)}
                     </div>
                 </ScrollArea>
             </CardFooter>
        </Card>
    );
}
