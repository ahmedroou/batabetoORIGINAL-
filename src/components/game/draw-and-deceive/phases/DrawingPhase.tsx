
'use client';

import React, { useCallback, useMemo, useState } from 'react';
import type { Game, Player } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitCorrectAnswerAndStartDrawing, submitDrawing } from '@/lib/actions/draw-and-deceive';
import { Loader2, Send, Wand2, Eye, Brain } from 'lucide-react';
import { DrawingCanvas } from './DrawingCanvas';

interface DrawingPhaseProps {
  game: Game;
  self: Player;
}

const WAITING_CARD_PROPS = {
  title: "في انتظار الفنان",
  description: "يقوم الفنان حاليًا باختيار كلمة سرية ورسمها. استعد لوضع فخك!",
  icon: Brain,
};

const WritingView = ({ artistName }: { artistName: string }) => (
  <Card className="w-full max-w-lg text-center">
    <CardHeader>
      <CardTitle>{`في انتظار ${artistName}...`}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="animate-pulse">
        يقوم الفنان الآن بكتابة وصف الرسمة...
      </p>
    </CardContent>
  </Card>
);

const WaitingView = () => (
    <Card className="w-full max-w-lg text-center">
        <CardHeader>
             <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                <Brain className="w-8 h-8 text-primary"/>
                {WAITING_CARD_PROPS.title}
            </CardTitle>
        </CardHeader>
        <CardContent>
            <p className="animate-pulse text-lg text-muted-foreground">{WAITING_CARD_PROPS.description}</p>
        </CardContent>
    </Card>
);

export function DrawingPhase({ game, self }: DrawingPhaseProps) {
  const { toast } = useToast();
  const state = game.drawAndDeceiveState!;
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [drawingDataUrl, setDrawingDataUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<'answer' | 'drawing' | false>(false);
  const [isArtistDone, setIsArtistDone] = useState(!!state.drawingDataUrl);

  const artist = useMemo(() => game.players.find(p => p.id === state.artistId), [game.players, state.artistId]);
  const isMyTurnAsArtist = artist?.id === self.id;
  const hasAnswerBeenSet = !!state.correctAnswer;
  
  const handleAnswerSubmit = async () => {
    if (!correctAnswer.trim() || isSubmitting) return;
    setIsSubmitting('answer');
    try {
      await submitCorrectAnswerAndStartDrawing(game.id, self.id, correctAnswer);
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDrawingSubmit = async () => {
    if (!drawingDataUrl || isSubmitting) return;
    setIsSubmitting('drawing');
    try {
      await submitDrawing(game.id, self.id, drawingDataUrl);
      setIsArtistDone(true);
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDrawEnd = useCallback((dataUrl: string) => {
    setDrawingDataUrl(dataUrl);
  }, []);

  if (!isMyTurnAsArtist) {
    if (!hasAnswerBeenSet) return <WritingView artistName={artist?.name || 'الفنان'} />;
    return <WaitingView />;
  }
  
  if (isArtistDone) {
      return (
          <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <CardTitle>تم استلام الرسمة بنجاح!</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="animate-pulse">في انتظار اللاعبين الآخرين لوضع فخاخهم...</p>
                </CardContent>
            </Card>
      )
  }

  if (!hasAnswerBeenSet) {
    return (
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <CardTitle>أنت الفنان!</CardTitle>
          <CardDescription>اكتب الوصف الصحيح لرسمتك (كلمة أو كلمتين فقط).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              placeholder="مثال: قطار سريع"
              maxLength={30}
              disabled={isSubmitting === 'answer'}
            />
            <Button onClick={handleAnswerSubmit} disabled={isSubmitting === 'answer' || !correctAnswer.trim()}>
              {isSubmitting === 'answer' ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full h-[85vh] max-w-5xl flex flex-col items-center gap-4">
      <div className="w-full flex-grow min-h-0">
        <DrawingCanvas onDrawEnd={handleDrawEnd} />
      </div>
      <Button size="lg" onClick={handleDrawingSubmit} disabled={isSubmitting === 'drawing' || !drawingDataUrl} className="w-full max-w-md">
        {isSubmitting === 'drawing' ? <Loader2 className="animate-spin" /> : "إرسال الرسمة"}
      </Button>
    </div>
  );
}
