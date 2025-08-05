

'use server';

/**
 * @fileOverview This file contains all server-side only actions, primarily for wrapping Genkit AI flows and handling admin actions.
 */

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
import type { 
    JudgePrisonAnswersInput,
    JudgePrisonAnswersOutput,
    Game,
    Mail,
    DrawingData,
    SocialRank,
    PermissionId,
} from '@/types';
import * as userActions from '@/lib/actions/user';
import * as adminActions from '@/lib/actions/admin';
import type { PlayerLocationChoice, UserProfile, AvatarPrice } from '@/types';
import * as behindTheMaskActions from '@/lib/actions/behind-the-mask';
import * as kingOfGeniusActions from '@/lib/actions/king-of-genius';
import * as prisonActions from '@/lib/actions/prison';
import * as trapAnswerActions from '@/lib/actions/trap-answer';
import * as wordWarActions from '@/lib/actions/word-war';
import * as roomActions from '@/lib/actions/room';
import * as drawAndGuessActions from '@/lib/actions/draw-and-guess';
import * as clanActions from '@/lib/actions/clans';
import * as challengeActions from '@/lib/actions/challenges';



/**
 * Generates a puzzle for a specific King of Genius challenge for testing purposes.
 * @param input - The challenge ID.
 * @returns A promise that resolves to the generated puzzle.
 */
export async function generateTestChallenge(input: GenerateGeniusChallengeInput): Promise<GenerateGeniusChallengeOutput> {
  return generateGeniusChallenge(input);
}

/**
 * Generates a plausible but incorrect answer for the "Trap Answer" game.
 * @param input - The question and the correct answer.
 * @returns A promise that resolves to the generated trap answer.
 */
export async function getTrapAnswer(input: GenerateTrapAnswerInput): Promise<GenerateTrapAnswerOutput> {
    return generateTrapAnswer(input);
}


// Admin Actions for Store Page
export const setAvatarPrices = adminActions.setAvatarPrices;
export const getAvatarPrices = adminActions.getAvatarPrices;
export const setSocialRanks = adminActions.setSocialRanks;
export const getSocialRanks = adminActions.getSocialRanks;
export const getTopUsers = adminActions.getTopUsers;
export const setDefaultAvatar = adminActions.setDefaultAvatar;
export const getDefaultAvatar = adminActions.getDefaultAvatar;
export const addPermissionToRank = adminActions.addPermissionToRank;
export const removePermissionFromRank = adminActions.removePermissionFromRank;
export const recalculateGameKings = adminActions.recalculateGameKings;

// New Admin Action for Mailbox
export const sendMailToUsers = adminActions.adminSendMail;
export const searchUsers = adminActions.searchUsers;
export const adminUpdateUser = adminActions.adminUpdateUser;
export const resetAllUserAvatars = adminActions.resetAllUserAvatars;


// Mailbox Actions for User
export const getMail = userActions.getMailForUser;
export const claimMailCoins = userActions.claimMailCoins;
export const markMailAsRead = userActions.markMailAsRead;


// Society Actions
export const giveReward = userActions.giveReward;
export const applyPunishment = userActions.applyPunishment;

// Re-export all game actions to be used by the client
export const leaveGame = roomActions.leaveGame;
export const kickPlayerFromLobby = roomActions.kickPlayerFromLobby;

export const progressToTeamSelection = kingOfGeniusActions.progressToTeamSelection;
export const restartKingOfGeniusChallenge = kingOfGeniusActions.restartChallenge;


export const startPrisonGame = prisonActions.startPrisonGame;
export const updatePrisonSettings = prisonActions.updatePrisonSettings;

export const startGame = behindTheMaskActions.startGame;

export const startTrapAnswerGame = trapAnswerActions.startTrapAnswerGame;

export const startWordWarGame = wordWarActions.startGame;
export const updateWordWarSettings = wordWarActions.updateGameSettings;
export const selectWordWarTeam = wordWarActions.selectTeam;
export const randomizeWordWarTeams = wordWarActions.randomizeTeams;
export const updateMafiaSettings = behindTheMaskActions.updateMafiaSettings;

// Draw and Guess Actions
export const startDrawAndGuessGame = drawAndGuessActions.startDrawAndGuessGame;
export const updateDrawAndGuessSettings = drawAndGuessActions.updateGameSettings;
export const selectDrawAndGuessCategory = drawAndGuessActions.selectCategory;
export const submitDrawing = drawAndGuessActions.submitDrawing;
export const submitGuess = drawAndGuessActions.submitGuess;
export async function updateDrawing(gameId: string, playerId: string, drawingData: DrawingData): Promise<void> {
    // This action is called frequently, so we just fire-and-forget.
    // No need to await it in the component.
    drawAndGuessActions.updateDrawing(gameId, playerId, drawingData);
};
export const setGuessStatus = drawAndGuessActions.setGuessStatus;
export const submitRating = drawAndGuessActions.submitRating;
export const nextDrawAndGuessRound = drawAndGuessActions.nextRound;
export const continueDrawing = drawAndGuessActions.continueDrawing;
export const handleDrawAndGuessTimeout = drawAndGuessActions.handleTimeout;

// Clan actions
export const createClan = clanActions.createClan;
export const getClans = clanActions.getClans;

// Challenge actions
export const createChallenge = challengeActions.createChallenge;
export const getChallenges = challengeActions.getChallenges;

// User actions
export const updateUserAvatar = userActions.updateUserAvatar;
export const purchaseAvatar = userActions.purchaseAvatar;
export const updateUserName = userActions.updateUserName;
export const createLeague = userActions.createLeague;
export const joinLeague = userActions.joinLeague;
export const getLeagueData = userActions.getLeagueData;
export const updateUserStats = userActions.updateUserStats;
export const deleteLeague = userActions.deleteLeague;
export const kickPlayerFromLeague = userActions.kickPlayerFromLeague;
export const leaveLeagueFromLobby = userActions.leaveLeague;
export const resetAllLeagueStats = userActions.resetAllLeagueStats;
export const sendSystemMail = userActions.sendSystemMail;
export const updateUserGender = userActions.updateUserGender;
export const humiliatePlayer = userActions.humiliatePlayer;
export const pledgeAllegiance = userActions.pledgeAllegiance;
export const issueDecree = userActions.issueDecree;
export const begForMercy = userActions.begForMercy;
export const forceAvatarChange = userActions.forceAvatarChange;
export const payPunishmentTax = userActions.payPunishmentTax;
export const getGameKings = userActions.getGameKings;
export const exchangeCoinsForHonor = userActions.exchangeCoinsForHonor;
