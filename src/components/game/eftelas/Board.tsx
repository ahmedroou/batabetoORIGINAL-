"use client";

import React from 'react';
import type { Game } from '@/types';

interface BoardProps {
    game: Game;
}

export function Board({ game }: BoardProps) {
    // This is a placeholder for the Monopoly board.
    // We will build this out with react-konva or another canvas library in the next steps.

    return (
        <div className="w-full h-full bg-green-200 border-4 border-black p-4 grid grid-cols-11 grid-rows-11 gap-1">
            {/* Top Row */}
            <div className="col-span-11 grid grid-cols-11 gap-1">
                 <div className="bg-white border border-black p-1 text-xs text-center">موقف مجاني</div>
                 <div className="bg-red-400 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-red-400 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-white border border-black p-1 text-xs text-center">حظك</div>
                 <div className="bg-red-400 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-gray-400 border border-black p-1 text-xs text-center">محطة</div>
                 <div className="bg-yellow-400 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-yellow-400 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-white border border-black p-1 text-xs text-center">مرافق</div>
                 <div className="bg-yellow-400 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-white border border-black p-1 text-xs text-center">اذهب للسجن</div>
            </div>

            {/* Middle Section */}
            <div className="col-span-1 h-full grid grid-rows-9 gap-1">
                <div className="bg-orange-400 border border-black p-1 text-xs text-center">عقار</div>
                <div className="bg-orange-400 border border-black p-1 text-xs text-center">عقار</div>
                <div className="bg-white border border-black p-1 text-xs text-center">فرص</div>
                <div className="bg-orange-400 border border-black p-1 text-xs text-center">عقار</div>
                <div className="bg-gray-400 border border-black p-1 text-xs text-center">محطة</div>
                <div className="bg-pink-400 border border-black p-1 text-xs text-center">عقار</div>
                <div className="bg-pink-400 border border-black p-1 text-xs text-center">عقار</div>
                <div className="bg-white border border-black p-1 text-xs text-center">مرافق</div>
                <div className="bg-pink-400 border border-black p-1 text-xs text-center">عقار</div>
            </div>

            <div className="col-span-9 bg-green-300">
                {/* Center of the board */}
            </div>

            <div className="col-span-1 h-full grid grid-rows-9 gap-1">
                 <div className="bg-green-400 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-green-400 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-white border border-black p-1 text-xs text-center">فرص</div>
                 <div className="bg-green-400 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-gray-400 border border-black p-1 text-xs text-center">محطة</div>
                 <div className="bg-white border border-black p-1 text-xs text-center">ضريبة</div>
                 <div className="bg-blue-800 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-white border border-black p-1 text-xs text-center">حظك</div>
                 <div className="bg-blue-800 border border-black p-1 text-xs text-center">عقار</div>
            </div>

             {/* Bottom Row */}
             <div className="col-span-11 grid grid-cols-11 gap-1">
                 <div className="bg-white border border-black p-1 text-xs text-center">السجن</div>
                 <div className="bg-cyan-400 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-cyan-400 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-white border border-black p-1 text-xs text-center">حظك</div>
                 <div className="bg-cyan-400 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-gray-400 border border-black p-1 text-xs text-center">محطة</div>
                 <div className="bg-white border border-black p-1 text-xs text-center">ضريبة</div>
                 <div className="bg-yellow-800 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-white border border-black p-1 text-xs text-center">فرص</div>
                 <div className="bg-yellow-800 border border-black p-1 text-xs text-center">عقار</div>
                 <div className="bg-white border border-black p-1 text-xs text-center">انطلق</div>
            </div>

        </div>
    );
}
