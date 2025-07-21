

"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, User, Mail, CircleDollarSign, ChevronLeft, ChevronRight, Save, Trophy, Gamepad2, Edit, X, Shield, Lock, ShoppingCart, Check } from "lucide-react";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { AVATAR_IDS } from "@/data/avatars";
import { updateUserAvatar, updateUserName, getSocialRankForUser, purchaseAvatar } from "@/lib/actions/user";
import { getAvatarPrices } from "@/app/actions";
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


export default function ProfilePage() {
  const { user, userProfile, loading, socialRanks, refreshUserProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  
  const [currentRank, setCurrentRank] = useState<SocialRank | null>(null);
  
  const [avatarPrices, setAvatarPrices] = useState<Record<string, number>>({});
  const [isLoadingPrices, setIsLoadingPrices] = useState(true);

  const [purchaseCandidate, setPurchaseCandidate] = useState<string | null>(null);


  useEffect(() => {
    if (!loading && userProfile) {
      const rank = getSocialRankForUser(userProfile.leaderboardPoints, socialRanks);
      setCurrentRank(rank);
    }
  }, [userProfile, loading, socialRanks]);

    const fetchPrices = useCallback(async () => {
        setIsLoadingPrices(true);
        const result = await getAvatarPrices();
        if (result.success && result.prices) {
            const priceMap = result.prices.reduce((acc, item) => {
                acc[item.avatarId] = item.price;
                return acc;
            }, {} as Record<string, number>);
            setAvatarPrices(priceMap);
        }
        setIsLoadingPrices(false);
    }, []);

    useEffect(() => {
        fetchPrices();
    }, [fetchPrices]);

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
            setPurchaseCandidate(avatarId);
        }
    };
  
  const handleAvatarSave = async (avatarId: string) => {
    if (!user || !avatarId || avatarId === userProfile?.avatarId) {
        return;
    };
    setIsSubmitting(true);
    try {
        await updateUserAvatar(user.uid, avatarId);
        toast({ title: "تم تحديث شخصيتك بنجاح!" });
    } catch (error: any) {
        toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

    const handlePurchaseConfirm = async () => {
        if (!user || !purchaseCandidate) return;
        
        setIsSubmitting(true);
        const result = await purchaseAvatar(user.uid, purchaseCandidate);
        
        if (result.success) {
            toast({ title: "تم الشراء بنجاح!", description: "تمت إضافة الشخصية إلى مجموعتك." });
            if(refreshUserProfile) refreshUserProfile();
            setSelectedAvatarId(purchaseCandidate);
        } else {
            toast({ title: "فشل الشراء", description: result.error, variant: "destructive" });
        }
        
        setIsSubmitting(false);
        setPurchaseCandidate(null);
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
  
  const RankIcon = currentRank?.icon;

  const purchaseCandidatePrice = purchaseCandidate ? avatarPrices[purchaseCandidate] || 0 : 0;

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
                 <div className="w-full">
                    <h3 className="text-center font-bold mb-2">اختر شخصيتك</h3>
                     <ScrollArea className="h-64 w-full rounded-md border p-4 bg-muted/50">
                        <div className="grid grid-cols-4 gap-4">
                            {AVATAR_IDS.map(avatarId => {
                                const isUnlocked = userProfile.unlockedAvatars.includes(avatarId);
                                const price = avatarPrices[avatarId] || 0;
                                const canAfford = userProfile.coins >= price;
                                
                                return (
                                <div key={avatarId} className="relative group cursor-pointer" onClick={() => handleAvatarClick(avatarId)}>
                                    <PlayerAvatar avatarId={avatarId} className={cn("w-20 h-20 border-4 rounded-lg transition-all", selectedAvatarId === avatarId ? "border-primary" : "border-transparent", !isUnlocked && "opacity-50")}/>
                                    {selectedAvatarId === avatarId && isUnlocked && (
                                       <div className="absolute top-1 right-1 bg-primary text-white rounded-full p-1">
                                           <Check className="w-3 h-3"/>
                                       </div>
                                    )}
                                    {!isUnlocked && (
                                        <div className="absolute inset-0 bg-black/60 rounded-lg flex flex-col items-center justify-center text-white">
                                            <Lock className="w-6 h-6"/>
                                            <div className="flex items-center gap-1 text-sm font-bold">
                                                <CircleDollarSign className="w-4 h-4 text-yellow-400"/>
                                                <span>{price}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                )
                            })}
                        </div>
                     </ScrollArea>
                 </div>
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
                {RankIcon ? <RankIcon className="h-6 w-6 text-gray-500" /> : <Shield className="h-6 w-6 text-gray-500" />}
                <span className="font-bold">{currentRank?.name || '...'}</span>
              </div>
              <div className="flex items-center gap-4 text-lg">
                <CircleDollarSign className="h-6 w-6 text-yellow-500" />
                <span className="font-bold">{userProfile.coins}</span>
                <span className="text-muted-foreground">كوينز</span>
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
      
        <AlertDialog open={!!purchaseCandidate} onOpenChange={(open) => !open && setPurchaseCandidate(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>تأكيد الشراء</AlertDialogTitle>
                    <AlertDialogDescription>
                        هل تريد شراء هذه الشخصية مقابل <strong className="text-yellow-500">{purchaseCandidatePrice} كوينز</strong>؟
                        سيتم خصم المبلغ من رصيدك.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={handlePurchaseConfirm} disabled={isSubmitting || userProfile.coins < purchaseCandidatePrice}>
                        {isSubmitting ? 'جاري الشراء...' : userProfile.coins < purchaseCandidatePrice ? 'لا يوجد رصيد كافي' : 'شراء'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

    </main>
  );
}
