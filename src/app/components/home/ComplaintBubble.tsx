"use client";

import { useState } from "react";
import type { UserProfile } from "@/types";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus } from "lucide-react";
import { ComplaintDialog } from "./HomeHeader";

interface ComplaintBubbleProps {
    userProfile: UserProfile | null;
}

export default function ComplaintBubble({ userProfile }: ComplaintBubbleProps) {
    if (!userProfile) {
        return null;
    }

    return (
        <div className="fixed bottom-5 left-5 z-50">
            <ComplaintDialog
                userProfile={userProfile}
                trigger={
                    <Button size="icon" className="rounded-full w-14 h-14 shadow-lg bg-primary hover:bg-primary/90 animate-pulse-glow">
                        <MessageSquarePlus className="w-7 h-7" />
                    </Button>
                }
            />
        </div>
    );
}
