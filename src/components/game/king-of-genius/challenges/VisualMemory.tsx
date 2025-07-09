'use client';

import { useState, useEffect } from 'react';
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

const MEMORIZE_TIME_SECONDS = 5;
const PLAY_TIME_SECONDS = 15;

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
  const [memorizeTimeLeft, setMemorizeTimeLeft] = useState(MEMORIZE_TIME_SECONDS);
  const [playTimeLeft, setPlayTimeLeft] = useState(PLAY_TIME_SECONDS);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [displayImages, setDisplayImages] = useState<DisplayImage[]>([]);

  useEffect(() => {
    // Only prepare images once when they are first received
    if (images.length > 0 && displayImages.length === 0) {
        const enhancedImages = images.map(image => ({
            ...image,
            url: `https://placehold.co/200x200/${randomHexColor()}/${randomHexColor()}.png`
        }));
        
        const shuffled = [...enhancedImages].sort(() => Math.random() - 0.5);
        setDisplayImages(shuffled);
    }
  }, [images, displayImages.length]);


  useEffect(() => {
    const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
    if (myResult) {
      setHasSubmitted(true);
      setPhase('ended');
    } else if (displayImages.length) {
      setPhase('memorize');
    }
  }, [game.challengeState?.results, self.id, displayImages]);

  useEffect(() => {
    if (phase === 'ended' || hasSubmitted) return;

    const timer = setInterval(() => {
      if (phase === 'memorize') {
        setMemorizeTimeLeft(prev => {
          if (prev <= 1) {
            setPhase('play');
            return 0;
          }
          return prev - 1;
        });
      } else if (phase === 'play') {
        setPlayTimeLeft(prev => {
          if (prev <= 1) {
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
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, hasSubmitted, game.id, self.id, toast]);

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

    const timeTaken = PLAY_TIME_SECONDS - playTimeLeft;
    
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


  if (phase === 'loading' || !displayImages.length) {
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

  const timerValue = phase === 'memorize' ? (memorizeTimeLeft / MEMORIZE_TIME_SECONDS) * 100 : (playTimeLeft / PLAY_TIME_SECONDS) * 100;

  return (
    <Card className="w-full max-w-2xl bg-gray-900 text-white border-gray-700 p-4">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2">
          {phase === 'memorize' ? <Brain /> : <Eye />}
          {challenge.name}
        </CardTitle>
        <CardDescription className="text-gray-400 h-10 flex items-center justify-center">
          {phase === 'memorize' ? `احفظ الصور! أمامك ${memorizeTimeLeft} ثانية.` : prompt}
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
            disabled={hasSubmitted || !selectedImageIds.length}
          >
            تأكيد الإجابة
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
