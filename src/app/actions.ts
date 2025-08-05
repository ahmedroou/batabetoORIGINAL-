

'use server';

/**
 * @fileOverview This file contains all server-side only actions, primarily for wrapping Genkit AI flows and handling admin actions.
 */

// AI Flow Wrappers
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

// Explicit re-export of AI flows
export { generateGeniusChallenge, generateTrapAnswer };
export type { GenerateGeniusChallengeInput, GenerateGeniusChallengeOutput, GenerateTrapAnswerInput, GenerateTrapAnswerOutput };

// NOTE: All other actions should be imported directly from their respective files
// in the components that use them (e.g., import { leaveGame } from '@/lib/actions/room').
// This file should only contain server actions that are directly used across the app
// or are wrappers for AI flows. Avoid re-exporting entire modules from here.

