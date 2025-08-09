

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
    
import { 
    createGameRoom, 
    joinGameRoom, 
    leaveGame, 
    kickPlayerFromLobby, 
    setPlayerReady 
} from '@/lib/actions/room';
import { 
    selectCategoryAndGetQuestion,
    handleTimeout as handleTrapAnswerTimeout,
    submitGuess,
    startTrapAnswerGame,
    updateGameSettings as updateTrapAnswerSettings,
    nextTrapAnswerRound,
    sendReaction,
    submitTrapAnswer
} from '@/lib/actions/trap-answer';
import { 
    getAvatarPrices,
    getPunishmentAvatarPrices,
    setDefaultAvatar,
    setSocialRanks,
    addPermissionToRank,
    removePermissionFromRank,
    recalculateGameKings,
    backfillPunishmentStatus,
    adminSendMail,
    setAnnouncement,
    getAnnouncement,
    adminUpdateUser
} from '@/lib/actions/admin';
import * as userActions from '@/lib/actions/user';
import * as adminActions from '@/lib/actions/admin';
import * as drawAndGuessActions from '@/lib/actions/draw-and-guess';
import * as newsActions from '@/lib/actions/news';
import * as clanActions from '@/lib/actions/clans';
import * as wordWarActions from '@/lib/actions/word-war';
import * as prisonActions from '@/lib/actions/prison';
import * as challengeActions from '@/lib/actions/challenges';


import type { Game } from '@/types';

// Explicitly export functions that are safe to be called from the client
export {
  generateGeniusChallenge,
  generateTrapAnswer,
  
  // Room Actions
  createGameRoom,
  joinGameRoom,
  leaveGame,
  kickPlayerFromLobby,
  setPlayerReady,
  
  // Trap Answer Actions
  selectCategoryAndGetQuestion,
  handleTrapAnswerTimeout,
  submitGuess,
  startTrapAnswerGame,
  updateTrapAnswerSettings,
  nextTrapAnswerRound,
  sendReaction,
  submitTrapAnswer,

  // Admin Actions (publicly accessible)
  getAvatarPrices,
  getPunishmentAvatarPrices,
  getAnnouncement,
  
  // User Actions (as a namespace to avoid conflicts)
  userActions,

  // Admin Actions (as a namespace)
  adminActions,
  drawAndGuessActions,
  newsActions,
  clanActions,
  challengeActions,
  wordWarActions,
  prisonActions,
};


export type { GenerateGeniusChallengeInput, GenerateGeniusChallengeOutput, GenerateTrapAnswerInput, GenerateTrapAnswerOutput };

// It seems there was an issue with re-exporting namespaces.
// Let's explicitly export the functions needed by the client from here.

export {
    createChallenge,
    getChallenges,
    joinChallenge,
    updateChallenge,
    deleteChallenge,
    getAllChallengesForAdmin,
} from '@/lib/actions/challenges';
