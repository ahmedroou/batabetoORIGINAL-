"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORIES, AI_CATEGORIES } from "@/data/questions";
import type { Category, AiCategoryValue } from "@/data/questions";
import { getAIQuestion } from "./actions";
import { useToast } from "@/hooks/use-toast";
import { Wand2, Users, UserPlus, Trophy, ArrowRight, Dices } from "lucide-react";

type GameState = "setup" | "category_select" | "question" | "results";

type Player = {
  name: string;
  score: number;
};

// A happy face SVG component
const HappyFace = ({ className }: { className?: string }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
);

// A sad face SVG component
const SadFace = ({ className }: { className?: string }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 15s1.5-2 4-2 4 2 4 2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
);

export default function Home() {
  const [gameState, setGameState] = useState<GameState>("setup");
  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [round, setRound] = useState(0);

  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  
  const [answererAnswer, setAnswererAnswer] = useState("");
  const [guesses, setGuesses] = useState<Record<string, string>>({});
  
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const { toast } = useToast();
  
  const [questionKey, setQuestionKey] = useState(0);

  const answerer = useMemo(() => {
    if (players.length === 0) return null;
    return players[round % players.length];
  }, [players, round]);

  const guessers = useMemo(() => {
    return players.filter((p) => p.name !== answerer?.name);
  }, [players, answerer]);

  const handleAddPlayer = () => {
    if (newPlayerName.trim() && !players.find(p => p.name.toLowerCase() === newPlayerName.trim().toLowerCase())) {
      setPlayers([...players, { name: newPlayerName.trim(), score: 0 }]);
      setNewPlayerName("");
    } else if (players.find(p => p.name.toLowerCase() === newPlayerName.trim().toLowerCase())) {
        toast({
            title: "Player exists",
            description: "A player with this name already exists.",
            variant: "destructive",
        })
    }
  };

  const startGame = () => {
    if (players.length >= 2) {
      setGameState("category_select");
    } else {
      toast({
        title: "Not enough players",
        description: "You need at least 2 players to start the game.",
        variant: "destructive",
      });
    }
  };
  
  const selectCategory = (category: Category) => {
    setSelectedCategory(category);
    const question = category.questions[Math.floor(Math.random() * category.questions.length)];
    setCurrentQuestion(question);
    setQuestionKey(prev => prev + 1);
    setGameState("question");
  };

  const handleGenerateAIQuestion = async (aiCategory: AiCategoryValue) => {
    setIsLoadingAI(true);
    const result = await getAIQuestion(aiCategory);
    setIsLoadingAI(false);

    if (result.error) {
      toast({
        title: "AI Error",
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    setSelectedCategory({ name: "AI Generated", icon: Dices, description: `A unique question about ${aiCategory}.`, questions: [] });
    setCurrentQuestion(result.question);
    setQuestionKey(prev => prev + 1);
    setGameState("question");
  };

  const handleGuessChange = (playerName: string, value: string) => {
    setGuesses(prev => ({ ...prev, [playerName]: value }));
  };

  const revealResults = () => {
    if (!answererAnswer.trim()) {
        toast({ title: "Missing Answer", description: "The answerer must provide an answer.", variant: "destructive" });
        return;
    }
    if (Object.values(guesses).some(g => !g.trim()) || Object.keys(guesses).length < guessers.length) {
        toast({ title: "Missing Guesses", description: "All guessers must submit their guess.", variant: "destructive" });
        return;
    }
    setGameState("results");
  };

  const nextRound = () => {
    const updatedPlayers = players.map(player => {
        const guess = guesses[player.name]?.trim().toLowerCase();
        if (guess && guess === answererAnswer.trim().toLowerCase()) {
            return { ...player, score: player.score + 10 };
        }
        return player;
    });

    setPlayers(updatedPlayers);
    setRound(prev => prev + 1);
    setGameState("category_select");
    setSelectedCategory(null);
    setCurrentQuestion(null);
    setAnswererAnswer("");
    setGuesses({});
  };
  
  const renderSetup = () => (
    <Card className="w-full max-w-md animate-fade-in">
      <CardHeader className="items-center text-center">
        <HappyFace className="w-20 h-20 text-primary opacity-80" />
        <CardTitle className="flex items-center gap-2 pt-2"><Users /> Player Setup</CardTitle>
        <CardDescription>Add at least two players to begin.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input 
            placeholder="Enter player name" 
            value={newPlayerName} 
            onChange={(e) => setNewPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddPlayer()}
          />
          <Button onClick={handleAddPlayer}><UserPlus /> Add</Button>
        </div>
        <div className="space-y-2">
          <Label>Players ({players.length})</Label>
          <ul className="rounded-md border p-2 space-y-1 bg-muted/50 min-h-[50px]">
            {players.map(p => <li key={p.name} className="font-medium">{p.name}</li>)}
          </ul>
        </div>
        <Button onClick={startGame} disabled={players.length < 2} className="w-full" size="lg">
          Start Game <ArrowRight className="ml-2" />
        </Button>
      </CardContent>
    </Card>
  );

  const renderCategorySelect = () => (
    <div className="w-full max-w-4xl animate-fade-in">
        <h1 className="text-3xl font-bold text-center mb-2">Choose a Category</h1>
        <p className="text-muted-foreground text-center mb-6">Round {round + 1}: <span className="font-bold text-primary">{answerer?.name}</span> is answering!</p>
      
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {CATEGORIES.map(cat => (
                <Card key={cat.name} className="hover:shadow-lg hover:-translate-y-1 transition-transform cursor-pointer" onClick={() => selectCategory(cat)}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><cat.icon /> {cat.name}</CardTitle>
                        <CardDescription>{cat.description}</CardDescription>
                    </CardHeader>
                </Card>
            ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wand2 /> AI Question Generator</CardTitle>
          <CardDescription>Feeling adventurous? Let AI create a unique question for you.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
            {AI_CATEGORIES.map(cat => (
                <Button key={cat.value} variant="secondary" onClick={() => handleGenerateAIQuestion(cat.value)} disabled={isLoadingAI}>
                    {isLoadingAI ? "Generating..." : cat.name}
                </Button>
            ))}
        </CardContent>
      </Card>
    </div>
  );

  const renderQuestion = () => (
      <Card className="w-full max-w-2xl animate-fade-in" key={questionKey}>
        <CardHeader>
          <CardTitle className="text-center text-primary">{selectedCategory?.name}</CardTitle>
          <CardDescription className="text-center font-bold text-lg pt-2">{currentQuestion}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="answerer-answer" className="text-lg">Answer for <span className="font-bold text-primary">{answerer?.name}</span> (type your honest answer)</Label>
                <Input id="answerer-answer" type="password" placeholder="Answerer's secret answer..." value={answererAnswer} onChange={e => setAnswererAnswer(e.target.value)} />
            </div>

            <div className="space-y-4">
                <h3 className="font-semibold text-lg">Guessers, lock in your answers!</h3>
                {guessers.map(guesser => (
                    <div className="space-y-2" key={guesser.name}>
                        <Label htmlFor={`guess-${guesser.name}`}>{guesser.name}'s Guess</Label>
                        <Input id={`guess-${guesser.name}`} type="password" placeholder={`What do you think ${answerer?.name} will say?`} value={guesses[guesser.name] || ''} onChange={e => handleGuessChange(guesser.name, e.target.value)} />
                    </div>
                ))}
            </div>
            <Button onClick={revealResults} className="w-full" size="lg">Reveal Answers</Button>
        </CardContent>
      </Card>
  );

  const renderResults = () => {
    const correctGuessers = guessers.filter(p => guesses[p.name]?.trim().toLowerCase() === answererAnswer.trim().toLowerCase());
    return (
        <Card className="w-full max-w-2xl animate-fade-in">
            <CardHeader>
                <CardTitle className="text-center">Results!</CardTitle>
                <CardDescription className="text-center text-base font-semibold pt-2">{currentQuestion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="text-center p-4 rounded-lg bg-primary/10">
                    <Label className="text-sm font-semibold">The actual answer was...</Label>
                    <p className="text-2xl font-bold text-primary">{answererAnswer}</p>
                </div>
                
                <div className="space-y-3">
                    {guessers.map(player => {
                        const isCorrect = guesses[player.name]?.trim().toLowerCase() === answererAnswer.trim().toLowerCase();
                        return (
                            <div key={player.name} className={`p-3 rounded-md border flex items-center gap-4 ${isCorrect ? 'border-primary/50' : 'border-destructive/50'}`}>
                                {isCorrect ? 
                                    <HappyFace className="w-10 h-10 text-primary shrink-0" /> : 
                                    <SadFace className="w-10 h-10 text-destructive shrink-0" />
                                }
                                <div>
                                    <p className="font-bold">{player.name} guessed:</p>
                                    <p className="text-lg">{guesses[player.name]}</p>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {correctGuessers.length > 0 ? (
                    <div className="text-center flex flex-col items-center gap-2">
                        <HappyFace className="w-24 h-24 text-primary" />
                        <p className="text-lg font-semibold">🎉 +10 points for {correctGuessers.map(p => p.name).join(', ')}! 🎉</p>
                    </div>
                ) : (
                    <div className="text-center flex flex-col items-center gap-2">
                        <SadFace className="w-24 h-24 text-destructive" />
                        <p className="text-center text-lg font-semibold">Oof, no one guessed it right!</p>
                    </div>
                )}

                <Button onClick={nextRound} className="w-full" size="lg">Next Round <ArrowRight className="ml-2" /></Button>
            </CardContent>
        </Card>
    );
  };

  const renderScoreboard = () => (
      <Card className="fixed bottom-4 right-4 w-64 hidden md:block animate-fade-in">
          <CardHeader>
              <CardTitle className="flex items-center gap-2"><Trophy /> Scoreboard</CardTitle>
          </CardHeader>
          <CardContent>
              <ul className="space-y-2">
                  {players.sort((a,b) => b.score - a.score).map(p => (
                      <li key={p.name} className="flex justify-between font-medium">
                          <span>{p.name}</span>
                          <span>{p.score}</span>
                      </li>
                  ))}
              </ul>
          </CardContent>
      </Card>
  )

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 relative bg-background">
      <div className="absolute top-4 left-4">
          <h1 className="text-2xl font-bold text-primary">Deep Dive</h1>
          <p className="text-sm text-muted-foreground">The Friendship Game</p>
      </div>
      
      {gameState === "setup" && renderSetup()}
      {gameState === "category_select" && renderCategorySelect()}
      {gameState === "question" && renderQuestion()}
      {gameState === "results" && renderResults()}

      {players.length > 0 && gameState !== "setup" && renderScoreboard()}
    </main>
  );
}
