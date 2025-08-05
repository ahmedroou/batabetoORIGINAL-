
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
import { restartKingOfGeniusChallenge } from '@/lib/actions/king-of-genius';
import * as roomActions from '@/lib/actions/room';
import * as trapAnswerActions from '@/lib/actions/trap-answer';
import * as userActions from '@/lib/actions/user';
import * as adminActions from '@/lib/actions/admin';
import * as drawAndGuessActions from '@/lib/actions/draw-and-guess';

// Explicitly export functions that are safe to be called from the client
export {
  generateGeniusChallenge,
  generateTrapAnswer,
  restartKingOfGeniusChallenge,
  roomActions,
  trapAnswerActions,
  userActions,
  adminActions,
  drawAndGuessActions,
  getAvatarPrices
};

export type { GenerateGeniusChallengeInput, GenerateGeniusChallengeOutput, GenerateTrapAnswerInput, GenerateTrapAnswerOutput };

// We need to export this function to be used in client components
import { getAvatarPrices } from '@/lib/actions/admin';

