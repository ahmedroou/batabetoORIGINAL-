

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

import type { Game, Challenge, ChallengePrize, DrawingData, GuessStatus, SocialRank, AvatarPrice, UserProfile, NightAction, PermissionId } from '@/types';

// Import individual functions instead of modules
import { createGameRoom as createGameRoomAction, joinGameRoom as joinGameRoomAction, leaveGame as leaveGameAction, setPlayerReady as setPlayerReadyAction, kickPlayerFromLobby as kickPlayerFromLobbyAction } from '@/lib/actions/room';
import { selectCategoryAndGetQuestion as selectTrapAnswerCategoryAction, handleTimeout as handleTrapAnswerTimeout, submitGuess as submitTrapAnswerGuess, startTrapAnswerGame as startTrapAnswerGameAction, updateGameSettings as updateTrapAnswerSettings, submitTrapAnswer as submitTrapAnswerAction, nextTrapAnswerRound as nextTrapAnswerRoundAction, sendReaction as sendReactionAction } from '@/lib/actions/trap-answer';
import { getAvatarPrices as getAvatarPricesAction, getPunishmentAvatarPrices as getPunishmentAvatarPricesAction, setAvatarPrices as setAvatarPricesAction, setPunishmentAvatarPrices as setPunishmentAvatarPricesAction, setDefaultAvatar as setDefaultAvatarAction, setSocialRanks as setSocialRanksAction, addPermissionToRank as addPermissionToRankAction, removePermissionFromRank as removePermissionFromRankAction, getAnnouncement as getAnnouncementAction, setAnnouncement as setAnnouncementAction, recalculateGameKings as recalculateGameKingsAction, adminUpdateUser as adminUpdateUserAction, backfillPunishmentStatus as backfillPunishmentStatusAction, adminSendMail as adminSendMailAction } from '@/lib/actions/admin';
import { getPublishedArticles as getPublishedArticlesAction, createPlayerArticle as createPlayerArticleAction } from '@/lib/actions/news';
import { createChallenge as createChallengeAction, getChallenges as getChallengesAction, joinChallenge as joinChallengeAction, updateChallenge as updateChallengeAction, deleteChallenge as deleteChallengeAction, getAllChallengesForAdmin as getAllChallengesForAdminAction } from '@/lib/actions/challenges';
import { restartChallenge, nextChallenge as nextKingOfGeniusChallenge, selectTeam as selectKingOfGeniusTeam, startKingOfGeniusGame as startKingOfGeniusGameAction, submitChallengeResult as submitKingOfGeniusResult, updateChallengeProgress as updateKingOfGeniusProgress, beginChallenge as beginKingOfGeniusChallenge } from '@/lib/actions/king-of-genius';
import { selectTeam as selectWordWarTeamAction, randomizeTeams as randomizeTeamsAction, startGame as startWordWarGameAction, updateGameSettings as updateWordWarSettingsAction, submitHint as submitHintAction, revealCard as revealCardAction, endTurn as endTurnAction, handleTimeout as handleWordWarTimeoutAction, toggleSuspicion as toggleSuspicionAction, proceedToFinalResults as proceedToFinalResultsAction, setGuide as setGuideAction } from '@/lib/actions/word-war';
import { startGame as startBehindTheMaskGameAction, updateMafiaSettings as updateMafiaSettingsAction, transitionToNight as transitionToNightAction, submitNightAction as submitNightActionAction, processNight as processNightAction, sendPublicMessage as sendPublicMessageAction, sendPrivateMessage as sendPrivateMessageAction, processDay as processDayAction, submitVote as submitVoteAction } from '@/lib/actions/behind-the-mask';
import { startDrawAndGuessGame as startDrawAndGuessGameAction, updateGameSettings as updateDrawAndGuessSettingsAction, selectCategoryAndGetQuestion as selectDrawAndGuessCategoryAction, updateDrawing as updateDrawingAction, submitDrawing as submitDrawingAction, submitGuess as submitDrawAndGuessGuessAction, setGuessStatus as setGuessStatusAction, nextDrawAndGuessRound as nextDrawAndGuessRoundAction, handleTimeout as handleDrawAndGuessTimeoutAction, submitRating as submitRatingAction } from '@/lib/actions/draw-and-guess';
import { startGame as startSmartMerchantGameAction, updateGameSettings as updateSmartMerchantSettingsAction, rollDiceAndMove as rollDiceAndMoveAction, handleMoveEnd as handleMoveEndAction, handleBuyDecision as handleBuyDecisionAction, answerQuestion as answerSmartMerchantQuestionAction, endTurn as endSmartMerchantTurnAction } from '@/lib/actions/smart-merchant';
import { startGame as startSnakesAndScissorsGameAction, updateGameSettings as updateSnakesAndScissorsSettingsAction, rollDice as rollSnakesAndScissorsDiceAction, answerQuestion as answerSnakesAndScissorsQuestionAction } from '@/lib/actions/snakes-and-scissors';
import { exchangeCoinsForHonor as exchangeCoinsForHonorAction, exchangeForLoyaltyPoints as exchangeCoinsForLoyaltyAction, exchangeCoinsForRebellion as exchangeCoinsForRebellionAction } from '@/lib/actions/user';

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


// Admin Actions (Ensure all are async and wrapped)
export async function getAvatarPrices() { return getAvatarPricesAction(); }
export async function getPunishmentAvatarPrices() { return getPunishmentAvatarPricesAction(); }
export async function setAvatarPrices(adminId: string, prices: AvatarPrice[]) { return setAvatarPricesAction(adminId, prices); }
export async function setPunishmentAvatarPrices(adminId: string, prices: AvatarPrice[]) { return setPunishmentAvatarPricesAction(adminId, prices); }
export async function setDefaultAvatar(adminId: string, avatarId: string) { return setDefaultAvatarAction(adminId, avatarId); }
export async function setSocialRanks(adminId: string, ranks: SocialRank[]) { return setSocialRanksAction(adminId, ranks); }
export async function addPermissionToRank(adminId: string, rankName: string, permissionId: PermissionId) { return addPermissionToRankAction(adminId, rankName, permissionId); }
export async function removePermissionFromRank(adminId: string, rankName: string, permissionId: PermissionId) { return removePermissionFromRankAction(adminId, rankName, permissionId); }
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
export async function selectWordWarTeam(gameId: string, playerId: string, team: 'red' | 'blue') { return selectWordWarTeamAction(gameId, playerId, team); }
export async function randomizeTeams(gameId: string, hostId: string) { return randomizeTeamsAction(gameId, hostId); }
export async function startWordWarGame(gameId: string, hostId: string) { return startWordWarGameAction(gameId, hostId); }
export async function updateWordWarSettings(gameId: string, hostId: string, settings: { turnTime: number }) { return updateWordWarSettingsAction(gameId, hostId, settings); }
export async function submitHint(gameId: string, playerId: string, word: string, count: number) { return submitHintAction(gameId, playerId, word, count); }
export async function revealCard(gameId: string, playerId: string, cardIndex: number) { return revealCardAction(gameId, playerId, cardIndex); }
export async function endTurn(gameId: string, playerId: string) { return endTurnAction(gameId, playerId); }
export async function handleWordWarTimeout(gameId: string, callerId: string) { return handleWordWarTimeoutAction(gameId, callerId); }
export async function toggleSuspicion(gameId: string, playerId: string, cardIndex: number) { return toggleSuspicionAction(gameId, playerId, cardIndex); }
export async function proceedToFinalResults(gameId: string, hostId: string) { return proceedToFinalResultsAction(gameId, hostId); }
export async function setGuide(gameId: string, hostId: string, playerId: string) { return setGuideAction(gameId, hostId, playerId); }


// Behind The Mask Actions
export async function startBehindTheMaskGame(gameId: string, hostId: string) { return startBehindTheMaskGameAction(gameId, hostId); }
export async function updateMafiaSettings(gameId: string, hostId: string, settings: any) { return updateMafiaSettingsAction(gameId, hostId, settings); }
export async function transitionToNight(gameId: string, hostId: string) { return transitionToNightAction(gameId, hostId); }
export async function submitNightAction(gameId: string, action: NightAction) { return submitNightActionAction(gameId, action); }
export async function processNight(gameId: string, hostId: string) { return processNightAction(gameId, hostId); }
export async function sendPublicMessage(gameId: string, message: any) { return sendPublicMessageAction(gameId, message); }
export async function sendPrivateMessage(gameId: string, chatId: string, message: any) { return sendPrivateMessageAction(gameId, chatId, message); }
export async function processDay(gameId: string, hostId: string) { return processDayAction(gameId, hostId); }
export async function submitVote(gameId: string, voterId: string, targetId: string | null) { return submitVoteAction(gameId, voterId, targetId); }

// Draw and Guess Actions
export async function startDrawAndGuessGame(gameId: string, hostId: string) { return startDrawAndGuessGameAction(gameId, hostId); }
export async function updateDrawAndGuessSettings(gameId: string, hostId: string, settings: any) { return updateDrawAndGuessSettingsAction(gameId, hostId, settings); }
export async function selectDrawAndGuessCategory(gameId: string, playerId: string, category: string) { return selectDrawAndGuessCategoryAction(gameId, playerId, category); }
export async function updateDrawing(gameId: string, playerId: string, drawingData: DrawingData) { return updateDrawingAction(gameId, playerId, drawingData); }
export async function submitDrawing(gameId: string, playerId: string, drawing: DrawingData) { return submitDrawingAction(gameId, playerId, drawing); }
export async function submitGuess as submitDrawAndGuessGuess(gameId: string, playerId: string, guess: string) { return submitDrawAndGuessGuessAction(gameId, playerId, guess); }
export async function setGuessStatus(gameId: string, drawerId: string, guesserId: string, guessText: string, status: GuessStatus) { return setGuessStatusAction(gameId, drawerId, guesserId, guessText, status); }
export async function nextDrawAndGuessRound(gameId: string, hostId: string) { return nextDrawAndGuessRoundAction(gameId, hostId); }
export async function handleDrawAndGuessTimeout(gameId: string, hostId: string) { return handleDrawAndGuessTimeoutAction(gameId, hostId); }
export async function submitRating(gameId: string, raterId: string, rating: number) { return submitRatingAction(gameId, raterId, rating); }

// Smart Merchant Actions
export async function startSmartMerchantGame(gameId: string, hostId: string) { return startSmartMerchantGameAction(gameId, hostId); }
export async function updateSmartMerchantSettings(gameId: string, hostId: string, settings: any) { return updateSmartMerchantSettingsAction(gameId, hostId, settings); }
export async function rollDiceAndMove(gameId: string, playerId: string) { return rollDiceAndMoveAction(gameId, playerId); }
export async function handleMoveEnd(gameId: string, playerId: string) { return handleMoveEndAction(gameId, playerId); }
export async function handleBuyDecision(gameId: string, playerId: string, decision: 'buy' | 'pass') { return handleBuyDecisionAction(gameId, playerId, decision); }
export async function answerQuestion(gameId: string, playerId: string, answer: string) { return answerSmartMerchantQuestionAction(gameId, playerId, answer); }
export async function endSmartMerchantTurn(gameId: string, playerId: string) { return endSmartMerchantTurnAction(gameId, playerId); }

// Snakes and Scissors Actions
export async function startSnakesAndScissorsGame(gameId: string, hostId: string) { return startSnakesAndScissorsGameAction(gameId, hostId); }
export async function updateSnakesAndScissorsSettings(gameId: string, hostId: string, settings: any) { return updateSnakesAndScissorsSettingsAction(gameId, hostId, settings); }
export async function rollSnakesAndScissorsDice(gameId: string, playerId: string) { return rollSnakesAndScissorsDiceAction(gameId, playerId); }
export async function answerSnakesAndScissorsQuestion(gameId: string, playerId: string, answer: string) { return answerSnakesAndScissorsQuestionAction(gameId, playerId, answer); }

// User Actions (those used in client components)
export async function exchangeCoinsForLoyaltyPoints(userId: string, amount: number) { return exchangeCoinsForLoyaltyAction(userId, amount); }
export async function exchangeCoinsForHonorPoints(userId: string, amount: number) { return exchangeCoinsForHonorAction(userId, amount); }
export async function exchangeCoinsForRebellionPoints(userId: string, amount: number) { return exchangeCoinsForRebellionAction(userId, amount); }
