

'use server';

import { db } from '@/lib/firebase';
import { doc, serverTimestamp, setDoc, updateDoc, collection, query, getDocs, getDoc, where, increment, runTransaction, arrayUnion, arrayRemove, deleteField, Timestamp, writeBatch, type Transaction } from 'firebase/firestore';
import { generateLeagueId, withAdminAuth } from '../helpers';
import type { UserProfile, League, Game } from '@/types';
import { updateUserWinCount } from './queries';

export async function getLeagueData(leagueId: string): Promise<{ league: League | null, members: UserProfile[] }> {
    try {
        const leagueRef = doc(db, 'leagues', leagueId);
        const leagueDoc = await getDoc(leagueRef);

        if (!leagueDoc.exists()) {
            return { league: null, members: [] };
        }

        const league = { id: leagueDoc.id, ...leagueDoc.data() } as League;
        
        let members: UserProfile[] = [];
        if (league.members && league.members.length > 0) {
            const usersRef = collection(db, 'users');
            const memberChunks = [];
            for (let i = 0; i < league.members.length; i += 30) {
                memberChunks.push(league.members.slice(i, i + 30));
            }
            
            const memberPromises = memberChunks.map(chunk => 
                getDocs(query(usersRef, where('__name__', 'in', chunk)))
            );

            const memberSnapshots = await Promise.all(memberPromises);
            
            memberSnapshots.forEach(snapshot => {
                snapshot.forEach(doc => {
                     const userData = doc.data();
                     const leaguePoints = league.scores?.[doc.id] || 0;
                     const gamesPlayedInLeague = league.gamesPlayed?.[doc.id] || 0;
                     members.push({ ...userData, uid: doc.id, leaderboardPoints: leaguePoints, gamesPlayed: gamesPlayedInLeague } as UserProfile);
                });
            });
        }
        
        return { league, members };
    } catch (error) {
        console.error("Error fetching league data:", error);
        return { league: null, members: [] };
    }
}


export const updateUserStats = withAdminAuth(async (adminId: string, leagueId: string, userId: string, stats: { points: number; gamesPlayed: number }): Promise<{ success: boolean, error?: string }> => {
    if (!userId || !leagueId) {
        return { success: false, error: "معرف المستخدم والدوري مطلوب." };
    }
    try {
        const leagueRef = doc(db, 'leagues', leagueId);
        
        const leagueDoc = await getDoc(leagueRef);
        if (!leagueDoc.exists()) {
             return { success: false, error: "الدوري غير موجود." };
        }

        await updateDoc(leagueRef, {
            [`scores.${userId}`]: stats.points,
            [`gamesPlayed.${userId}`]: stats.gamesPlayed
        });
        return { success: true };
    } catch (error) {
        console.error("Error updating user stats in league:", error);
        return { success: false, error: "حدث خطأ غير متوقع." };
    }
});

export async function createLeague(userId: string, leagueName: string, password?: string) {
    if (!userId || !leagueName.trim()) {
        return { error: 'اسم الدوري مطلوب.' };
    }
    try {
        const leagueId = generateLeagueId(); 
        const leagueRef = doc(db, 'leagues', leagueId);

        const newLeague: Omit<League, 'id'> = {
            name: leagueName.trim(),
            adminId: userId,
            members: [userId],
            createdAt: serverTimestamp() as any,
            scores: { [userId]: 0 },
            gamesPlayed: { [userId]: 0 },
        };
        if (password) {
            newLeague.password = password;
        }

        const userRef = doc(db, 'users', userId);

        await runTransaction(db, async (transaction) => {
            transaction.set(leagueRef, newLeague);
            transaction.update(userRef, {
                leagues: arrayUnion({ id: leagueId, name: newLeague.name })
            });
        });

        return { success: true, leagueId };
    } catch (error) {
        console.error("Firebase error in createLeague:", error);
        return { error: 'حدث خطأ غير متوقع عند إنشاء الدوري.' };
    }
}

export async function joinLeague(userId: string, leagueId: string, password?: string) {
    if (!userId || !leagueId.trim()) {
        return { error: 'معرف الدوري مطلوب.' };
    }

    try {
        const leagueRef = doc(db, 'leagues', leagueId);
        const userRef = doc(db, 'users', userId);

        await runTransaction(db, async (transaction) => {
            const leagueDoc = await transaction.get(leagueRef);
            if (!leagueDoc.exists()) {
                throw new Error("الدوري غير موجود. تأكد من المعرف.");
            }
            const league = leagueDoc.data() as League;

            if (league.members.includes(userId)) {
                throw new Error("أنت عضو بالفعل في هذا الدوري.");
            }

            if (league.password && league.password !== password) {
                throw new Error("كلمة المرور غير صحيحة.");
            }

            transaction.update(leagueRef, {
                members: arrayUnion(userId),
                [`scores.${userId}`]: 0,
                [`gamesPlayed.${userId}`]: 0,
            });
            transaction.update(userRef, {
                leagues: arrayUnion({ id: leagueId, name: league.name })
            });
        });

        return { success: true };
    } catch (error: any) {
        console.error("Error joining league:", error);
        return { success: false, error: error.message || "فشل الانضمام للدوري." };
    }
}

export const deleteLeague = withAdminAuth(async (requestingUserId: string, leagueId: string): Promise<{ success: boolean; error?: string }> => {
    if (!leagueId) {
        return { success: false, error: "معلومات غير كافية للحذف." };
    }

    const leagueRef = doc(db, "leagues", leagueId);

    try {
        await runTransaction(db, async (transaction) => {
            const leagueDoc = await transaction.get(leagueRef);
            if (!leagueDoc.exists()) throw new Error("الدوري غير موجود.");
            
            const league = leagueDoc.data() as League;
            const isLeagueAdmin = league.adminId === requestingUserId;
            
            if (!isLeagueAdmin) {
                throw new Error("ليس لديك الصلاحية لحذف هذا الدوري.");
            }
            
            const members = league.members || [];
            
            transaction.delete(leagueRef);

            for (const memberId of members) {
                const memberRef = doc(db, "users", memberId);
                transaction.update(memberRef, {
                    leagues: arrayRemove({ id: leagueId, name: league.name }),
                });
            }
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || "فشل حذف الدوري." };
    }
});


export const kickPlayerFromLeague = withAdminAuth(async (adminId: string, leagueId: string, memberToKickId: string): Promise<{ success: boolean; error?: string }> => {
    if (adminId === memberToKickId) {
        return { success: false, error: "لا يمكنك طرد نفسك." };
    }

    const leagueRef = doc(db, "leagues", leagueId);
    const memberRef = doc(db, "users", memberToKickId);

    try {
        await runTransaction(db, async (transaction) => {
            const leagueDoc = await transaction.get(leagueRef);
            if (!leagueDoc.exists()) throw new Error("الدوري غير موجود.");
            
            const league = leagueDoc.data() as League;
            if (league.adminId !== adminId) throw new Error("فقط مشرف الدوري يمكنه طرد اللاعبين.");
            if (!league.members.includes(memberToKickId)) throw new Error("هذا اللاعب ليس عضواً في الدوري.");

            transaction.update(leagueRef, {
                members: arrayRemove(memberToKickId),
                [`scores.${memberToKickId}`]: deleteField(),
                [`gamesPlayed.${memberToKickId}`]: deleteField(),
            });

            transaction.update(memberRef, {
                leagues: arrayRemove({ id: leagueId, name: league.name }),
            });
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || "فشل طرد اللاعب." };
    }
});

export async function leaveLeague(leagueId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    if (!leagueId || !userId) {
        return { success: false, error: "معلومات غير كافية لمغادرة الدوري." };
    }

    const leagueRef = doc(db, "leagues", leagueId);
    const userRef = doc(db, "users", userId);

    try {
        await runTransaction(db, async (transaction) => {
            const leagueDoc = await transaction.get(leagueRef);
            if (!leagueDoc.exists()) throw new Error("الدوري غير موجود.");

            const league = leagueDoc.data() as League;
            if (league.adminId === userId) throw new Error("لا يمكن للمشرف مغادرة الدوري. يجب حذف الدوري بدلاً من ذلك.");
            if (!league.members.includes(userId)) throw new Error("أنت لست عضواً في هذا الدوري.");
            
            transaction.update(leagueRef, {
                members: arrayRemove(userId),
                [`scores.${userId}`]: deleteField(),
                [`gamesPlayed.${userId}`]: deleteField(),
            });
            
            transaction.update(userRef, {
                leagues: arrayRemove({ id: leagueId, name: league.name }),
            });
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || "فشل مغادرة الدوري." };
    }
}

export const resetAllLeagueStats = withAdminAuth(async (adminId: string): Promise<{ success: boolean, count?: number, error?: string }> => {
    const leaguesRef = collection(db, 'leagues');

    try {
        const leagueSnapshot = await getDocs(leaguesRef);
        if (leagueSnapshot.empty) {
            return { success: true, count: 0 };
        }

        const batch = writeBatch(db);
        leagueSnapshot.forEach(leagueDoc => {
            const leagueData = leagueDoc.data() as League;
            const newScores: Record<string, number> = {};
            const newGamesPlayed: Record<string, number> = {};
            leagueData.members.forEach(memberId => {
                newScores[memberId] = 0;
                newGamesPlayed[memberId] = 0;
            });
            batch.update(leagueDoc.ref, {
                scores: newScores,
                gamesPlayed: newGamesPlayed
            });
        });

        await batch.commit();

        return { success: true, count: leagueSnapshot.size };

    } catch (error: any) {
        console.error("Error resetting all league stats:", error);
        return { success: false, error: error.message || "Failed to reset league stats." };
    }
});

/**
 * A pure function for testability. It calculates the updates needed for players at the end of a game.
 * @param game The final game state object.
 * @returns An object containing the necessary updates.
 */
export function calculateEndOfGameAwards(game: Game) {
    const finalScores = game.playerScores || {};
    const playersToUpdate = game.players.filter(p => p.status !== 'left');
    
    // Sort players by final score
    const sortedPlayers = [...playersToUpdate].sort((a, b) => (finalScores[b.id] || 0) - (finalScores[a.id] || 0));

    // Define awards based on rank
    const awardTiers = [
        { points: 3, coins: 2 }, // 1st place
        { points: 2, coins: 1 }, // 2nd place
        { points: 1, coins: 0 }, // 3rd place
    ];

    const updates: Record<string, { leaderboardPoints: number, coins: number, gamesPlayed: number }> = {};
    let winUpdate: { userId: string; gameType: Game['gameType']; } | null = null;
    
    const isTeamGame = ['red', 'blue', 'good', 'mafia'].includes(game.gameResult?.winner || '');
    
    if (isTeamGame) {
        // Team-based awards
        const winningTeam = game.gameResult!.winner;
        playersToUpdate.forEach(player => {
            if (player.team === winningTeam) {
                updates[player.id] = { leaderboardPoints: 3, coins: 2, gamesPlayed: 1 };
            } else {
                updates[player.id] = { leaderboardPoints: 0, coins: 0, gamesPlayed: 1 };
            }
        });
        // Win counts for team games are handled separately if needed, maybe for each member.
        // For simplicity, we can say the 'win' is for the team, not individual stats, unless specified.
    } else {
        // Individual awards
        const playerRanks: { id: string, rank: number }[] = [];
        let currentRank = 0;
        let lastScore = -Infinity;
        sortedPlayers.forEach(player => {
            if ((finalScores[player.id] || 0) !== lastScore) {
                currentRank = playerRanks.length + 1;
            }
            playerRanks.push({ id: player.id, rank: currentRank });
            lastScore = finalScores[player.id] || 0;
        });
        
        playerRanks.forEach(({ id, rank }) => {
            const playerAwards = (rank - 1) < awardTiers.length ? awardTiers[rank-1] : { points: 0, coins: 0 };
             updates[id] = { ...playerAwards, gamesPlayed: 1 };
        });

        if (playerRanks.length > 0 && playerRanks[0].rank === 1) {
            winUpdate = { userId: playerRanks[0].id, gameType: game.gameType };
        }
    }

    return { updates, winUpdate };
}


/**
 * Distributes end-of-game awards like leaderboard points and coins based on player ranking.
 * This function commits the updates to Firestore.
 * @param game The final game state object.
 */
export async function distributeEndOfGameAwards(game: Game) {
    const playersToUpdate = game.players.filter(p => p.status !== 'left');
    if (playersToUpdate.length === 0) return;

    const { updates, winUpdate } = calculateEndOfGameAwards(game);
    const batch = writeBatch(db);

    Object.entries(updates).forEach(([playerId, playerUpdates]) => {
        const userRef = doc(db, "users", playerId);
        const firestoreUpdates: any = { gamesPlayed: increment(1) };
        if (playerUpdates.leaderboardPoints > 0) firestoreUpdates.leaderboardPoints = increment(playerUpdates.leaderboardPoints);
        if (playerUpdates.coins > 0) firestoreUpdates.coins = increment(playerUpdates.coins);
        batch.update(userRef, firestoreUpdates);
    });

    if (winUpdate) {
        const winnerRef = doc(db, "users", winUpdate.userId);
        batch.update(winnerRef, { [`winCounts.${winUpdate.gameType}`]: increment(1) });
    }
    
    // For team games, you might want to increment win counts for all winning members.
    if (['red', 'blue', 'good', 'mafia'].includes(game.gameResult?.winner || '')) {
        const winningTeam = game.gameResult!.winner;
        playersToUpdate.forEach(player => {
            if (player.team === winningTeam) {
                 const winnerRef = doc(db, "users", player.id);
                 batch.update(winnerRef, { [`winCounts.${game.gameType}`]: increment(1) });
            }
        });
    }

    await batch.commit();
}


/**
 * Updates player scores in all associated leagues after a game has ended.
 * @param game The final game state object containing player scores.
 */
export async function updateLeagueScoresForGameEnd(game: Game) {
    await distributeEndOfGameAwards(game);
}
