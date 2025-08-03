import { BrainCircuit, Bomb, Gavel, VenetianMask, Swords } from "lucide-react";
import type { Game } from "@/types";

export const GAME_ICONS: Record<Game['gameType'], React.ElementType> = {
    'king-of-genius': BrainCircuit,
    'trap-answer': Bomb,
    'prison': Gavel,
    'behind-the-mask': VenetianMask,
    'word_war': Swords,
};
