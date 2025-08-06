
"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Game, Player, SnakesAndScissorsQuestion } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '../../PlayerAvatar';
import * as actions from '@/lib/actions/snakes-and-scissors';
import Dice, { DiceHandle } from '../Dice';
import { Swords, Check, X, Shield, Users, Radio, Loader2, GitCommitVertical, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';


const CATEGORY_CHOICES = ['جغرافيا', 'رياضة', 'علوم', 'أنمي', 'تاريخ', 'أدب'];

const CategorySelection = ({ game, self }: { game: Game, self: Player }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const currentTurnPlayer = game.players.find(p => p.id === game.snakesAndScissorsState?.turnOrder[game.snakesAndScissorsState.currentTurnIndex]);

  const handleSelect = async (category: string) => {
    setIsSubmitting(true);
    try {
      await actions.selectCategory(game.id, self.id, category);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: 'destructive' });
      setIsSubmitting(false);
    }
  };

  if (self.id !== currentTurnPlayer?.id) {
    return <p className="text-center animate-pulse">في انتظار {currentTurnPlayer?.name} لاختيار فئة السؤال...</p>;
  }

  return (
    <div className="text-center space-y-4">
      <h3 className="text-xl font-bold">دورك! اختر فئة السؤال</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {CATEGORY_CHOICES.map(cat => (
          <Button key={cat} onClick={() => handleSelect(cat)} disabled={isSubmitting} variant="outline" size="lg">{cat}</Button>
        ))}
      </div>
    </div>
  );
};

const RpsRound = ({ game, self }: { game: Game, self: Player }) => {
  const rpsState = game.snakesAndScissorsState?.rpsState;
  const isPlayerInRps = self.id === rpsState?.challengerId || self.id === rpsState?.opponentId;
  const myChoice = rpsState?.choices[self.id];
  const opponentChoice = rpsState?.choices[rpsState.opponentId];

  // Logic to handle RPS choice would go here
  return <div>جولة حجرة ورقة مقص</div>;
};

const QuestionRound = ({ game, self }: { game: Game, self: Player }) => {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

    const questionState = game.snakesAndScissorsState?.questionState;
    const question = questionState?.question;
    const answerResult = questionState?.answerResult;
    const amIAsker = self.id === questionState?.questionAskerId;
    const amITarget = self.id !== questionState?.questionAskerId; // Everyone else is the target for now

    if (!question) return <p>جاري تحميل السؤال...</p>;

    const handleAnswer = async () => {
        if (!selectedAnswer || isSubmitting) return;
        setIsSubmitting(true);
        const result = await actions.answerQuestion(game.id, self.id, selectedAnswer);
        if (result.error) {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(false);
    };

    if (!amITarget) {
        return (
            <div className="text-center space-y-4">
                 <h3 className="text-xl font-bold">{question.text}</h3>
                 <p className="animate-pulse">في انتظار اللاعبين الآخرين للإجابة...</p>
            </div>
        )
    }

    if(answerResult) {
        const isMyResult = answerResult.playerId === self.id;
        const resultText = answerResult.isCorrect ? "إجابة صحيحة!" : "إجابة خاطئة!";
        const resultColor = answerResult.isCorrect ? "text-green-500" : "text-red-500";
        return (
             <div className="text-center space-y-4">
                 <h3 className={cn("text-2xl font-bold", resultColor)}>{resultText}</h3>
                 <p>
                    {answerResult.isCorrect ? "سيتم رمي النرد." : "ستتراجع خطوتين للخلف."}
                 </p>
            </div>
        )
    }

    return (
        <Card className="w-full max-w-lg bg-transparent border-none shadow-none">
            <CardHeader className="p-0 text-center mb-4">
                <CardTitle>{question.category}</CardTitle>
                <CardDescription className="text-lg font-semibold text-foreground">{question.text}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 p-0">
                {question.options.map(option => (
                    <Button 
                        key={option} 
                        variant={selectedAnswer === option ? "default" : "secondary"} 
                        className="w-full justify-start text-base h-12"
                        onClick={() => setSelectedAnswer(option)}
                        disabled={isSubmitting}
                    >
                       <Radio className="ml-2"/> {option}
                    </Button>
                ))}
                 <Button className="w-full mt-4" size="lg" onClick={handleAnswer} disabled={!selectedAnswer || isSubmitting}>
                    {isSubmitting ? <Loader2 className="animate-spin" /> : "تأكيد الإجابة"}
                 </Button>
            </CardContent>
        </Card>
    );
};


const MovementRound = ({ game, self }: { game: Game, self: Player }) => {
    const diceRef = useRef<DiceHandle>(null);
    const movementState = game.snakesAndScissorsState?.movementState;
    const isHost = game.hostId === self.id;
    const currentTurnPlayer = game.players.find(p => p.id === game.snakesAndScissorsState?.turnOrder[game.snakesAndScissorsState.currentTurnIndex]);

    useEffect(() => {
        if (isHost && !movementState?.isRolling) {
            actions.rollDice(game.id, self.id);
        }
    }, [isHost, movementState, game.id, self.id]);

    useEffect(() => {
        if (movementState?.diceValue) {
            diceRef.current?.roll(movementState.diceValue);
        }
    }, [movementState?.diceValue]);

    return (
        <div className="text-center space-y-4">
            <h3 className="text-xl font-bold">نتيجة الرمية للاعب {currentTurnPlayer?.name}!</h3>
            <Dice ref={diceRef} initialValue={movementState?.diceValue} isRolling={movementState?.isRolling} />
            {movementState?.isRolling ? <p className="animate-pulse">جاري رمي النرد...</p> : <p>سيتقدم اللاعب {movementState?.diceValue} خطوات.</p>}
        </div>
    );
};

export function GameBoardPhase({ game, self }: { game: Game, self: Player }) {
    const turnPhase = game.snakesAndScissorsState?.turnPhase;

    const renderTurnPhase = () => {
        switch (turnPhase) {
            case 'category_selection':
                return <CategorySelection game={game} self={self} />;
            case 'rps_round':
                return <RpsRound game={game} self={self} />;
            case 'question':
                 return <QuestionRound game={game} self={self} />;
            case 'movement':
                return <MovementRound game={game} self={self} />;
            default:
                return <p>مرحلة غير معروفة: {turnPhase}</p>;
        }
    };
    
    const players = game.players.filter(p => p.status !== 'left');
    const board = game.snakesAndScissorsState?.board || [];
    const boardSize = game.snakesAndScissorsState?.settings?.boardSize || 100;
    const currentTurnPlayer = game.players.find(p => p.id === game.snakesAndScissorsState?.turnOrder[game.snakesAndScissorsState.currentTurnIndex]);

    const getBoardCells = useMemo(() => {
        const cells = Array.from({ length: boardSize }, (_, i) => i + 1);
        const rows: number[][] = [];
        let row: number[] = [];
        for (let i = 0; i < cells.length; i++) {
            row.push(cells[i]);
            if (row.length === 10) {
                rows.push(row);
                row = [];
            }
        }
        if (row.length > 0) rows.push(row);
        
        return rows.map((r, i) => i % 2 === 0 ? r.reverse() : r).reverse().flat();
    }, [boardSize]);


    return (
        <div className="w-full h-screen flex flex-col items-center justify-between p-4 bg-gray-100">
            <header className="w-full flex justify-between items-center max-w-7xl mx-auto">
                 <Card className="w-1/4">
                    <CardHeader className="p-2">
                        <CardTitle className="text-base flex items-center gap-2"><Users/> اللاعبون</CardTitle>
                    </CardHeader>
                    <CardContent className="p-2 space-y-1">
                        {players.map(p => (
                             <div key={p.id} className={cn("p-1 rounded-md flex justify-between items-center text-xs transition-colors duration-300", p.id === currentTurnPlayer?.id && 'bg-primary/20')}>
                                <div className="flex items-center gap-1">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-6 h-6"/>
                                    <span className="font-bold">{p.name}</span>
                                </div>
                                <span className="font-mono font-bold">{p.position || 0}</span>
                             </div>
                        ))}
                    </CardContent>
                 </Card>
                  <Card className="flex-grow mx-4">
                    <CardContent className="p-2">
                         <h3 className="text-sm font-bold text-center">دور اللاعب: {currentTurnPlayer?.name}</h3>
                    </CardContent>
                 </Card>
            </header>
            
            <main className="flex-grow flex items-center justify-center w-full my-4">
                <div className="grid grid-cols-10 gap-1 p-2 bg-white rounded-lg shadow-lg aspect-square max-w-lg max-h-[70vh]">
                    {getBoardCells.map((cellNumber) => {
                        const playersOnCell = players.filter(p => p.position === cellNumber);
                        const boardSquare = board[cellNumber - 1];
                        return (
                            <div key={cellNumber} className="border rounded-md flex items-center justify-center relative aspect-square text-xs">
                                <span className="absolute top-0 right-1 font-bold text-gray-400">{cellNumber}</span>
                                {boardSquare?.type === 'ladder' && <GitBranch className="w-6 h-6 text-green-500 rotate-45" />}
                                {boardSquare?.type === 'snake' && <GitCommitVertical className="w-6 h-6 text-red-500" />}
                                <div className="flex flex-wrap items-center justify-center gap-0.5">
                                {playersOnCell.map(p => (
                                    <motion.div
                                        key={p.id}
                                        layoutId={`player-avatar-${p.id}`}
                                    >
                                        <PlayerAvatar avatarId={p.avatarId} className="w-4 h-4" />
                                    </motion.div>
                                ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </main>
            
            <footer className="w-full max-w-2xl">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={turnPhase}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                    >
                         <Card className="bg-white/80 backdrop-blur-sm">
                            <CardContent className="p-4">
                                {renderTurnPhase()}
                            </CardContent>
                        </Card>
                    </motion.div>
                </AnimatePresence>
            </footer>
        </div>
    );
}
