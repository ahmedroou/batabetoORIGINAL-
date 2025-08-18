'use server';

/**
 * @fileoverview This file re-exports all admin actions from their new, modular locations.
 * This structure improves maintainability by separating concerns.
 */

import {
  uploadEducatedMerchantQuestionsFromJson,
  uploadTrapAnswerQuestionsFromJson,
  uploadPrisonQuestionsFromJson,
  uploadWordWarWordsFromJson,
  countQuestions,
  deleteQuestions,
  deleteDuplicateWords,
  deleteSimilarQuestions,
} from './content';

import {
  backfillPunishmentStatus,
  backfillUserPermissions,
} from './maintenance';

import {
  setAnnouncement,
  getAnnouncement,
  setAvatarPrices,
  setPunishmentAvatarPrices,
  setDefaultAvatar,
  setSocialRanks,
  addPermissionToRank,
  removePermissionFromRank,
  getTrapAnswerCategories,
  addTrapAnswerCategory,
  editTrapAnswerCategory,
  deleteTrapAnswerCategory,
  getEducatedMerchantCategories,
  addEducatedMerchantCategory,
  editEducatedMerchantCategory,
  deleteEducatedMerchantCategory,
} from './settings';

import {
  adminSearchUsers,
  adminUpdateUser,
  resetAllUserAvatars,
  getTopUsers,
  adminSendMail,
  giveReward,
  applyPunishment,
  recalculateGameKings,
  distributeEndOfGameAwards,
} from './users';

import { runAiJournalist } from './ai';

export {
  // AI
  runAiJournalist,
  // Content
  uploadEducatedMerchantQuestionsFromJson,
  uploadTrapAnswerQuestionsFromJson,
  uploadPrisonQuestionsFromJson,
  uploadWordWarWordsFromJson,
  countQuestions,
  deleteQuestions,
  deleteDuplicateWords,
  deleteSimilarQuestions,
  // Maintenance
  backfillPunishmentStatus,
  backfillUserPermissions,
  // Settings
  setAnnouncement,
  getAnnouncement,
  setAvatarPrices,
  setPunishmentAvatarPrices,
  setDefaultAvatar,
  setSocialRanks,
  addPermissionToRank,
  removePermissionFromRank,
  getTrapAnswerCategories,
  addTrapAnswerCategory,
  editTrapAnswerCategory,
  deleteTrapAnswerCategory,
  getEducatedMerchantCategories,
  addEducatedMerchantCategory,
  editEducatedMerchantCategory,
  deleteEducatedMerchantCategory,
  // Users
  adminSearchUsers,
  adminUpdateUser,
  resetAllUserAvatars,
  getTopUsers,
  adminSendMail,
  giveReward,
  applyPunishment,
  recalculateGameKings,
  distributeEndOfGameAwards,
};
