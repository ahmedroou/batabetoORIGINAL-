
'use client';

import type { Game, Player, SnakesAndScissorsQuestion } from '@/types';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { PlayerAvatar } from '../PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { smartMerchantActions as actions } from '@/app/actions';
import { AnimatePresence, motion } from 'framer-motion';
import { Dices } from 'lucide-react';
import { cn } from '@/lib/utils';


// --- Inlined Dice component and CSS ---
const DiceCSS = `
.dice-container {
    perspective: 1000px;
}

.dice {
  width: 50px;
  height: 50px;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 1s;
}

.dice.rolling {
  animation: roll 1s ease-out;
}

.face {
  position: absolute;
  width: 50px;
  height: 50px;
  background: white;
  border: 2px solid #333;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
  font-weight: bold;
  color: black;
}

.face-1 { transform: rotateY(0deg) translateZ(25px); }
.face-2 { transform: rotateY(90deg) translateZ(25px); }
.face-3 { transform: rotateY(180deg) translateZ(25px); }
.face-4 { transform: rotateY(-90deg) translateZ(25px); }
.face-5 { transform: rotateX(90deg) translateZ(25px); }
.face-6 { transform: rotateX(-90deg) translateZ(25px); }

@keyframes roll {
  0% { transform: rotateX(0deg) rotateY(0deg); }
  100% { transform: rotateX(1080deg) rotateY(1080deg); }
}

.dice[data-value="1"] { transform: rotateY(0deg); }
.dice[data-value="2"] { transform: rotateY(-90deg); }
.dice[data-value="3"] { transform: rotateY(-180deg); }
.dice[data-value="4"] { transform: rotateY(90deg); }
.dice[data-value="5"] { transform: rotateX(-90deg); } 
.dice[data-value="6"] { transform: rotateX(90deg); }
`;

interface DiceProps {
  onRoll: (rollValue: number) => void;
}

function Dice({ onRoll }: DiceProps) {
    const [isRolling, setIsRolling] = useState(false);
    const [value, setValue] = useState(1);

    const handleRoll = () => {
        if (isRolling) return;
        setIsRolling(true);
        const rollValue = Math.floor(Math.random() * 4) + 1;
        
        setTimeout(() => {
            setValue(rollValue);
            setIsRolling(false);
            // Wait for the dice to land before calling the onRoll callback
            setTimeout(() => onRoll(rollValue), 500); 
        }, 1000); // Animation duration
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <style>{DiceCSS}</style>
            <div className="w-20 h-20 flex items-center justify-center">
                <div className={cn("dice-container", isRolling && 'rolling')}>
                    <div className="dice" data-value={value}>
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className={`face face-${i + 1}`}>{i < 4 ? i+1 : ''}</div>
                        ))}
                    </div>
                </div>
            </div>
            <Button onClick={handleRoll} disabled={isRolling}>
                <Dices className="mr-2" />
                {isRolling ? 'جاري الرمي...' : 'ارمِ النرد'}
            </Button>
        </div>
    );
}
// --- End of inlined Dice component ---


interface ActionPanelProps {
    game: Game;
    self: Player;
    isMyTurn: boolean;
}

export function ActionPanel({ game, self, isMyTurn }: ActionPanelProps) {
    const { toast } = useToast();
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

    const handleRollDice = async (rollValue: number) => {
        try {
            await actions.rollDiceAndMove(game.id, self.id, rollValue);
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
                 <div className="text-center space-y-2 p-4 border rounded-md min-h-[200px] flex flex-col justify-center items-center">
                    <h4 className="font-bold">دور {game.players.find(p => p.id === game.smartMerchantState?.turnOrder[game.smartMerchantState.currentTurnIndex])?.name}</h4>
                    <AnimatePresence mode="wait">
                    {isMyTurn && (
                        <motion.div
                            key={game.smartMerchantState?.turnPhase}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="w-full"
                        >
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
                        </motion.div>
                    )}
                    </AnimatePresence>
                 </div>
                 <div className="space-y-2">
                     <h4 className="font-bold">سجل الأحداث</h4>
                     <ScrollArea className="h-40 p-2 border rounded-md">
                         {game.smartMerchantState?.eventLog?.map((log, i) => <p key={i} className="text-sm">{log}</p>).reverse()}
                     </ScrollArea>
                 </div>
            </CardContent>
        </Card>
    );
}
