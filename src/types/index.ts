import type { Timestamp } from 'firebase/firestore';

export interface Player {
  id: string;
  name: string;
  avatarId: string;
  
  // For killer game
  alias?: string;
  role?: 'killer' | 'detective' | 'civilian';
  isAlive?: boolean;
  isVotedOut?: boolean;
}

export type WhoAmIGameState = "lobby" | "answering" | "guessing" | "round_results" | "final_results";
export type KillerGameState = "lobby" | "aliases" | "roles" | "crime_scene" | "night" | "day" | "voting" | "voting_results" | "ended";
export type GameState = WhoAmIGameState | KillerGameState;


// Who guessed whom correctly, and how many times.
// { guesserId: { guessedPlayerId: count } }
export type ScoreMatrix = Record<string, Record<string, number>>; 

export interface InitialCrimeScene {
    victimAlias: string;
    victimBackground: string;
    method: string;
    publicClue: string;
    detailedClue: string;
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
  turn?: number;
  nightAction?: {
    killerId: string;
    victimId: string;
    method: string;
  };
  initialCrimeScene?: InitialCrimeScene;
  votes?: Record<string, string>; // { voterId: votedForId }
  gameResult?: {
    winner: 'killer' | 'detective_civilians';
    message: string;
    votedOutPlayerAlias?: string;
    votedOutPlayerRole?: 'killer' | 'detective' | 'civilian';
  };
}
