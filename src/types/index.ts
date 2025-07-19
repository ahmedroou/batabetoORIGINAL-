

import type { Timestamp } from 'firebase/firestore';

export interface League {
  id: string;
  name: string;
  adminId: string;
  members: string[]; // array of user IDs
  password?: string;
  createdAt: Timestamp;
}


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
  score?: number; // Added for final results ranking
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  coins: number;
  avatarId: string;
  leaderboardPoints: number;
  trophies?: number;
  gamesPlayed?: number;
  hasChangedName?: boolean;
  leagues?: {id: string, name: string}[];
}

export type KillerGameState = "lobby" | "instructions" | "role_reveal" | "location_choice" | "night" | "victim_reveal" | "discussion" | "voting_results" | "ended";
export type KingOfGeniusGameState = "lobby" | "team_selection" | "challenge_intro" | "challenge_active" | "challenge_results" | "final_results";
export type TheSlapGameState = "lobby" | "slap-describing" | "slap-guessing" | "slap-results" | "final_results" | "slap-voting" | "slap-voting-results";
export type TrapAnswerGameState = "lobby" | "category-selection" | "answer-submission" | "guessing" | "round-results" | "final-results";

export type GameState = KillerGameState | KingOfGeniusGameState | TheSlapGameState | TrapAnswerGameState;

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

export interface TrapQuestion {
    id: string;
    question: string;
    answer: string;
    category: string;
    dummyAnswers: string[];
}


export interface Game {
  id: string;
  hostId: string;
  gameType: 'killer' | 'king-of-genius' | 'the-slap-game' | 'trap-answer';
  players: Player[];
  playerUids: string[];
  gameState: GameState;
  createdAt: Timestamp;
  
  // Shared fields
  round?: number; 
  playerScores?: Record<string, number>;
  
  // killer specific fields
  crimeScene?: CrimeScene;
  turn?: number;
  lastVictimTurn?: number; // To track when the last victim was announced
  killerSkipUsed?: boolean;
  locationChoices?: Record<string, PlayerLocationChoice>;
  nightAction?: {
    victimId?: string | null;
    method?: KillerMethod;
    victimAlias?: string;
    victimWasTraitor?: boolean;
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
    isTraitor?: boolean;
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
    winner: 'killer' | 'detective_civilians' | 'الفريق الأزرق' | 'الفريق الأحمر' | 'تعادل' | 'traitor_arrested';
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

  // trap-answer specific fields
  trapAnswerState?: {
      settings: {
          categories: string[];
          rounds: number;
          answerTime: number;
      };
      turnOrder?: string[];
      currentTurnIndex?: number;
      fiveRandomCategories?: string[];
      selectedCategory?: string;
      currentQuestion?: TrapQuestion;
      playerAnswers?: Record<string, string>; // { playerId: "fake answer" }
      playerGuesses?: Record<string, string>; // { guesserId: "answer string chosen" }
      timerEndsAt?: Timestamp | null;
      lastRoundResults?: {
        answers: {
          text: string;
          isCorrect: boolean;
          authorIds: string[] | null; // null if correct answer, string[] of player IDs for trap answers
          guesserIds: string[];
        }[];
        scores: Record<string, {
            points: number;
            breakdown: { reason: string, points: number }[];
        }>;
    };
    playersActed?: string[];
  };
}
