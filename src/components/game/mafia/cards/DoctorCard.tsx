
"use client";

import type { Role } from "@/types";
import { HeartPulse } from "lucide-react";

export function DoctorCard({ role }: { role: Role }) {
    return (
        <div className="w-full h-full p-4 flex flex-col items-center justify-between bg-green-900/50 rounded-xl border-2 border-green-500">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-green-300">{role.name}</h2>
                <p className="text-sm font-semibold text-green-200">أنت من فريق الخير</p>
            </div>
            <div className="my-4">
                 <HeartPulse className="w-32 h-32 text-green-400" />
            </div>
            <p className="text-center text-green-100 text-sm px-2">
                {role.description}
            </p>
        </div>
    );
}
