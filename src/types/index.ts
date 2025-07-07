
import type { Timestamp } from 'firebase/firestore';

export interface Player {
  id: string;
  name: string;
  avatarId: string;
  alias?: string;
  role?: 'killer' | 'detective' | 'civilian' | 'witness';
  status: 'alive' | 'killed' | 'voted_out' | 'arrested' | 'left';
  isImmune?: boolean;
  team?: 'A' | 'B';
}

export type WhoAmIGameState = "lobby" | "instructions" | "answering" | "guessing" | "round_results" | "final_results";
export type KillerGameState = "lobby" | "preparation" | "role_reveal" | "detective_choice" | "night" | "victim_reveal" | "discussion" | "voting_results" | "ended";
export type KingOfGeniusGameState = "lobby" | "team_selection" | "challenge_intro" | "challenge_active" | "challenge_results" | "final_results";

export type GameState = WhoAmIGameState | KillerGameState | KingOfGeniusGameState;

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

export interface ChallengeResult {
    playerId: string;
    team: 'A' | 'B';
    isCorrect: boolean;
    time: number; // Time in seconds
}

export interface Game {
  id: string;
  hostId: string;
  gameType: 'who-am-i' | 'killer' | 'king-of-genius';
  players: Player[];
  playerUids: string[];
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
  killerSkipUsed?: boolean;
  nightAction?: {
    victimId?: string;
    method?: string;
    victimAlias?: string;
    skipped?: boolean;
  };
  witnessInfo?: {
    killerId: string;
    killerAlias: string;
    killerPlayerNumber?: string;
    victimId: string;
    victimAlias: string;
    method: string;
    reason: 'assassination_failed' | 'detective_survived';
  };
  votes?: Record<string, string>; // { voterId: votedForId }
  lastVoteResult?: {
      tied: boolean;
      eliminatedPlayerAlias?: string;
      eliminatedPlayerRole?: Player['role'];
      message?: string;
  };
  messages?: ChatMessage[];
  detectiveArrest?: {
      used: boolean;
  };
  gameResult?: {
    winner: 'killer' | 'detective_civilians' | 'الفريق الأزرق' | 'الفريق الأحمر' | 'تعادل';
    message: string;
  };
  discussionEndsAt?: Timestamp;

  // king-of-genius specific fields
  teamScores?: { A: number; B: number };
  challengeOrder?: string[];
  currentChallengeIndex?: number;
  challengeState?: {
      puzzle?: any;
      results?: ChallengeResult[];
  };
}
