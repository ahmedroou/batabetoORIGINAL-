
"use client";

import type { Role } from "@/types";
import { Search } from "lucide-react";

export function DetectiveCard({ role }: { role: Role }) {
    return (
        <div className="w-full h-full p-4 flex flex-col items-center justify-between bg-blue-900/50 rounded-xl border-2 border-blue-500">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-blue-300">{role.name}</h2>
                <p className="text-sm font-semibold text-blue-200">أنت من فريق الخير</p>
            </div>
            <div className="my-4">
                 <Search className="w-32 h-32 text-blue-400" />
            </div>
            <p className="text-center text-blue-100 text-sm px-2">
                {role.description}
            </p>
        </div>
    );
}
