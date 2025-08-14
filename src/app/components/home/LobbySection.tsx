"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LogIn, Users, ClipboardPaste, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { joinGameRoom } from "@/lib/actions/room";
import ActiveLobbiesList from "./ActiveLobbiesList";
import type { Game } from "@/types";

interface LobbySectionProps {
  onLobbiesUpdate?: (lobbies: Game[]) => void;
}

const MAX_CODE_LEN = 6;
const extractCode = (text: string) => {
  // يلتقط أول رمز مكوّن من 6 أحرف/أرقام من أي نص/رابط
  const match = text.toUpperCase().match(/[A-Z0-9]{6}/);
  return match ? match[0] : "";
};

export default function LobbySection({ onLobbiesUpdate }: LobbySectionProps) {
  const [gameId, setGameId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const isValid = useMemo(() => gameId.length === MAX_CODE_LEN, [gameId]);

  const handleJoin = async (id: string) => {
    const code = extractCode(id);

    if (!user || !userProfile?.avatarId) {
      toast({ title: "الرجاء اختيار شخصية من ملفك الشخصي أولاً", variant: "destructive", duration: 3000 });
      return;
    }

    if (!code) {
      toast({ title: "الرجاء إدخال رمز غرفة صالح", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    const result = await joinGameRoom(code, user.uid, userProfile.avatarId);

    if (result.error) {
      toast({ title: "خطأ", description: result.error, variant: "destructive" });
      setIsLoading(false);
    } else if (result.gameId && result.player) {
      sessionStorage.setItem(`player-id-${result.gameId}`, result.player.id);
      router.push(`/game/${result.gameId}`);
    }
  };

  const normalizeInput = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_CODE_LEN);

  const handlePasteClick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const code = extractCode(text);
      if (code) {
        setGameId(code);
        toast({ title: "تم لصق الرمز", description: code });
      } else {
        toast({ title: "لم أجد رمزًا صالحًا في الحافظة", variant: "destructive" });
      }
    } catch {
      toast({ title: "لا يمكن الوصول إلى الحافظة", description: "اسمح بالأذونات أو الصق يدويًا.", variant: "destructive" });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* بطاقة الانضمام السريع */}
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background/60 to-fuchsia-500/10 backdrop-blur-xl shadow-xl">
        {/* زينة تدرج دائرية */}
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="pointer-events-none absolute -top-20 -left-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl"
        />
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl"
        />

        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5" /> الانضمام السريع
          </CardTitle>
          <CardDescription>عندك رمز غرفة؟ اكتبه أو الصقه هنا للدخول فورًا.</CardDescription>
        </CardHeader>

        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleJoin(gameId);
            }}
          >
            <div className="flex w-full max-w-md mx-auto items-center gap-2 rtl:space-x-reverse">
              <Input
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                aria-label="رمز الغرفة"
                placeholder="ABC123"
                value={gameId}
                onChange={(e) => setGameId(normalizeInput(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleJoin(gameId);
                  }
                }}
                className="text-center tracking-[0.4em] font-mono text-lg h-12 rounded-xl border-primary/30 focus-visible:ring-2 focus-visible:ring-primary/40"
              />

              <Button type="button" variant="outline" onClick={handlePasteClick} className="h-12 rounded-xl">
                <ClipboardPaste className="h-5 w-5" />
              </Button>

              <Button
                type="submit"
                className="h-12 rounded-xl min-w-[110px] inline-flex items-center justify-center gap-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  <motion.span
                    className="inline-flex items-center gap-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <Sparkles className="h-5 w-5 animate-pulse" /> جاري الدخول…
                  </motion.span>
                ) : (
                  <>
                    <LogIn className="h-5 w-5" /> انضم
                  </>
                )}
              </Button>
            </div>

            {/* حالة صحة الرمز */}
            <div className="flex items-center justify-center gap-2 text-sm">
              {isValid ? (
                <span className="inline-flex items-center gap-1 text-emerald-500">
                  <CheckCircle2 className="h-4 w-4" /> جاهز للانضمام
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <AlertCircle className="h-4 w-4" /> الرمز مكوّن من 6 أحرف/أرقام
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* قائمة الغرف النشطة */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <ActiveLobbiesList onJoin={handleJoin} onLobbiesUpdate={onLobbiesUpdate as any} />
      </motion.div>
    </div>
  );
}
