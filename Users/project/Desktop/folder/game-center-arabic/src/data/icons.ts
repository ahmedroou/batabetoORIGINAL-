

import { BrainCircuit, Bomb, VenetianMask, Swords, Palette, TestTube, Dices, LandPlot } from "lucide-react";
import type { Game } from "@/types";

export const GAME_ICONS: Record<string, React.ElementType> = {
    'king-of-genius': BrainCircuit,
    'trap-answer': Bomb,
    'behind-the-mask': VenetianMask,
    'word_war': Swords,
    'draw-and-guess': Palette,
    'prison': TestTube,
    'smart-merchant': Dices,
};

export const GAME_TYPE_NAMES: Record<Game['gameType'], string> = {
    'king-of-genius': 'ساحة العباقرة',
    'trap-answer': 'الجواب المفخخ',
    'behind-the-mask': 'خلف القناع',
    'word_war': 'حرب الكلمات',
    'draw-and-guess': 'لعبة رسمة',
    'prison': 'السجن',
    'smart-merchant': 'التاجر الذكي',
};

