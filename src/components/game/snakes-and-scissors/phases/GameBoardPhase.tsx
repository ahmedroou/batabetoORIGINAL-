
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Game, Player, SnakesAndScissorsQuestion } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '../../PlayerAvatar';
import * as actions from '@/lib/actions/snakes-and-scissors';
import Dice, { DiceHandle } from '../Dice';
import { Swords, Check, X, Shield, Users, Radio } from 'lucide-react';

const CATEGORY_CHOICES = ['جغرافيا', 'رياضة', 'علوم', 'أنمي', 'تاريخ', 'أدب'];

const CategorySelection = ({ game, self }: { game: Game, self: Player }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();
  const currentTurnPlayer = game.players.find(p => p.id === game.snakesAndScissorsState?.turnOrder[game.snakesAndScissorsState.currentTurnIndex]);

  const handleSelect = async (category: string) => {
    setIsSubmitting(true);
    try {
      await actions.selectCategory(game.id, self.id, category);
    } catch (e: any) {
      toast.toast({ title: "خطأ", description: e.message, variant: 'destructive' });
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
    const questionState = game.snakesAndScissorsState?.questionState;
    const question = questionState?.question;

    if (!question) return <p>جاري تحميل السؤال...</p>;

    return (
        <Card className="w-full max-w-lg">
            <CardHeader>
                <CardTitle>{question.category}</CardTitle>
                <CardDescription className="text-lg font-semibold">{question.text}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                {question.options.map(option => (
                    <Button key={option} variant="outline" className="w-full justify-start text-base h-12">
                       <Radio className="ml-2"/> {option}
                    </Button>
                ))}
            </CardContent>
        </Card>
    );
};


const MovementRound = ({ game, self }: { game: Game, self: Player }) => {
    const diceRef = useRef<DiceHandle>(null);
    const movementState = game.snakesAndScissorsState?.movementState;

    useEffect(() => {
        if (movementState?.diceValue) {
            diceRef.current?.roll(movementState.diceValue);
        }
    }, [movementState?.diceValue]);

    return (
        <div className="text-center space-y-4">
            <h3 className="text-xl font-bold">نتيجة الرمية!</h3>
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
    const boardSize = game.snakesAndScissorsState?.settings?.boardSize || 100;

    return (
        <div className="w-full h-screen flex flex-col items-center justify-between p-4 bg-gray-100">
            <header className="w-full flex justify-between items-center">
                 <Card>
                    <CardContent className="p-2">
                        <h3 className="text-sm font-bold">لوحة النتائج</h3>
                        {/* Scoreboard content here */}
                    </CardContent>
                 </Card>
                  <Card>
                    <CardContent className="p-2">
                         <h3 className="text-sm font-bold">دور اللاعب</h3>
                         {/* Current player info */}
                    </CardContent>
                 </Card>
            </header>
            
            <main className="flex-grow flex items-center justify-center w-full">
                <div className="grid grid-cols-10 gap-1 p-2 bg-white rounded-lg shadow-lg aspect-square max-w-lg max-h-[70vh]">
                    {Array.from({ length: boardSize }).map((_, index) => {
                        const cellNumber = boardSize - index;
                        return (
                            <div key={index} className="border rounded-md flex items-center justify-center relative aspect-square text-xs">
                                <span className="absolute top-0 right-1 font-bold">{cellNumber}</span>
                                {players.filter(p => p.position === cellNumber).map(p => (
                                    <PlayerAvatar key={p.id} avatarId={p.avatarId} className="w-6 h-6 absolute bottom-0 left-0" />
                                ))}
                            </div>
                        )
                    })}
                </div>
            </main>
            
            <footer className="w-full max-w-lg">
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

