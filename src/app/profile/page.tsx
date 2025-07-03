
"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Mail, CircleDollarSign } from "lucide-react";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && !userProfile) {
      toast({
        title: "غير مصرح لك",
        description: "يجب عليك تسجيل الدخول لعرض هذه الصفحة.",
        variant: "destructive",
      });
      router.push("/login");
    }
  }, [userProfile, loading, router, toast]);

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
          <CardDescription>هنا يمكنك عرض تفاصيل حسابك.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-lg">
          <div className="flex items-center gap-4">
            <User className="h-6 w-6 text-primary" />
            <span className="font-medium">{userProfile.name}</span>
          </div>
          <div className="flex items-center gap-4">
            <Mail className="h-6 w-6 text-primary" />
            <span className="text-muted-foreground">{userProfile.email}</span>
          </div>
          <div className="flex items-center gap-4">
            <CircleDollarSign className="h-6 w-6 text-yellow-500" />
            <span className="font-bold">{userProfile.coins}</span>
            <span className="text-muted-foreground">كوينز</span>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
