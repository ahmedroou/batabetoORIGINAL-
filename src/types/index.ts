import type { Timestamp } from 'firebase/firestore';

export interface Player {
  id: string;
  name: string;
  score: number;
  avatarId: string;
}

export type GameState = "lobby" | "category_select" | "question" | "results";

export interface Game {
  id: string;
  players: Player[];
  gameState: GameState;
  round: number;
  answererId?: string;
  guessers: string[];
  selectedCategory?: string;
  currentQuestion?: string;
  answererAnswer?: string;
  guesses: Record<string, string>;
  createdAt: Timestamp;
}
