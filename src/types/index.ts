

import type { Timestamp } from 'firebase/firestore';
import type { LucideIcon } from 'lucide-react';
import { z } from 'zod';
import type { ALL_PERMISSIONS } from '@/data/permissions';


// Zod Schemas for AI Flows
const PlayerAnswersSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  answers: z.array(z.string()),
});

export const JudgeSingleSubmissionInputSchema = z.object({
    question: z.string().describe("The question that was asked."),
    submission: PlayerAnswersSchema.describe("The submission from a single player."),
});
export type JudgeSingleSubmissionInput = z.infer<typeof JudgeSingleSubmissionInputSchema>;

export const JudgeSingleSubmissionOutputSchema = z.object({
    playerId: z.string(),
    name: z.string(),
    correctAnswers: z.array(z.string()).describe("An array of the answers that were deemed correct."),
    score: z.number().int().describe("The final score for this player for the round."),
    evaluation: z.string().optional().describe("A witty and concise explanation for the score given to this specific player.")
});
export type JudgeSingleSubmissionOutput = z.infer<typeof JudgeSingleSubmissionOutputSchema>;


export const JudgePrisonAnswersInputSchema = z.object({
  question: z.string().describe("The question that was asked."),
  submissions: z.array(PlayerAnswersSchema).describe("An array of submissions from all players."),
  rejudgeReason: z.object({
      name: z.string(),
      reason: z.string()
  }).optional().describe("An optional reason provided by a player for a re-evaluation request."),
});
export type JudgePrisonAnswersInput = z.infer<typeof JudgePrisonAnswersInputSchema>;

export const JudgePrisonAnswersOutputSchema = z.object({
  results: z.array(JudgeSingleSubmissionOutputSchema),
  judgeExplanation: z.string().optional().describe("A witty and concise explanation of the overall judgment, especially when a re-judge is requested."),
  isRejectionJustified: z.boolean().optional().describe("Set to true only if a re-judge request was denied."),
});
export type JudgePrisonAnswersOutput = z.infer<typeof JudgePrisonAnswersOutputSchema>;


// Schemas for News Article Flow
export const EventSummarySchema = z.object({
  key_events: z.array(z.string()).describe('A list of the most interesting and dramatic events of the day, including key points from previous articles.'),
  overall_mood: z.string().describe('A one-sentence summary of the general mood of the day (e.g., "A day of surprising betrayals and unexpected victories.").'),
});

export const DraftArticleSchema = z.object({
  headline: z.string().describe('A catchy, satirical, and dramatic headline for the news article.'),
  body: z.string().describe('The full body of the news article, written in an engaging and slightly sarcastic journalistic style. It should connect the key events into a coherent narrative. The length should be between 100 and 200 words.'),
});

export const NewsArticleInputSchema = z.object({
  events: z.array(z.any()).describe('An array of social event objects from the game from the last 24 hours.'),
  previous_articles: z.array(z.any()).describe('An array of articles published in the last week, to provide context.'),
  date: z.string().describe("Today's date in a readable format (e.g., 'Sunday, July 28, 2024')."),
});
export type NewsArticleInput = z.infer<typeof NewsArticleInputSchema>;

export const NewsArticleOutputSchema = z.object({
  headline: z.string(),
  body: z.string(),
  category: z.string().default('أخبار اللعبة'),
  imageUrl: z.string().optional(),
});
export type NewsArticleOutput = z.infer<typeof NewsArticleOutputSchema>;


// Regular Types
export type PermissionId = typeof ALL_PERMISSIONS[number]['id'];

export interface Permission {
    id: PermissionId;
    name: string;
    description: string;
    category: 'economic' | 'social' | 'gameplay' | 'meta';
}

export interface AudienceGroup {
    id: string;
    name: string;
    members: string[]; // array of user IDs
}
export interface Article {
    id: string;
    title: string;
    content: string;
    imageUrl?: string;
    authorName: string;
    authorId: string;
    createdAt: Date;
    isPublished: boolean;
    // New fields
    category?: string; 
    audience?: 'public' | string[]; // public or array of audience group IDs
    tags?: string[];
    views?: number;
}

export type ChallengePrize = {
    type: 'coins' | 'diamonds' | 'honorPoints';
    value: number;
};

export interface Challenge {
    id: string;
    title: string;
    // New fields for tournament system
    targetPoints: number; // Goal to win
    specificGameType?: Game['gameType'] | 'all'; // Can be restricted to one game or all games
    firstPlacePrize: ChallengePrize[];
    secondPlacePrize: ChallengePrize[];
    thirdPlacePrize: ChallengePrize[];
    
    endsAt: Date;
    createdAt: Timestamp;
    participantIds: string[];
    
    // Leaderboard will be a subcollection on the challenge document
    // winners will be stored on the challenge document as well
    winners?: {
        first?: { id: string, name: string };
        second?: { id: string, name: string };
        third?: { id: string, name: string };
    };

    // DEPRECATED or REPURPOSED fields from old system
    gameType?: Game['gameType']; // Maybe repurposed for "specificGameType" if not 'all'
    entryFee?: { // Can be kept if there's an entry fee to the tournament itself
        type: 'coins' | 'leaderboardPoints';
        value: number;
    };
    minPlayersToStart?: number; // Might not be relevant for this new format
    gameRoomIds?: { id: string, playerCount: number }[]; // Not relevant for this format
    participantCount?: number;
    isClassWar?: boolean;
    classWarDetails?: {
        challengingTiers: string[];
        defendingTier: string;
    };
}


export interface ClanWarInvitation {
    id: string;
    challengerClan: { id: string; name: string; emblem: string };
    challengedClan: { id: string; name: string; emblem: string };
    gameType: Game['gameType'];
    battleTime: Date;
    status: 'pending' | 'accepted' | 'rejected';
}

export interface ClanWar extends ClanWarInvitation {
    gameId: string | null; // Null until the game starts
    winnerClanId: string | null;
}


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
  permissions: PermissionId[];
}

export const DEFAULT_SOCIAL_RANKS: SocialRank[] = [
    { threshold: 0, name: 'عامل وضيع', icon: 'Shield', permissions: [] },
    { threshold: 100, name: 'مواطن صالح', icon: 'ShieldCheck', permissions: [] },
    { threshold: 250, name: 'تاجر', icon: 'Award', permissions: [] },
    { threshold: 500, name: 'نبيل', icon: 'Gem', permissions: [] },
    { threshold: 1000, name: 'عضو مجلس', icon: 'Star', permissions: [] },
    { threshold: 2000, name: 'وزير', icon: 'Star', permissions: [] },
    { threshold: 5000, name: 'حاكم المدينة', icon: 'Crown', permissions: [] },
    { threshold: 10000, name: 'الملك', icon: 'Crown', permissions: [] },
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

export const DEFAULT_DRAW_AND_GUESS_CATEGORIES = [
    "جملة مركبة",
    "أمثال عامية",
    "أنميات مشهورة",
    "أفلام مشهورة",
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
export type PlayerStatus = 'alive' | 'killed' | 'voted_out' | 'left' | 'executed' | 'in_prison' | 'bankrupt';

export type ClanMemberRole = 'leader' | 'vice-leader' | 'member';

export interface ClanMember {
    id: string;
    name: string;
    avatarId: string;
    leaderboardPoints: number;
    role: ClanMemberRole;
}

export interface Clan {
  id: string;
  name: string;
  emblem: string;
  color: string;
  leaderId: string;
  members: ClanMember[];
  invitations: { userId: string; userName: string; avatarId: string; }[];
  totalPoints: number;
  totalHonorPoints: number;
  unlockedEmblems: string[];
}


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
  score: number; 
  clan?: { id: string; name: string, emblem: string };
  position: number; 
  isReady?: boolean; 
  temporaryTitle?: string | null;
  balance?: number; // For monopoly-style game
  properties?: number[]; // Array of property IDs (index in the board array)
}

export interface Humiliation {
    by: string; // ID of the humiliator
    byName: string;
    at: Date;
    until: Date;
    taxToLift: number;
    durationInDays: number;
}

export interface AllegianceRequest {
    fromId: string;
    fromName: string;
    fromAvatar: string;
    offer: {
        amount: number;
        currency: 'coins'; // For now, only coins
    };
    durationInDays: number; // 1, 2, or 3
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: Date;
}

export interface ActiveAllegiance {
    to: string; // ID of the liege lord
    toName: string;
    until: Date;
}


export interface TaxDemand {
    fromId: string;
    fromName: string;
    amount: number;
    status: 'pending' | 'paid' | 'rejected';
    createdAt: Date;
}

export interface AllianceMemberInfo {
    name: string;
    avatarId: string;
    status: 'pending' | 'accepted';
}

export interface Alliance {
    id: string; // sorted_id1_id2
    members: Record<string, AllianceMemberInfo>;
    createdAt: Date;
}

export interface Decree {
    title: string;
    issuedBy: string;
    issuedByName: string;
    at: Date;
    until: Date;
    durationInDays: number;
}

export interface SocialEvent {
    type: 'allegiance' | 'rebellion' | 'humiliation' | 'game_end';
    description: string;
    timestamp: Date;
}


export interface ClanInvitation {
    clanId: string;
    clanName: string;
    invitedBy: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string | null;
  gender?: 'male' | 'female';
  isAdmin: boolean;
  isEditor: boolean; // Added for news editors
  coins: number;
  diamonds: number;
  avatarId: string;
  unlockedAvatars: string[];
  unlockedPunishmentAvatars?: string[];
  leaderboardPoints: number; 
  honorPoints: number;
  loyaltyPoints: number;
  rebellionPoints?: number;
  trophies: number;
  gamesPlayed: number;
  hasChangedName?: boolean;
  leagues?: {id: string, name: string}[];
  winCounts?: Record<Game['gameType'], number>;
  clan?: { id: string; name: string, emblem: string };
  clanRole?: ClanMemberRole;
  clanInvitations?: ClanInvitation[];
  audienceGroups?: string[];
  humiliation?: Humiliation | null;
  allegiance?: ActiveAllegiance | null;
  allegianceRequests?: AllegianceRequest[];
  taxDemands?: TaxDemand[];
  alliances?: Alliance[];
  decrees?: Decree[];
  duelChallenges?: DuelChallenge[];
  lastPunishmentTimestamp?: Record<string, Timestamp>; // { [targetId]: timestamp }
  originalAvatarToRevert?: { 
      id: string; 
      until: Date; 
      taxToLift: number; 
      by: string; 
      byName: string;
      durationInDays: number;
  } | null;
  permissions?: PermissionId[]; // All permissions granted by the user's current rank
  isPunished?: boolean;
}

export interface GameKing {
    name: string;
    avatarId: string;
    winCount: number;
    kingId: string;
}

// Snakes and Scissors Types (now Monopoly-style)
export interface BoardProperty {
    id: number;
    type: 'property' | 'fine' | 'start' | 'chance';
    name: string;
    price: number;
    rent: number;
    ownerId: string | null;
    color: string | null;
}

export type MonopolyTurnPhase = 'roll' | 'moving' | 'buy_or_pass' | 'question' | 'pay_rent' | 'end_turn' | 'final_results';
export type MonopolyGameState = 'lobby' | MonopolyTurnPhase;


export interface SnakesAndScissorsQuestion {
    id: string;
    text: string;
    options: string[];
    correctAnswer: string;
    category: string;
}


export type KingOfGeniusGameState = "lobby" | "team_selection" | "challenge_intro" | "challenge_active" | "challenge_results" | "final_results";
export type TrapAnswerGameState = "lobby" | "category-selection" | "answer-submission" | "guessing" | "round-results" | "final_results";
export type MafiaGameState = "lobby" | "role_reveal" | "night" | "day" | "voting" | "execution" | "final_results";
export type WordWarGameState = "lobby" | "preparation" | "guide_turn" | "guesser_turn" | "board_reveal" | "final_results";
export type DrawAndGuessGameState = "lobby" | "category_selection" | "drawing" | "guessing" | "round-results" | "final_results";
export type PrisonGameState = "lobby" | "instructions" | "open_auction" | "closed_auction_bidding" | "closed_auction_answering" | "judging" | "rejudging" | "results" | "final_results";

export type GameState = KingOfGeniusGameState | TrapAnswerGameState | MafiaGameState | WordWarGameState | DrawAndGuessGameState | PrisonGameState | MonopolyGameState;

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
    currency: 'coins' | 'diamonds';
}

export type EmojiReactionType = 'laugh' | 'mock' | 'apologize' | 'shame';

export interface EmojiReaction {
    emoji: EmojiReactionType;
    timestamp: Timestamp;
}


export interface DrawingLine {
    points: number[];
    color: string;
    strokeWidth: number;
    tool: 'pen' | 'eraser';
}

export interface DrawingRect {
    type: 'rect';
    x: number;
    y: number;
    width: number;
    height: number;
    stroke: string;
    strokeWidth: number;
    isDrawing?: boolean;
}

export interface DrawingCircle {
    type: 'circle';
    x: number;
    y: number;
    radius: number;
    stroke: string;
    strokeWidth: number;
    isDrawing?: boolean;
}

export interface DrawingSimpleLine {
    type: 'line';
    points: [number, number, number, number];
    stroke: string;
    strokeWidth: number;
    isDrawing?: boolean;
}

export interface DrawingTriangle {
    type: 'triangle';
    x: number;
    y: number;
    radius: number;
    stroke: string;
    strokeWidth: number;
    isDrawing?: boolean;
}


export type DrawingShape = DrawingRect | DrawingCircle | DrawingSimpleLine | DrawingTriangle;

export interface DrawingData {
    lines: DrawingLine[];
    shapes: DrawingShape[];
    bgColor: string;
    width: number;
    height: number;
}
export type GuessStatus = 'correct' | 'close' | 'incorrect';
export interface PlayerGuess {
    playerId: string;
    playerName: string;
    guess: string;
    status: GuessStatus;
}
export interface DrawAndGuessPrompt {
    id: string;
    text: string;
    category: string;
}

export type MafiaPhase = MafiaGameState;
export type NightActionType = 'kill' | 'heal' | 'investigate' | 'spy' | 'bomb' | 'shapeshift';

export interface NightAction {
    actorId: string;
    action: NightActionType;
    targetId: string;
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


export interface DuelChallenge {
    id: string; // gameId
    fromId: string;
    fromName: string;
    betAmount: number;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: Date;
}

export interface Game {
  id: string;
  hostId: string;
  challengeId?: string; // For challenges
  challengeDetails?: {
      title: string;
      minPlayersToStart: number;
      entryFee: {
          type: 'coins' | 'leaderboardPoints';
          value: number;
      };
  };
  gameType: 'king-of-genius' | 'trap-answer' | 'behind-the-mask' | 'word_war' | 'draw-and-guess' | 'prison' | 'snakes_and_scissors';
  players: Player[];
  playerUids: string[];
  gameState: GameState;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  isDuel?: boolean;
  duelDetails?: {
      challengerId: string;
      challengedId: string;
      betAmount: number;
  };
  
  round?: number; 
  playerScores?: Record<string, number>;
  
  gameResult?: {
    winner: PlayerTeam | 'draw' | 'game_over' | string;
    message: string;
  };
  
  // king-of-genius specific fields
  teamScores?: { A: number; B: number };
  challengeOrder?: string[];
  currentChallengeIndex?: number;
  puzzles?: string[];
  challengeState?: {
      duration: number,
      challengeEndsAt: Timestamp,
      puzzle?: any;
      results?: ChallengeResult[];
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
        deceivedFool?: { playerId: string; name: string; avatarId: string; count: number } | null;
        cunningDeceiver?: { playerId: string; name: string; avatarId: string; count: number } | null;
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
    lastExecutedPlayer?: { name: string; avatarId: string; temporaryTitle?: string } | null;
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
    suspicions?: Record<string, number[]>; // { [team_color]: [cardIndex1, cardIndex2...] }
  };
    
   // "Draw and Guess" specific state
  drawAndGuessState?: {
    settings: {
        drawingTime: number;
        guessingTime: number;
        roundsPerPlayer: number;
    };
    categories?: string[];
    fiveRandomCategories?: string[];
    turnOrder?: string[];
    drawerTurnCounts?: Record<string, number>; // { [playerId]: count }
    currentDrawerId?: string;
    prompt?: DrawAndGuessPrompt;
    drawing?: DrawingData | null;
    guesses?: PlayerGuess[];
    ratings?: Record<string, number>; // { [raterId]: rating }
    timerEndsAt?: Timestamp;
    retries?: number; // Number of retries for the drawer
  };
  
    // "The Prison" specific state
  prisonState?: {
      settings: {
          biddingTime: number;
          answeringTime: number;
          judgingTime: number;
          rounds: number;
      };
      currentQuestion?: PrisonQuestion;
      closedAuctionQuestion?: PrisonQuestion;
      playerProgress?: Record<string, { answers: string[] }>;
      openAuctionSubmissions?: Record<string, string[]>;
      bids?: Record<string, number>; // { playerId: amount }
      highestBid?: number;
      auctionWinnerId?: string;
      aiJudgeResults?: JudgeSingleSubmissionOutput[];
      lastRoundResult?: {
          message: string;
          points: Record<string, {
              points: number;
              breakdown: { reason: string, points: number }[];
          }>;
          freedPlayerName?: string;
          freedPlayerAvatarId?: string;
      };
      prisonHistory?: Record<string, { inPrison: number, roundsWithoutWinningAuction: number }>; // { playerId: { inPrison: rounds, ... }}
      timerEndsAt?: Timestamp;
      judgingStarted?: boolean;
      questionChangersUsedBy?: string[];
      rejudgeRequestsUsedBy?: string[];
      activeRejudgeRequest?: { playerId: string; name: string; reason: string };
      judgeExplanation?: string;
      isRejectionJustified?: boolean;
  };
  
  // "Snakes and Scissors" specific state
  snakesAndScissorsState?: {
    settings: {
        boardSize: number;
        rounds: number;
    };
    board: BoardProperty[];
    turnOrder: string[];
    currentTurnIndex: number;
    turnPhase: MonopolyTurnPhase;
    questionState?: {
        question: SnakesAndScissorsQuestion,
        answeredBy: Record<string, { answer: string; isCorrect: boolean }>;
    };
    movementState?: {
        isRolling: boolean;
        diceValue: number;
        playerId: string;
        from: number;
        to: number;
    };
    eventLog?: string[];
    timerEndsAt?: Timestamp;
  };
}


export const GAME_TYPE_NAMES: Record<Game['gameType'], string> = {
    'king-of-genius': 'ساحة العباقرة',
    'trap-answer': 'الجواب المفخخ',
    'behind-the-mask': 'خلف القناع',
    'word_war': 'حرب الكلمات',
    'draw-and-guess': 'لعبة رسمة',
    'prison': 'السجن',
    'snakes_and_scissors': 'بنك الحظ',
};

