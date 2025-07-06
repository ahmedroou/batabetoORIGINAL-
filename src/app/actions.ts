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
