'use client';

import { useState, useEffect } from 'react';
// استيراد الأنواع والمكونات من ملفاتك الأخرى
import type { Game, Player, GeniusChallenge } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';
import { Check, Loader2, Footprints } from 'lucide-react';
import { submitChallengeResult } from '@/lib/actions/king-of-genius';
import { cn } from '@/lib/utils';

// تحديد حجم الشبكة
const GRID_SIZE = 5;

// دالة لتوليد مسار منظم وواضح
// المسار يبدأ من الزاوية العليا اليمنى (GRID_SIZE - 1, 0)
// وينتهي في الزاوية السفلية اليسرى (0, GRID_SIZE - 1)
const generateRandomPath = () => {
  const path = [];
  let currentX = GRID_SIZE - 1; // إحداثي X الحالي (البداية من أقصى اليمين)
  let currentY = 0;             // إحداثي Y الحالي (البداية من الأعلى)

  path.push({ x: currentX, y: currentY }); // إضافة نقطة البداية إلى المسار

  // الاستمرار في توليد المسار حتى نصل إلى نقطة النهاية
  while (currentX !== 0 || currentY !== GRID_SIZE - 1) {
    const possibleMoves = [];

    // إذا لم نصل إلى أقصى اليسار بعد، يمكننا التحرك لليسار
    if (currentX > 0) {
      possibleMoves.push({ dx: -1, dy: 0 }); // حركة لليسار (إنقاص X)
    }
    // إذا لم نصل إلى الأسفل بعد، يمكننا التحرك للأسفل
    if (currentY < GRID_SIZE - 1) {
      possibleMoves.push({ dx: 0, dy: 1 }); // حركة للأسفل (زيادة Y)
    }

    let nextMove;
    if (possibleMoves.length === 0) {
        // هذا الشرط يجب ألا يتحقق في ظل منطق المسار الموجه نحو الهدف
        // يشير إلى أننا عالقون أو وصلنا إلى النهاية
        break;
    } else if (possibleMoves.length === 1) {
        // إذا كان هناك خيار واحد فقط (إما لليسار أو للأسفل)، نختاره
        nextMove = possibleMoves[0];
    } else {
        // إذا كان كلا الاتجاهين (يسار وأسفل) ممكنين، نختار عشوائيًا بينهما
        // هذا يضمن مسارًا واحدًا ولكنه ليس مستقيمًا تمامًا
        nextMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
    }

    // تحديث الإحداثيات الحالية بناءً على الحركة المختارة
    currentX += nextMove.dx;
    currentY += nextMove.dy;
    path.push({ x: currentX, y: currentY }); // إضافة النقطة الجديدة إلى المسار
  }

  return path;
};

export function PathOfSurvival({ game, player, self, challenge }: { game: Game, player: Player, self: Player, challenge: GeniusChallenge }) {
  const { toast } = useToast();
  // المسار يتم توليده الآن داخل المكون باستخدام generateRandomPath
  const [path] = useState<{ x: number, y: number }[]>(generateRandomPath);
  
  const [gameState, setGameState] = useState<'preview' | 'play' | 'submitted'>('preview');
  const [userPath, setUserPath] = useState<{ x: number, y: number }[]>([]);
  const [startTime, setStartTime] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  
  useEffect(() => {
    // التحقق مما إذا كان اللاعب قد أرسل نتيجته بالفعل في اللعبة الحالية
    const myResult = game.challengeState?.results?.find(r => r.playerId === self.id);
    if (myResult) {
      setGameState('submitted'); // إذا تم الإرسال، نضع حالة اللعبة على "تم الإرسال"
      setHasSubmitted(true);     // ونحدد أن اللاعب قد أرسل نتيجته
      return;
    }

    // إذا كان المسار موجودًا (وهو كذلك دائمًا الآن لأنه يتم توليده محليًا)
    // نبدأ مؤقت المعاينة
    if (path.length > 0) { // تأكد من أن المسار غير فارغ قبل بدء المؤقت
        const timer = setTimeout(() => {
            setGameState('play'); // بعد 3 ثوانٍ، تنتقل اللعبة إلى وضع "اللعب"
            setStartTime(Date.now()); // تسجيل وقت بدء اللعب لحساب المدة
        }, 3000);
        return () => clearTimeout(timer); // تنظيف المؤقت عند إلغاء تحميل المكون
    }
  }, [game.challengeState, self.id, path]); // يعتمد على حالة اللعبة، معرف اللاعب الذاتي، والمسار

  // دالة معالجة النقر على خلايا الشبكة
  const handleCellClick = async (x: number, y: number) => {
    // لا يمكن النقر إلا إذا كانت اللعبة في وضع "اللعب" ولم يتم إرسال النتيجة بعد
    if (gameState !== 'play' || hasSubmitted) return;
    // منع النقر على خلية تم النقر عليها مسبقًا في مسار المستخدم
    if (userPath.some(p => p.x === x && p.y === y)) return;

    // الحصول على الخطوة المتوقعة التالية في المسار الصحيح
    const currentExpectedStep = path[userPath.length];

    // التحقق مما إذا كانت الخلية التي تم النقر عليها هي الخطوة الصحيحة التالية
    if (currentExpectedStep && currentExpectedStep.x === x && currentExpectedStep.y === y) {
        const newPath = [...userPath, { x, y }]; // إضافة الخلية الصحيحة إلى مسار المستخدم
        setUserPath(newPath); // تحديث حالة مسار المستخدم

        // إذا أكمل المستخدم المسار بأكمله بنجاح
        if (newPath.length === path.length) {
            const endTime = Date.now(); // تسجيل وقت الانتهاء
            setGameState('submitted');   // تغيير حالة اللعبة إلى "تم الإرسال"
            setHasSubmitted(true);       // تحديد أن اللاعب قد أرسل نتيجته
            // عرض رسالة نجاح باستخدام Toast
            toast({ title: "نجاة!", description: "لقد عبرت المسار بنجاح!", className: "bg-green-100 border-green-500 text-green-700" });
            try {
                // إرسال نتيجة التحدي إلى الخادم
                await submitChallengeResult(game.id, self.id, { isCorrect: true, time: (endTime - startTime) / 1000 });
            } catch (error: any) {
                // عرض رسالة خطأ إذا فشل الإرسال
                toast({ title: "خطأ", description: error.message, variant: "destructive" });
            }
        }
    } else {
        // إذا نقر المستخدم على خلية خاطئة، يخسر اللعبة فورًا
        const endTime = Date.now(); // تسجيل وقت الانتهاء
        setGameState('submitted');   // تغيير حالة اللعبة إلى "تم الإرسال"
        setHasSubmitted(true);       // تحديد أن اللاعب قد أرسل نتيجته
        // عرض رسالة خطأ باستخدام Toast
        toast({ title: "مسار خاطئ!", description: "لقد انحرفت عن الطريق.", variant: "destructive" });
        try {
            // إرسال نتيجة الخسارة إلى الخادم
            await submitChallengeResult(game.id, self.id, { isCorrect: false, time: (endTime - startTime) / 1000 });
        } catch (error: any) {
            // عرض رسالة خطأ إذا فشل الإرسال
            toast({ title: "خطأ", description: error.message, variant: "destructive" });
        }
    }
  };

  // إذا كان اللاعب قد أرسل نتيجته بالفعل، نعرض رسالة الانتظار
  if (hasSubmitted) {
    return (
      <Card className="w-full max-w-md bg-white text-center">
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

  // تحديد نقطة البداية والنهاية من المسار الذي تم توليده
  const startPoint = path[0];
  const endPoint = path[path.length - 1];

  return (
    <Card className="w-full max-w-md bg-white">
      <CardHeader className="text-center">
        {/* عنوان اللعبة مع أيقونة */}
        <CardTitle className="text-3xl text-primary flex items-center justify-center gap-2"><Footprints/>{challenge.name}</CardTitle>
        {/* وصف اللعبة بناءً على الحالة الحالية */}
        <CardDescription className="text-muted-foreground mt-2">
          {gameState === 'preview' ? '👁️ احفظ المسار... سيختفي بعد لحظات!' : '🧩 أعد رسم المسار الصحيح!'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center p-4">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}>
          {/* رسم خلايا الشبكة */}
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, index) => {
            const x = index % GRID_SIZE; // إحداثي X للخلية
            const y = Math.floor(index / GRID_SIZE); // إحداثي Y للخلية
            
            // التحقق مما إذا كانت الخلية جزءًا من المسار الصحيح
            const isPathCell = path.some((p: any) => p.x === x && p.y === y);
            // التحقق مما إذا كانت الخلية جزءًا من المسار الذي رسمه المستخدم
            const isUserPathCell = userPath.some(p => p.x === x && p.y === y);
            // التحقق مما إذا كانت الخلية هي نقطة البداية أو النهاية
            const isStart = startPoint.x === x && startPoint.y === y;
            const isEnd = endPoint.x === x && endPoint.y === y;

            return (
              <Button
                key={`${x}-${y}`} // مفتاح فريد للزر
                variant="outline" // نوع الزر (من shadcn/ui)
                className={cn(
                  "w-14 h-14 sm:w-16 sm:h-16 transition-all duration-200 p-0 border-2 flex items-center justify-center",
                  // تلوين المسار باللون الذهبي في وضع المعاينة
                  gameState === 'preview' && isPathCell ? 'bg-amber-300 border-amber-400' : 'bg-slate-200 hover:bg-slate-300 border-slate-300',
                  // تلوين مسار المستخدم باللون الأزرق في وضع اللعب
                  gameState === 'play' && isUserPathCell && 'bg-blue-400 border-blue-500',
                  // تغيير مؤشر الفأرة وتعطيل الأزرار حسب حالة اللعبة
                  gameState !== 'play' ? 'cursor-not-allowed' : 'cursor-pointer'
                )}
                onClick={() => handleCellClick(x, y)} // معالج النقر
                disabled={gameState !== 'play'} // تعطيل الزر إذا لم تكن اللعبة في وضع اللعب
              >
                <span className="text-xl">
                  {/* عرض رموز البداية والنهاية */}
                  {isStart ? '🏁' : isEnd ? '🏆' : ''}
                </span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
