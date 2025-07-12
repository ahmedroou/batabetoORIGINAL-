
import type { Timestamp } from 'firebase/firestore';

export interface Player {
  id: string;
  name: string;
  avatarId: string;
  alias?: string;
  role?: 'killer' | 'detective' | 'civilian' | 'witness';
  status: 'alive' | 'killed' | 'voted_out' | 'arrested' | 'left' | 'eliminated';
  isImmune?: boolean;
  team?: 'A' | 'B';
}

export type WhoAmIGameState = "lobby" | "instructions" | "answering" | "guessing" | "round_results" | "final_results";
export type KillerGameState = "lobby" | "preparation" | "role_reveal" | "detective_choice" | "night" | "victim_reveal" | "discussion" | "voting_results" | "ended";
export type KingOfGeniusGameState = "lobby" | "instructions" | "team_selection" | "challenge_intro" | "challenge_active" | "challenge_results" | "final_results";

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
    score?: number; // Optional score, for games like Hidden Maze
    playerDrawnPath?: PathTile[]; // For Path of Survival
}

export type GridPosition = { r: number; c: number };
export type PathTile = { x: number; y: number };

export interface PlayerProgress {
  // For Quick Math
  currentProblemIndex?: number;
  // For Path of Survival
  currentStep?: number;
  wrongAttempts?: number;
  clickedTiles?: { x: number, y: number }[];
  // For Hidden Maze
  position?: GridPosition;
  visited?: GridPosition[];
  hitWalls?: GridPosition[];
  points?: number;
  revealedByHint?: GridPosition[];
  // For Code Breaker
  attempts?: { guess: string[], feedback: ('correct' | 'misplaced' | 'incorrect')[] }[];
  // For Smart Grid (Columns Only)
  answers?: Record<string, string>; // e.g. { '0-3': '12' } for col 0, row 3
}

export type SmartGridColumn = {
  cells: (number | null)[];
  pattern: string;
  solution: number[];
}

export interface SmartGridPuzzleData {
    columns: SmartGridColumn[];
}

export interface Bomb {
    heldBy: string; // Player ID
    expiresAt: Timestamp;
}

export interface BombDuelState {
    bombs: Bomb[];
    players: Record<string, {
        isShielding: boolean;
        shieldCooldownUntil: Timestamp | null;
        throwCooldownUntil: Timestamp | null;
    }>;
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
  puzzles?: string[]; // Array of stringified puzzles
  challengeState?: {
      puzzle?: any; // The puzzle for the *current* challenge
      results?: ChallengeResult[];
      challengeEndsAt?: Timestamp;
      duration?: number;
      playerProgress?: Record<string, PlayerProgress>;
      bombDuelState?: BombDuelState;
  };
}
