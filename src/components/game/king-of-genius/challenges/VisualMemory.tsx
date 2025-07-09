'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Eye, Brain } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Progress } from '@/components/ui/progress';

const MEMORIZE_TIME_SECONDS = 5;
const PLAY_TIME_SECONDS = 15;

type Phase = 'loading' | 'memorize' | 'play' | 'ended';

interface ImageObject {
  id: string;
  description: string;
}

export function VisualMemory({
  game,
  player,
  self,
  challenge,
}: {
  game: Game;
  player: Player;
  self: Player;
  challenge: GeniusChallenge;
}) {
  const { toast } = useToast();
  const puzzle = game.challengeState?.puzzle;
  const images: ImageObject[] = puzzle?.images ?? [];
  const prompt: string = puzzle?.prompt ?? '';
  const correctImageIds: string[] = puzzle?.correctImageIds ?? [];

  const [phase, setPhase] = useState<Phase>('loading');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [memorizeTimeLeft, setMemorizeTimeLeft] = useState(MEMORIZE_TIME_SECONDS);
  const [playTimeLeft, setPlayTimeLeft] = useState(PLAY_TIME_SECONDS);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [shuffledImages, setShuffledImages] = useState<ImageObject[]>([]);
  const playStartTimeRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Shuffle images only once
  useEffect(() => {
    if (images.length > 0 && shuffledImages.length === 0) {
      setShuffledImages([...images].sort(() => Math.random() - 0.5));
    }
  }, [images, shuffledImages.length]);

  // Detect result already submitted
  useEffect(() => {
    const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
    if (myResult) {
      setHasSubmitted(true);
      setPhase('ended');
    } else if (images.length && prompt && correctImageIds.length) {
      setHasSubmitted(false);
      setPhase('memorize');
      setMemorizeTimeLeft(MEMORIZE_TIME_SECONDS);
      setPlayTimeLeft(PLAY_TIME_SECONDS);
      setSelectedImageIds([]);
    }
  }, [game.challengeState?.results, self.id, images, prompt, correctImageIds]);

  // Timer handler
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  
    if (phase === 'memorize') {
      timerRef.current = setInterval(() => {
        setMemorizeTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setPhase('play');
            playStartTimeRef.current = Date.now();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (phase === 'play' && !hasSubmitted) {
      timerRef.current = setInterval(() => {
        setPlayTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setPhase('ended');
            if (!hasSubmitted) {
              setHasSubmitted(true);
              submitChallengeResult(game.id, self.id, { isCorrect: false, time: PLAY_TIME_SECONDS });
              toast({ title: "انتهى الوقت!", variant: "destructive" });
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, hasSubmitted, game.id, self.id, toast]);
  

  const handleTileClick = (imageId: string) => {
    if (phase !== 'play') return;
    setSelectedImageIds(prev => {
      if (prev.includes(imageId)) {
        return prev.filter(id => id !== imageId);
      } else {
        return [...prev, imageId];
      }
    });
  };

  const handleSubmit = () => {
    if (phase !== 'play' || hasSubmitted) return;

    const timeTaken = playStartTimeRef.current ? (Date.now() - playStartTimeRef.current) / 1000 : PLAY_TIME_SECONDS - playTimeLeft;
    
    const sortedSelected = [...selectedImageIds].sort();
    const sortedCorrect = [...correctImageIds].sort();

    const isCorrect =
      sortedSelected.length === sortedCorrect.length &&
      sortedSelected.every((value, index) => value === sortedCorrect[index]);

    setPhase('ended');
    setHasSubmitted(true);
    submitChallengeResult(game.id, self.id, { isCorrect, time: timeTaken });

    if (isCorrect) {
      toast({
        title: "ذاكرة قوية!",
        description: "لقد وجدت كل الصور الصحيحة.",
        className: "bg-green-100 border-green-500 text-green-700",
      });
    } else {
      toast({
        title: "محاولة خاطئة!",
        description: "لم تكن إجابتك دقيقة.",
        variant: "destructive",
      });
    }
  };

  // Loading state
  if (phase === 'loading' || !shuffledImages.length) {
    return (
      <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
        <CardHeader>
          <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">جاري توليد الصور...</p>
        </CardContent>
      </Card>
    );
  }

  // Result submitted state
  if (hasSubmitted) {
    return (
      <Card className="w-full max-w-md text-center bg-gray-800 text-white border-gray-700">
        <CardHeader>
          <CardTitle className="text-3xl text-primary">{challenge.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <Check className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <p className="text-xl">تم إرسال نتيجتك. في انتظار بقية اللاعبين...</p>
        </CardContent>
      </Card>
    );
  }

  // Timer bar value
  const timerValue =
    phase === 'memorize'
      ? (memorizeTimeLeft / MEMORIZE_TIME_SECONDS) * 100
      : (playTimeLeft / PLAY_TIME_SECONDS) * 100;

  return (
    <Card className="w-full max-w-2xl bg-gray-900 text-white border-gray-700 p-4">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2">
          {phase === 'memorize' ? <Brain /> : <Eye />}
          {challenge.name}
        </CardTitle>
        <CardDescription className="text-gray-400">
          {phase === 'memorize'
            ? `احفظ الصور! أمامك ${memorizeTimeLeft} ثانية.`
            : prompt}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        <div className="w-full bg-gray-800 p-2 rounded-lg">
          <Progress
            value={timerValue}
            className={cn(
              "w-full h-2 bg-gray-700",
              phase === 'memorize'
                ? "[&>*]:bg-blue-500"
                : "[&>*]:bg-red-500"
            )}
          />
        </div>

        <div
          className="grid grid-cols-3 gap-2 md:gap-4"
        >
          <AnimatePresence>
            {shuffledImages.map((image) => (
              <motion.div
                key={image.id}
                layout
                className="aspect-square relative"
                onClick={() => handleTileClick(image.id)}
                style={{ cursor: phase === 'play' ? 'pointer' : 'default', perspective: '1000px' }}
              >
                <div
                    className="relative w-full h-full transition-transform duration-500"
                    style={{ 
                        transformStyle: 'preserve-3d',
                        transform: phase === 'memorize' ? 'rotateY(0deg)' : 'rotateY(180deg)',
                    }}
                >
                    {/* Front of card */}
                    <div
                        className="absolute w-full h-full"
                        style={{ backfaceVisibility: 'hidden' }}
                    >
                        <Image
                            src={`https://placehold.co/200x200.png`}
                            data-ai-hint={image.description}
                            alt={image.description}
                            width={200}
                            height={200}
                            className="w-full h-full object-cover rounded-md"
                            priority
                        />
                    </div>
                    {/* Back of card */}
                    <div
                        className={cn(
                          "absolute w-full h-full flex items-center justify-center bg-gray-700 rounded-md border-4 transition-all",
                          selectedImageIds.includes(image.id)
                            ? "border-green-500"
                            : "border-transparent"
                        )}
                        style={{
                          transform: "rotateY(180deg)",
                          backfaceVisibility: 'hidden',
                        }}
                    >
                        <Check className={cn(
                          "h-12 w-12 text-green-500 transition-opacity",
                          selectedImageIds.includes(image.id)
                            ? "opacity-100"
                            : "opacity-0"
                        )} />
                    </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </CardContent>
      <CardFooter>
        {phase === 'play' && (
          <Button
            onClick={handleSubmit}
            className="w-full"
            size="lg"
            disabled={hasSubmitted || !selectedImageIds.length}
          >
            تأكيد الإجابة
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
