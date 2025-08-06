
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Game, Player, SnakesAndScissorsQuestion } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '../../PlayerAvatar';
import * as actions from '@/lib/actions/snakes-and-scissors';
import Dice, { DiceHandle } from '../Dice';
import { Swords, Check, X, Shield, Users, Radio, Loader2, GitCommitVertical, GitBranch, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
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

  return <div>جولة حجرة ورقة مقص</div>;
};

const QuestionRound = ({ game, self }: { game: Game, self: Player }) => {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

    const questionState = game.snakesAndScissorsState?.questionState;
    const question = questionState?.question;
    const myAnswerData = questionState?.answeredBy?.[self.id];

    const currentTurnPlayerId = game.snakesAndScissorsState?.turnOrder[game.snakesAndScissorsState.currentTurnIndex];
    const amITurnPlayer = self.id === currentTurnPlayerId;
    
    if (!question) return <p>جاري تحميل السؤال...</p>;

    const handleAnswer = async () => {
        if (!selectedAnswer || isSubmitting) return;
        setIsSubmitting(true);
        const result = await actions.answerQuestion(game.id, self.id, selectedAnswer);
        if (result.error) {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
            setIsSubmitting(false);
        }
    };
    
    if (myAnswerData) {
        const isCorrect = myAnswerData.isCorrect;
        return (
             <div className="text-center space-y-4">
                 <h3 className={cn("text-2xl font-bold", isCorrect ? "text-green-500" : "text-red-500")}>
                    {isCorrect ? "إجابة صحيحة!" : "إجابة خاطئة!"}
                </h3>
                 <p className="animate-pulse">
                     {amITurnPlayer ? (isCorrect ? 'استعد لرمي النرد!' : 'ستتراجع للخلف...') : 'في انتظار اللاعب صاحب الدور...'}
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
            case 'category_selection': return <CategorySelection game={game} self={self} />;
            case 'rps_round': return <RpsRound game={game} self={self} />;
            case 'question': return <QuestionRound game={game} self={self} />;
            case 'movement': return <MovementRound game={game} self={self} />;
            default: return <p>مرحلة غير معروفة: {turnPhase}</p>;
        }
    };
    
    const players = game.players.filter(p => p.status !== 'left');
    const board = game.snakesAndScissorsState?.board || [];
    const boardSize = game.snakesAndScissorsState?.settings?.boardSize || 100;
    const currentTurnPlayer = game.players.find(p => p.id === game.snakesAndScissorsState?.turnOrder[game.snakesAndScissorsState.currentTurnIndex]);

    const cellCoordinates = useMemo(() => {
        const coords: { [key: number]: { x: number; y: number } } = {};
        const numRows = Math.ceil(Math.sqrt(boardSize));
        const numCols = numRows;
        const cellW = 100 / numCols;
        const cellH = 100 / numRows;

        for (let i = 0; i < boardSize; i++) {
            const cellNumber = i + 1;
            const row = Math.floor(i / numCols);
            let col = i % numCols;

            if (row % 2 !== 0) { // Reverse column order for odd rows (from right to left)
                col = numCols - 1 - col;
            }
            
            // Y is inverted because we start from the bottom
            coords[cellNumber] = { x: col * cellW, y: (numRows - 1 - row) * cellH };
        }
        return coords;
    }, [boardSize]);


    return (
        <div className="w-full h-screen flex items-center justify-center p-4 bg-gray-800">
            <div className="w-full h-full max-w-7xl max-h-[90vh] grid grid-cols-4 gap-4">
                {/* Player List */}
                <Card className="col-span-1 bg-slate-900/50 text-white border-slate-700">
                    <CardHeader className="p-3">
                        <CardTitle className="text-xl flex items-center gap-2"><Users/> اللاعبون</CardTitle>
                    </CardHeader>
                    <CardContent className="p-2 space-y-1">
                        {players.map(p => (
                             <div key={p.id} className={cn("p-2 rounded-md flex justify-between items-center text-sm transition-all duration-300 border-l-4", p.id === currentTurnPlayer?.id ? 'bg-primary/20 border-primary' : 'bg-slate-800/50 border-transparent')}>
                                <div className="flex items-center gap-2">
                                    <PlayerAvatar avatarId={p.avatarId} className="w-8 h-8"/>
                                    <span className="font-bold">{p.name}</span>
                                </div>
                                <span className="font-mono font-bold text-lg">{p.position || 0}</span>
                             </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Game Board */}
                <div className="col-span-2 relative bg-gradient-to-br from-purple-900/50 via-slate-800 to-indigo-900/50 rounded-lg p-4 shadow-2xl">
                    <div className="w-full h-full relative">
                        {/* Lines for snakes and ladders */}
                        {board.map((square, index) => {
                            if (square.type === 'normal' || !square.to) return null;
                            const startCoords = cellCoordinates[index + 1];
                            const endCoords = cellCoordinates[square.to];
                            if (!startCoords || !endCoords) return null;
                            
                            const isSnake = square.type === 'snake';
                            const color = isSnake ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 197, 94, 0.7)';
                             
                            return (
                                <svg key={`line-${index}`} className="absolute top-0 left-0 w-full h-full" style={{ overflow: 'visible' }}>
                                    <line
                                        x1={`${startCoords.x + 5}%`} y1={`${startCoords.y + 5}%`}
                                        x2={`${endCoords.x + 5}%`} y2={`${endCoords.y + 5}%`}
                                        stroke={color}
                                        strokeWidth="4"
                                        strokeDasharray={isSnake ? "4 4" : "none"}
                                        markerEnd={isSnake ? "url(#arrow-red)" : "url(#arrow-green)"}
                                    />
                                    <defs>
                                        <marker id="arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(239, 68, 68, 0.7)" /></marker>
                                        <marker id="arrow-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(34, 197, 94, 0.7)" /></marker>
                                    </defs>
                                </svg>
                            );
                        })}

                        {/* Player Avatars on Board */}
                        {players.map((p, pIndex) => {
                            if (p.position === 0) return null; // Don't show on board if at start
                            const coords = cellCoordinates[p.position];
                            if (!coords) return null;
                            
                            const playersOnSameCell = players.filter(other => other.position === p.position);
                            const myIndexOnCell = playersOnSameCell.findIndex(other => other.id === p.id);
                            const offset = myIndexOnCell * 20 - (playersOnSameCell.length-1) * 10;
                            
                            return (
                                <motion.div
                                    key={`avatar-${p.id}`}
                                    layoutId={`player-avatar-${p.id}`}
                                    className="absolute"
                                    initial={{ x: `${coords.x}%`, y: `${coords.y}%` }}
                                    animate={{ x: `${coords.x}%`, y: `${coords.y}%` }}
                                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                                    style={{ width: '10%', height: '10%', transform: `translate(${offset}%, ${offset}%)` }}
                                >
                                    <PlayerAvatar avatarId={p.avatarId} className="w-full h-full border-2 border-white rounded-full shadow-lg" />
                                </motion.div>
                            );
                        })}

                        {/* Board Cells */}
                        {Array.from({ length: boardSize }).map((_, i) => {
                            const cellNumber = i + 1;
                            const coords = cellCoordinates[cellNumber];
                            const boardSquare = board[cellNumber - 1];
                            const hasSpecial = boardSquare?.type !== 'normal';
                            
                            return (
                                <div key={cellNumber} className="absolute flex items-center justify-center" style={{ left: `${coords.x}%`, top: `${coords.y}%`, width: '10%', height: '10%' }}>
                                    <div className="w-full h-full bg-slate-700/30 rounded-full flex items-center justify-center">
                                       {!hasSpecial && <span className="text-slate-500 font-bold text-xs">{cellNumber}</span>}
                                       {hasSpecial && boardSquare?.type === 'ladder' && <ArrowUpRight className="w-5 h-5 text-green-400" />}
                                       {hasSpecial && boardSquare?.type === 'snake' && <ArrowDownLeft className="w-5 h-5 text-red-400" />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                     {/* Starting Line */}
                    <div className="absolute bottom-0 left-0 right-0 h-16 flex justify-center items-center gap-2 p-2 bg-slate-900/50 rounded-b-lg">
                        {players.filter(p => p.position === 0).map(p => (
                             <motion.div key={`start-avatar-${p.id}`} layoutId={`player-avatar-${p.id}`}>
                                <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 border-2 border-primary rounded-full" />
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Action Panel */}
                <Card className="col-span-1 bg-slate-900/50 text-white border-slate-700 flex flex-col justify-center">
                    <CardContent className="p-4">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={turnPhase}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                            >
                                {renderTurnPhase()}
                            </motion.div>
                        </AnimatePresence>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
