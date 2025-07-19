
"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, User, Mail, CircleDollarSign, ChevronLeft, ChevronRight, Save, Trophy, Gamepad2, Edit, X, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { AVATAR_IDS } from "@/data/avatars";
import { updateUserAvatar, updateUserName } from "@/lib/actions/user";
import { ScrollArea } from "@/components/ui/scroll-area";


export default function ProfilePage() {
  const { user, userProfile, loading, refreshUserProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");


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
    if (userProfile?.name) {
      setNewName(userProfile.name);
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
    } catch (error: any) {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleNameSave = async () => {
    if (!user || !newName.trim() || newName.trim() === userProfile?.name) {
        setIsEditingName(false);
        return;
    }
    if (newName.trim().length < 2) {
        toast({ title: "الاسم قصير جدًا", description: "يجب أن يتكون الاسم من حرفين على الأقل.", variant: "destructive" });
        return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateUserName(user.uid, newName.trim());
      if (result.success) {
        toast({ title: "تم تحديث اسمك بنجاح!" });
        setIsEditingName(false);
        if (refreshUserProfile) refreshUserProfile();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
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
      <Card className="w-full max-w-lg animate-bounce-in">
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
                {isEditingName ? (
                    <div className="flex-grow flex items-center gap-2">
                        <Input 
                            value={newName} 
                            onChange={(e) => setNewName(e.target.value)}
                            className="h-9"
                            disabled={isSubmitting}
                        />
                        <Button size="icon" className="h-9 w-9" onClick={handleNameSave} disabled={isSubmitting}>
                            <Save className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setIsEditingName(false)} disabled={isSubmitting}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <>
                        <span className="font-medium flex-grow">{userProfile.name}</span>
                        {!userProfile.hasChangedName && (
                            <Button variant="ghost" size="icon" onClick={() => setIsEditingName(true)}>
                                <Edit className="h-4 w-4" />
                            </Button>
                        )}
                    </>
                )}
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
               <div className="flex items-center gap-4 text-lg">
                <Trophy className="h-6 w-6 text-yellow-500" />
                <span className="font-bold">{userProfile.leaderboardPoints || 0}</span>
                <span className="text-muted-foreground">نقاط الصدارة</span>
              </div>
              <div className="flex items-center gap-4 text-lg">
                <Gamepad2 className="h-6 w-6 text-gray-500" />
                <span className="font-bold">{userProfile.gamesPlayed || 0}</span>
                <span className="text-muted-foreground">مباريات</span>
              </div>
              <div className="flex items-center gap-4 text-lg">
                <Trophy className="h-6 w-6 text-amber-500" />
                <span className="font-bold">{userProfile.trophies || 0}</span>
                <span className="text-muted-foreground">كؤوس</span>
              </div>
           </div>
            <div className="space-y-4 pt-4 border-t">
                <h3 className="text-lg font-bold flex items-center gap-2"><Shield /> الدوريات التي انضممت إليها</h3>
                <ScrollArea className="h-40 w-full rounded-md border p-2 bg-background">
                    {userProfile.leagues && userProfile.leagues.length > 0 ? (
                        userProfile.leagues.map(league => (
                            <div key={league.id} className="p-2 mb-2 rounded-md bg-muted flex justify-between items-center">
                                <div>
                                    <p className="font-semibold">{league.name}</p>
                                    <p className="text-xs text-muted-foreground">ID: {league.id}</p>
                                </div>
                                <Button variant="ghost" size="sm">عرض</Button>
                            </div>
                        ))
                    ) : (
                        <p className="text-center text-muted-foreground p-4">لم تنضم إلى أي دوري بعد.</p>
                    )}
                </ScrollArea>
            </div>
        </CardContent>
      </Card>
    </main>
  );
}
