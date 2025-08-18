'use server';

import { db } from '@/lib/firebase';
import { doc, serverTimestamp, setDoc, updateDoc, collection, query, getDocs, getDoc, where, increment, runTransaction, arrayUnion, arrayRemove, deleteField, Timestamp, writeBatch, type Transaction } from 'firebase/firestore';
import { generateLeagueId } from '../helpers';
import type { UserProfile, League, Game, Challenge, SocialRank } from '@/types';
import { distributeEndOfGameAwards } from '../admin/users';


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
                     // This part is tricky. We are overriding the global gamesPlayed with league-specific.
                     // A better structure would be to have league-specific stats separate.
                     // For now, this makes the league leaderboard display correctly.
                     const gamesPlayedInLeague = league.gamesPlayed?.[doc.id] || 0;
                     members.push({ ...userData, uid: doc.id, leaderboardPoints: leaguePoints, gamesPlayed: { total: gamesPlayedInLeague } } as UserProfile);
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
            // This needs to be adapted for per-game counts, this action might be deprecated or changed.
            // For now, it will update a generic 'total' which doesn't exist.
            // A more specific action would be needed to update stats for a *specific* game.
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
            gamesPlayed: { }, // Initialize as an empty object for per-game counts
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
                // gamesPlayed doesn't need to be initialized here as it's per-game type
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
            const newGamesPlayed: Record<string, Record<string, number>> = {}; // Changed to match per-game structure
            leagueData.members.forEach(memberId => {
                newScores[memberId] = 0;
                newGamesPlayed[memberId] = {}; // Reset per-game stats for each member
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

export async function updateLeagueScoresForGameEnd(game: Game) {
    if (!game || !game.playerUids || game.playerUids.length === 0) return;
    
    const leaguesQuery = query(collection(db, 'leagues'), where('members', 'array-contains-any', game.playerUids));
    const leaguesSnapshot = await getDocs(leaguesQuery);
    
    if (leaguesSnapshot.empty) return;
    
    const { data } = await distributeEndOfGameAwards(game.id);
    if (!data) return;

    const { updates } = data;
    
    const batch = writeBatch(db);

    leaguesSnapshot.forEach(leagueDoc => {
        const leagueUpdates: { [key: string]: any } = {};
        Object.entries(updates).forEach(([playerId, playerUpdates]) => {
            if(leagueDoc.data().members.includes(playerId)) {
                if (playerUpdates.challengePoints && playerUpdates.challengePoints !== 0) {
                     leagueUpdates[`scores.${playerId}`] = increment(playerUpdates.challengePoints);
                }
                if (game.gameType) {
                    leagueUpdates[`gamesPlayed.${playerId}.${game.gameType}`] = increment(1);
                }
            }
        });
        if (Object.keys(leagueUpdates).length > 0) {
            batch.update(leagueDoc.ref, leagueUpdates);
        }
    });

    await batch.commit();
}
