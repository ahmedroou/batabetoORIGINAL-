
"use client";

import { Skeleton } from "@/components/ui/skeleton";

export default function MainLoadingSkeleton() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8">
            <div className="w-full max-w-md space-y-8">
                <Skeleton className="w-32 h-32 rounded-full mx-auto" />
                <Skeleton className="h-10 w-3/4 mx-auto" />
                <Skeleton className="h-8 w-1/2 mx-auto" />
                <div className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </div>
            </div>
        </main>
    );
}
