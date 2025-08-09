

'use server';

import { db } from '@/lib/firebase';
import { doc, serverTimestamp, updateDoc, collection, getDoc, increment, runTransaction, arrayUnion, setDoc, deleteField } from 'firebase/firestore';
import type { UserProfile, SocialRank, Humiliation, AllegianceRequest, ActiveAllegiance, TaxDemand, Alliance, Decree, DuelChallenge, SocialEvent } from '@/types';
import { DEFAULT_SOCIAL_RANKS } from '@/types';
import { sendSystemMail } from './mail';
import { generateGameId } from '../helpers';
import { getRanks } from './queries';


async function recordSocialEvent(event: Omit<SocialEvent, 'id' | 'timestamp'>, transaction?: any) {
    const eventRef = doc(collection(db, 'social_events'));
    const eventData = { ...event, timestamp: serverTimestamp() };
    if (transaction) {
        transaction.set(eventRef, eventData);
    } else {
        await setDoc(eventRef, eventData);
    }
}

export async function giveReward(actorId: string, targetId: string, reward: { points?: number, coins?: number }, reason: string): Promise<{ success: boolean; error?: string }> {
    return runTransaction(db, async (transaction) => {
        const targetRef = doc(db, "users", targetId);
        const targetDoc = await transaction.get(targetRef);
        
        if (!targetDoc.exists()) {
            throw new Error("اللاعب المستهدف غير موجود.");
        }
        
        const updates: any = {};
        if (reward.points && reward.points > 0) updates.leaderboardPoints = increment(reward.points);
        if (reward.coins && reward.coins > 0) updates.coins = increment(reward.coins);
        
        if (Object.keys(updates).length > 0) {
            transaction.update(targetRef, updates);
        }

        const mailContent = {
            subject: 'لقد تلقيت مكافأة!',
            body: `لقد منحك المشرف مكافأة: ${reward.points || 0} نقاط و ${reward.coins || 0} كوينز. السبب: ${reason}`
        };
        await sendSystemMail(targetId, mailContent, transaction);


        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل منح المكافأة." };
    });
};


export async function applyPunishment(actorId: string, targetId: string, penalty: { points?: number, coins?: number}, reason: string): Promise<{ success: boolean; error?: string }> {
     return runTransaction(db, async (transaction) => {
        const targetRef = doc(db, "users", targetId);
        const targetDoc = await transaction.get(targetRef);

        if (!targetDoc.exists()) {
            throw new Error("اللاعب المستهدف غير موجود.");
        }
        
        const updates: any = {};
        if (penalty.points && penalty.points > 0) {
            updates.leaderboardPoints = increment(-penalty.points);
        }
        if (penalty.coins && penalty.coins > 0) {
            updates.coins = increment(-penalty.coins);
        }

        if (Object.keys(updates).length > 0) {
            transaction.update(targetRef, updates);
        }
         const mailContent = {
            subject: 'لقد تلقيت عقوبة!',
            body: `لقد طبق المشرف عليك عقوبة: خصم ${penalty.points || 0} نقاط و ${penalty.coins || 0} كوينز. السبب: ${reason}`
        };
        await sendSystemMail(targetId, mailContent, transaction);

        return { success: true };
     }).catch((error: any) => {
        return { success: false, error: error.message || "فشل تطبيق العقوبة." };
    });
};


export async function humiliatePlayer(actorId: string, targetId: string, durationInDays: number, taxToLift: number): Promise<{ success: boolean, error?: string }> {
    const allRanks = await getRanks();
    
    const honorCost = durationInDays * 3;

    return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const targetRef = doc(db, "users", targetId);

        const [actorDoc, targetDoc] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);

        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

        const actor = actorDoc.data() as UserProfile;
        const target = targetDoc.data() as UserProfile;

        // This is a server-side replica of the client-side getSocialRankForUser logic
        const getRank = (points: number, ranks: SocialRank[]) => {
            const sortedRanks = [...ranks].sort((a,b) => b.threshold - a.threshold);
            for (const rank of sortedRanks) {
                if (points >= rank.threshold) return rank;
            }
            return sortedRanks[sortedRanks.length - 1] || null;
        }

        const actorRank = getRank(actor.leaderboardPoints || 0, allRanks);
        const targetRank = getRank(target.leaderboardPoints || 0, allRanks);
        
        if (!actorRank || !targetRank) throw new Error("خطأ في تحديد الرتب.");
        if ((actor.honorPoints || 0) < honorCost) throw new Error(`لا تملك نقاط شرف كافية (التكلفة ${honorCost}).`);
        if (actorRank.threshold <= targetRank.threshold) throw new Error("لا يمكنك إذلال لاعب من نفس طبقتك أو أعلى.");
        if (target.allegiance?.to === actorId) throw new Error("لا يمكنك إذلال لاعب أعلن ولاءه لك.");

        const existingHumiliation = target.humiliation?.until;
        if (existingHumiliation && new Date((existingHumiliation as any).toDate()) > new Date()) {
            throw new Error("هذا اللاعب مُذل بالفعل.");
        }
        
        const humiliation: Humiliation = {
            by: actorId,
            byName: actor.name,
            at: new Date(),
            until: new Date(Date.now() + durationInDays * 24 * 60 * 60 * 1000),
            taxToLift: taxToLift > 0 ? taxToLift : 0,
            durationInDays: durationInDays,
        };
        
        transaction.update(actorRef, { honorPoints: increment(-honorCost) });
        transaction.update(targetRef, {
            rebellionPoints: increment(3 * durationInDays),
            humiliation: humiliation,
            isPunished: true, // Set punishment flag
        });

        await recordSocialEvent({
            type: 'humiliation',
            description: `${actor.name} قام بإذلال ${target.name}.`
        }, transaction);

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل تنفيذ الإذلال." };
    });
}

export async function requestAllegiance(actorId: string, targetId: string, durationInDays: number, offer: { amount: number, currency: 'coins' }): Promise<{ success: boolean, error?: string }> {
     const LOYALTY_COST_MAP: Record<number, number> = { 1: 3, 2: 6, 3: 8 };
     const loyaltyCost = LOYALTY_COST_MAP[durationInDays] || 3;

    return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const targetRef = doc(db, "users", targetId);

        const [actorDoc, targetDoc] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);

        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

        const actor = actorDoc.data() as UserProfile;
        
        if ((actor.loyaltyPoints || 0) < loyaltyCost) throw new Error(`لا تملك نقاط ولاء كافية (التكلفة ${loyaltyCost}).`);
        if(actor.coins < offer.amount) throw new Error("لا تملك ما يكفي من الكوينز لتقديم هذا العرض.");

        const newRequest: AllegianceRequest = {
            fromId: actorId,
            fromName: actor.name,
            fromAvatar: actor.avatarId,
            offer,
            durationInDays,
            status: 'pending',
            createdAt: new Date(),
        };

        transaction.update(targetRef, {
            allegianceRequests: arrayUnion(newRequest)
        });

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل إرسال طلب الولاء." };
    });
}


export async function issueDecree(actorId: string, targetId: string, title: string, durationInDays: number): Promise<{ success: boolean; error?: string }> {
    const honorCost = 7; 
     return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const targetRef = doc(db, "users", targetId);

        const [actorDoc, targetDoc] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);

        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");
        
        const actor = actorDoc.data() as UserProfile;
        if ((actor.honorPoints || 0) < honorCost) throw new Error(`لا تملك نقاط شرف كافية لإصدار مرسوم (التكلفة ${honorCost}).`);
        
        const lastPunishment = actor.lastPunishmentTimestamp?.[targetId];
        if (lastPunishment && (Date.now() - (lastPunishment as any).toMillis() < 24 * 60 * 60 * 1000)) {
            throw new Error("لا يمكنك معاقبة هذا اللاعب مرة أخرى إلا بعد مرور 24 ساعة.");
        }
        
        // Remove existing decrees for this actor on the target before adding a new one
        const targetData = targetDoc.data() as UserProfile;
        const otherDecrees = (targetData.decrees || []).filter(d => d.issuedBy !== actorId);
        
        const newDecree: Decree = {
            title: title,
            issuedBy: actorId,
            issuedByName: actor.name,
            at: new Date(),
            until: new Date(Date.now() + durationInDays * 24 * 60 * 60 * 1000),
            durationInDays: durationInDays,
        };
        
        transaction.update(actorRef, { 
            honorPoints: increment(-honorCost),
            [`lastPunishmentTimestamp.${targetId}`]: serverTimestamp(),
        });

        transaction.update(targetRef, { 
            decrees: [...otherDecrees, newDecree],
            isPunished: true, // Set punishment flag
        });
        
        return { success: true };
     }).catch((error: any) => {
        return { success: false, error: error.message || "فشل إصدار المرسوم." };
    });
}


export async function begForMercy(actorId: string, targetId: string, cost: number): Promise<{ success: boolean, error?: string }> {
     return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const targetRef = doc(db, "users", targetId);
        
        const [actorDoc, targetDoc] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);
        
        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");
        
        const actor = actorDoc.data() as UserProfile;
        if ((actor.loyaltyPoints || 0) < cost) throw new Error(`لا تملك نقاط ولاء كافية (التكلفة ${cost}).`);
        
        transaction.update(actorRef, { loyaltyPoints: increment(-cost) });
        transaction.update(targetRef, { honorPoints: increment(cost) });
        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل التوسل." };
    });
}


export async function demandTaxes(actorId: string, targetId: string, amount: number): Promise<{ success: boolean; error?: string }> {
    const actorRef = doc(db, "users", actorId);
    const targetRef = doc(db, "users", targetId);

    return runTransaction(db, async (transaction) => {
        const [actorDoc, targetDoc] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);
        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");
        
        const actor = actorDoc.data() as UserProfile;
        const target = targetDoc.data() as UserProfile;

        if (target.allegiance?.to === actorId) throw new Error("لا يمكنك فرض ضريبة على من أعلن ولاءه لك.");
        if ((actor.honorPoints || 0) < 5) throw new Error("لا تملك نقاط شرف كافية لفرض ضريبة (التكلفة 5).");
        
        const lastPunishment = actor.lastPunishmentTimestamp?.[targetId];
        if (lastPunishment && (Date.now() - (lastPunishment as any).toMillis() < 24 * 60 * 60 * 1000)) {
            throw new Error("لا يمكنك معاقبة هذا اللاعب مرة أخرى إلا بعد مرور 24 ساعة.");
        }

        const newDemand: TaxDemand = {
            fromId: actorId,
            fromName: actor.name,
            amount: amount,
            status: 'pending',
            createdAt: new Date(),
        };

        transaction.update(targetRef, { taxDemands: arrayUnion(newDemand) });
        transaction.update(actorRef, {
            honorPoints: increment(-5),
            [`lastPunishmentTimestamp.${targetId}`]: serverTimestamp(),
        });
        
        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل فرض الضريبة." };
    });
}


export async function respondToTaxDemand(actorId: string, demand: TaxDemand, response: 'paid' | 'rejected'): Promise<{ success: boolean; error?: string }> {
    const actorRef = doc(db, "users", actorId);
    const taxerRef = doc(db, "users", demand.fromId);

    return runTransaction(db, async (transaction) => {
        const actorDoc = await transaction.get(actorRef);
        if (!actorDoc.exists()) throw new Error("لم يتم العثور على ملفك الشخصي.");
        
        const actorData = actorDoc.data() as UserProfile;
        const demands = actorData.taxDemands || [];
        const demandIndex = demands.findIndex(d => d.fromId === demand.fromId && d.createdAt.toString() === demand.createdAt.toString());
        if (demandIndex === -1) throw new Error("لم يتم العثور على طلب الضريبة هذا.");

        const updatedDemands = [...demands];
        updatedDemands.splice(demandIndex, 1);
        
        if (response === 'paid') {
            if ((actorData.coins || 0) < demand.amount) throw new Error("ليس لديك ما يكفي من الكوينز لدفع الضريبة.");
            transaction.update(actorRef, { coins: increment(-demand.amount), loyaltyPoints: increment(2), taxDemands: updatedDemands });
            transaction.update(taxerRef, { coins: increment(demand.amount), honorPoints: increment(2) });
        } else {
            transaction.update(actorRef, { taxDemands: updatedDemands, rebellionPoints: increment(1) });
        }
        
        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل الرد على طلب الضريبة." };
    });
}

export async function requestAlliance(actorId: string, targetId: string): Promise<{ success: boolean; error?: string }> {
    const actorRef = doc(db, "users", actorId);
    const targetRef = doc(db, "users", targetId);
    return runTransaction(db, async (transaction) => {
        const [actorDoc, targetDoc] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);
        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

        const actor = actorDoc.data() as UserProfile;
        const target = targetDoc.data() as UserProfile;

        const newAlliance: Alliance = {
            id: [actorId, targetId].sort().join('_'),
            members: {
                [actorId]: { name: actor.name, avatarId: actor.avatarId, status: 'accepted' },
                [targetId]: { name: target.name, avatarId: target.avatarId, status: 'pending' },
            },
            createdAt: new Date(),
        };

        transaction.update(targetRef, { alliances: arrayUnion(newAlliance) });
        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل طلب التحالف." };
    });
}

export async function respondToAlliance(actorId: string, alliance: Alliance, response: 'accepted' | 'rejected'): Promise<{ success: boolean; error?: string }> {
     const actorRef = doc(db, "users", actorId);
     const otherMemberId = Object.keys(alliance.members).find(id => id !== actorId);
     if(!otherMemberId) return { success: false, error: "خطأ في بيانات التحالف." };
     const otherMemberRef = doc(db, "users", otherMemberId);

    return runTransaction(db, async (transaction) => {
        const [actorDoc, otherDoc] = await Promise.all([transaction.get(actorRef), transaction.get(otherMemberRef)]);
        if (!actorDoc.exists() || !otherDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

        const actorData = actorDoc.data() as UserProfile;
        const otherData = otherDoc.data() as UserProfile;

        const actorAllianceIndex = (actorData.alliances || []).findIndex(a => a.id === alliance.id);
        if (actorAllianceIndex === -1) throw new Error("لم يتم العثور على طلب التحالف.");
        
        const updatedActorAlliances = [...(actorData.alliances || [])];
        updatedActorAlliances.splice(actorAllianceIndex, 1);
        
        const updatedOtherAlliances = [...(otherData.alliances || [])];
        const otherAllianceIndex = updatedOtherAlliances.findIndex(a => a.id === alliance.id);
        if (otherAllianceIndex !== -1) {
            updatedOtherAlliances.splice(otherAllianceIndex, 1);
        }

        if (response === 'accepted') {
            alliance.members[actorId]!.status = 'accepted';
            updatedActorAlliances.push(alliance);
            updatedOtherAlliances.push(alliance);
        }
        
        transaction.update(actorRef, { alliances: updatedActorAlliances });
        transaction.update(otherMemberRef, { alliances: updatedOtherAlliances });

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل الرد على طلب التحالف." };
    });
}

export async function issueDuelChallenge(actorId: string, targetId: string, betAmount: number): Promise<{ success: boolean; error?: string }> {
     const actorRef = doc(db, "users", actorId);
     const targetRef = doc(db, "users", targetId);

     return runTransaction(db, async (transaction) => {
         const [actorDoc, targetDoc] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);
         if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

         const actor = actorDoc.data() as UserProfile;
         
         if((actor.coins || 0) < betAmount) throw new Error("لا تملك ما يكفي من الكوينز للمراهنة.");

         const challengeId = generateGameId();
         const newChallenge: DuelChallenge = {
             id: challengeId,
             fromId: actorId,
             fromName: actor.name,
             betAmount: betAmount,
             status: 'pending',
             createdAt: new Date(),
         };
         
         transaction.update(targetRef, { duelChallenges: arrayUnion(newChallenge) });

         return { success: true };
     }).catch((error: any) => {
         return { success: false, error: error.message || "فشل إرسال التحدي." };
     });
}

export async function respondToDuelChallenge(actorId: string, challenge: DuelChallenge, response: 'accepted' | 'rejected'): Promise<{ success: boolean, error?: string, gameId?: string }> {
    const actorRef = doc(db, "users", actorId);
    
     return runTransaction(db, async (transaction) => {
         const actorDoc = await transaction.get(actorRef);
         if (!actorDoc.exists()) throw new Error("لم يتم العثور على اللاعب.");

         const actorData = actorDoc.data() as UserProfile;
         const demands = actorData.duelChallenges || [];
         const demandIndex = demands.findIndex(d => d.id === challenge.id);
         if (demandIndex === -1) throw new Error("لم يتم العثور على طلب التحدي هذا.");

         const updatedDemands = [...demands];
         updatedDemands.splice(demandIndex, 1);
         
         let gameId: string | undefined = undefined;

         if (response === 'accepted') {
             if ((actorData.coins || 0) < challenge.betAmount) throw new Error("لا تملك ما يكفي من الكوينز لقبول الرهان.");
             gameId = challenge.id;
         } 

         transaction.update(actorRef, { duelChallenges: updatedDemands });
         
         return { success: true, gameId };
     }).catch((error: any) => {
         return { success: false, error: error.message || "فشل الرد على التحدي." };
    });
}

export async function forceAvatarChange(actorId: string, targetId: string, avatarId: string, durationInDays: number, taxToLift: number): Promise<{ success: boolean; error?: string }> {
     const honorCost = durationInDays * 2;
     return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const targetRef = doc(db, "users", targetId);
        
        const [actorDoc, targetDoc] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);
        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

        const actor = actorDoc.data() as UserProfile;
        const target = targetDoc.data() as UserProfile;
        
        if (!actor.unlockedPunishmentAvatars?.includes(avatarId)) {
            throw new Error("أنت لا تملك شخصية العقوبة هذه. يجب عليك شراؤها أولاً.");
        }
        
        if ((actor.honorPoints || 0) < honorCost) throw new Error(`لا تملك نقاط شرف كافية لهذه العقوبة (التكلفة ${honorCost}).`);

        const lastPunishment = actor.lastPunishmentTimestamp?.[targetId];
        if (lastPunishment && (Date.now() - (lastPunishment as any).toMillis() < 24 * 60 * 60 * 1000)) {
            throw new Error("لا يمكنك معاقبة هذا اللاعب مرة أخرى إلا بعد مرور 24 ساعة.");
        }
        
        transaction.update(actorRef, {
            honorPoints: increment(-honorCost),
            [`lastPunishmentTimestamp.${targetId}`]: serverTimestamp(),
        });
        
        const originalAvatar = {
            id: target.avatarId,
            until: new Date(Date.now() + durationInDays * 24 * 60 * 60 * 1000),
            taxToLift: taxToLift > 0 ? taxToLift : 0,
            by: actorId,
            byName: actor.name,
            durationInDays: durationInDays
        };

        transaction.update(targetRef, {
            avatarId: avatarId,
            originalAvatarToRevert: originalAvatar,
            isPunished: true, // Set punishment flag
        });
        
        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل فرض تغيير الشخصية." };
    });
}


export async function payPunishmentTax(actorId: string): Promise<{ success: boolean; error?: string; message?: string }> {
     return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const actorDoc = await transaction.get(actorRef);
        if (!actorDoc.exists()) throw new Error("المستخدم غير موجود.");
        
        let actorData = actorDoc.data() as UserProfile;
        let updateData: any = {};
        let message = "";
        
        if (actorData.humiliation && new Date((actorData.humiliation.until as any).toDate()) > new Date()) {
            const punishment = actorData.humiliation;
             if ((actorData.coins || 0) < punishment.taxToLift) {
                throw new Error("لا تملك ما يكفي من الكوينز لدفع الضريبة.");
            }
            const punisherRef = doc(db, "users", punishment.by);
            transaction.update(punisherRef, { coins: increment(punishment.taxToLift) });
            updateData.coins = increment(-punishment.taxToLift);
            updateData.humiliation = deleteField();
            message = `تم دفع ضريبة الإذلال (${punishment.taxToLift} كوينز).`;
        } else if (actorData.originalAvatarToRevert && new Date((actorData.originalAvatarToRevert.until as any).toDate()) > new Date()) {
            const punishment = actorData.originalAvatarToRevert;
            if ((actorData.coins || 0) < punishment.taxToLift) {
                throw new Error("لا تملك ما يكفي من الكوينز لدفع الضريبة.");
            }
            const punisherRef = doc(db, "users", punishment.by);
            transaction.update(punisherRef, { coins: increment(punishment.taxToLift) });
            updateData.coins = increment(-punishment.taxToLift);
            updateData.avatarId = punishment.id;
            updateData.originalAvatarToRevert = deleteField();
            message = `تم دفع ضريبة تغيير الشخصية (${punishment.taxToLift} كوينز).`;
        } else {
            throw new Error("ليس عليك أي عقوبات يمكنك دفعها حاليًا.");
        }
        
        // After clearing one punishment, check if any others are still active
        const remainingDecrees = (actorData.decrees || []).filter(d => d.until && new Date((d.until as any).toDate()) > new Date());
        
        if (!updateData.humiliation && !updateData.originalAvatarToRevert && remainingDecrees.length === 0) {
            updateData.isPunished = false;
        }

        transaction.update(actorRef, updateData);

        return { success: true, message: message };
    }).catch((error: any) => {
        return { success: false, error: error.message };
    });
}

export async function exchangeCoinsForLoyaltyPoints(userId: string, amount: number): Promise<{ success: boolean; error?: string }> {
    const COIN_TO_LOYALTY_RATE = 3;
    const userRef = doc(db, 'users', userId);
    const cost = amount;
    const gain = amount * COIN_TO_LOYALTY_RATE;

    return runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("المستخدم غير موجود.");
        const userData = userDoc.data() as UserProfile;

        if ((userData.coins || 0) < cost) {
            throw new Error(`ليس لديك ما يكفي من الكوينز.`);
        }

        transaction.update(userRef, {
            coins: increment(-cost),
            loyaltyPoints: increment(gain)
        });

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message };
    });
}
