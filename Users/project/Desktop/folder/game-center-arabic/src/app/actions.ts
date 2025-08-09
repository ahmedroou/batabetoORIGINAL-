

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

import { createChallenge as createChallengeAction, getChallenges as getChallengesAction, joinChallenge as joinChallengeAction, updateChallenge as updateChallengeAction, deleteChallenge as deleteChallengeAction, getAllChallengesForAdmin as getAllChallengesForAdminAction } from '@/lib/actions/challenges';
import { restartChallenge } from '@/lib/actions/king-of-genius';
import { createGameRoom as createGameRoomAction, joinGameRoom as joinGameRoomAction } from '@/lib/actions/room';
import { selectCategoryAndGetQuestion as selectTrapAnswerCategoryAction, handleTimeout as handleTrapAnswerTimeout, submitGuess as submitTrapAnswerGuess } from '@/lib/actions/trap-answer';
import { getAvatarPrices as getAvatarPricesAction } from '@/lib/actions/admin';
import { getPublishedArticles as getPublishedArticlesAction } from '@/lib/actions/news';

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
    return createChallengeAction(adminId, challengeData);
}
export async function getChallenges(): Promise<Challenge[]> {
    return getChallengesAction();
}
export async function joinChallenge(challengeId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    return joinChallengeAction(challengeId, userId);
}
export async function updateChallenge(adminId: string, challengeId: string, data: Partial<Omit<Challenge, 'id' | 'createdAt'>>): Promise<{ success: boolean; error?: string }> {
    return updateChallengeAction(adminId, challengeId, data);
}
export async function deleteChallenge(adminId: string, challengeId: string): Promise<{ success: boolean; error?: string }> {
    return deleteChallengeAction(adminId, challengeId);
}
export async function getAllChallengesForAdmin(adminId: string): Promise<Challenge[]> {
    return getAllChallengesForAdminAction(adminId);
}

// King of Genius Actions
export async function restartKingOfGeniusChallenge(gameId: string, hostId: string) {
    return restartChallenge(gameId, hostId);
}

// Room Actions
export async function createGameRoom(userId: string, gameType: Game['gameType'], avatarId: string) {
    return createGameRoomAction(userId, gameType, avatarId);
}
export async function joinGameRoom(gameId: string, userId: string, avatarId: string) {
    return joinGameRoomAction(gameId, userId, avatarId);
}

// Trap Answer Actions
export async function selectCategoryAndGetQuestion(gameId: string, playerId: string, category: string) {
    return selectTrapAnswerCategoryAction(gameId, playerId, category);
}
export async function handleTimeout(gameId: string, hostId: string) {
    return handleTrapAnswerTimeout(gameId, hostId);
}
export async function submitGuess(gameId: string, playerId: string, guess: string | null) {
    return submitTrapAnswerGuess(gameId, playerId, guess);
}

// Admin Actions (Publicly accessible ones)
export async function getAvatarPrices() {
    return getAvatarPricesAction();
}

// News Actions
export async function getPublishedArticles(userId?: string) {
    return getPublishedArticlesAction(userId);
}

// Note: Do not re-export entire modules like `export { roomActions }`.
// Instead, create specific wrapper functions as done above.
// This is a requirement for files marked with "use server".
