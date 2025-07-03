import type { Timestamp } from 'firebase/firestore';

export interface Player {
  id: string;
  name: string;
  avatarId: string;
  alias?: string;
  role?: 'killer' | 'detective' | 'civilian';
  status: 'alive' | 'killed' | 'voted_out' | 'arrested';
}

export type WhoAmIGameState = "lobby" | "answering" | "guessing" | "round_results" | "final_results";
export type KillerGameState = "lobby" | "aliases" | "roles" | "crime_scene" | "detective_choice" | "night" | "discussion" | "voting_results" | "ended";
export type GameState = WhoAmIGameState | KillerGameState;


// Who guessed whom correctly, and how many times.
// { guesserId: { guessedPlayerId: count } }
export type ScoreMatrix = Record<string, Record<string, number>>; 

export interface CrimeScene {
  victimAlias: string;
  victimBackground: string;
  method: string;
  publicClue: string;
  detailedClue: string;
}

export interface ChatMessage {
  senderId: string;
  senderAlias: string;
  isDetective: boolean;
  text: string;
  timestamp: Timestamp;
}

export interface Game {
  id: string;
  hostId: string;
  gameType: 'who-am-i' | 'killer';
  players: Player[];
  gameState: GameState;
  createdAt: Timestamp;

  // who-am-i specific fields
  round?: number; 
  questions?: string[]; 
  currentQuestion?: string;
  answers?: Record<string, string>; 
  guesses?: Record<string, Record<string, string>>; 
  scoreMatrix?: ScoreMatrix;

  // killer specific fields
  crimeScene?: CrimeScene;
  turn?: number;
  nightAction?: {
    killerId: string;
    victimId: string;
    method: string;
  };
  votes?: Record<string, string>; // { voterId: votedForId }
  lastVoteResult?: {
      tied: boolean;
      eliminatedPlayerAlias?: string;
      eliminatedPlayerRole?: Player['role'];
  };
  messages?: ChatMessage[];
  detectiveArrest?: {
      used: boolean;
  };
  gameResult?: {
    winner: 'killer' | 'detective_civilians';
    message: string;
  };
}
