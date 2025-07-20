

"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, User, Mail, CircleDollarSign, ChevronLeft, ChevronRight, Save, Trophy, Gamepad2, Edit, X, Shield, Lock, ShoppingCart } from "lucide-react";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { AVATAR_IDS } from "@/data/avatars";
import { updateUserAvatar, updateUserName, getSocialRanksForUser } from "@/lib/actions/user";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { AvatarPrice, SocialRank } from '@/types';
import { getAvatarPrices, purchaseAvatarAction } from '@/app/actions';
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
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  
  const [avatarPrices, setAvatarPrices] = useState<AvatarPrice[]>([]);
  const [avatarToPurchase, setAvatarToPurchase] = useState<AvatarPrice | null>(null);
  const [currentRank, setCurrentRank] = useState<SocialRank | null>(null);

  useEffect(() => {
    if (!loading && userProfile) {
      const rank = getSocialRanksForUser(userProfile.leaderboardPoints, socialRanks);
      setCurrentRank(rank);
    }
  }, [userProfile, loading, socialRanks]);


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
    
    const fetchPrices = async () => {
        const { prices } = await getAvatarPrices();
        setAvatarPrices(prices || []);
    };
    fetchPrices();

  }, [userProfile, loading, router, toast]);
  
  const handleAvatarSelect = (avatarId: string) => {
    if (!userProfile) return;
    const priceInfo = avatarPrices.find(p => p.id === avatarId);
    const isPurchased = userProfile.purchasedAvatars?.includes(avatarId);
    
    if (isPurchased) {
        setSelectedAvatarId(avatarId);
    } else {
        const price = priceInfo?.price ?? 0;
        if (price > 0) {
            setAvatarToPurchase({id: avatarId, price});
        } else {
            handlePurchase({ id: avatarId, price: 0 }); // Purchase free avatar directly
        }
    }
  };

  const handlePurchase = async (itemToPurchase: AvatarPrice | null = avatarToPurchase) => {
    if (!user || !itemToPurchase) return;
    setIsSubmitting(true);
    try {
      const result = await purchaseAvatarAction(user.uid, itemToPurchase.id, itemToPurchase.price);
      if (result.success) {
        toast({ title: "تم الشراء بنجاح!", description: "يمكنك الآن استخدام هذا الأفاتار."});
        setSelectedAvatarId(itemToPurchase.id);
        if(refreshUserProfile) refreshUserProfile();
      } else {
        toast({ title: "فشل الشراء", description: result.error, variant: "destructive" });
      }
    } finally {
        setIsSubmitting(false);
        setAvatarToPurchase(null);
    }
  }
  
  const handleAvatarSave = async () => {
    if (!user || !selectedAvatarId || selectedAvatarId === userProfile?.avatarId) {
        setIsEditingAvatar(false);
        return;
    };
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
              {selectedAvatarId && isEditingAvatar && (
                 <div className="w-full">
                    <h3 className="text-center font-bold mb-2">اختر شخصيتك</h3>
                     <ScrollArea className="h-64 w-full rounded-md border p-4 bg-muted/50">
                        <div className="grid grid-cols-4 gap-4">
                            {AVATAR_IDS.map(avatarId => {
                                const priceInfo = avatarPrices.find(p => p.id === avatarId);
                                const isPurchased = userProfile.purchasedAvatars?.includes(avatarId);
                                const price = priceInfo?.price ?? 0;
                                return (
                                <div key={avatarId} className="relative group cursor-pointer" onClick={() => handleAvatarSelect(avatarId)}>
                                    <PlayerAvatar avatarId={avatarId} className={cn("w-20 h-20 border-4 rounded-lg transition-all", selectedAvatarId === avatarId ? "border-primary" : "border-transparent", !isPurchased && "opacity-60")}/>
                                    {!isPurchased && (
                                       <div className="absolute inset-0 bg-black/60 rounded-lg flex flex-col items-center justify-center text-white">
                                           <Lock className="w-6 h-6"/>
                                           <span className="text-xs font-bold flex items-center gap-1">{price} <CircleDollarSign className="w-3 h-3 text-yellow-300"/></span>
                                       </div>
                                    )}
                                    {isPurchased && selectedAvatarId === avatarId && (
                                       <div className="absolute top-1 right-1 bg-primary text-white rounded-full p-1">
                                           <Check className="w-3 h-3"/>
                                       </div>
                                    )}
                                </div>
                                )
                            })}
                        </div>
                     </ScrollArea>
                 </div>
              )}
               {!isEditingAvatar && selectedAvatarId && (
                    <PlayerAvatar avatarId={selectedAvatarId} className="w-32 h-32 rounded-full border-4 border-primary shadow-xl" />
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
                <Shield className="h-6 w-6 text-gray-500" />
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
      
        <AlertDialog open={!!avatarToPurchase} onOpenChange={(open) => !open && setAvatarToPurchase(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>شراء أفاتار</AlertDialogTitle>
                    <AlertDialogDescription>
                        هل أنت متأكد أنك تريد شراء هذا الأفاتار مقابل {avatarToPurchase?.price} كوينز؟
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handlePurchase()} disabled={isSubmitting}>
                        {isSubmitting ? 'جاري الشراء...' : 'نعم، قم بالشراء'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </main>
  );
}
