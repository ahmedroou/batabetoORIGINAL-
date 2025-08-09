

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

import type { Game, Challenge, ChallengePrize, DrawingData, GuessStatus, SocialRank, AvatarPrice } from '@/types';

// Import individual functions instead of modules
import { createGameRoom as createGameRoomAction, joinGameRoom as joinGameRoomAction, leaveGame as leaveGameAction, setPlayerReady as setPlayerReadyAction, kickPlayerFromLobby as kickPlayerFromLobbyAction } from '@/lib/actions/room';
import { selectCategoryAndGetQuestion as selectTrapAnswerCategoryAction, handleTimeout as handleTrapAnswerTimeout, submitGuess as submitTrapAnswerGuess, startTrapAnswerGame as startTrapAnswerGameAction, updateGameSettings as updateTrapAnswerSettings, submitTrapAnswer as submitTrapAnswerAction, nextTrapAnswerRound as nextTrapAnswerRoundAction, sendReaction as sendReactionAction } from '@/lib/actions/trap-answer';
import { getAvatarPrices as getAvatarPricesAction, getPunishmentAvatarPrices as getPunishmentAvatarPricesAction, setAvatarPrices as setAvatarPricesAction, setPunishmentAvatarPrices as setPunishmentAvatarPricesAction, setDefaultAvatar as setDefaultAvatarAction, setSocialRanks as setSocialRanksAction, addPermissionToRank as addPermissionToRankAction, removePermissionFromRank as removePermissionFromRankAction, getAnnouncement as getAnnouncementAction, setAnnouncement as setAnnouncementAction, recalculateGameKings as recalculateGameKingsAction, adminUpdateUser as adminUpdateUserAction, backfillPunishmentStatus as backfillPunishmentStatusAction, adminSendMail as adminSendMailAction } from '@/lib/actions/admin';
import { getPublishedArticles as getPublishedArticlesAction, createPlayerArticle as createPlayerArticleAction } from '@/lib/actions/news';
import { createChallenge as createChallengeAction, getChallenges as getChallengesAction, joinChallenge as joinChallengeAction, updateChallenge as updateChallengeAction, deleteChallenge as deleteChallengeAction, getAllChallengesForAdmin as getAllChallengesForAdminAction } from '@/lib/actions/challenges';
import { restartChallenge, nextChallenge as nextKingOfGeniusChallenge, selectTeam as selectKingOfGeniusTeam, startKingOfGeniusGame as startKingOfGeniusGameAction, submitChallengeResult as submitKingOfGeniusResult, updateChallengeProgress as updateKingOfGeniusProgress, beginChallenge as beginKingOfGeniusChallenge } from '@/lib/actions/king-of-genius';
import * as wordWarActions from '@/lib/actions/word-war';
import * as behindTheMaskActions from '@/lib/actions/behind-the-mask';
import * as drawAndGuessActions from '@/lib/actions/draw-and-guess';

// Explicitly export AI-related functions and types
export { generateGeniusChallenge, generateTrapAnswer };
export type { GenerateGeniusChallengeInput, GenerateGeniusChallengeOutput, GenerateTrapAnswerInput, GenerateTrapAnswerOutput };

// --- Wrapper functions for client-side actions ---

// Room Actions
export async function createGameRoom(userId: string, gameType: Game['gameType'], avatarId: string) { return createGameRoomAction(userId, gameType, avatarId); }
export async function joinGameRoom(gameId: string, userId: string, avatarId: string) { return joinGameRoomAction(gameId, userId, avatarId); }
export async function leaveGame(gameId: string, playerId: string) { return leaveGameAction(gameId, playerId); }
export async function setPlayerReady(gameId: string, playerId: string) { return setPlayerReadyAction(gameId, playerId); }
export async function kickPlayerFromLobby(gameId: string, hostId: string, playerIdToKick: string) { return kickPlayerFromLobbyAction(gameId, hostId, playerIdToKick); }


// Trap Answer Actions
export async function selectCategoryAndGetQuestion(gameId: string, playerId: string, category: string) { return selectTrapAnswerCategoryAction(gameId, playerId, category); }
export async function handleTimeout(gameId: string, hostId: string) { return handleTrapAnswerTimeout(gameId, hostId); }
export async function submitGuess(gameId: string, playerId: string, guess: string | null) { return submitTrapAnswerGuess(gameId, playerId, guess); }
export async function startTrapAnswerGame(gameId: string, hostId: string) { return startTrapAnswerGameAction(gameId, hostId); }
export async function updateTrapAnswerSettings(gameId: string, hostId: string, settings: any) { return updateTrapAnswerSettings(gameId, hostId, settings); }
export async function submitTrapAnswer(gameId: string, playerId: string, answer: string) { return submitTrapAnswerAction(gameId, playerId, answer); }
export async function nextTrapAnswerRound(gameId: string, hostId: string) { return nextTrapAnswerRoundAction(gameId, hostId); }
export async function sendReaction(gameId: string, playerId: string, emoji: any) { return sendReactionAction(gameId, playerId, emoji); }


// Admin Actions
export async function getAvatarPrices() { return getAvatarPricesAction(); }
export async function getPunishmentAvatarPrices() { return getPunishmentAvatarPricesAction(); }
export async function setAvatarPrices(adminId: string, prices: AvatarPrice[]) { return setAvatarPricesAction(adminId, prices); }
export async function setPunishmentAvatarPrices(adminId: string, prices: AvatarPrice[]) { return setPunishmentAvatarPricesAction(adminId, prices); }
export async function setDefaultAvatar(adminId: string, avatarId: string) { return setDefaultAvatarAction(adminId, avatarId); }
export async function setSocialRanks(adminId: string, ranks: SocialRank[]) { return setSocialRanksAction(adminId, ranks); }
export async function addPermissionToRank(adminId: string, rankName: string, permissionId: any) { return addPermissionToRankAction(adminId, rankName, permissionId); }
export async function removePermissionFromRank(adminId: string, rankName: string, permissionId: any) { return removePermissionFromRankAction(adminId, rankName, permissionId); }
export async function getAnnouncement() { return getAnnouncementAction(); }
export async function setAnnouncement(adminId: string, text: string) { return setAnnouncementAction(adminId, text); }
export async function recalculateGameKings(adminId: string) { return recalculateGameKingsAction(adminId); }
export async function adminUpdateUser(adminId: string, userId: string, data: Partial<UserProfile>) { return adminUpdateUserAction(adminId, userId, data); }
export async function backfillPunishmentStatus(adminId: string) { return backfillPunishmentStatusAction(adminId); }
export async function adminSendMail(adminId: string, recipientIds: string[], subject: string, body: string, coins: number) { return adminSendMailAction(adminId, recipientIds, subject, body, coins); }


// News Actions
export async function getPublishedArticles(userId?: string) { return getPublishedArticlesAction(userId); }
export async function createPlayerArticle(authorId: string, articleData: { title: string; content: string; }, isAnonymous: boolean) { return createPlayerArticleAction(authorId, articleData, isAnonymous); }


// Challenge Actions
export async function createChallenge(adminId: string, challengeData: Omit<Challenge, 'id' | 'createdAt' | 'participantIds' | 'endsAt' | 'participantCount'> & { durationInHours: number }): Promise<{ success: boolean; error?: string }> { return createChallengeAction(adminId, challengeData); }
export async function getChallenges(): Promise<Challenge[]> { return getChallengesAction(); }
export async function joinChallenge(challengeId: string, userId: string): Promise<{ success: boolean; error?: string }> { return joinChallengeAction(challengeId, userId); }
export async function updateChallenge(adminId: string, challengeId: string, data: Partial<Omit<Challenge, 'id' | 'createdAt'>>): Promise<{ success: boolean; error?: string }> { return updateChallengeAction(adminId, challengeId, data); }
export async function deleteChallenge(adminId: string, challengeId: string): Promise<{ success: boolean; error?: string }> { return deleteChallengeAction(adminId, challengeId); }
export async function getAllChallengesForAdmin(adminId: string): Promise<Challenge[]> { return getAllChallengesForAdminAction(adminId); }


// King of Genius Actions
export async function restartKingOfGeniusChallenge(gameId: string, hostId: string) { return restartChallenge(gameId, hostId); }
export async function nextKingOfGenius(gameId: string, hostId: string) { return nextKingOfGeniusChallenge(gameId, hostId); }
export async function selectKingOfGeniusTeam(gameId: string, playerId: string, team: 'A' | 'B') { return selectKingOfGeniusTeam(gameId, playerId, team); }
export async function startKingOfGenius(gameId: string, hostId: string) { return startKingOfGeniusGameAction(gameId, hostId); }
export async function submitKingOfGeniusResult(gameId: string, playerId: string, result: any) { return submitKingOfGeniusResult(gameId, playerId, result); }
export async function updateKingOfGeniusProgress(gameId: string, playerId: string, progress: any) { return updateKingOfGeniusProgress(gameId, playerId, progress); }
export async function beginKingOfGenius(gameId: string, hostId: string) { return beginKingOfGeniusChallenge(gameId, hostId); }


// Word War Actions
export async function selectWordWarTeam(gameId: string, playerId: string, team: 'red' | 'blue') { return wordWarActions.selectTeam(gameId, playerId, team); }
export async function randomizeWordWarTeams(gameId: string, hostId: string) { return wordWarActions.randomizeTeams(gameId, hostId); }
export async function startWordWarGame(gameId: string, hostId: string) { return wordWarActions.startGame(gameId, hostId); }
export async function updateWordWarSettings(gameId: string, hostId: string, settings: { turnTime: number }) { return wordWarActions.updateGameSettings(gameId, hostId, settings); }
export async function submitHint(gameId: string, playerId: string, word: string, count: number) { return wordWarActions.submitHint(gameId, playerId, word, count); }
export async function revealCard(gameId: string, playerId: string, cardIndex: number) { return wordWarActions.revealCard(gameId, playerId, cardIndex); }
export async function endTurn(gameId: string, playerId: string) { return wordWarActions.endTurn(gameId, playerId); }
export async function handleWordWarTimeout(gameId: string, callerId: string) { return wordWarActions.handleTimeout(gameId, callerId); }
export async function toggleSuspicion(gameId: string, playerId: string, cardIndex: number) { return wordWarActions.toggleSuspicion(gameId, playerId, cardIndex); }
export async function proceedToFinalResults(gameId: string, hostId: string) { return wordWarActions.proceedToFinalResults(gameId, hostId); }


// Behind The Mask Actions
export async function startBehindTheMaskGame(gameId: string, hostId: string) { return behindTheMaskActions.startGame(gameId, hostId); }
export async function updateMafiaSettings(gameId: string, hostId: string, settings: any) { return behindTheMaskActions.updateMafiaSettings(gameId, hostId, settings); }
export async function transitionToNight(gameId: string, hostId: string) { return behindTheMaskActions.transitionToNight(gameId, hostId); }
export async function submitNightAction(gameId: string, action: any) { return behindTheMaskActions.submitNightAction(gameId, action); }
export async function processNight(gameId: string, hostId: string) { return behindTheMaskActions.processNight(gameId, hostId); }
export async function sendPublicMessage(gameId: string, message: any) { return behindTheMaskActions.sendPublicMessage(gameId, message); }
export async function sendPrivateMessage(gameId: string, chatId: string, message: any) { return behindTheMaskActions.sendPrivateMessage(gameId, chatId, message); }
export async function processDay(gameId: string, hostId: string) { return behindTheMaskActions.processDay(gameId, hostId); }
export async function submitVote(gameId: string, voterId: string, targetId: string | null) { return behindTheMaskActions.submitVote(gameId, voterId, targetId); }

// Draw and Guess Actions
export async function startDrawAndGuessGame(gameId: string, hostId: string) { return drawAndGuessActions.startDrawAndGuessGame(gameId, hostId); }
export async function updateDrawAndGuessSettings(gameId: string, hostId: string, settings: any) { return drawAndGuessActions.updateGameSettings(gameId, hostId, settings); }
export async function selectDrawAndGuessCategory(gameId: string, playerId: string, category: string) { return drawAndGuessActions.selectCategoryAndGetQuestion(gameId, playerId, category); }
export async function updateDrawing(gameId: string, playerId: string, drawingData: DrawingData) { return drawAndGuessActions.updateDrawing(gameId, playerId, drawingData); }
export async function submitDrawing(gameId: string, playerId: string, drawing: DrawingData) { return drawAndGuessActions.submitDrawing(gameId, playerId, drawing); }
export async function submitDrawAndGuessGuess(gameId: string, playerId: string, guess: string) { return drawAndGuessActions.submitGuess(gameId, playerId, guess); }
export async function setGuessStatus(gameId: string, drawerId: string, guesserId: string, guessText: string, status: GuessStatus) { return drawAndGuessActions.setGuessStatus(gameId, drawerId, guesserId, guessText, status); }
export async function nextDrawAndGuessRound(gameId: string, hostId: string) { return drawAndGuessActions.nextDrawAndGuessRound(gameId, hostId); }
export async function handleDrawAndGuessTimeout(gameId: string, hostId: string) { return drawAndGuessActions.handleTimeout(gameId, hostId); }

// Note: Do not re-export entire modules like `export { roomActions }`.
// Instead, create specific wrapper functions as done above.
// This is a requirement for files marked with "use server".
