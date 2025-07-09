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
import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';

const MEMORIZE_DURATION_MS = 5000;
const PLAY_DURATION_MS = 15000;

type Phase = 'loading' | 'memorize' | 'play' | 'ended';

interface ImageObject {
  id: string;
  description: string;
}

interface DisplayImage extends ImageObject {
    url: string;
}

const randomHexColor = () => Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

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
  const [displayTime, setDisplayTime] = useState(0);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [displayImages, setDisplayImages] = useState<DisplayImage[]>([]);
  const imagesProcessed = useRef(false);

  useEffect(() => {
    if (images.length > 0 && !imagesProcessed.current) {
        imagesProcessed.current = true;
        const enhancedImages = images.map(image => ({
            ...image,
            url: `https://placehold.co/200x200/${randomHexColor()}/${randomHexColor()}.png`
        }));
        
        const shuffled = [...enhancedImages].sort(() => Math.random() - 0.5);
        setDisplayImages(shuffled);
    }
  }, [images]);

  useEffect(() => {
    const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
    if (myResult) {
      setHasSubmitted(true);
      setPhase('ended');
    }
  }, [game.challengeState?.results, self.id]);

  useEffect(() => {
    if (hasSubmitted || !game.challengeState?.challengeEndsAt || displayImages.length === 0) return;

    const endTime = game.challengeState.challengeEndsAt.toMillis();
    const playStartTime = endTime - PLAY_DURATION_MS;

    const updatePhase = () => {
        const now = Date.now();

        if (now < playStartTime) {
            setPhase('memorize');
            setDisplayTime(Math.max(0, Math.round((playStartTime - now) / 1000)));
        } else if (now < endTime) {
            setPhase('play');
            setDisplayTime(Math.max(0, Math.round((endTime - now) / 1000)));
        } else {
            setPhase('ended');
            setDisplayTime(0);
            if (!hasSubmitted) { 
                setHasSubmitted(true);
                submitChallengeResult(game.id, self.id, { isCorrect: false, time: PLAY_DURATION_MS / 1000 });
                toast({ title: "انتهى الوقت!", variant: "destructive" });
            }
        }
    };

    const intervalId = setInterval(updatePhase, 500);
    updatePhase(); 

    return () => clearInterval(intervalId);

  }, [game.challengeState?.challengeEndsAt, hasSubmitted, game.id, self.id, toast, displayImages.length]);

  const handleTileClick = (imageId: string) => {
    if (phase !== 'play') return;
    setSelectedImageIds(prev =>
      prev.includes(imageId)
        ? prev.filter(id => id !== imageId)
        : [...prev, imageId]
    );
  };

  const handleSubmit = () => {
    if (phase !== 'play' || hasSubmitted) return;

    const timeTaken = (PLAY_DURATION_MS / 1000) - displayTime;
    
    const sortedSelected = [...selectedImageIds].sort();
    const sortedCorrect = [...correctImageIds].sort();

    const isCorrect =
      sortedSelected.length === sortedCorrect.length &&
      sortedSelected.every((value, index) => value === sortedCorrect[index]);

    setPhase('ended');
    setHasSubmitted(true);
    submitChallengeResult(game.id, self.id, { isCorrect, time: timeTaken });

    toast({
      title: isCorrect ? "ذاكرة قوية!" : "محاولة خاطئة!",
      description: isCorrect ? "لقد وجدت كل الصور الصحيحة." : "لم تكن إجابتك دقيقة.",
      variant: isCorrect ? "default" : "destructive",
      className: isCorrect ? "bg-green-100 border-green-500 text-green-700" : "",
    });
  };
  
  const renderGrid = () => {
    return displayImages.map(image => (
      <div key={image.id} className="aspect-square" style={{ perspective: '1000px' }}>
        <motion.div
          className="relative w-full h-full"
          style={{ transformStyle: 'preserve-3d' }}
          animate={{ rotateY: phase === 'memorize' ? 0 : 180 }}
          transition={{ duration: 0.5 }}
          onClick={() => handleTileClick(image.id)}
        >
          {/* Front of card (Image) */}
          <div
            className="absolute w-full h-full"
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
          >
            <Image
              src={image.url}
              data-ai-hint={image.description}
              alt={image.description}
              width={200}
              height={200}
              className="w-full h-full object-cover rounded-md"
              unoptimized
            />
          </div>
          {/* Back of card (Clickable Area) */}
          <div
            className={cn(
              "absolute w-full h-full flex items-center justify-center bg-gray-700 rounded-md border-4 transition-all",
              selectedImageIds.includes(image.id) ? "border-green-500" : "border-transparent",
              phase === 'play' && 'cursor-pointer'
            )}
            style={{
              transform: "rotateY(180deg)",
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden'
            }}
          >
            <Check
              className={cn(
                "h-12 w-12 text-green-500 transition-opacity",
                selectedImageIds.includes(image.id) ? "opacity-100" : "opacity-0"
              )}
            />
          </div>
        </motion.div>
      </div>
    ));
  };


  if (phase === 'loading' || displayImages.length === 0) {
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

  const timerValue = phase === 'memorize' ? (displayTime / (MEMORIZE_DURATION_MS / 1000)) * 100 : (displayTime / (PLAY_DURATION_MS / 1000)) * 100;

  return (
    <Card className="w-full max-w-2xl bg-gray-900 text-white border-gray-700 p-4">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2">
          {phase === 'memorize' ? <Brain /> : <Eye />}
          {challenge.name}
        </CardTitle>
        <CardDescription className="text-gray-400 h-10 flex items-center justify-center">
          {phase === 'memorize' ? `احفظ الصور! أمامك ${displayTime} ثانية.` : prompt}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        <div className="w-full bg-gray-800 p-2 rounded-lg">
          <Progress
            value={timerValue}
            className={cn("w-full h-2 bg-gray-700", phase === 'memorize' ? "[&>*]:bg-blue-500" : "[&>*]:bg-red-500")}
          />
        </div>
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          {renderGrid()}
        </div>
      </CardContent>
      <CardFooter>
        {phase === 'play' && (
          <Button
            onClick={handleSubmit}
            className="w-full"
            size="lg"
            disabled={hasSubmitted || selectedImageIds.length === 0}
          >
            تأكيد الإجابة
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
