

'use server';

/**
 * @fileoverview This file re-exports all user-related actions from their new, modular locations.
 * This structure improves maintainability by separating concerns.
 */

// Explicitly import and export to avoid namespace collisions and help bundlers.
import { createUserProfile, updateUserName, updateUserAvatar, updateUserGender } from './profile';
import { purchaseAvatar, purchasePunishmentAvatar, exchangeCoinsForHonor, exchangeCoinsForRebellion, exchangeCoinsForLoyaltyPoints } from './currency';
import { getPlayerFromUserId, getGameKings, getKingOfGames, getAllUsers, updateUserWinCount, getRanks, getUsersByRank, getTopPunisher, getKingsPageData, recordMatchHistory, getTopUsers } from './queries';
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
    updateLeagueScoresForGameEnd
} from './leagues';
import { giveReward, applyPunishment, humiliatePlayer, issueDecree, begForMercy, demandTaxes, respondToTaxDemand, requestAlliance, respondToAlliance, issueDuelChallenge, respondToDuelChallenge, forceAvatarChange, payPunishmentTax, liftPunishment } from './social';
import { requestAllegiance, respondToAllegianceRequest, deleteAllegianceRequest } from './allegiance';
import { joinChallenge, finalizeChallenge } from '../challenges';
import { distributeEndOfGameAwards } from '@/lib/actions/admin/users';


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
    deleteAllegianceRequest,
    liftPunishment,
    getKingsPageData,
    recordMatchHistory,
    distributeEndOfGameAwards,
    updateLeagueScoresForGameEnd,
    finalizeChallenge,
};


