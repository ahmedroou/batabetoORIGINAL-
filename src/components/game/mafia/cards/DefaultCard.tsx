
"use client";

import type { Role } from "@/types";
import { VenetianMask } from "lucide-react";

export function DefaultCard({ role }: { role: Role }) {
    const isMafia = role.team === 'mafia';
    return (
        <div className="w-full h-full p-4 flex flex-col items-center justify-between bg-gray-800 rounded-xl border-2 border-gray-600">
            <div className="text-center">
                <h2 className={`text-2xl font-bold ${isMafia ? 'text-red-400' : 'text-blue-400'}`}>{role.name}</h2>
                <p className={`text-sm font-semibold ${isMafia ? 'text-red-300' : 'text-blue-300'}`}>
                    أنت من فريق {isMafia ? 'المافيا' : 'الخير'}
                </p>
            </div>
            <div className="my-4">
                 <VenetianMask className="w-32 h-32 text-gray-500" />
            </div>
            <p className="text-center text-gray-300 text-sm px-2">
                {role.description}
            </p>
        </div>
    );
}
