

'use server';

/**
 * @fileOverview This file contains all server-side only actions, primarily for wrapping Genkit AI flows and handling admin actions.
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
import {
  judgePrisonAnswers,
} from '@/ai/flows/judge-prison-answers-flow';
import type { 
    JudgePrisonAnswersInput,
    JudgePrisonAnswersOutput,
} from '@/types';
import { restartChallenge } from '@/lib/actions/king-of-genius';
import * as killerActions from '@/lib/actions/killer';
import * as userActions from '@/lib/actions/user';
import * as adminActions from '@/lib/actions/admin';
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
 * AI Judge for the Prison Game.
 * @param input - The question and player submissions.
 * @returns A promise that resolves to the judged results.
 */
export async function getPrisonJudgeResults(input: JudgePrisonAnswersInput): Promise<JudgePrisonAnswersOutput> {
    return judgePrisonAnswers(input);
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
export async function submitKillerMessage(gameId: string, playerId: string, text: string) {
    return killerActions.submitMessage(gameId, playerId, text);
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
