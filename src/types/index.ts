
import type { Timestamp } from 'firebase/firestore';
import type { LucideIcon } from 'lucide-react';
import { z } from 'zod';


// Zod Schemas
const PlayerAnswersSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  answers: z.array(z.string()),
});

export const JudgePrisonAnswersInputSchema = z.object({
  question: z.string().describe('The question that was asked to the players.'),
  submissions: z
    .array(PlayerAnswersSchema)
    .describe('An array of player submissions.'),
});
export type JudgePrisonAnswersInput = z.infer<
  typeof JudgePrisonAnswersInputSchema
>;

const SinglePlayerResultSchema = z.object({
  playerId: z.string(),
  name: z.string().describe('The name of the player.'),
  correctAnswers: z
    .array(z.string())
    .describe('A list of the answers that you considered correct.'),
  score: z.number().int().describe('The total count of correct answers.'),
});

export const JudgePrisonAnswersOutputSchema = z.object({
  results: z
    .array(SinglePlayerResultSchema)
    .describe('The judging results for each player.'),
});
export type JudgePrisonAnswersOutput = z.infer<
  typeof JudgePrisonAnswersOutputSchema
>;


// Regular Types
export interface SocialRank {
  threshold: number;
  name: string;
  icon: LucideIcon; 
}

export const DEFAULT_SOCIAL_RANKS: {threshold: number, name: string, icon: any}[] = [
    { threshold: 0, name: 'عامل وضيع', icon: 'Shield' },
    { threshold: 50, name: 'مواطن صالح', icon: 'ShieldCheck' },
    { threshold: 150, name: 'شخصية مرموقة', icon: 'Award' },
    { threshold: 300, name: 'عضو مجلس', icon: 'Gem' },
    { threshold: 500, name: 'زعيم المدينة', icon: 'Crown' },
];

export const DEFAULT_TRAP_ANSWER_CATEGORIES = [
    "تاريخ",
    "رياضة",
    "أدب",
    "أنمي ومانجا",
    "إسلاميات",
    "فنون",
    "جغرافيا",
    "لغة عربية",
    "معلومات غريبة",
    "الحيوانات والطبيعة",
    "النباتات",
    "المطبخ"
];


export interface League {
  id: string;
  name: string;
  adminId: string;
  members: string[]; // array of user IDs
  password?: string;
  createdAt: Timestamp;
  scores?: Record<string, number>; // { [userId]: score }
  gamesPlayed?: Record<string, number>;
}


export interface Player {
  id: string;
  name: string;
  avatarId: string;
  leaderboardPoints: number; // For rank display in-game
  alias?: string;
  role?: 'killer' | 'detective' | 'civilian' | 'witness' | 'cop' | 'contestant';
  status: 'alive' | 'killed' | 'voted_out' | 'arrested' | 'left' | 'eliminated' | 'in_prison' | 'executed';
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
  unlockedAvatars: string[];
  leaderboardPoints: number; // For social rank progression
  trophies?: number;
  gamesPlayed?: number;
  hasChangedName?: boolean;
  leagues?: {id: string, name: string}[];
  judgeStats?: {
      totalRating: number;
      ratingCount: number;
  };
}

export type KillerGameState = "lobby" | "instructions" | "role_reveal" | "location_choice" | "night" | "victim_reveal" | "discussion" | "voting_results" | "ended";
export type KingOfGeniusGameState = "lobby" | "team_selection" | "challenge_intro" | "challenge_active" | "challenge_results" | "final_results";
export type TheSlapGameState = "lobby" | "slap-describing" | "slap-guessing" | "slap-results" | "final_results" | "slap-voting" | "slap-voting-results";
export type TrapAnswerGameState = "lobby" | "category-selection" | "answer-submission" | "guessing" | "round-results" | "final-results";
export type PrisonGameState = "lobby" | "open_auction" | "closed_auction_bidding" | "closed_auction_answering" | "judging" | "results" | "final_results";


export type GameState = KillerGameState | KingOfGeniusGameState | TheSlapGameState | TrapAnswerGameState | PrisonGameState;

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
  currentProblemIndex?: number;
  currentStep?: number;
  wrongAttempts?: number;
  clickedTiles?: { x: number, y: number }[];
  position?: GridPosition;
  visited?: GridPosition[];
  hitWalls?: GridPosition[];
  points?: number;
  revealedByHint?: GridPosition[];
  attempts?: { guess: string[], feedback: ('correct' | 'misplaced' | 'incorrect')[] }[];
  answers?: Record<string, string>;
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

export interface PrisonQuestion {
    id: string;
    text: string;
}

export interface AvatarPrice {
    avatarId: string;
    price: number;
}

export type EmojiReactionType = 'laugh' | 'mock' | 'apologize' | 'shame';

export interface EmojiReaction {
    emoji: EmojiReactionType;
    timestamp: Timestamp;
}

export interface Game {
  id: string;
  hostId: string;
  gameType: 'killer' | 'king-of-genius' | 'the-slap-game' | 'trap-answer' | 'prison';
  players: Player[];
  playerUids: string[];
  gameState: GameState;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  
  round?: number; 
  playerScores?: Record<string, number>;
  
  // killer specific fields
  crimeScene?: CrimeScene;
  turn?: number;
  lastVictimTurn?: number;
  killerSkipUsed?: boolean;
  locationChoices?: Record<string, PlayerLocationChoice>;
  nightAction?: {
    skipped?: boolean;
    victimId?: string | null;
    method?: KillerMethod;
    victimAlias?: string;
    victimWasTraitor?: boolean;
    assassinationFailed?: boolean;
    killerGuess?: string;
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
  votes?: Record<string, string>;
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
    winner: 'killer' | 'detective_civilians' | 'الفريق الأزرق' | 'الفريق الأحمر' | 'تعادل' | 'traitor_arrested' | 'judge_left';
    message: string;
  };
  discussionEndsAt?: Timestamp;

  // king-of-genius specific fields
  teamScores?: { A: number; B: number };
  challengeOrder?: string[];
  currentChallengeIndex?: number;
  puzzles?: string[];
  challengeState?: {
      puzzle?: any;
      results?: ChallengeResult[];
      challengeEndsAt?: Timestamp;
      duration?: number;
      playerProgress?: Record<string, PlayerProgress>;
  };

  // the-slap-game specific fields
  slapState?: {
    descriptionPairs: Record<string, string>;
    turnOrder: string[];
    currentTurnIndex: number;
    currentDescriberId: string;
    currentDescribedId: string;
    description?: string;
    guesses?: Record<string, { describedId: string; describerId: string }>;
    lastRoundPoints?: Record<string, number>;
    votes?: Record<string, string>;
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
      playerAnswers?: Record<string, string | null>;
      playerGuesses?: Record<string, string>;
      timerEndsAt?: Timestamp | null;
      dummyAnswerForRound?: string;
      shuffledAnswers?: string[];
      lastRoundResults?: {
        answers: {
          text: string;
          isCorrect: boolean;
          authorIds: string[] | null;
          guesserIds: string[];
        }[];
        scores: Record<string, {
            points: number;
            breakdown: { reason: string, points: number }[];
        }>;
    };
    reactions?: Record<string, EmojiReaction>;
  };

  // prison specific fields
  prisonState?: {
      settings: {
          biddingTime: number;
          answeringTime: number;
          judgingTime: number;
          rounds: number;
      };
      timerEndsAt?: Timestamp | null;
      currentQuestion?: PrisonQuestion;
      prisonHistory?: Record<string, { inPrison: number, winsWithoutBidding: number }>;
      openAuctionSubmissions?: Record<string, string[]>;
      aiJudgeResults?: {
        playerId: string;
        name: string;
        correctAnswers: string[];
        score: number;
      }[];
      bids?: Record<string, number>;
      withdrawnBidders?: string[];
      auctionWinnerId?: string;
      auctionLoserId?: string;
      closedAuctionQuestion?: PrisonQuestion;
      closedAuctionAnswer?: string;
      lastRoundResult?: {
          message: string;
          executedPlayerName?: string;
          points?: Record<string, {
              points: number;
              breakdown: { reason: string; points: number }[];
          }>;
      };
  };
}
