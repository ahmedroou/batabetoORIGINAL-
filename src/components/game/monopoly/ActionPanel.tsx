
"use client";

import type { Game, Player, SnakesAndScissorsQuestion, BoardProperty } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayerAvatar } from '../PlayerAvatar';
import { cn } from '@/lib/utils';
import { Dices, HelpCircle, Send, Banknote, Building, X, Hand, Check } from 'lucide-react';
import * as actions from '@/lib/actions/snakes-and-scissors';
import { useState } from 'react';
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
            <p className="font-bold text-center">{question.text}</p>
            {question.options.map(opt => (
                <Button key={opt} variant={selected === opt ? "default" : "outline"} className="w-full justify-start" onClick={() => setSelected(opt)}>
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
    const currentProperty = ssState.board[self.position];
    const turnPhase = ssState.turnPhase;
    const movement = ssState.movementState;

    const handleRoll = async () => {
        try {
            await actions.rollDiceAndMove(game.id, self.id);
        } catch (e: any) {
            toast({ title: "خطأ", description: e.message, variant: "destructive" });
        }
    };

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
                        <p className="font-bold text-lg">حان دورك لرمي النرد!</p>
                        <Dice ref={diceRef} isRolling={false} value={1} />
                        <Button className="w-full" onClick={handleRoll}><Dices className="ml-2"/> ارم النرد</Button>
                    </div>
                );
            case 'buy_or_pass':
                return (
                    <div className="text-center space-y-2">
                        <p>أنت على <span className="font-bold">{currentProperty.name}</span>.</p>
                        <p>السعر: {currentProperty.price} دينار.</p>
                        <p>الإيجار: {currentProperty.rent} دينار.</p>
                        <div className="grid grid-cols-2 gap-2 pt-2">
                            <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => handleBuyDecision('buy')} disabled={(self.balance || 0) < currentProperty.price}>
                                <Banknote className="ml-2" /> شراء
                            </Button>
                            <Button className="w-full" variant="outline" onClick={() => handleBuyDecision('pass')}><X className="ml-2"/> تخطي</Button>
                        </div>
                    </div>
                );
            case 'question':
                return <QuestionDisplay question={ssState.questionState!.question} onAnswer={handleAnswerQuestion} />;
            case 'pay_rent':
                 const owner = players.find(p => p.id === currentProperty.ownerId);
                 setTimeout(() => handleEndTurn(), 3000); // Automatically end turn after showing message
                 return <p className="text-center p-4 bg-red-100 text-red-800 rounded-lg">ملكية! ادفع {currentProperty.rent} دينار إلى {owner?.name}.</p>
            case 'end_turn':
                 setTimeout(() => handleEndTurn(), 1500); // Automatically end turn after showing message
                 return <p className="text-center p-4 bg-blue-100 text-blue-800 rounded-lg">انتهى دورك.</p>;
            default:
                return <p className="text-center text-muted-foreground animate-pulse">في انتظار اللاعب الآخر...</p>;
        }
    };

    return (
        <Card className="h-full flex flex-col">
            <CardHeader>
                <CardTitle>لوحة التحكم</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                    <h3 className="font-bold text-lg text-center mb-2">دور اللاعب</h3>
                     {isMyTurn ? renderTurnContent() : <p className="text-center text-muted-foreground animate-pulse">في انتظار اللاعب الآخر...</p>}
                </div>
                 <div className="space-y-2">
                    <h3 className="font-bold text-lg text-center">اللاعبون</h3>
                    <ScrollArea className="h-64">
                         {players.map(p => (
                             <div key={p.id} className={cn("p-2 rounded-md flex justify-between items-center text-sm transition-all duration-300 border-l-4 mb-1", ssState.turnOrder[ssState.currentTurnIndex] === p.id ? 'bg-primary/20 border-primary' : 'bg-slate-800/50 border-transparent')}>
                                <div className="flex items-center gap-2">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8" temporaryTitle={p.temporaryTitle} />
                                    <span className="font-bold">{p.name}</span>
                                </div>
                                <span className="font-mono font-bold text-lg text-green-400">{p.balance || 0} دينار</span>
                             </div>
                        ))}
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
