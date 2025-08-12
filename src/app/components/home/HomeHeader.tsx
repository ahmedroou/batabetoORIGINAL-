
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogOut, User, ShieldCheck, Store, Mail as MailIcon, MessageSquarePlus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { ComplaintDialog } from "./Dialogs"; // Assuming this is where it will be
import type { UserProfile } from "@/types";

interface HomeHeaderProps {
    userProfile: UserProfile;
}

export default function HomeHeader({ userProfile }: HomeHeaderProps) {
    const router = useRouter();

    const handleSignOut = async () => {
        await signOut(auth);
        router.push('/');
    };
    
    return (
        <header className="w-full p-4">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Link href="/profile">
                                    <Button variant="ghost" size="icon">
                                        <User className="h-6 w-6 text-primary" />
                                    </Button>
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent><p>ملفك الشخصي</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={handleSignOut}>
                                    <LogOut className="h-6 w-6 text-destructive" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>تسجيل الخروج</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                
                <div className="flex-1"></div>
                
                <div className="flex items-center gap-2">
                    {userProfile.isAdmin && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Link href="/admin">
                                        <Button variant="ghost" size="icon">
                                            <ShieldCheck className="h-6 w-6 text-destructive" />
                                        </Button>
                                    </Link>
                                </TooltipTrigger>
                                <TooltipContent><p>لوحة تحكم الأدمن</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    <ComplaintDialog userProfile={userProfile} />
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Link href="/store">
                                    <Button variant="ghost" size="icon">
                                        <Store className="h-6 w-6 text-primary" />
                                    </Button>
                                </Link>
                            </TooltipTrigger>
                            <TooltipContent><p>المتجر</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>
        </header>
    );
}
