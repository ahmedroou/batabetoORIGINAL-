

/**
 * @fileoverview This file re-exports all user-related actions from their new, modular locations.
 * This structure improves maintainability by separating concerns.
 */

// Explicitly import and export to avoid namespace collisions and help bundlers.
import { createUserProfile, updateUserName, updateUserAvatar, updateUserGender } from './profile';
import { purchaseAvatar, purchasePunishmentAvatar, exchangeCoinsForHonor, exchangeCoinsForRebellion, exchangeCoinsForLoyaltyPoints } from './currency';
import { getPlayerFromUserId, getGameKings, getKingOfGames, getAllUsers, updateUserWinCount, getRanks, getUsersByRank, getTopUsers, getTopPunisher, getKingsPageData } from './queries';
import { sendSystemMail, getMail, markMailAsRead, claimMailCoins } from './mail';
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
} from './leagues';
import { calculateEndOfGameAwards } from './awards';
import { giveReward, applyPunishment, humiliatePlayer, issueDecree, begForMercy, demandTaxes, respondToTaxDemand, requestAlliance, respondToAlliance, issueDuelChallenge, respondToDuelChallenge, forceAvatarChange, payPunishmentTax, liftPunishment } from './social';
import { requestAllegiance, respondToAllegianceRequest } from './allegiance';
import { joinChallenge } from '../challenges';


export {
    createUserProfile,
    updateUserName,
    updateUserAvatar,
    updateUserGender,
    purchaseAvatar,
    purchasePunishmentAvatar,
    exchangeCoinsForHonor,
    exchangeCoinsForRebellion,
    getPlayerFromUserId,
    getGameKings,
    getKingOfGames,
    getAllUsers,
    getUsersByRank,
    getTopUsers,
    getTopPunisher,
    updateUserWinCount,
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
    exchangeCoinsForLoyaltyPoints,
    getRanks,
    joinChallenge,
    requestAllegiance, 
    respondToAllegianceRequest,
    liftPunishment,
    getKingsPageData,
};


    




