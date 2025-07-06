
import type { Timestamp } from 'firebase/firestore';

export interface Player {
  id: string;
  name: string;
  avatarId: string;
  alias?: string;
  role?: 'killer' | 'detective' | 'civilian' | 'witness';
  status: 'alive' | 'killed' | 'voted_out' | 'arrested';
  isImmune?: boolean;
  team?: 'A' | 'B'; // For Rope of Salvation game
}

export type WhoAmIGameState = "lobby" | "instructions" | "answering" | "guessing" | "round_results" | "final_results";
export type KillerGameState = "lobby" | "preparation" | "role_reveal" | "detective_choice" | "night" | "victim_reveal" | "discussion" | "voting_results" | "ended";
export type RopeOfSalvationGameState = "lobby" | "team_selection" | "map_view" | "challenge" | "ended";
export type GameState = WhoAmIGameState | KillerGameState | RopeOfSalvationGameState;

export type ChallengeType = 'intelligence' | 'memory' | 'description' | 'symbols' | 'timing';
export type PowerupType = 'telescope' | 'compass' | 'gps' | 'hint';


export interface MapTile {
    id: string;
    type: 'challenge' | 'safe' | 'powerup';
    challengeType?: ChallengeType;
    powerupType?: PowerupType;
}

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

export interface Game {
  id: string;
  hostId: string;
  gameType: 'who-am-i' | 'killer' | 'rope-of-salvation';
  players: Player[];
  playerUids: string[];
  gameState: GameState;
  createdAt: Timestamp;
  readyPlayers?: string[];

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
    winner: 'killer' | 'detective_civilians';
    message: string;
  };
  discussionEndsAt?: Timestamp;

  // rope-of-salvation specific fields
  mapDimensions?: { rows: number; cols: number };
  map?: MapTile[];
  teamAPosition?: { row: number; col: number };
  teamBPosition?: { row: number; col: number };
  collapsePosition?: number; // column index, starts at -1
  activeTeam?: 'A' | 'B';
  teamAScore?: number;
  teamBScore?: number;
  teamAHealth?: number; // Rope health
  teamBHealth?: number; // Rope health
  teamAPowerups?: Record<PowerupType, boolean>;
  teamBPowerups?: Record<PowerupType, boolean>;
  currentChallenge?: {
    team: 'A' | 'B';
    type: ChallengeType;
    description: string;
    expiresAt: Timestamp;
  };
}
