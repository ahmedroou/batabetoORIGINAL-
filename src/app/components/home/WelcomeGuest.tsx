
"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

export default function WelcomeGuest() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4">
            <Card className="w-full max-w-md animate-bounce-in">
                <CardHeader className="text-center">
                    <CardTitle className="flex items-center justify-center gap-2 text-2xl"><Users /> مرحبًا بك!</CardTitle>
                    <CardDescription>ابدأ بتسجيل الدخول أو إنشاء حساب جديد للعب.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Link href="/login" passHref>
                        <Button className="w-full" size="lg">تسجيل الدخول</Button>
                    </Link>
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">أو</span>
                        </div>
                    </div>
                    <Link href="/signup" passHref>
                        <Button variant="secondary" className="w-full" size="lg">إنشاء حساب جديد</Button>
                    </Link>
                </CardContent>
            </Card>
        </main>
    );
}
