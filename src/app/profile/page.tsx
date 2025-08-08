

"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, User, Mail, CircleDollarSign, Save, Trophy, Gamepad2, Edit, X, Shield, Lock, ShoppingCart, Check, Gavel, Star, VenetianMask, MessageSquareWarning, Diamond, ShieldCheck, Users as UsersIcon } from "lucide-react";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { AVATAR_IDS } from "@/data/avatars";
import { updateUserAvatar, updateUserName, purchaseAvatar, updateUserGender, payPunishmentTax, purchasePunishmentAvatar } from "@/lib/actions/user";
import { getAvatarPrices, getPunishmentAvatarPrices } from "@/lib/actions/admin";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { SocialRank, AvatarPrice } from '@/types';
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


export default function ProfilePage() {
  const { user, userProfile, loading, socialRanks, refreshUserProfile, getSocialRankForUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  
  const [currentRank, setCurrentRank] = useState<SocialRank | null>(null);
  
  const [isPayingTax, setIsPayingTax] = useState(false);
  
  const currentPunishment = useMemo(() => {
    if (!userProfile) return null;
    if (userProfile.originalAvatarToRevert?.until && new Date(userProfile.originalAvatarToRevert.until) > new Date()) {
        return { type: 'avatar', details: userProfile.originalAvatarToRevert };
    }
    if (userProfile.humiliation?.until && new Date(userProfile.humiliation.until) > new Date()) {
        return { type: 'humiliation', details: userProfile.humiliation };
    }
    return null;
  }, [userProfile]);

  useEffect(() => {
    if (!loading && userProfile) {
      const rank = getSocialRankForUser(userProfile.leaderboardPoints);
      setCurrentRank(rank);
    }
  }, [userProfile, loading, getSocialRankForUser]);

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
  
    const handleAvatarClick = async (avatarId: string) => {
        if (!userProfile) return;
        
        const isUnlocked = userProfile.unlockedAvatars.includes(avatarId);
            
        if (isUnlocked) {
            setSelectedAvatarId(avatarId);
            await handleAvatarSave(avatarId);
        } else {
            toast({title: "غير مملوكة", description: "يجب عليك شراء هذه الشخصية من المتجر أولاً.", variant: "destructive"});
        }
    };
  
  const handleAvatarSave = async (avatarId: string) => {
    if (!user || !avatarId || avatarId === userProfile?.avatarId) {
        return;
    };
    setIsSubmitting(true);
    try {
        const result = await updateUserAvatar(user.uid, avatarId);
        if (result.success) {
            toast({ title: "تم تحديث شخصيتك بنجاح!" });
             if (refreshUserProfile) await refreshUserProfile();
        } else {
             toast({ title: "خطأ", description: result.error, variant: "destructive" });
        }
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
  
  const handlePayTax = async () => {
      if (!user) return;
      setIsPayingTax(true);
      const result = await payPunishmentTax(user.uid);
      if(result.success) {
          toast({ title: "نجاح!", description: result.message });
          if(refreshUserProfile) refreshUserProfile();
      } else {
          toast({ title: "خطأ", description: result.error, variant: "destructive" });
      }
      setIsPayingTax(false);
  }
  
  const RankIcon = currentRank?.icon;
  const activeDecree = userProfile?.decrees?.find(d => d.until && new Date(d.until) > new Date());
  
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
             <div className="flex gap-2">
                 <Button variant="outline" size="sm" asChild>
                    <Link href="/store"><ShoppingCart className="ml-2 h-4 w-4"/> المتجر</Link>
                </Button>
                <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
                  <ArrowLeft />
                </Button>
             </div>
          </CardTitle>
          <CardDescription>هنا يمكنك عرض تفاصيل حسابك وتخصيص شخصيتك.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div>
                <h3 className="text-center font-bold mb-2">اختر شخصيتك</h3>
                <ScrollArea className="h-64 w-full rounded-md border p-4 bg-muted/50">
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-4">
                        {userProfile.unlockedAvatars.map(avatarId => {
                            const isSelected = selectedAvatarId === avatarId;
                            return (
                                <div key={avatarId} className="relative group cursor-pointer" onClick={() => handleAvatarClick(avatarId)}>
                                    <PlayerAvatar avatarId={avatarId} className={cn("w-full aspect-square border-4 rounded-lg transition-all", isSelected ? "border-primary" : "border-transparent")}/>
                                    {isSelected && (
                                        <div className="absolute top-1 right-1 bg-primary text-white rounded-full p-1 shadow-lg">
                                            <Check className="w-3 h-3"/>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                 </ScrollArea>
            </div>
           
            {currentPunishment && (
                <div className="p-3 rounded-lg border bg-destructive/10 text-destructive-foreground">
                    <h4 className="font-bold text-destructive flex items-center gap-2"><Gavel/> أنت تحت تأثير عقوبة!</h4>
                    <p className="text-sm mt-1">
                        {currentPunishment.type === 'avatar' ? `تم تغيير شخصيتك بواسطة ${currentPunishment.details.byName}.` : `تم إذلالك بواسطة ${currentPunishment.details.byName}.`}
                    </p>
                    <Button onClick={handlePayTax} disabled={isPayingTax || userProfile.coins < currentPunishment.details.taxToLift} className="w-full mt-2" variant="destructive">
                        {isPayingTax ? "جاري الدفع..." : `ادفع ضريبة ${currentPunishment.details.taxToLift} كوينز لإزالة العقوبة`}
                    </Button>
                </div>
            )}

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
                            <Save className="h-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setIsEditingName(false)} disabled={isSubmitting}>
                            <X className="h-4 h-4" />
                        </Button>
                    </div>
                ) : (
                    <>
                        <span className="font-medium flex-grow">{userProfile.name}</span>
                        {!userProfile.hasChangedName && (
                            <Button variant="ghost" size="icon" onClick={() => setIsEditingName(true)}>
                                <Edit className="h-4 h-4" />
                            </Button>
                        )}
                    </>
                )}
              </div>
              <div className="flex items-center gap-4 text-lg">
                <Mail className="h-6 w-6 text-primary" />
                <span className="text-muted-foreground">{userProfile.email}</span>
              </div>
              {userProfile.gender && (
                <div className="flex items-center gap-4 text-lg">
                    <VenetianMask className="h-6 w-6 text-primary" />
                    <span className="font-bold">{userProfile.gender === 'male' ? 'ذكر' : 'أنثى'}</span>
                </div>
              )}
               <div className="flex items-center gap-4 text-lg">
                {RankIcon ? <RankIcon className="h-6 w-6 text-gray-500" /> : <Shield className="h-6 w-6 text-gray-500" />}
                <span className="font-bold">{activeDecree?.title || currentRank?.name || '...'}</span>
              </div>
               {userProfile.clan && (
                  <div className="flex items-center gap-4 text-lg">
                    <UsersIcon className="h-6 w-6 text-primary" />
                    <span className="font-bold">{userProfile.clan.name}</span>
                  </div>
              )}
              <div className="flex items-center gap-4 text-lg">
                <CircleDollarSign className="h-6 w-6 text-yellow-500" />
                <span className="font-bold">{userProfile.coins}</span>
                <span className="text-muted-foreground">كوينز</span>
              </div>
              <div className="flex items-center gap-4 text-lg">
                <Diamond className="h-6 w-6 text-blue-500" />
                <span className="font-bold">{userProfile.diamonds}</span>
                <span className="text-muted-foreground">ألماس</span>
              </div>
               <div className="flex items-center gap-4 text-lg">
                <Trophy className="h-6 w-6 text-yellow-500" />
                <span className="font-bold">{userProfile.leaderboardPoints || 0}</span>
                <span className="text-muted-foreground">نقاط صدارة</span>
              </div>
              <div className="flex items-center gap-4 text-lg">
                <Gamepad2 className="h-6 w-6 text-gray-500" />
                <span className="font-bold">{userProfile.gamesPlayed || 0}</span>
                <span className="text-muted-foreground">مباريات</span>
              </div>
           </div>
        </CardContent>
      </Card>
    </main>
  );
}
