
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
    }).describe("The reason provided by a player for re-evaluation. The judge must consider if this objection is about another player's answers.").optional(),
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
    .describe('The judging results for each player. It must be consistent with the judgeExplanation.'),
  judgeExplanation: z.string().optional().describe("A brief explanation from the judge about the re-evaluation decision, especially if a rejudgeReason was provided. The explanation must perfectly match the changes made to the results. If a player's argument is rejected, the explanation should be rude and sarcastic."),
  isRejectionJustified: z.boolean().optional().describe("Set to true if the judge's rejection of the player's argument is justified (i.e., the player's argument was weak, wrong, or illogical). This should only be set if a rejudgeReason was provided and rejected."),
});
export type JudgePrisonAnswersOutput = z.infer<
  typeof JudgePrisonAnswersOutputSchema
>;


// Regular Types
export interface Mail {
  id: string;
  senderName: string; // 'Admin' or a specific admin's name
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  expiresAt: Date;
  coins?: number;
  coinsClaimed?: boolean;
}


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

export type PlayerRole = 'killer' | 'detective' | 'doctor' | 'soldier' | 'spy' | 'shapeshifter' | 'bomber' | 'civilian' | 'contestant';
export type PlayerTeam = 'mafia' | 'good' | 'neutral' | 'red' | 'blue';
export type PlayerStatus = 'alive' | 'killed' | 'voted_out' | 'left' | 'executed' | 'in_prison';


export interface Player {
  id: string;
  name: string;
  avatarId: string;
  leaderboardPoints: number; 
  role?: PlayerRole;
  team?: PlayerTeam;
  apparentRole?: PlayerRole; // For shapeshifter
  status: PlayerStatus;
  isProtected?: boolean; // For doctor's protection
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
}

export type KingOfGeniusGameState = "lobby" | "team_selection" | "challenge_intro" | "challenge_active" | "challenge_results" | "final_results";
export type TrapAnswerGameState = "lobby" | "category-selection" | "answer-submission" | "guessing" | "round-results" | "final-results";
export type PrisonGameState = "lobby" | "instructions" | "open_auction" | "closed_auction_bidding" | "closed_auction_answering" | "judging" | "rejudging" | "results" | "final_results";
export type MafiaGameState = "lobby" | "role_reveal" | "night" | "day" | "voting" | "execution" | "final_results";
export type WordWarGameState = "lobby" | "guide_turn" | "guesser_turn" | "final_results";

export type GameState = KingOfGeniusGameState | TrapAnswerGameState | PrisonGameState | MafiaGameState | WordWarGameState;

export type ScoreMatrix = Record<string, Record<string, number>>; 

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

// Mafia Game Specific Types
export type MafiaPhase = MafiaGameState;
export type NightActionType = 'kill' | 'heal' | 'investigate' | 'spy' | 'bomb' | 'shapeshift';

export interface NightAction {
    actorId: string;
    action: NightActionType;
    targetId: string;
    // For shapeshifter
    disguiseRole?: PlayerRole;
}

export interface DayEvent {
    type: 'death' | 'protection' | 'investigation' | 'spy_reveal' | 'execution';
    message: string;
    killedPlayer?: {
        name: string;
        avatarId: string;
    };
    revealedRole?: PlayerRole;
    revealedTeam?: PlayerTeam;
}

export interface PrivateEvent {
    type: 'investigation_result' | 'spy_result' | 'spy_result_soldier_block' | 'doctor_success';
    message: string;
    targetPlayer?: {
        id: string;
        name: string;
        avatarId: string;
        role?: PlayerRole;
    };
}


export interface PublicChatMessage {
    senderId: string;
    senderName: string;
    message: string;
    timestamp: Timestamp;
}

export interface PrivateChatMessage {
    senderId: string;
    senderName: string;
    message: string;
    timestamp: Timestamp;
}
export interface PrivateChat {
    participants: string[]; // [spyId, killerId]
    messages: PrivateChatMessage[];
}

export interface WordWarCard {
    text: string;
    color: 'red' | 'blue' | 'neutral' | 'assassin';
    revealed: boolean;
}


export interface Game {
  id: string;
  hostId: string;
  gameType: 'king-of-genius' | 'trap-answer' | 'prison' | 'behind-the-mask' | 'word_war';
  players: Player[];
  playerUids: string[];
  gameState: GameState;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  
  round?: number; 
  playerScores?: Record<string, number>;
  
  gameResult?: {
    winner: PlayerTeam | 'draw' | 'الفريق الأزرق' | 'الفريق الأحمر' | 'تعادل' | 'game_over';
    message: string;
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
    trickStats?: {
        trickedBy: Record<string, string[]>; // { [trickedPlayerId]: [trickerPlayerId1, trickerPlayerId2...] }
        trickedOthers: Record<string, string[]>; // { [trickerPlayerId]: [trickedPlayerId1, ...] }
    };
    finalAwards?: {
        deceivedFool?: { playerId: string; name: string; avatarId: string; count: number };
        cunningDeceiver?: { playerId: string; name: string; avatarId: string; count: number };
    };
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

  // "خلف القناع" (Mafia) specific state
  mafiaState?: {
    settings?: {
      nightTime: number;
      dayTime: number;
    };
    phase: MafiaPhase;
    rolesInGame?: PlayerRole[];
    timerEndsAt?: Timestamp;
    night?: number;
    events?: DayEvent[];
    publicChat?: PublicChatMessage[];
    privateEvents?: Record<string, PrivateEvent[]>; // { [playerId]: [PrivateEvent, ...] }
    nightActions?: Record<string, NightAction>;
    lastKilledPlayerId?: string | null;
    lastHealedPlayerId?: string | null;
    lastAbilityUse?: Record<string, number>; // { [playerId]: nightNumber }
    lastExecutedPlayer?: { name: string; avatarId: string; } | null;
    votes?: Record<string, string | null>; // { voterId: targetId }
    privateChats?: Record<string, PrivateChat>; // Keyed by a unique chat ID
  };

  // "حرب الكلمات" (Word War) specific state
  wordWarState?: {
    settings: {
        turnTime: number;
    };
    cards: WordWarCard[];
    turn: 'red' | 'blue';
    guides: {
        red: string;
        blue: string;
    };
    previousGuides?: {
        red?: string;
        blue?: string;
    };
    currentHint?: {
        word: string;
        count: number;
    };
    guessesLeft?: number;
    turnResult?: 'hit' | 'miss' | 'neutral' | 'assassin';
    timerEndsAt?: Timestamp | null;
  };
    
}
