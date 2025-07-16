

import type { Timestamp } from 'firebase/firestore';

export interface Player {
  id: string;
  name: string;
  avatarId: string;
  alias?: string;
  role?: 'killer' | 'detective' | 'civilian' | 'witness' | 'cop';
  status: 'alive' | 'killed' | 'voted_out' | 'arrested' | 'left' | 'eliminated';
  isImmune?: boolean;
  isTraitor?: boolean; // For the witness who sides with the killer
  team?: 'A' | 'B';
}

export type WhoAmIGameState = "lobby" | "instructions" | "answering" | "guessing" | "round_results" | "final_results";
export type KillerGameState = "lobby" | "preparation" | "role_reveal" | "detective_choice" | "night" | "victim_reveal" | "discussion" | "voting_results" | "ended";
export type KingOfGeniusGameState = "lobby" | "team_selection" | "challenge_intro" | "challenge_active" | "challenge_results" | "final_results";
export type TheSlapGameState = "lobby" | "slap-describing" | "slap-guessing" | "slap-results" | "final_results" | "slap-voting" | "slap-voting-results";

export type GameState = WhoAmIGameState | KillerGameState | KingOfGeniusGameState | TheSlapGameState;

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

export interface NightChatMessage extends ChatMessage {
    location: PlayerLocationChoice;
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

export type PlayerLocationChoice = "night_alley" | "commercial_market" | "abandoned_farm";

export const KILLER_METHODS = [
    "طعن بالسكين",
    "ضرب مبرح",
    "طلقة مسدس",
    "وابل من الرصاصات",
    "تعذيبه حتى الموت",
    "تسميمه",
    "منحه ميتة رحيمة",
] as const;

export type KillerMethod = typeof KILLER_METHODS[number];


export interface Game {
  id: string;
  hostId: string;
  gameType: 'who-am-i' | 'killer' | 'king-of-genius' | 'the-slap-game';
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
  locationChoices?: Record<string, PlayerLocationChoice>;
  nightAction?: {
    victimId?: string | null;
    method?: KillerMethod;
    victimAlias?: string;
    killerGuess?: {
        guessedPlayerId: string;
        wasCorrect: boolean;
    },
    skipped?: boolean;
    assassinationFailed?: boolean;
    detectiveSurvived?: boolean;
  };
  witnessInfo?: {
    playersInLocation: {id: string, alias: string}[];
  };
  copCheck?: {
    used: boolean;
    targetId?: string;
  };
  copCheckResult?: {
    targetId: string;
    targetAlias: string;
    isKiller: boolean;
  };
  votes?: Record<string, string>; // { voterId: votedForId }
  lastVoteResult?: {
      tied: boolean;
      eliminatedPlayerAlias?: string;
      eliminatedPlayerRole?: Player['role'];
      isTraitor?: boolean;
      message?: string;
  };
  messages?: ChatMessage[];
  nightMessages?: NightChatMessage[];
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
  };

  // the-slap-game specific fields
  playerScores?: Record<string, number>;
  slapState?: {
    descriptionPairs: Record<string, string>; // { describerId: describedId }
    turnOrder: string[];
    currentTurnIndex: number;
    currentDescriberId: string;
    currentDescribedId: string;
    description?: string;
    guesses?: Record<string, { describedId: string; describerId: string }>;
    lastRoundPoints?: Record<string, number>;
    votes?: Record<string, string>; // { voterId: votedForId }
    dumbestPlayerId?: string | null;
  };
}
