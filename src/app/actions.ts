

'use server';

/**
 * @fileOverview This file contains all server-side only actions, primarily for wrapping Genkit AI flows and handling admin actions.
 */

import {
  generateGeniusChallenge,
  type GenerateGeniusChallengeInput,
  type GenerateGeniusChallengeOutput,
} from '@/ai/flows/generate-genius-challenge';
import { 
    generateTrapAnswer,
    type GenerateTrapAnswerInput,
    type GenerateTrapAnswerOutput,
} from '@/ai/flows/generate-trap-answer-flow';
import type { 
    JudgePrisonAnswersInput,
    JudgePrisonAnswersOutput,
    Game,
    Mail,
} from '@/types';
import * as userActions from '@/lib/actions/user';
import * as adminActions from '@/lib/actions/admin';
import type { PlayerLocationChoice, UserProfile, AvatarPrice, SocialRank } from '@/types';
import * as behindTheMaskActions from '@/lib/actions/behind-the-mask';
import * as kingOfGeniusActions from '@/lib/actions/king-of-genius';
import * as prisonActions from '@/lib/actions/prison';
import * as trapAnswerActions from '@/lib/actions/trap-answer';
import * as wordWarActions from '@/lib/actions/word-war';
import * as roomActions from '@/lib/actions/room';
import * as castleActions from '@/lib/actions/the-castle';


/**
 * Generates a puzzle for a specific King of Genius challenge for testing purposes.
 * @param input - The challenge ID.
 * @returns A promise that resolves to the generated puzzle.
 */
export async function generateTestChallenge(input: GenerateGeniusChallengeInput): Promise<GenerateGeniusChallengeOutput> {
  return generateGeniusChallenge(input);
}

/**
 * Generates a plausible but incorrect answer for the "Trap Answer" game.
 * @param input - The question and the correct answer.
 * @returns A promise that resolves to the generated trap answer.
 */
export async function getTrapAnswer(input: GenerateTrapAnswerInput): Promise<GenerateTrapAnswerOutput> {
    return generateTrapAnswer(input);
}


// Admin Actions for Store Page
export async function setAvatarPrices(prices: AvatarPrice[]): Promise<{success: boolean, error?: string}> {
  return adminActions.setAvatarPrices(prices);
}

export async function getAvatarPrices(): Promise<{success: boolean, prices?: AvatarPrice[], error?: string}> {
  return adminActions.getAvatarPrices();
}

export async function setSocialRanks(ranks: SocialRank[]): Promise<{success: boolean, error?: string}> {
  return adminActions.setSocialRanks(ranks);
}

export async function getSocialRanks(): Promise<{success: boolean, ranks?: SocialRank[], error?: string}> {
  return adminActions.getSocialRanks();
}

export async function getTopUsers(field: 'coins' | 'leaderboardPoints', count: number): Promise<UserProfile[]> {
  return adminActions.getTopUsers(field, count);
}

export async function setDefaultAvatar(avatarId: string): Promise<{ success: boolean; error?: string }> {
  return adminActions.setDefaultAvatar(avatarId);
}

export async function getDefaultAvatar(): Promise<{ success: boolean; avatarId?: string; error?: string }> {
    return adminActions.getDefaultAvatar();
}

// New Admin Action for Mailbox
export async function sendMailToUsers(adminId: string, recipientIds: string[], subject: string, body: string, coins: number): Promise<{ success: boolean; error?: string }> {
    return adminActions.adminSendMail(adminId, recipientIds, subject, body, coins);
}

export async function searchUsers(searchTerm: string): Promise<UserProfile[]> {
    return adminActions.searchUsers(searchTerm);
}

export async function adminUpdateUser(userId: string, data: Partial<UserProfile>): Promise<{success: boolean, error?: string}> {
    return adminActions.adminUpdateUser(userId, data);
}

export async function resetAllUserAvatars(): Promise<{ success: boolean; error?: string; count?: number, message?: string }> {
    return adminActions.resetAllUserAvatars();
}


// Mailbox Actions for User
export async function getMail(userId: string): Promise<Mail[]> {
    return userActions.getMailForUser(userId);
}

export async function claimMailCoins(userId: string, mailId: string): Promise<{success: boolean, error?: string}> {
    return userActions.claimMailCoins(userId, mailId);
}

export async function markMailAsRead(userId: string, mailId: string): Promise<void> {
    return userActions.markMailAsRead(userId, mailId);
}

// Re-export all game actions to be used by the client
export const leaveGame = roomActions.leaveGame;
export const kickPlayerFromLobby = roomActions.kickPlayerFromLobby;

export const progressToTeamSelection = kingOfGeniusActions.progressToTeamSelection;
export const restartKingOfGeniusChallenge = kingOfGeniusActions.restartChallenge;


export const startPrisonGame = prisonActions.startPrisonGame;
export const updatePrisonSettings = prisonActions.updatePrisonSettings;

export const startGame = behindTheMaskActions.startGame;

export const startTrapAnswerGame = trapAnswerActions.startTrapAnswerGame;

export const startWordWarGame = wordWarActions.startGame;
export const updateWordWarSettings = wordWarActions.updateGameSettings;
export const selectWordWarTeam = wordWarActions.selectTeam;
export const randomizeWordWarTeams = wordWarActions.randomizeTeams;
export const updateMafiaSettings = behindTheMaskActions.updateMafiaSettings;

export const startTheCastleGame = castleActions.startGame;
export const movePlayer = castleActions.movePlayer;
export const buildWall = castleActions.buildWall;
export const endTurn = castleActions.endTurn;
