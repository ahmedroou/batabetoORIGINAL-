

'use server';

import { db } from '@/lib/firebase';
import { doc, serverTimestamp, setDoc, updateDoc, collection, query, getDocs, getDoc, where, increment, runTransaction, arrayUnion, arrayRemove, deleteField, Timestamp, writeBatch, type Transaction } from 'firebase/firestore';
import { generateLeagueId } from '../helpers';
import type { UserProfile, League, Game, Challenge, SocialRank } from '@/types';
import { updateUserWinCount } from './queries';
import { calculateEndOfGameAwards } from './awards';
import { sendSystemMail } from './mail';
import { getRanks } from './queries';


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
            const memberChunks: string[][] = [];
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


export async function updateUserStats(adminId: string, leagueId: string, userId: string, stats: { points: number; gamesPlayed: number }): Promise<{ success: boolean, error?: string }> {
    if (!userId || !leagueId) {
        return { success: false, error: "معرف المستخدم والدوري مطلوب." };
    }
    
    return runTransaction(db, async (transaction) => {
        const adminRef = doc(db, "users", adminId);
        const leagueRef = doc(db, 'leagues', leagueId);
        
        const [adminDoc, leagueDoc] = await Promise.all([transaction.get(adminRef), transaction.get(leagueRef)]);
        
        if(!leagueDoc.exists()) throw new Error("الدوري غير موجود.");
        
        const league = leagueDoc.data() as League;
        const isAdmin = adminDoc.exists() && adminDoc.data()?.isAdmin;
        const isLeagueAdmin = league.adminId === adminId;

        if(!isAdmin && !isLeagueAdmin) throw new Error("ليس لديك صلاحية لتعديل بيانات هذا الدوري.");

        transaction.update(leagueRef, {
            [`scores.${userId}`]: stats.points,
            [`gamesPlayed.${userId}`]: stats.gamesPlayed
        });

        return { success: true };
    }).catch( (error: any) => {
         return { success: false, error: error.message || "حدث خطأ غير متوقع." };
    });
};

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

export async function deleteLeague(requestingUserId: string, leagueId: string): Promise<{ success: boolean; error?: string }> {
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
};


export async function kickPlayerFromLeague(adminId: string, leagueId: string, memberToKickId: string): Promise<{ success: boolean; error?: string }> {
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
};

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

export async function resetAllLeagueStats(adminId: string): Promise<{ success: boolean, count?: number, error?: string }> {
    const adminRef = doc(db, 'users', adminId);
    const adminDoc = await getDoc(adminRef);
    if (!adminDoc.exists() || !adminDoc.data()?.isAdmin) {
        return { success: false, error: 'ليس لديك صلاحية لتنفيذ هذا الأمر.' };
    }
    
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
};

/**
 * Distributes end-of-game awards like leaderboard points and coins based on player ranking.
 * This function commits the updates to Firestore.
 * @param game The final game state object.
 */
export async function distributeEndOfGameAwards(game: Game) {
    const playersToUpdate = game.players.filter(p => p.status !== 'left');
    if (playersToUpdate.length === 0) return;
    
    // This is a READ operation, which is why it was causing transaction errors.
    const allRanks = await getRanks();

    const { updates, winUpdate, specialAwards } = calculateEndOfGameAwards(game, allRanks);
    const batch = writeBatch(db);

    const shouldUpdateChallenges = Object.values(updates).some(upd => (upd.challengePoints || 0) > 0);
    let activeChallenges: Challenge[] = [];

    if (shouldUpdateChallenges) {
        const now = Timestamp.now();
        const challengesQuery = query(collection(db, 'challenges'), where('endsAt', '>', now));
        const challengesSnapshot = await getDocs(challengesQuery);
        activeChallenges = challengesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Challenge));
    }

    Object.entries(updates).forEach(([playerId, playerUpdates]) => {
        const userRef = doc(db, "users", playerId);
        const firestoreUpdates: any = { gamesPlayed: increment(1) };
        if (playerUpdates.leaderboardPoints > 0) {
            firestoreUpdates.leaderboardPoints = increment(playerUpdates.leaderboardPoints);
        }
        if (playerUpdates.coins > 0) {
            firestoreUpdates.coins = increment(playerUpdates.coins);
        }
        if (playerUpdates.permissions) {
            firestoreUpdates.permissions = playerUpdates.permissions;
        }

        batch.update(userRef, firestoreUpdates);
        
        if (playerUpdates.challengePoints && playerUpdates.challengePoints > 0 && activeChallenges.length > 0) {
            const player = game.players.find(p => p.id === playerId);
            if (player) {
                for (const challenge of activeChallenges) {
                    if (challenge.participantIds?.includes(playerId) && (challenge.specificGameType === 'all' || challenge.specificGameType === game.gameType)) {
                        const challengeRef = doc(db, 'challenges', challenge.id);
                        batch.update(challengeRef, {
                            [`scores.${playerId}`]: increment(playerUpdates.challengePoints)
                        });
                    }
                }
            }
        }
    });

    if (winUpdate) {
        await updateUserWinCount(winUpdate.gameType, winUpdate.userId, batch);
    }
    
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
 * This is now the primary entry point for all end-of-game score processing.
 * @param game The final game state object containing player scores.
 */
export async function updateLeagueScoresForGameEnd(game: Game) {
    if (!game.gameResult) return;
    
    // This is the only place we call distributeEndOfGameAwards, ensuring it's outside any transaction.
    await distributeEndOfGameAwards(game);

    const playersWithLeagues = game.players.filter(p => p.status !== 'left' && p.leagues && p.leagues.length > 0);
    if(playersWithLeagues.length === 0) return;
    
    const allRanks = await getRanks();
    const { updates } = calculateEndOfGameAwards(game, allRanks);
    
    const batch = writeBatch(db);

    playersWithLeagues.forEach(player => {
        const playerUpdates = updates[player.id];
        if (playerUpdates && playerUpdates.leaderboardPoints > 0) {
            player.leagues?.forEach(leagueInfo => {
                const leagueRef = doc(db, 'leagues', leagueInfo.id);
                batch.update(leagueRef, {
                    [`scores.${player.id}`]: increment(playerUpdates.leaderboardPoints),
                    [`gamesPlayed.${player.id}`]: increment(1)
                });
            });
        }
    });
    
    try {
        await batch.commit();
    } catch (error) {
        console.error("Error updating league scores after game end:", error);
    }
}

