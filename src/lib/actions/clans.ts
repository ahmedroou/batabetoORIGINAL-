
'use server';

import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    collection,
    getDocs,
    Timestamp,
    query,
    orderBy,
    writeBatch,
    increment,
    arrayUnion,
    getDoc,
    arrayRemove
} from 'firebase/firestore';
import type { Clan, Player, UserProfile, ClanMember, ClanWarInvitation, Game } from '@/types';
import { getPlayerFromUserId } from './user';


/**
 * Creates a new clan. The creator automatically becomes the leader.
 * Costs 5 coins to create.
 * @param {string} userId - The ID of the user creating the clan.
 * @param {string} clanName - The desired name for the new clan.
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function createClan(userId: string, clanName: string): Promise<{ success: boolean; error?: string }> {
    if (!clanName.trim()) {
        return { success: false, error: "اسم الفريق مطلوب." };
    }
    const userRef = doc(db, 'users', userId);
    const clanRef = doc(collection(db, 'clans'));
    
    try {
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) {
                throw new Error("لم يتم العثور على المستخدم.");
            }
            const userData = userDoc.data() as UserProfile;

            if (userData.coins < 5) {
                throw new Error("ليس لديك ما يكفي من الكوينز لإنشاء فريق.");
            }
             if (userData.clan) {
                throw new Error("أنت عضو بالفعل في فريق.");
            }
            
            const newMember: ClanMember = {
                id: userId,
                name: userData.name,
                avatarId: userData.avatarId,
                leaderboardPoints: userData.leaderboardPoints || 0,
                role: 'leader',
            };

            const newClan: Omit<Clan, 'id'> = {
                name: clanName,
                emblem: 'Avatar000.png', 
                color: '#ffffff',
                leaderId: userId,
                members: [newMember],
                totalPoints: userData.leaderboardPoints * 2,
                totalHonorPoints: userData.honorPoints || 0,
                unlockedEmblems: ['Avatar000.png'],
                invitations: []
            };
            
            transaction.set(clanRef, newClan);
            transaction.update(userRef, {
                coins: increment(-5),
                clan: { id: clanRef.id, name: clanName, emblem: 'Avatar000.png' },
                clanRole: 'leader'
            });
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || "فشل إنشاء الفريق." };
    }
}


/**
 * Fetches all clans and sorts them by total points in descending order.
 * @returns {Promise<Clan[]>} An array of sorted clans.
 */
export async function getClans(): Promise<Clan[]> {
    try {
        const clansCol = collection(db, 'clans');
        const q = query(clansCol, orderBy('totalPoints', 'desc'));
        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Clan));
    } catch (error) {
        console.error("Error fetching clans:", error);
        return [];
    }
}

export async function createClanWarInvite(data: Omit<ClanWarInvitation, 'id' | 'status' | 'challengerClan' | 'challengedClan'> & { challengerClanId: string, challengedClanId: string }) {
    const { challengerClanId, challengedClanId, gameType, battleTime } = data;
    const inviteRef = doc(collection(db, 'clan_war_invites'));
    
    try {
        const [challengerDoc, challengedDoc] = await Promise.all([
            getDoc(doc(db, 'clans', challengerClanId)),
            getDoc(doc(db, 'clans', challengedClanId))
        ]);

        if (!challengerDoc.exists() || !challengedDoc.exists()) {
            throw new Error("لم يتم العثور على أحد الفريقين.");
        }

        const newInvite: ClanWarInvitation = {
            id: inviteRef.id,
            challengerClan: { id: challengerDoc.id, name: challengerDoc.data().name, emblem: challengerDoc.data().emblem },
            challengedClan: { id: challengedDoc.id, name: challengedDoc.data().name, emblem: challengedDoc.data().emblem },
            gameType,
            battleTime,
            status: 'pending'
        };

        await setDoc(inviteRef, newInvite);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function getClanWarInvites(clanId: string): Promise<ClanWarInvitation[]> {
    try {
        const invitesRef = collection(db, 'clan_war_invites');
        const q = query(invitesRef, where('challengedClan.id', '==', clanId), where('status', '==', 'pending'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => d.data() as ClanWarInvitation);
    } catch (error) {
        console.error("Error fetching clan war invites", error);
        return [];
    }
}

export async function respondToClanWarInvite(inviteId: string, clanId: string, response: 'accepted' | 'rejected') {
     try {
        const inviteRef = doc(db, 'clan_war_invites', inviteId);
        const inviteDoc = await getDoc(inviteRef);
        if(!inviteDoc.exists() || inviteDoc.data()?.challengedClan.id !== clanId) {
            throw new Error("دعوة غير صالحة أو لا تملك صلاحية الرد عليها.");
        }

        if (response === 'accepted') {
             await updateDoc(inviteRef, { status: 'accepted' });
        } else {
             await deleteDoc(inviteRef);
        }
        return { success: true };

     } catch (error: any) {
        return { success: false, error: error.message };
     }
}
