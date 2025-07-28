

import type { Timestamp } from 'firebase/firestore';
import type { LucideIcon } from 'lucide-react';
import { z } from 'zod';


// Zod Schemas for AI Flows
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
   rejudgeReason: z.object({
        playerId: z.string(),
        name: z.string(),
        reason: z.string(),
    }).describe("The reason provided by a player requesting a re-evaluation.").optional(),
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
  judgeExplanation: z.string().optional().describe("A brief explanation from the judge about the re-evaluation decision, especially if a rejudgeReason was provided."),
  isRejectionJustified: z.boolean().optional().describe("Set to true if the judge's rejection of the player's argument is justified (i.e., the player's argument was weak, wrong, or illogical). This should only be set if a rejudgeReason was provided."),
});
export type JudgePrisonAnswersOutput = z.infer<
  typeof JudgePrisonAnswersOutputSchema
>;


// Regular Types
export interface SocialRank {
  threshold: number;
  name: string;
  icon: any; 
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

export type MafiaRole = 'killer' | 'spy';
export type TownRole = 'detective' | 'doctor' | 'soldier' | 'impersonator' | 'civilian' | 'suicide_bomber';
export type PlayerRole = MafiaRole | TownRole | 'contestant';

export interface Player {
  id: string;
  name: string;
  avatarId: string;
  leaderboardPoints: number; 
  lastActiveAt?: Timestamp; 
  role?: PlayerRole;
  status: 'alive' | 'killed' | 'voted_out' | 'left' | 'executed' | 'in_prison';
  isProtected?: boolean; // For doctor's protection
  apparentRole?: PlayerRole; // For the Impersonator
  alias?: string; 
  team?: 'A' | 'B';
  score?: number; 
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  coins: number;
  avatarId: string;
  unlockedAvatars: string[];
  leaderboardPoints: number; 
  trophies?: number;
  gamesPlayed?: number;
  hasChangedName?: boolean;
  leagues?: {id: string, name: string}[];
  judgeStats?: {
      totalRating: number;
      ratingCount: number;
  };
}

export type KillerGameState = "lobby" | "role_reveal" | "night" | "discussion" | "tie_breaker_voting" | "voting_results" | "ended";
export type KingOfGeniusGameState = "lobby" | "team_selection" | "challenge_intro" | "challenge_active" | "challenge_results" | "final_results";
export type TrapAnswerGameState = "lobby" | "category-selection" | "answer-submission" | "guessing" | "round-results" | "final-results";
export type PrisonGameState = "lobby" | "instructions" | "open_auction" | "closed_auction_bidding" | "closed_auction_answering" | "judging" | "rejudging" | "results" | "final_results";


export type GameState = KillerGameState | KingOfGeniusGameState | TrapAnswerGameState | PrisonGameState;

export type ScoreMatrix = Record<string, Record<string, number>>; 

export interface ChatMessage {
  senderId: string;
  senderName: string;
  text: string;
  timestamp: Timestamp;
  isDetective?: boolean; // To keep compatibility, but less used in new Mafia
}

export interface NightAction {
    killTarget?: string;
    checkTarget?: string;
    protectTarget?: string;
    impersonateRole?: PlayerRole;
    setCurseTarget?: string;
}

export interface NightResult {
    killedPlayerId?: string | null;
    killedPlayerName?: string;
    wasSaved?: boolean;
    detectiveCheckResult?: { targetName: string; role: PlayerRole };
    spyCheckResult?: { targetName: string; role: PlayerRole, apparentRole?: PlayerRole };
    spyWasSpotted?: boolean;
    suicideBomberTakesKillerWithThem?: boolean;
}

export interface ChallengeResult {
    playerId: string;
    team: 'A' | 'B';
    isCorrect: boolean;
    time: number; 
    score?: number; 
    playerDrawnPath?: PathTile[]; 
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
  answers?: Record<string, string> | string[]; 
}

export type SmartGridColumn = {
  cells: (number | null)[];
  pattern: string;
  solution: number[];
}

export interface SmartGridPuzzleData {
    columns: SmartGridColumn[];
}

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
  gameType: 'killer' | 'king-of-genius' | 'trap-answer' | 'prison';
  players: Player[];
  playerUids: string[];
  gameState: GameState;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  
  round?: number; 
  playerScores?: Record<string, number>;
  
  // killer specific fields
  turn?: number;
  nightActions?: Record<string, NightAction>;
  nightResults?: NightResult;
  votes?: Record<string, string>;
  lastVoteResult?: {
      eliminatedPlayerId?: string;
      eliminatedPlayerName?: string;
      eliminatedPlayerRole?: PlayerRole;
      wasTie: boolean;
      message?: string;
      tiedPlayers?: string[]; 
  };
  messages?: ChatMessage[];
  gameResult?: {
    winner: 'mafia' | 'town' | 'الفريق الأزرق' | 'الفريق الأحمر' | 'تعادل' | 'judge_left' | 'game_over' | 'detective_civilians' | 'killer';
    message: string;
  };
  discussionEndsAt?: Timestamp;
  killerSettings?: {
    discussionTime: number;
    nightTime: number;
  };

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
      playerProgress?: Record<string, PlayerProgress>;
      timerEndsAt?: Timestamp | null;
      currentQuestion?: PrisonQuestion;
      prisonHistory?: Record<string, { inPrison: number, roundsWithoutWinningAuction: number }>;
      openAuctionSubmissions?: Record<string, string[]>;
      judgingStarted?: boolean; 
      aiJudgeResults?: {
        playerId: string;
        name: string;
        correctAnswers: string[];
        score: number;
      }[];
      bids?: Record<string, number>;
      highestBid?: number;
      withdrawnBidders?: string[];
      auctionWinnerId?: string;
      closedAuctionQuestion?: PrisonQuestion;
      lastRoundWinnerId?: string | null;
      questionChangersUsedBy?: string[];
      activeRejudgeRequest?: { playerId: string, name: string, reason: string };
      rejudgeRequestsUsedBy?: string[];
      judgeExplanation?: string;
      isRejectionJustified?: boolean;
      gameShouldEndAfterThis?: boolean; 
      lastRoundResult?: {
          message?: string;
          executedPlayerName?: string;
          executedPlayerAvatarId?: string;
          freedPlayerName?: string;
          freedPlayerAvatarId?: string;
          points?: Record<string, {
              points: number;
              breakdown: { reason: string, points: number }[];
          }>;
      };
  };
}
