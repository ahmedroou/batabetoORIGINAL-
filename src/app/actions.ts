
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
import * as newsActions from '@/lib/actions/news';
import * as clanActions from '@/lib/actions/clans';
import * as challengeActions from '@/lib/actions/challenges';

// Explicitly export functions that are safe to be called from the client
export {
  generateGeniusChallenge,
  generateTrapAnswer,
  restartKingOfGeniusChallenge,
};

export async function createGameRoom(userId: string, gameType: Game['gameType'], avatarId: string) {
    return roomActions.createGameRoom(userId, gameType, avatarId);
}

export async function joinGameRoom(gameId: string, userId: string, avatarId: string) {
    return roomActions.joinGameRoom(gameId, userId, avatarId);
}

export async function selectCategoryAndGetQuestion(gameId: string, playerId: string, category: string) {
    return trapAnswerActions.selectCategoryAndGetQuestion(gameId, playerId, category);
}

export async function handleTimeout(gameId: string, hostId: string) {
    return trapAnswerActions.handleTimeout(gameId, hostId);
}
export async function submitGuess(gameId: string, playerId: string, guess: string | null) {
    return trapAnswerActions.submitGuess(gameId, playerId, guess);
}

export async function getAvatarPrices() {
    return adminActions.getAvatarPrices();
}

export async function getPublishedArticles(userId?: string) {
    return newsActions.getPublishedArticles(userId);
}

export type { GenerateGeniusChallengeInput, GenerateGeniusChallengeOutput, GenerateTrapAnswerInput, GenerateTrapAnswerOutput };

import type { Game } from '@/types';
