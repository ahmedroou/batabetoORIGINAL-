

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
  leaderboard: z.array(z.any()).describe("A list of the top 5 players on the leaderboard."),
  punished_players: z.array(z.any()).describe("A list of players currently under any punishment."),
  top_punisher: z.any().nullable().describe("The player who has issued the most punishments."),
  active_challenges: z.array(z.any()).describe("A list of currently active challenges or tournaments."),
  recent_games: z.array(z.any()).optional().describe("A list of the last 10 finished games."),
  date: z.string().describe("Today's date in a readable format (e.g., 'Sunday, July 28, 2024')."),
  directive: z.string().optional().describe("An optional directive from the admin on what to focus on in the article."),
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

export type EntryFee = {
    type: 'coins' | 'leaderboardPoints';
    value: number;
};

export interface Challenge {
    id: string;
    title: string;
    targetPoints: number; 
    specificGameType?: Game['gameType'] | 'all';
    firstPlacePrize: ChallengePrize[];
    secondPlacePrize: ChallengePrize[];
    thirdPlacePrize: ChallengePrize[];
    entryFee?: EntryFee;
    
    endsAt: Date;
    createdAt: Timestamp;
    participantIds: string[];
    participantCount: number;
    scores: Record<string, number>;
    winners?: {
        first?: { id: string, name: string };
        second?: { id: string, name: string };
        third?: { id: string, name: string };
    };
    topParticipants?: UserProfile[]; 
    participants?: UserProfile[];
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
    { threshold: 50, name: 'مواطن صالح', icon: 'ShieldCheck', permissions: [] },
    { threshold: 150, name: 'شخصية مرموقة', icon: 'Award', permissions: [] },
    { threshold: 300, name: 'عضو مجلس', icon: 'Gem', permissions: [] },
    { threshold: 500, name: 'زعيم المدينة', icon: 'Crown', permissions: [] },
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

export type PlayerRole = 'killer' | 'detective' | 'doctor' | 'soldier' | 'spy' | 'shapeshifter' | 'bomber' | 'civilian' | 'contestant';
export type PlayerTeam = 'mafia' | 'good' | 'neutral' | 'red' | 'blue';
export type PlayerStatus = 'alive' | 'killed' | 'voted_out' | 'left' | 'executed' | 'in_prison';

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
    id: string;
    title: string;
    issuedBy: string;
    issuedByName: string;
    at: Date;
    until: Date;
    durationInDays: number;
    taxToLift: number;
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
  punishmentsIssued?: number;
  hasChangedName?: boolean;
  leagues?: {id: string, name: string}[];
  winCounts?: Record<Game['gameType'], number>;
  clan?: { id: string; name: string, emblem: string };
  clanRole?: ClanMemberRole;
  clanInvitations?: ClanInvitation[];
  audienceGroups?: string[];
  humiliation?: Humiliation | null;
  allegiance?: ActiveAllegiance | null;
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

export type KingOfGeniusGameState = "lobby" | "team_selection" | "challenge_intro" | "challenge_active" | "challenge_results" | "final_results";
export type TrapAnswerGameState = "lobby" | "category-selection" | "answer-submission" | "guessing" | "round-results" | "final_results";
export type MafiaGameState = "lobby" | "role_reveal" | "night" | "day" | "voting" | "execution" | "final_results";
export type WordWarGameState = "lobby" | "preparation" | "guide_turn" | "guesser_turn" | "board_reveal" | "final_results";
export type PrisonGameState = "lobby" | "instructions" | "open_auction" | "closed_auction_bidding" | "closed_auction_answering" | "judging" | "rejudging" | "results" | "final_results";

export type GameState = KingOfGeniusGameState | TrapAnswerGameState | MafiaGameState | WordWarGameState | PrisonGameState;

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
    dummyAnswers?: string[];
    randomKey?: number; // Add this field for efficient random fetching
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
  gameType: 'king-of-genius' | 'trap-answer' | 'behind-the-mask' | 'word_war' | 'prison';
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
          guessTime?: number;
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
        timedOutGuesserIds?: string[];
        awayPlayerIdsDuringRound?: string[];
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
    awayPlayerIds?: string[]; 
    awayPlayerIdsInAnsweringPhase?: string[];
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
}

export const GAME_TYPE_NAMES: Record<Game['gameType'], string> = {
    'king-of-genius': 'ساحة العباقرة',
    'trap-answer': 'الجواب المفخخ',
    'behind-the-mask': 'خلف القناع',
    'word_war': 'حرب الكلمات',
    'prison': 'السجن',
};

// Sub-states for Mafia game
export type MafiaPhase = 'lobby' | 'role_reveal' | 'night' | 'day' | 'execution' | 'final_results';

export type DayEventType = 'death' | 'protection' | 'execution' | 'no_execution';
export type DayEvent = {
    type: DayEventType;
    message: string;
    killedPlayer?: { name: string; avatarId: string; };
    executedPlayer?: { name: string; avatarId: string; };
};

export type NightActionType = 'kill' | 'heal' | 'investigate' | 'spy' | 'bomb' | 'shapeshift';
export interface NightAction {
    actorId: string;
    action: NightActionType;
    targetId: string;
    disguiseRole?: PlayerRole; // For shapeshifter
}

export type PrivateEventType = 'investigation_result' | 'spy_result' | 'spy_result_soldier_block' | 'doctor_success';
export interface PrivateEvent {
    type: PrivateEventType;
    message: string;
    targetPlayer?: { id: string; name: string; avatarId: string; role?: PlayerRole; };
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
    participants: string[];
    messages: PrivateChatMessage[];
}
