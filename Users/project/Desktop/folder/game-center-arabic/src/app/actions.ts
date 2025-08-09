

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

import * as challengeActions from '@/lib/actions/challenges';
import * as kingOfGeniusActions from '@/lib/actions/king-of-genius';
import * as roomActions from '@/lib/actions/room';
import * as trapAnswerActions from '@/lib/actions/trap-answer';
import * as userActions from '@/lib/actions/user';
import * as adminActions from '@/lib/actions/admin';
import * as drawAndGuessActions from '@/lib/actions/draw-and-guess';
import * as newsActions from '@/lib/actions/news';
import * as clanActions from '@/lib/actions/clans';
import * as prisonActions from '@/lib/actions/prison';

import type { Game, Challenge, ChallengePrize } from '@/types';

// Explicitly export AI-related functions
export {
  generateGeniusChallenge,
  generateTrapAnswer,
};
export type { GenerateGeniusChallengeInput, GenerateGeniusChallengeOutput, GenerateTrapAnswerInput, GenerateTrapAnswerOutput };

// --- Wrapper functions for client-side actions ---

// Challenge Actions
export async function createChallenge(adminId: string, challengeData: Omit<Challenge, 'id' | 'createdAt' | 'participantIds' | 'endsAt' | 'participantCount'> & { durationInHours: number }): Promise<{ success: boolean; error?: string }> {
    return challengeActions.createChallenge(adminId, challengeData);
}
export async function getChallenges(): Promise<Challenge[]> {
    return challengeActions.getChallenges();
}
export async function joinChallenge(challengeId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    return challengeActions.joinChallenge(challengeId, userId);
}
export async function updateChallenge(adminId: string, challengeId: string, data: Partial<Omit<Challenge, 'id' | 'createdAt'>>): Promise<{ success: boolean; error?: string }> {
    return challengeActions.updateChallenge(adminId, challengeId, data);
}
export async function deleteChallenge(adminId: string, challengeId: string): Promise<{ success: boolean; error?: string }> {
    return challengeActions.deleteChallenge(adminId, challengeId);
}
export async function getAllChallengesForAdmin(adminId: string): Promise<Challenge[]> {
    return challengeActions.getAllChallengesForAdmin(adminId);
}

// King of Genius Actions
export async function restartKingOfGeniusChallenge(gameId: string, hostId: string) {
    return kingOfGeniusActions.restartChallenge(gameId, hostId);
}

// Room Actions
export async function createGameRoom(userId: string, gameType: Game['gameType'], avatarId: string) {
    return roomActions.createGameRoom(userId, gameType, avatarId);
}
export async function joinGameRoom(gameId: string, userId: string, avatarId: string) {
    return roomActions.joinGameRoom(gameId, userId, avatarId);
}

// Trap Answer Actions
export async function selectCategoryAndGetQuestion(gameId: string, playerId: string, category: string) {
    return trapAnswerActions.selectCategoryAndGetQuestion(gameId, playerId, category);
}
export async function handleTimeout(gameId: string, hostId: string) {
    return trapAnswerActions.handleTimeout(gameId, hostId);
}
export async function submitGuess(gameId: string, playerId: string, guess: string | null) {
    return trapAnswerActions.submitGuess(gameId, playerId, guess);
}

// Admin Actions (Publicly accessible ones)
export async function getAvatarPrices() {
    return adminActions.getAvatarPrices();
}

// News Actions
export async function getPublishedArticles(userId?: string) {
    return newsActions.getPublishedArticles(userId);
}

// Note: Do not re-export entire modules like `export { roomActions }`.
// Instead, create specific wrapper functions as done above.
// This is a requirement for files marked with "use server".
