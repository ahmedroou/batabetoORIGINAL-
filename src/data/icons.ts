import { BrainCircuit, Bomb, VenetianMask, Swords, Palette, TestTube, Dices, LandPlot } from "lucide-react";
import type { Game } from "@/types";

export const GAME_ICONS: Record<string, React.ElementType> = {
    'king-of-genius': BrainCircuit,
    'trap-answer': Bomb,
    'behind-the-mask': VenetianMask,
    'word_war': Swords,
    'draw-and-guess': Palette,
    'prison': TestTube,
    'snakes_and_scissors': Dices,
    'monopoly': LandPlot,
};
