
'use server';

/**
 * @fileOverview This file contains all server-side only actions, primarily for wrapping Genkit AI flows.
 */

import {
  generateCrimeScenario,
  type GenerateCrimeScenarioOutput,
} from '@/ai/flows/generate-crime-scenario';
import {
  generatePersonalizedQuestions,
  type GeneratePersonalizedQuestionsInput,
  type GeneratePersonalizedQuestionsOutput,
} from '@/ai/flows/generate-personalized-questions';
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
import { restartChallenge } from '@/lib/actions/king-of-genius';
import * as killerActions from '@/lib/actions/killer';
import type { PlayerLocationChoice } from '@/types';


/**
 * Generates a new crime scene using an AI flow. This must be a server action.
 * @returns A promise that resolves to the generated crime scene data.
 */
export async function generateNewCrimeScene(): Promise<GenerateCrimeScenarioOutput> {
  return generateCrimeScenario({});
}

/**
 * Generates a personalized question based on a category. This is a server action for potential future use.
 * @param input - The category for the question.
 * @returns A promise that resolves to the generated question.
 */
export async function getPersonalizedQuestion(
  input: GeneratePersonalizedQuestionsInput
): Promise<GeneratePersonalizedQuestionsOutput> {
  return generatePersonalizedQuestions(input);
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
 * Restarts the current challenge for the "King of Genius" game.
 * @param gameId - The ID of the game.
 * @param hostId - The ID of the host initiating the restart.
 * @returns A promise that resolves when the action is complete.
 */
export async function restartKingOfGeniusChallenge(gameId: string, hostId: string): Promise<void> {
    return restartChallenge(gameId, hostId);
}

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
