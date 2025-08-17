
      

import { BrainCircuit, Bomb, VenetianMask, Swords, Palette, TestTube, Dices, LandPlot, Building2, HelpCircle, Brush } from "lucide-react";
import type { Game } from "@/types";

export const GAME_ICONS: Record<string, React.ElementType> = {
    'king-of-genius': BrainCircuit,
    'trap-answer': Bomb,
    'behind-the-mask': VenetianMask,
    'word_war': Swords,
    'prison': TestTube,
    'educated-merchant': Building2,
    'quiz-swap': HelpCircle,
    'draw-and-deceive': Brush,
};

export const GAME_TYPE_NAMES: Record<Game['gameType'], string> = {
    'king-of-genius': 'ساحة العباقرة',
    'trap-answer': 'الجواب المفخخ',
    'behind-the-mask': 'خلف القناع',
    'word_war': 'حرب الكلمات',
    'prison': 'السجن',
    'educated-merchant': 'التاجر المتعلم',
    'quiz-swap': 'تبديل الأسئلة',
    'draw-and-deceive': 'ارسم واخدع'
};


    