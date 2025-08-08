

/**
 * @fileoverview This file re-exports all user-related actions from their new, modular locations.
 * This structure improves maintainability by separating concerns.
 */

// Explicitly import and export to avoid namespace collisions and help bundlers.
import { createUserProfile, updateUserName, updateUserAvatar, updateUserGender } from './user/profile';
import { purchaseAvatar, purchasePunishmentAvatar, exchangeCoinsForHonor } from './user/currency';
import { getSocialRankForUser, getPlayerFromUserId, getGameKings, getKingOfGames, getAllUsers, updateUserWinCount, searchUsers } from './user/queries';
import { sendSystemMail, getMail, markMailAsRead, claimMailCoins } from './user/mail';
import { 
    getLeagueData, 
    updateUserStats, 
    createLeague, 
    joinLeague, 
    deleteLeague, 
    kickPlayerFromLeague, 
    leaveLeague, 
    resetAllLeagueStats, 
    updateLeagueScoresForGameEnd, 
    calculateEndOfGameAwards 
} from './user/leagues';
import { giveReward, applyPunishment, humiliatePlayer, requestAllegiance, issueDecree, begForMercy, demandTaxes, respondToTaxDemand, requestAlliance, respondToAlliance, issueDuelChallenge, respondToDuelChallenge, forceAvatarChange, payPunishmentTax, exchangeForLoyaltyPoints } from './user/social';

export {
    createUserProfile,
    updateUserName,
    updateUserAvatar,
    updateUserGender,
    purchaseAvatar,
    purchasePunishmentAvatar,
    exchangeCoinsForHonor,
    getSocialRankForUser,
    getPlayerFromUserId,
    getGameKings,
    getKingOfGames,
    getAllUsers,
    updateUserWinCount,
    searchUsers,
    sendSystemMail,
    getMail,
    markMailAsRead,
    claimMailCoins,
    getLeagueData,
    updateUserStats,
    createLeague,
    joinLeague,
    deleteLeague,
    kickPlayerFromLeague,
    leaveLeague,
    resetAllLeagueStats,
    updateLeagueScoresForGameEnd,
    calculateEndOfGameAwards,
    giveReward,
    applyPunishment,
    humiliatePlayer,
    requestAllegiance,
    issueDecree,
    begForMercy,
    demandTaxes,
    respondToTaxDemand,
    requestAlliance,
    respondToAlliance,
    issueDuelChallenge,
    respondToDuelChallenge,
    forceAvatarChange,
    payPunishmentTax,
    exchangeForLoyaltyPoints
};
