

'use server';

import { db } from '@/lib/firebase';
import { doc, serverTimestamp, setDoc, updateDoc, collection, query, getDocs, getDoc, where, increment, runTransaction, arrayUnion, arrayRemove, deleteField, Timestamp, writeBatch } from 'firebase/firestore';
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

            // This admin check is now handled by the HOF, but an extra layer doesn't hurt.
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
 * Distributes end-of-game awards like leaderboard points and coins based on player ranking.
 * This is a generic function to be used by all game types.
 * @param game The final game state object.
 */
export async function distributeEndOfGameAwards(game: Game) {
    const finalScores = game.playerScores || {};
    const playersToUpdate = game.players.filter(p => p.status !== 'left');
    if (playersToUpdate.length === 0) return;

    const batch = writeBatch(db);
    
    // 1. Sort players by final score
    const sortedPlayers = [...playersToUpdate].sort((a, b) => (finalScores[b.id] || 0) - (finalScores[a.id] || 0));
    
    // 2. Define awards based on rank
    const awards = [
        { points: 3, coins: 2 }, // 1st place
        { points: 2, coins: 1 }, // 2nd place
        { points: 1, coins: 0 }, // 3rd place
    ];

    // 3. Apply awards and update stats
    for (let i = 0; i < sortedPlayers.length; i++) {
        const player = sortedPlayers[i];
        const userRef = doc(db, "users", player.id);
        const playerAwards = i < awards.length ? awards[i] : { points: 0, coins: 0 };

        const updates: any = { gamesPlayed: increment(1) };
        if (playerAwards.points > 0) updates.leaderboardPoints = increment(playerAwards.points);
        if (playerAwards.coins > 0) updates.coins = increment(playerAwards.coins);

        // Record a win for the first place player
        if (i === 0) {
            updates[`winCounts.${game.gameType}`] = increment(1);
        }

        batch.update(userRef, updates);
    }
    
    await batch.commit();
}


/**
 * Updates player scores in all associated leagues after a game has ended.
 * @param game The final game state object containing player scores.
 */
export async function updateLeagueScoresForGameEnd(game: Game) {
    // This is now a wrapper around the new, more generic awards function
    await distributeEndOfGameAwards(game);

    // Keep the league-specific logic if needed, but it's now decoupled from general awards.
    const finalScores = game.playerScores || {};
    const playersToUpdate = game.players.filter(p => p.status !== 'left');
    if (playersToUpdate.length === 0) return;

    // This part can be simplified or removed if leagues just reflect total leaderboard points.
    // For now, we'll keep it to update gamesPlayed in leagues.
    const processLeagueUpdates = async (transaction: any) => {
        const userRefs = playersToUpdate.map(p => doc(db, 'users', p.id));
        const userDocs = await Promise.all(userRefs.map(ref => transaction.get(ref)));

        const leagueIds = new Set<string>();
        userDocs.forEach((docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as UserProfile;
                data.leagues?.forEach(l => leagueIds.add(l.id));
            }
        });

        for (const leagueId of Array.from(leagueIds)) {
            const leagueRef = doc(db, 'leagues', leagueId);
            const leagueUpdates: any = {};
            for (const player of playersToUpdate) {
                leagueUpdates[`gamesPlayed.${player.id}`] = increment(1);
                // Points are now updated directly on the user profile, leagues can reflect that total.
                // If you want separate league scores, you would increment them here.
            }
            transaction.update(leagueRef, leagueUpdates);
        }
    };

    try {
        await runTransaction(db, processLeagueUpdates);
    } catch (error) {
        console.error("Failed to update league scores:", error);
        // Log the error but don't throw, as the main user awards have already been granted.
    }
}
