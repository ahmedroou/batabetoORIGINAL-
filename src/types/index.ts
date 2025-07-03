import type { Timestamp } from 'firebase/firestore';

export interface Player {
  id: string;
  name: string;
  avatarId: string;
  alias?: string;
  role?: 'killer' | 'detective' | 'civilian' | 'witness';
  status: 'alive' | 'killed' | 'voted_out' | 'arrested';
  isImmune?: boolean;
}

export type WhoAmIGameState = "lobby" | "answering" | "guessing" | "round_results" | "final_results";
export type KillerGameState = "lobby" | "aliases" | "roles" | "crime_scene" | "night" | "discussion" | "voting_results" | "ended";
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
  rumor: string;
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
    motive: string; // Killer-provided motive
    victimAlias?: string; // Victim's alias
    detectiveSurvived?: boolean; // Flag if the assassination attempt on the detective failed
    isTargetingDetective?: boolean;
    witnessSawKiller?: boolean;
  };
  witnessInfo?: {
    killerId: string;
    killerAlias: string;
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
