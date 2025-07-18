
"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Mail, CircleDollarSign, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { AVATAR_IDS } from "@/data/avatars";
import { updateUserAvatar } from "@/lib/actions/user";


export default function ProfilePage() {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !userProfile) {
      toast({
        title: "غير مصرح لك",
        description: "يجب عليك تسجيل الدخول لعرض هذه الصفحة.",
        variant: "destructive",
      });
      router.push("/login");
    }
    if (userProfile?.avatarId) {
      setSelectedAvatarId(userProfile.avatarId);
    }
  }, [userProfile, loading, router, toast]);

  const handleAvatarCycle = (direction: 'next' | 'prev') => {
      if (!selectedAvatarId) return;
      const currentIndex = AVATAR_IDS.indexOf(selectedAvatarId);
      const nextIndex = direction === 'next' 
        ? (currentIndex + 1) % AVATAR_IDS.length
        : (currentIndex - 1 + AVATAR_IDS.length) % AVATAR_IDS.length;
      setSelectedAvatarId(AVATAR_IDS[nextIndex]);
  };
  
  const handleAvatarSave = async () => {
    if (!user || !selectedAvatarId) return;
    setIsSubmitting(true);
    try {
        await updateUserAvatar(user.uid, selectedAvatarId);
        toast({ title: "تم تحديث شخصيتك بنجاح!" });
        setIsEditingAvatar(false);
    } catch (error) {
        toast({ title: "خطأ", description: "فشل تحديث الشخصية.", variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };


  if (loading || !userProfile) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/40">
        <Card className="w-full max-w-md p-6">
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2 mt-2" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-6 w-1/2" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-6 w-2/3" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-6 w-1/4" />
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/40">
      <Card className="w-full max-w-md animate-bounce-in">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>ملفك الشخصي</span>
            <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
              <ArrowLeft />
            </Button>
          </CardTitle>
          <CardDescription>هنا يمكنك عرض تفاصيل حسابك وتخصيص شخصيتك.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
           <div className="flex flex-col items-center space-y-4">
              {selectedAvatarId && (
                <div className="flex items-center gap-4">
                  {isEditingAvatar && (
                    <Button variant="ghost" size="icon" onClick={() => handleAvatarCycle('prev')}><ChevronRight /></Button>
                  )}
                   <PlayerAvatar avatarId={selectedAvatarId} className="w-32 h-32 rounded-full border-4 border-primary shadow-xl" />
                  {isEditingAvatar && (
                    <Button variant="ghost" size="icon" onClick={() => handleAvatarCycle('next')}><ChevronLeft /></Button>
                  )}
                </div>
              )}
               {isEditingAvatar ? (
                    <div className="flex gap-2">
                        <Button onClick={handleAvatarSave} disabled={isSubmitting}>
                            <Save className="ml-2" /> {isSubmitting ? 'جاري الحفظ...' : 'حفظ'}
                        </Button>
                        <Button variant="outline" onClick={() => { setIsEditingAvatar(false); setSelectedAvatarId(userProfile.avatarId); }}>إلغاء</Button>
                    </div>
                ) : (
                    <Button variant="outline" onClick={() => setIsEditingAvatar(true)}>تغيير الشخصية</Button>
                )}
           </div>

           <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-4 text-lg">
                <User className="h-6 w-6 text-primary" />
                <span className="font-medium">{userProfile.name}</span>
              </div>
              <div className="flex items-center gap-4 text-lg">
                <Mail className="h-6 w-6 text-primary" />
                <span className="text-muted-foreground">{userProfile.email}</span>
              </div>
              <div className="flex items-center gap-4 text-lg">
                <CircleDollarSign className="h-6 w-6 text-yellow-500" />
                <span className="font-bold">{userProfile.coins}</span>
                <span className="text-muted-foreground">كوينز</span>
              </div>
           </div>
        </CardContent>
      </Card>
    </main>
  );
}
