

'use server';

/**
 * @fileOverview This file contains all server-side only actions, primarily for wrapping Genkit AI flows.
 */

import {
  generateCrimeScenario,
  type GenerateCrimeScenarioOutput,
} from '@/ai/flows/generate-crime-scenario';
import {
  detectIdentityReveal,
  type DetectIdentityRevealInput,
  type DetectIdentityRevealOutput,
} from '@/ai/flows/detect-identity-reveal-flow';
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
import { restartChallenge } from '@/lib/actions/king-of-genius';
import * as killerActions from '@/lib/actions/killer';
import * as adminActions from '@/lib/actions/admin';
import * as userActions from '@/lib/actions/user';
import type { PlayerLocationChoice, UserProfile, AvatarPrice, SocialRank } from '@/types';


/**
 * Generates a new crime scene using an AI flow. This must be a server action.
 * @returns A promise that resolves to the generated crime scene data.
 */
export async function generateNewCrimeScene(): Promise<GenerateCrimeScenarioOutput> {
  return generateCrimeScenario({});
}

/**
 * Checks if a message reveals the detective's identity. This is a server action for potential future use.
 * @param input - The message and detective's alias.
 * @returns A promise that resolves to whether the identity was revealed.
 */
export async function checkForIdentityReveal(
  input: DetectIdentityRevealInput
): Promise<DetectIdentityRevealOutput> {
  return detectIdentityReveal(input);
}

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


/**
 * Restarts the current challenge for the "King of Genius" game.
 * @param gameId - The ID of the game.
 * @param hostId - The ID of the host initiating the restart.
 * @returns A promise that resolves when the action is complete.
 */
export async function restartKingOfGeniusChallenge(gameId: string, hostId: string): Promise<void> {
    return restartChallenge(gameId, hostId);
}

// Killer Game Actions
export async function submitPlayerLocation(gameId: string, playerId: string, location: PlayerLocationChoice) {
  return killerActions.chooseLocation(gameId, playerId, location);
}

export async function witnessSideWithKillerAction(gameId: string, witnessId: string) {
    return killerActions.witnessSidesWithKiller(gameId, witnessId);
}

export async function copCheckPlayerAction(gameId: string, copId: string, targetId: string) {
    return killerActions.copCheckPlayer(gameId, copId, targetId);
}

export async function submitKillerMessage(gameId: string, playerId: string, text: string, asDetective: boolean) {
    return killerActions.submitMessage(gameId, playerId, text, asDetective);
}

export async function submitKillerNightMessage(gameId: string, playerId: string, text: string, location: PlayerLocationChoice) {
    return killerActions.submitNightMessage(gameId, playerId, text, location);
}

// Admin Actions
export async function searchUsers(searchTerm: string): Promise<UserProfile[]> {
    return adminActions.searchUsers(searchTerm);
}

export async function adminUpdateUser(userId: string, data: Partial<UserProfile>): Promise<{success: boolean, error?: string}> {
    return adminActions.adminUpdateUser(userId, data);
}

export async function setAvatarPrices(prices: AvatarPrice[]): Promise<{success: boolean, error?: string}> {
    return adminActions.setAvatarPrices(prices);
}

export async function getAvatarPrices(): Promise<{success: boolean, prices?: AvatarPrice[], error?: string}> {
    return adminActions.getAvatarPrices();
}

export async function setSocialRanks(ranks: SocialRank[]): Promise<{success: boolean; error?: string}> {
    return adminActions.setSocialRanks(ranks);
}

export async function getSocialRanks(): Promise<{success: boolean; ranks?: SocialRank[]; error?: string}> {
    return adminActions.getSocialRanks();
}


// User Actions
export async function purchaseAvatarAction(userId: string, avatarId: string, price: number): Promise<{success: boolean, error?: string}> {
    return userActions.purchaseAvatar(userId, avatarId, price);
}
