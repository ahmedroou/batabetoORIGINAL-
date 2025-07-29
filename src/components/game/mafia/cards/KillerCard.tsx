
"use client";

import type { Role } from "@/types";
import { Skull } from "lucide-react";

export function KillerCard({ role }: { role: Role }) {
    return (
        <div className="w-full h-full p-4 flex flex-col items-center justify-between bg-red-900/50 rounded-xl border-2 border-red-500">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-red-300">{role.name}</h2>
                <p className="text-sm font-semibold text-red-200">أنت من فريق المافيا</p>
            </div>
            <div className="my-4">
                 <Skull className="w-32 h-32 text-red-400" />
            </div>
            <p className="text-center text-red-100 text-sm px-2">
                {role.description}
            </p>
        </div>
    );
}
