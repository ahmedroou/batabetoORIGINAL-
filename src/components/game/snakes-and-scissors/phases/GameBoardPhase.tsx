
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
import { Swords, Check, X, Shield, Users, Radio, Loader2, GitCommitVertical, GitBranch, ArrowUpRight, ArrowDownLeft, Crown } from 'lucide-react';
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
                    {isCorrect ? 'استعد لرمي النرد!' : 'للأسف، ستتراجع للخلف.'}
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

const generateSerpentineCoordinates = (boardSize: number, numCols: number, containerWidth: number, containerHeight: number) => {
    const coords: { [key: number]: { x: number; y: number } } = {};
    const numRows = Math.ceil(boardSize / numCols);
    
    // Use a slightly larger portion of the container to allow for margins
    const usableWidth = containerWidth * 0.95;
    const usableHeight = containerHeight * 0.95;

    const cellWidth = usableWidth / numCols;
    const cellHeight = usableHeight / numRows;
    const cellSize = Math.min(cellWidth, cellHeight);
    
    const cellMargin = cellSize * 0.1; // 10% margin
    const effectiveCellSize = cellSize - cellMargin;

    const boardPixelWidth = (effectiveCellSize + cellMargin) * numCols;
    const boardPixelHeight = (effectiveCellSize + cellMargin) * numRows;

    const offsetX = (containerWidth - boardPixelWidth) / 2;
    const offsetY = (containerHeight - boardPixelHeight) / 2;


    for (let i = 0; i < boardSize; i++) {
        const cellNumber = i + 1;
        const row = Math.floor(i / numCols);
        let col = i % numCols;

        if (row % 2 !== 0) {
            col = numCols - 1 - col;
        }

        coords[cellNumber] = {
            x: offsetX + col * (effectiveCellSize + cellMargin),
            y: offsetY + (numRows - 1 - row) * (effectiveCellSize + cellMargin),
        };
    }
    return { coords, cellSize: effectiveCellSize };
};


export function GameBoardPhase({ game, self }: { game: Game, self: Player }) {
    const turnPhase = game.snakesAndScissorsState?.turnPhase;
    const [boardContainerRef, setBoardContainerRef] = useState<HTMLDivElement | null>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });


    useEffect(() => {
        const updateSize = () => {
            if (boardContainerRef) {
                setContainerSize({
                    width: boardContainerRef.offsetWidth,
                    height: boardContainerRef.offsetHeight,
                });
            }
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, [boardContainerRef]);


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
    const numCols = useMemo(() => {
        if (boardSize <= 30) return 6;
        if (boardSize <= 50) return 8;
        return 10;
    }, [boardSize]);
    const currentTurnPlayer = game.players.find(p => p.id === game.snakesAndScissorsState?.turnOrder[game.snakesAndScissorsState.currentTurnIndex]);
    
    const { coords: cellCoordinates, cellSize } = useMemo(() => 
        generateSerpentineCoordinates(boardSize, numCols, containerSize.width, containerSize.height),
    [boardSize, numCols, containerSize.width, containerSize.height]);

    return (
        <div className="w-full h-screen flex items-center justify-center p-4 bg-gray-800">
            <div className="w-full h-full max-w-7xl max-h-[90vh] grid grid-cols-4 gap-4">
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

                <div ref={setBoardContainerRef} className="col-span-2 relative bg-gradient-to-br from-purple-900/50 via-slate-800 to-indigo-900/50 rounded-lg shadow-2xl overflow-hidden">
                    {containerSize.width > 0 && (
                         <div className="w-full h-full relative">
                            {Object.entries(cellCoordinates).map(([cellNumStr, coords]) => {
                                const cellNumber = parseInt(cellNumStr, 10);
                                const boardSquare = board[cellNumber - 1];
                                const hasSpecial = boardSquare?.type !== 'normal';
                                
                                return (
                                    <div key={cellNumber} className="absolute flex items-center justify-center" style={{ left: coords.x, top: coords.y, width: cellSize, height: cellSize }}>
                                        <div className={cn("w-full h-full bg-slate-700/30 flex items-center justify-center border border-slate-600/50 rounded-md")}>
                                            {cellNumber === 1 && <span className="text-white font-bold text-xs">START</span>}
                                            {cellNumber === boardSize && <Crown className="w-5 h-5 text-yellow-400" />}
                                           {!hasSpecial && cellNumber !== 1 && cellNumber !== boardSize && <span className="text-slate-500 font-bold text-xs">{cellNumber}</span>}
                                           {hasSpecial && boardSquare?.type === 'ladder' && <ArrowUpRight className="w-5 h-5 text-green-400" />}
                                           {hasSpecial && boardSquare?.type === 'snake' && <ArrowDownLeft className="w-5 h-5 text-red-400" />}
                                        </div>
                                    </div>
                                );
                            })}
                            
                            {players.filter(p => p.position > 0).map((p) => {
                                const coords = cellCoordinates[p.position];
                                if (!coords) return null;
                                
                                const playersOnSameCell = players.filter(other => other.position === p.position);
                                const myIndexOnCell = playersOnSameCell.findIndex(other => other.id === p.id);
                                const offsetFactor = 0.25; 
                                const offsetX = (myIndexOnCell - (playersOnSameCell.length - 1) / 2) * cellSize * offsetFactor;
                                const offsetY = (myIndexOnCell - (playersOnSameCell.length - 1) / 2) * cellSize * offsetFactor;


                                return (
                                    <motion.div
                                        key={`avatar-${p.id}`}
                                        layoutId={`player-avatar-${p.id}`}
                                        className="absolute z-10"
                                        initial={{ x: coords.x + offsetX, y: coords.y + offsetY }}
                                        animate={{ x: coords.x + offsetX, y: coords.y + offsetY }}
                                        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                                        style={{ width: cellSize * 0.7, height: cellSize * 0.7 }}
                                    >
                                        <PlayerAvatar avatarId={p.avatarId} className="w-full h-full border-2 border-white rounded-full shadow-lg" />
                                    </motion.div>
                                );
                            })}
                         </div>
                    )}
                     <div className="absolute bottom-0 left-0 right-0 h-16 flex justify-center items-center gap-2 p-2 bg-slate-900/50 rounded-b-lg">
                        {players.filter(p => p.position === 0).map(p => (
                             <motion.div key={`start-avatar-${p.id}`} layoutId={`player-avatar-${p.id}`}>
                                <PlayerAvatar avatarId={p.avatarId} className="w-10 h-10 border-2 border-primary rounded-full" />
                            </motion.div>
                        ))}
                    </div>
                </div>

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
