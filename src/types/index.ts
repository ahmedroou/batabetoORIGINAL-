import type { Timestamp } from 'firebase/firestore';

export interface Player {
  id: string;
  name: string;
  avatarId: string;
}

export type GameState = "lobby" | "answering" | "guessing" | "round_results" | "final_results";

// Who guessed whom correctly, and how many times.
// { guesserId: { guessedPlayerId: count } }
export type ScoreMatrix = Record<string, Record<string, number>>; 

export interface Game {
  id: string;
  players: Player[];
  gameState: GameState;
  round: number; // 0 to 14
  questions: string[]; // 15 questions for the game
  currentQuestion: string;
  
  // Data for the current round
  answers: Record<string, string>; // { playerId: answer }
  guesses: Record<string, Record<string, string>>; // { guesserId: { subjectPlayerId: guessedPlayerId } }

  // Overall game score
  scoreMatrix: ScoreMatrix;
  
  createdAt: Timestamp;
}
