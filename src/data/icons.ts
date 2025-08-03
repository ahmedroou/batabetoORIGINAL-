import { BrainCircuit, Bomb, Gavel, VenetianMask, Swords, Building } from "lucide-react";
import type { Game } from "@/types";

export const GAME_ICONS: Record<Game['gameType'], React.ElementType> = {
    'king-of-genius': BrainCircuit,
    'trap-answer': Bomb,
    'prison': Gavel,
    'behind-the-mask': VenetianMask,
    'word_war': Swords,
    'the_castle': Building,
};
