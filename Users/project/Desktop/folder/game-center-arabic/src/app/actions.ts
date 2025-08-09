

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
import * as kingOfGeniusActions from '@/lib/actions/king-of-genius';
import * as roomActions from '@/lib/actions/room';
import * as trapAnswerActions from '@/lib/actions/trap-answer';
import * as userActions from '@/lib/actions/user';
import * as adminActions from '@/lib/actions/admin';
import * as drawAndGuessActions from '@/lib/actions/draw-and-guess';
import * as newsActions from '@/lib/actions/news';
import * as clanActions from '@/lib/actions/clans';
import * as challengeActions from '@/lib/actions/challenges';
import * as wordWarActions from '@/lib/actions/word-war';
import * as prisonActions from '@/lib/actions/prison';
import * as snakesAndScissorsActions from '@/lib/actions/snakes-and-scissors';

import type { Game } from '@/types';

// Explicitly export functions that are safe to be called from the client
export {
  generateGeniusChallenge,
  generateTrapAnswer,
};

export async function createGameRoom(userId: string, gameType: Game['gameType'], avatarId: string) {
    return roomActions.createGameRoom(userId, gameType, avatarId);
}

export async function joinGameRoom(gameId: string, userId: string, avatarId: string) {
    return roomActions.joinGameRoom(gameId, userId, avatarId);
}

// Re-exporting all actions for consistency
export {
    kingOfGeniusActions,
    roomActions,
    trapAnswerActions,
    userActions,
    adminActions,
    drawAndGuessActions,
    newsActions,
    clanActions,
    challengeActions,
    wordWarActions,
    prisonActions,
    snakesAndScissorsActions,
};

export type { GenerateGeniusChallengeInput, GenerateGeniusChallengeOutput, GenerateTrapAnswerInput, GenerateTrapAnswerOutput };

// Specific exports for draw-and-guess since they seem to be used directly
export const { 
    selectCategoryAndGetQuestion, 
    handleTimeout: handleDrawAndGuessTimeout, 
    submitGuess,
    submitRating,
    nextDrawAndGuessRound,
    submitDrawing,
    updateDrawing
} = drawAndGuessActions;

    