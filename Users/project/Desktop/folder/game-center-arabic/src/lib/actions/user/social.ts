

'use server';

import { db } from '@/lib/firebase';
import { doc, serverTimestamp, updateDoc, collection, getDoc, increment, runTransaction, arrayUnion, setDoc, deleteField, writeBatch } from 'firebase/firestore';
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

        // This is a synchronous function to calculate rank from a pre-fetched list.
        const getRank = (points: number, ranks: SocialRank[]) => {
            const sortedRanks = [...ranks].sort((a,b) => b.threshold - a.threshold);
            for (const rank of sortedRanks) {
                if (points >= rank.threshold) return rank;
            }
            return sortedRanks[sortedRanks.length - 1] || null;
        }

        const actorRank = getRank(actor.leaderboardPoints, allRanks);
        const targetRank = getRank(target.leaderboardPoints, allRanks);
        
        if (!actorRank || !targetRank) throw new Error("خطأ في تحديد الرتب.");
        if ((actor.honorPoints || 0) < honorCost) throw new Error(`لا تملك نقاط شرف كافية (التكلفة ${honorCost}).`);
        if (actorRank.threshold <= targetRank.threshold) throw new Error("لا يمكنك إذلال لاعب من نفس طبقتك أو أعلى.");
        if (target.allegiance?.to === actorId) throw new Error("لا يمكنك إذلال لاعب أعلن ولاءه لك.");

        const humiliationUntil = target.humiliation?.until;
        if (humiliationUntil && (humiliationUntil as any).toDate() > new Date()) {
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
        
        transaction.update(actorRef, { honorPoints: increment(-honorCost), punishmentsIssued: increment(1) });
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


export async function issueDecree(actorId: string, targetId: string, title: string, durationInDays: number, taxToLift: number): Promise<{ success: boolean; error?: string }> {
    const honorCost = 7; // Fixed cost of 7 honor points as requested.
     return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const targetRef = doc(db, "users", targetId);

        const [actorDoc, targetDoc] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);

        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");
        
        const actor = actorDoc.data() as UserProfile;
        if (!actor.permissions?.includes('can_force_name_change')) {
            throw new Error("ليس لديك صلاحية إصدار المراسيم.");
        }
        if ((actor.honorPoints || 0) < honorCost) throw new Error(`لا تملك نقاط شرف كافية لإصدار مرسوم (التكلفة ${honorCost}).`);
        
        const lastPunishment = actor.lastPunishmentTimestamp?.[targetId];
        if (lastPunishment && (Date.now() - (lastPunishment as any).toMillis() < 24 * 60 * 60 * 1000)) {
            throw new Error("لا يمكنك معاقبة هذا اللاعب مرة أخرى إلا بعد مرور 24 ساعة.");
        }
        
        // Remove existing decrees for this actor on the target before adding a new one
        const targetData = targetDoc.data() as UserProfile;
        const otherDecrees = (targetData.decrees || []).filter(d => d.issuedBy !== actorId);
        
        const newDecree: Decree = {
            id: `decree_${actorId}_${Date.now()}`,
            title: title,
            issuedBy: actorId,
            issuedByName: actor.name,
            at: new Date(),
            until: new Date(Date.now() + durationInDays * 24 * 60 * 60 * 1000),
            durationInDays: durationInDays,
            taxToLift,
        };
        
        transaction.update(actorRef, { 
            honorPoints: increment(-honorCost),
            [`lastPunishmentTimestamp.${targetId}`]: serverTimestamp(),
            punishmentsIssued: increment(1)
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
            punishmentsIssued: increment(1)
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
        
        if (!actor.permissions?.includes('can_force_avatar_change')) {
            throw new Error("ليس لديك صلاحية فرض تغيير الصورة.");
        }
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
            punishmentsIssued: increment(1)
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
        const batch = writeBatch(db);
        let message = "";
        let paidSomething = false;

        // Pay for Humiliation
        if (actorData.humiliation?.until && (actorData.humiliation.until as any).toDate() > new Date() && actorData.humiliation.taxToLift > 0) {
            const punishment = actorData.humiliation;
            if ((actorData.coins || 0) >= punishment.taxToLift) {
                const punisherRef = doc(db, "users", punishment.by);
                batch.update(punisherRef, { coins: increment(punishment.taxToLift) });
                batch.update(actorRef, { coins: increment(-punishment.taxToLift), humiliation: deleteField() });
                message += `تم دفع ضريبة الإذلال (${punishment.taxToLift} كوينز). `;
                paidSomething = true;
            }
        }

        // Pay for Avatar Change
        if (actorData.originalAvatarToRevert?.until && (actorData.originalAvatarToRevert.until as any).toDate() > new Date() && actorData.originalAvatarToRevert.taxToLift > 0) {
            const punishment = actorData.originalAvatarToRevert;
            const currentCoins = (actorData.coins || 0) - (paidSomething ? punishment.taxToLift : 0);
            if (currentCoins >= punishment.taxToLift) {
                 const punisherRef = doc(db, "users", punishment.by);
                 batch.update(punisherRef, { coins: increment(punishment.taxToLift) });
                 batch.update(actorRef, { coins: increment(-punishment.taxToLift), avatarId: punishment.id, originalAvatarToRevert: deleteField() });
                 message += `تم دفع ضريبة تغيير الشخصية (${punishment.taxToLift} كوينز). `;
                 paidSomething = true;
            }
        }
        
        // Pay for Decree
        const decreesToPay = (actorData.decrees || []).filter(d => d.until && (d.until as any).toDate() > new Date() && d.taxToLift > 0);
        const remainingDecrees = (actorData.decrees || []).filter(d => !decreesToPay.some(dp => dp.id === d.id));
        let coinsAfterInitialPayments = actorData.coins || 0;
        if(paidSomething) { // Adjust coins if other taxes were paid
            if(actorData.humiliation) coinsAfterInitialPayments -= actorData.humiliation.taxToLift;
            if(actorData.originalAvatarToRevert) coinsAfterInitialPayments -= actorData.originalAvatarToRevert.taxToLift;
        }

        let paidDecree = false;
        for(const decree of decreesToPay) {
            if(coinsAfterInitialPayments >= decree.taxToLift) {
                 const punisherRef = doc(db, "users", decree.issuedBy);
                 batch.update(punisherRef, { coins: increment(decree.taxToLift) });
                 batch.update(actorRef, { coins: increment(-decree.taxToLift) });
                 message += `تم دفع ضريبة اللقب المهين (${decree.taxToLift} كوينز). `;
                 paidSomething = true;
                 paidDecree = true;
            } else {
                remainingDecrees.push(decree);
            }
        }
        if(paidDecree) batch.update(actorRef, { decrees: remainingDecrees });


        if (!paidSomething) {
            throw new Error("ليس عليك أي عقوبات يمكنك دفعها حاليًا أو لا تملك ما يكفي من الكوينز.");
        }
        
        await batch.commit();

        return { success: true, message: message.trim() };
    }).catch((error: any) => {
        return { success: false, error: error.message };
    });
}

```
- src/lib/actions/user/social.ts:
```ts


'use server';

import { db } from '@/lib/firebase';
import { doc, serverTimestamp, updateDoc, collection, getDoc, increment, runTransaction, arrayUnion, setDoc, deleteField, writeBatch } from 'firebase/firestore';
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

        // This is a synchronous function to calculate rank from a pre-fetched list.
        const getRank = (points: number, ranks: SocialRank[]) => {
            const sortedRanks = [...ranks].sort((a,b) => b.threshold - a.threshold);
            for (const rank of sortedRanks) {
                if (points >= rank.threshold) return rank;
            }
            return sortedRanks[sortedRanks.length - 1] || null;
        }

        const actorRank = getRank(actor.leaderboardPoints, allRanks);
        const targetRank = getRank(target.leaderboardPoints, allRanks);
        
        if (!actorRank || !targetRank) throw new Error("خطأ في تحديد الرتب.");
        if ((actor.honorPoints || 0) < honorCost) throw new Error(`لا تملك نقاط شرف كافية (التكلفة ${honorCost}).`);
        if (actorRank.threshold <= targetRank.threshold) throw new Error("لا يمكنك إذلال لاعب من نفس طبقتك أو أعلى.");
        if (target.allegiance?.to === actorId) throw new Error("لا يمكنك إذلال لاعب أعلن ولاءه لك.");

        const humiliationUntil = target.humiliation?.until;
        if (humiliationUntil && (humiliationUntil as any).toDate() > new Date()) {
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
        
        transaction.update(actorRef, { honorPoints: increment(-honorCost), punishmentsIssued: increment(1) });
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


export async function issueDecree(actorId: string, targetId: string, title: string, durationInDays: number, taxToLift: number): Promise<{ success: boolean; error?: string }> {
    const honorCost = 7; // Fixed cost of 7 honor points as requested.
     return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const targetRef = doc(db, "users", targetId);

        const [actorDoc, targetDoc] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);

        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");
        
        const actor = actorDoc.data() as UserProfile;
        if (!actor.permissions?.includes('can_force_name_change')) {
            throw new Error("ليس لديك صلاحية إصدار المراسيم.");
        }
        if ((actor.honorPoints || 0) < honorCost) throw new Error(`لا تملك نقاط شرف كافية لإصدار مرسوم (التكلفة ${honorCost}).`);
        
        const lastPunishment = actor.lastPunishmentTimestamp?.[targetId];
        if (lastPunishment && (Date.now() - (lastPunishment as any).toMillis() < 24 * 60 * 60 * 1000)) {
            throw new Error("لا يمكنك معاقبة هذا اللاعب مرة أخرى إلا بعد مرور 24 ساعة.");
        }
        
        // Remove existing decrees for this actor on the target before adding a new one
        const targetData = targetDoc.data() as UserProfile;
        const otherDecrees = (targetData.decrees || []).filter(d => d.issuedBy !== actorId);
        
        const newDecree: Decree = {
            id: `decree_${actorId}_${Date.now()}`,
            title: title,
            issuedBy: actorId,
            issuedByName: actor.name,
            at: new Date(),
            until: new Date(Date.now() + durationInDays * 24 * 60 * 60 * 1000),
            durationInDays: durationInDays,
            taxToLift,
        };
        
        transaction.update(actorRef, { 
            honorPoints: increment(-honorCost),
            [`lastPunishmentTimestamp.${targetId}`]: serverTimestamp(),
            punishmentsIssued: increment(1)
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
            punishmentsIssued: increment(1)
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
        
        if (!actor.permissions?.includes('can_force_avatar_change')) {
            throw new Error("ليس لديك صلاحية فرض تغيير الصورة.");
        }
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
            punishmentsIssued: increment(1)
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
        
        const humiliation = actorData.humiliation?.until ? (actorData.humiliation.until as any).toDate() : null;
        const avatarRevert = actorData.originalAvatarToRevert?.until ? (actorData.originalAvatarToRevert.until as any).toDate() : null;
        const decrees = (actorData.decrees || []).filter(d => d.until && (d.until as any).toDate() > new Date());
        let totalTax = 0;
        let paidSomething = false;

        const punishmentsToPay = [];
        
        if(humiliation && actorData.humiliation!.taxToLift > 0) {
            punishmentsToPay.push({type: 'humiliation', tax: actorData.humiliation!.taxToLift, punisherId: actorData.humiliation!.by});
        }
        if(avatarRevert && actorData.originalAvatarToRevert!.taxToLift > 0) {
            punishmentsToPay.push({type: 'avatar', tax: actorData.originalAvatarToRevert!.taxToLift, punisherId: actorData.originalAvatarToRevert!.by});
        }
        decrees.forEach(d => {
            if(d.taxToLift > 0) {
                punishmentsToPay.push({type: 'decree', tax: d.taxToLift, punisherId: d.issuedBy, id: d.id });
            }
        });
        
        totalTax = punishmentsToPay.reduce((sum, p) => sum + p.tax, 0);

        if ((actorData.coins || 0) < totalTax) {
            throw new Error(`ليس لديك ما يكفي من الكوينز لدفع جميع الضرائب (${totalTax}).`);
        }
        if(totalTax === 0) {
            throw new Error("ليس عليك أي ضرائب يمكن دفعها حاليًا.");
        }

        // Pay all taxes in a batch
        for(const p of punishmentsToPay) {
            const punisherRef = doc(db, "users", p.punisherId);
            transaction.update(punisherRef, { coins: increment(p.tax) });
            message += `تم دفع ضريبة (${p.tax} كوينز). `;
        }
        
        transaction.update(actorRef, {
            coins: increment(-totalTax),
            humiliation: deleteField(),
            originalAvatarToRevert: deleteField(),
            decrees: [],
            isPunished: false,
        });

        return { success: true, message: message.trim() };

    }).catch((error: any) => {
        return { success: false, error: error.message };
    });
}
```
- src/lib/actions/user.ts:
```ts


/**
 * @fileoverview This file re-exports all user-related actions from their new, modular locations.
 * This structure improves maintainability by separating concerns.
 */

// Explicitly import and export to avoid namespace collisions and help bundlers.
import { createUserProfile, updateUserName, updateUserAvatar, updateUserGender } from './user/profile';
import { purchaseAvatar, purchasePunishmentAvatar, exchangeCoinsForHonor, exchangeCoinsForRebellion, exchangeCoinsForLoyaltyPoints } from './user/currency';
import { getPlayerFromUserId, getGameKings, getKingOfGames, getAllUsers, updateUserWinCount, searchUsers, getRanks, getUsersByRank, getTopPunisher } from './user/queries';
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
} from './user/leagues';
import { calculateEndOfGameAwards } from './user/awards';
import { giveReward, applyPunishment, humiliatePlayer, requestAllegiance, issueDecree, begForMercy, demandTaxes, respondToTaxDemand, requestAlliance, respondToAlliance, issueDuelChallenge, respondToDuelChallenge, forceAvatarChange, payPunishmentTax } from './user/social';

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
    getTopPunisher,
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
    exchangeCoinsForLoyaltyPoints,
    getRanks,
};

```
- src/tailwind.config.ts:
```ts
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-tajawal)', 'sans-serif'],
        code: ['monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

```
- src/types/index.ts:
```ts
import type { Timestamp } from 'firebase/firestore';
import type { LucideIcon } from 'lucide-react';
import { z } from 'zod';
import type { ALL_PERMISSIONS } from '@/data/permissions';


// Zod Schemas for AI Flows
const PlayerAnswersSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  answers: z.array(z.string()),
});

export const JudgeSingleSubmissionInputSchema = z.object({
    question: z.string().describe("The question that was asked."),
    submission: PlayerAnswersSchema.describe("The submission from a single player."),
});
export type JudgeSingleSubmissionInput = z.infer<typeof JudgeSingleSubmissionInputSchema>;

export const JudgeSingleSubmissionOutputSchema = z.object({
    playerId: z.string(),
    name: z.string(),
    correctAnswers: z.array(z.string()).describe("An array of the answers that were deemed correct."),
    score: z.number().int().describe("The final score for this player for the round."),
    evaluation: z.string().optional().describe("A witty and concise explanation for the score given to this specific player.")
});
export type JudgeSingleSubmissionOutput = z.infer<typeof JudgeSingleSubmissionOutputSchema>;


export const JudgePrisonAnswersInputSchema = z.object({
  question: z.string().describe("The question that was asked."),
  submissions: z.array(PlayerAnswersSchema).describe("An array of submissions from all players."),
  rejudgeReason: z.object({
      name: z.string(),
      reason: z.string()
  }).optional().describe("An optional reason provided by a player for a re-evaluation request."),
});
export type JudgePrisonAnswersInput = z.infer<typeof JudgePrisonAnswersInputSchema>;

export const JudgePrisonAnswersOutputSchema = z.object({
  results: z.array(JudgeSingleSubmissionOutputSchema),
  judgeExplanation: z.string().optional().describe("A witty and concise explanation of the overall judgment, especially when a re-judge is requested."),
  isRejectionJustified: z.boolean().optional().describe("Set to true only if a re-judge request was denied."),
});
export type JudgePrisonAnswersOutput = z.infer<typeof JudgePrisonAnswersOutputSchema>;


// Schemas for News Article Flow
export const EventSummarySchema = z.object({
  key_events: z.array(z.string()).describe('A list of the most interesting and dramatic events of the day, including key points from previous articles.'),
  overall_mood: z.string().describe('A one-sentence summary of the general mood of the day (e.g., "A day of surprising betrayals and unexpected victories.").'),
});

export const DraftArticleSchema = z.object({
  headline: z.string().describe('A catchy, satirical, and dramatic headline for the news article.'),
  body: z.string().describe('The full body of the news article, written in an engaging and slightly sarcastic journalistic style. It should connect the key events into a coherent narrative. The length should be between 100 and 200 words.'),
});

export const NewsArticleInputSchema = z.object({
  events: z.array(z.any()).describe('An array of social event objects from the game from the last 24 hours.'),
  previous_articles: z.array(z.any()).describe('An array of articles published in the last week, to provide context.'),
  date: z.string().describe("Today's date in a readable format (e.g., 'Sunday, July 28, 2024')."),
});
export type NewsArticleInput = z.infer<typeof NewsArticleInputSchema>;

export const NewsArticleOutputSchema = z.object({
  headline: z.string(),
  body: z.string(),
  category: z.string().default('أخبار اللعبة'),
  imageUrl: z.string().optional(),
});
export type NewsArticleOutput = z.infer<typeof NewsArticleOutputSchema>;


// Regular Types
export type PermissionId = typeof ALL_PERMISSIONS[number]['id'];

export interface Permission {
    id: PermissionId;
    name: string;
    description: string;
    category: 'economic' | 'social' | 'gameplay' | 'meta';
}

export interface AudienceGroup {
    id: string;
    name: string;
    members: string[]; // array of user IDs
}
export interface Article {
    id: string;
    title: string;
    content: string;
    imageUrl?: string;
    authorName: string;
    authorId: string;
    createdAt: Date;
    isPublished: boolean;
    // New fields
    category?: string; 
    audience?: 'public' | string[]; // public or array of audience group IDs
    tags?: string[];
    views?: number;
}

export type ChallengePrize = {
    type: 'coins' | 'diamonds' | 'honorPoints';
    value: number;
};

export interface Challenge {
    id: string;
    title: string;
    targetPoints: number; 
    specificGameType?: Game['gameType'] | 'all';
    firstPlacePrize: ChallengePrize[];
    secondPlacePrize: ChallengePrize[];
    thirdPlacePrize: ChallengePrize[];
    
    endsAt: Date;
    createdAt: Timestamp;
    participantIds: string[];
    participantCount?: number;
    winners?: {
        first?: { id: string, name: string };
        second?: { id: string, name: string };
        third?: { id: string, name: string };
    };
}


export interface ClanWarInvitation {
    id: string;
    challengerClan: { id: string; name: string; emblem: string };
    challengedClan: { id: string; name: string; emblem: string };
    gameType: Game['gameType'];
    battleTime: Date;
    status: 'pending' | 'accepted' | 'rejected';
}

export interface ClanWar extends ClanWarInvitation {
    gameId: string | null; // Null until the game starts
    winnerClanId: string | null;
}


export interface Mail {
  id: string;
  senderName: string; // 'Admin' or a specific admin's name
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  expiresAt: Date;
  coins?: number;
  coinsClaimed?: boolean;
}


export interface SocialRank {
  threshold: number;
  name: string;
  icon: any; 
  permissions: PermissionId[];
}

export const DEFAULT_SOCIAL_RANKS: SocialRank[] = [
    { threshold: 0, name: 'عامل وضيع', icon: 'Shield', permissions: [] },
    { threshold: 50, name: 'مواطن صالح', icon: 'ShieldCheck', permissions: [] },
    { threshold: 150, name: 'شخصية مرموقة', icon: 'Award', permissions: [] },
    { threshold: 300, name: 'عضو مجلس', icon: 'Gem', permissions: [] },
    { threshold: 500, name: 'زعيم المدينة', icon: 'Crown', permissions: [] },
];

export const DEFAULT_TRAP_ANSWER_CATEGORIES = [
    "تاريخ",
    "رياضة",
    "أدب",
    "أنمي ومانجا",
    "إسلاميات",
    "فنون",
    "جغرافيا",
    "لغة عربية",
    "معلومات غريبة",
    "الحيوانات والطبيعة",
    "النباتات",
    "المطبخ"
];

export const DEFAULT_DRAW_AND_GUESS_CATEGORIES = [
    "جملة مركبة",
    "أمثال عامية",
    "أنميات مشهورة",
    "أفلام مشهورة",
];


export interface League {
  id: string;
  name: string;
  adminId: string;
  members: string[]; // array of user IDs
  password?: string;
  createdAt: Timestamp;
  scores?: Record<string, number>; // { [userId]: score }
  gamesPlayed?: Record<string, number>;
}

export type PlayerRole = 'killer' | 'detective' | 'doctor' | 'soldier' | 'spy' | 'shapeshifter' | 'bomber' | 'civilian' | 'contestant';
export type PlayerTeam = 'mafia' | 'good' | 'neutral' | 'red' | 'blue';
export type PlayerStatus = 'alive' | 'killed' | 'voted_out' | 'left' | 'executed' | 'in_prison' | 'bankrupt';

export type ClanMemberRole = 'leader' | 'vice-leader' | 'member';

export interface ClanMember {
    id: string;
    name: string;
    avatarId: string;
    leaderboardPoints: number;
    role: ClanMemberRole;
}

export interface Clan {
  id: string;
  name: string;
  emblem: string;
  color: string;
  leaderId: string;
  members: ClanMember[];
  invitations: { userId: string; userName: string; avatarId: string; }[];
  totalPoints: number;
  totalHonorPoints: number;
  unlockedEmblems: string[];
}


export interface Player {
  id: string;
  name: string;
  avatarId: string;
  leaderboardPoints: number; 
  role?: PlayerRole;
  team?: PlayerTeam;
  apparentRole?: PlayerRole; // For shapeshifter
  status: PlayerStatus;
  isProtected?: boolean; // For doctor's protection
  score: number; 
  clan?: { id: string; name: string, emblem: string };
  position: number; 
  isReady?: boolean; 
  temporaryTitle?: string | null;
}

export interface Humiliation {
    by: string; // ID of the humiliator
    byName: string;
    at: Date;
    until: Date;
    taxToLift: number;
    durationInDays: number;
}

export interface AllegianceRequest {
    fromId: string;
    fromName: string;
    fromAvatar: string;
    offer: {
        amount: number;
        currency: 'coins'; // For now, only coins
    };
    durationInDays: number; // 1, 2, or 3
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: Date;
}

export interface ActiveAllegiance {
    to: string; // ID of the liege lord
    toName: string;
    until: Date;
}


export interface TaxDemand {
    fromId: string;
    fromName: string;
    amount: number;
    status: 'pending' | 'paid' | 'rejected';
    createdAt: Date;
}

export interface AllianceMemberInfo {
    name: string;
    avatarId: string;
    status: 'pending' | 'accepted';
}

export interface Alliance {
    id: string; // sorted_id1_id2
    members: Record<string, AllianceMemberInfo>;
    createdAt: Date;
}

export interface Decree {
    id: string;
    title: string;
    issuedBy: string;
    issuedByName: string;
    at: Date;
    until: Date;
    durationInDays: number;
    taxToLift: number;
}

export interface SocialEvent {
    type: 'allegiance' | 'rebellion' | 'humiliation' | 'game_end';
    description: string;
    timestamp: Date;
}


export interface ClanInvitation {
    clanId: string;
    clanName: string;
    invitedBy: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string | null;
  gender?: 'male' | 'female';
  isAdmin: boolean;
  isEditor: boolean; // Added for news editors
  coins: number;
  diamonds: number;
  avatarId: string;
  unlockedAvatars: string[];
  unlockedPunishmentAvatars?: string[];
  leaderboardPoints: number; 
  honorPoints: number;
  loyaltyPoints: number;
  rebellionPoints?: number;
  trophies: number;
  gamesPlayed: number;
  punishmentsIssued?: number;
  hasChangedName?: boolean;
  leagues?: {id: string, name: string}[];
  winCounts?: Record<Game['gameType'], number>;
  clan?: { id: string; name: string, emblem: string };
  clanRole?: ClanMemberRole;
  clanInvitations?: ClanInvitation[];
  audienceGroups?: string[];
  humiliation?: Humiliation | null;
  allegiance?: ActiveAllegiance | null;
  allegianceRequests?: AllegianceRequest[];
  taxDemands?: TaxDemand[];
  alliances?: Alliance[];
  decrees?: Decree[];
  duelChallenges?: DuelChallenge[];
  lastPunishmentTimestamp?: Record<string, Timestamp>; // { [targetId]: timestamp }
  originalAvatarToRevert?: { 
      id: string; 
      until: Date; 
      taxToLift: number; 
      by: string; 
      byName: string;
      durationInDays: number;
  } | null;
  permissions?: PermissionId[]; // All permissions granted by the user's current rank
  isPunished?: boolean;
}

export interface GameKing {
    name: string;
    avatarId: string;
    winCount: number;
    kingId: string;
}

export type KingOfGeniusGameState = "lobby" | "team_selection" | "challenge_intro" | "challenge_active" | "challenge_results" | "final_results";
export type TrapAnswerGameState = "lobby" | "category-selection" | "answer-submission" | "guessing" | "round-results" | "final-results";
export type MafiaGameState = "lobby" | "role_reveal" | "night" | "day" | "voting" | "execution" | "final_results";
export type WordWarGameState = "lobby" | "preparation" | "guide_turn" | "guesser_turn" | "board_reveal" | "final_results";
export type DrawAndGuessGameState = "lobby" | "category_selection" | "drawing" | "guessing" | "round-results" | "final_results";
export type PrisonGameState = "lobby" | "instructions" | "open_auction" | "closed_auction_bidding" | "closed_auction_answering" | "judging" | "rejudging" | "results" | "final_results";

export type GameState = KingOfGeniusGameState | TrapAnswerGameState | MafiaGameState | WordWarGameState | DrawAndGuessGameState | PrisonGameState;

export type ScoreMatrix = Record<string, Record<string, number>>; 

export interface ChallengeResult {
    playerId: string;
    team: 'A' | 'B';
    isCorrect: boolean;
    time: number; 
    score?: number; 
    playerDrawnPath?: PathTile[]; 
}

export type GridPosition = { r: number; c: number };
export type PathTile = { x: number; y: number };

export interface PlayerProgress {
  currentProblemIndex?: number;
  currentStep?: number;
  wrongAttempts?: number;
  clickedTiles?: { x: number, y: number }[];
  position?: GridPosition;
  visited?: GridPosition[];
  hitWalls?: GridPosition[];
  points?: number;
  revealedByHint?: GridPosition[];
  attempts?: { guess: string[], feedback: ('correct' | 'misplaced' | 'incorrect')[] }[];
  answers?: Record<string, string> | string[]; 
}

export type SmartGridColumn = {
  cells: (number | null)[];
  pattern: string;
  solution: number[];
}

export interface SmartGridPuzzleData {
    columns: SmartGridColumn[];
}

export interface TrapQuestion {
    id: string;
    question: string;
    answer: string;
    category: string;
    dummyAnswers: string[];
}

export interface PrisonQuestion {
    id: string;
    text: string;
}

export interface AvatarPrice {
    avatarId: string;
    price: number;
    currency: 'coins' | 'diamonds';
}

export type EmojiReactionType = 'laugh' | 'mock' | 'apologize' | 'shame';

export interface EmojiReaction {
    emoji: EmojiReactionType;
    timestamp: Timestamp;
}


export interface DrawingLine {
    points: number[];
    color: string;
    strokeWidth: number;
    tool: 'pen' | 'eraser';
}

export interface DrawingRect {
    type: 'rect';
    x: number;
    y: number;
    width: number;
    height: number;
    stroke: string;
    strokeWidth: number;
    isDrawing?: boolean;
}

export interface DrawingCircle {
    type: 'circle';
    x: number;
    y: number;
    radius: number;
    stroke: string;
    strokeWidth: number;
    isDrawing?: boolean;
}

export interface DrawingSimpleLine {
    type: 'line';
    points: [number, number, number, number];
    stroke: string;
    strokeWidth: number;
    isDrawing?: boolean;
}

export interface DrawingTriangle {
    type: 'triangle';
    x: number;
    y: number;
    radius: number;
    stroke: string;
    strokeWidth: number;
    isDrawing?: boolean;
}


export type DrawingShape = DrawingRect | DrawingCircle | DrawingSimpleLine | DrawingTriangle;

export interface DrawingData {
    lines: DrawingLine[];
    shapes: DrawingShape[];
    bgColor: string;
    width: number;
    height: number;
}
export type GuessStatus = 'correct' | 'close' | 'incorrect';
export interface PlayerGuess {
    playerId: string;
    playerName: string;
    guess: string;
    status: GuessStatus;
}
export interface DrawAndGuessPrompt {
    id: string;
    text: string;
    category: string;
}

export type MafiaPhase = MafiaGameState;
export type NightActionType = 'kill' | 'heal' | 'investigate' | 'spy' | 'bomb' | 'shapeshift';

export interface NightAction {
    actorId: string;
    action: NightActionType;
    targetId: string;
    disguiseRole?: PlayerRole;
}

export interface DayEvent {
    type: 'death' | 'protection' | 'investigation' | 'spy_reveal' | 'execution';
    message: string;
    killedPlayer?: {
        name: string;
        avatarId: string;
    };
    revealedRole?: PlayerRole;
    revealedTeam?: PlayerTeam;
}

export interface PrivateEvent {
    type: 'investigation_result' | 'spy_result' | 'spy_result_soldier_block' | 'doctor_success';
    message: string;
    targetPlayer?: {
        id: string;
        name: string;
        avatarId: string;
        role?: PlayerRole;
    };
}


export interface PublicChatMessage {
    senderId: string;
    senderName: string;
    message: string;
    timestamp: Timestamp;
}

export interface PrivateChatMessage {
    senderId: string;
    senderName: string;
    message: string;
    timestamp: Timestamp;
}
export interface PrivateChat {
    participants: string[]; // [spyId, killerId]
    messages: PrivateChatMessage[];
}

export interface WordWarCard {
    text: string;
    color: 'red' | 'blue' | 'neutral' | 'assassin';
    revealed: boolean;
}


export interface DuelChallenge {
    id: string; // gameId
    fromId: string;
    fromName: string;
    betAmount: number;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: Date;
}

export interface Game {
  id: string;
  hostId: string;
  challengeId?: string; // For challenges
  challengeDetails?: {
      title: string;
      minPlayersToStart: number;
      entryFee: {
          type: 'coins' | 'leaderboardPoints';
          value: number;
      };
  };
  gameType: 'king-of-genius' | 'trap-answer' | 'behind-the-mask' | 'word_war' | 'draw-and-guess' | 'prison';
  players: Player[];
  playerUids: string[];
  gameState: GameState;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  isDuel?: boolean;
  duelDetails?: {
      challengerId: string;
      challengedId: string;
      betAmount: number;
  };
  
  round?: number; 
  playerScores?: Record<string, number>;
  
  gameResult?: {
    winner: PlayerTeam | 'draw' | 'game_over' | string;
    message: string;
  };
  
  // king-of-genius specific fields
  teamScores?: { A: number; B: number };
  challengeOrder?: string[];
  currentChallengeIndex?: number;
  puzzles?: string[];
  challengeState?: {
      duration: number,
      challengeEndsAt: Timestamp,
      puzzle?: any;
      results?: ChallengeResult[];
      playerProgress?: Record<string, PlayerProgress>;
  };

  // trap-answer specific fields
  trapAnswerState?: {
      settings: {
          categories: string[];
          rounds: number;
          answerTime: number;
      };
      turnOrder?: string[];
      currentTurnIndex?: number;
      fiveRandomCategories?: string[];
      selectedCategory?: string;
      currentQuestion?: TrapQuestion;
      playerAnswers?: Record<string, string | null>;
      playerGuesses?: Record<string, string>;
      timerEndsAt?: Timestamp | null;
      dummyAnswerForRound?: string;
      shuffledAnswers?: string[];
      lastRoundResults?: {
        answers: {
          text: string;
          isCorrect: boolean;
          authorIds: string[] | null;
          guesserIds: string[];
        }[];
        scores: Record<string, {
            points: number;
            breakdown: { reason: string, points: number }[];
        }>;
    };
    reactions?: Record<string, EmojiReaction>;
    trickStats?: {
        trickedBy: Record<string, string[]>; // { [trickedPlayerId]: [trickerPlayerId1, trickerPlayerId2...] }
        trickedOthers: Record<string, string[]>; // { [trickerPlayerId]: [trickedPlayerId1, ...] }
    };
    finalAwards?: {
        deceivedFool?: { playerId: string; name: string; avatarId: string; count: number } | null;
        cunningDeceiver?: { playerId: string; name: string; avatarId: string; count: number } | null;
    };
  };

  // "خلف القناع" (Mafia) specific state
  mafiaState?: {
    settings?: {
      nightTime: number;
      dayTime: number;
    };
    phase: MafiaPhase;
    rolesInGame?: PlayerRole[];
    timerEndsAt?: Timestamp;
    night?: number;
    events?: DayEvent[];
    publicChat?: PublicChatMessage[];
    privateEvents?: Record<string, PrivateEvent[]>; // { [playerId]: [PrivateEvent, ...] }
    nightActions?: Record<string, NightAction>;
    lastKilledPlayerId?: string | null;
    lastHealedPlayerId?: string | null;
    lastAbilityUse?: Record<string, number>; // { [playerId]: nightNumber }
    lastExecutedPlayer?: { name: string; avatarId: string; temporaryTitle?: string } | null;
    votes?: Record<string, string | null>; // { voterId: targetId }
    privateChats?: Record<string, PrivateChat>; // Keyed by a unique chat ID
  };

  // "حرب الكلمات" (Word War) specific state
  wordWarState?: {
    settings: {
        turnTime: number;
    };
    cards: WordWarCard[];
    turn: 'red' | 'blue';
    guides: {
        red: string;
        blue: string;
    };
    previousGuides?: {
        red?: string;
        blue?: string;
    };
    currentHint?: {
        word: string;
        count: number;
    };
    guessesLeft?: number;
    turnResult?: 'hit' | 'miss' | 'neutral' | 'assassin';
    timerEndsAt?: Timestamp | null;
    suspicions?: Record<string, number[]>; // { [team_color]: [cardIndex1, cardIndex2...] }
  };
    
   // "Draw and Guess" specific state
  drawAndGuessState?: {
    settings: {
        drawingTime: number;
        guessingTime: number;
        roundsPerPlayer: number;
    };
    categories?: string[];
    fiveRandomCategories?: string[];
    turnOrder?: string[];
    drawerTurnCounts?: Record<string, number>; // { [playerId]: count }
    currentDrawerId?: string;
    prompt?: DrawAndGuessPrompt;
    drawing?: DrawingData | null;
    guesses?: PlayerGuess[];
    ratings?: Record<string, number>; // { [raterId]: rating }
    timerEndsAt?: Timestamp;
    retries?: number; // Number of retries for the drawer
  };
  
    // "The Prison" specific state
  prisonState?: {
      settings: {
          biddingTime: number;
          answeringTime: number;
          judgingTime: number;
          rounds: number;
      };
      currentQuestion?: PrisonQuestion;
      closedAuctionQuestion?: PrisonQuestion;
      playerProgress?: Record<string, { answers: string[] }>;
      openAuctionSubmissions?: Record<string, string[]>;
      bids?: Record<string, number>; // { playerId: amount }
      highestBid?: number;
      auctionWinnerId?: string;
      aiJudgeResults?: JudgeSingleSubmissionOutput[];
      lastRoundResult?: {
          message: string;
          points: Record<string, {
              points: number;
              breakdown: { reason: string, points: number }[];
          }>;
          freedPlayerName?: string;
          freedPlayerAvatarId?: string;
      };
      prisonHistory?: Record<string, { inPrison: number, roundsWithoutWinningAuction: number }>; // { playerId: { inPrison: rounds, ... }}
      timerEndsAt?: Timestamp;
      judgingStarted?: boolean;
      questionChangersUsedBy?: string[];
      rejudgeRequestsUsedBy?: string[];
      activeRejudgeRequest?: { playerId: string; name: string; reason: string };
      judgeExplanation?: string;
      isRejectionJustified?: boolean;
  };
}


export const GAME_TYPE_NAMES: Record<Game['gameType'], string> = {
    'king-of-genius': 'ساحة العباقرة',
    'trap-answer': 'الجواب المفخخ',
    'behind-the-mask': 'خلف القناع',
    'word_war': 'حرب الكلمات',
    'draw-and-guess': 'لعبة رسمة',
    'prison': 'السجن',
};

```
- src/lib/actions/user/currency.ts:
```ts


'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, increment } from 'firebase/firestore';
import type { UserProfile, AvatarPrice } from '@/types';
import { arrayUnion } from 'firebase/firestore';


export async function purchaseAvatar(userId: string, avatarId: string): Promise<{ success: boolean; error?: string }> {
     if (!userId || !avatarId) {
        return { success: false, error: "معلومات غير كافية." };
    }

    const userRef = doc(db, 'users', userId);
    const pricesRef = doc(db, 'game_settings', 'avatar_prices');

    try {
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            const pricesDoc = await transaction.get(pricesRef);

            if (!userDoc.exists()) throw new Error("لم يتم العثور على المستخدم.");
            if (!pricesDoc.exists()) throw new Error("لم يتم العثور على أسعار الشخصيات.");

            const userData = userDoc.data() as UserProfile;
            const priceData = pricesDoc.data();
            const avatarPriceInfo: AvatarPrice | undefined = priceData.prices?.find((p: any) => p.avatarId === avatarId);

            if (!avatarPriceInfo) throw new Error("لم يتم العثور على سعر لهذه الشخصية.");
            const { price, currency } = avatarPriceInfo;

            if (userData.unlockedAvatars?.includes(avatarId)) throw new Error("أنت تملك هذه الشخصية بالفعل.");
            
            const userCurrency = currency === 'diamonds' ? userData.diamonds : userData.coins;
            if (userCurrency < price) {
                throw new Error(`ليس لديك ما يكفي من ${currency === 'diamonds' ? 'الألماس' : 'الكوينز'}.`);
            }
            
            const currencyFieldToUpdate = currency === 'diamonds' ? 'diamonds' : 'coins';

            transaction.update(userRef, {
                [currencyFieldToUpdate]: increment(-price),
                unlockedAvatars: arrayUnion(avatarId)
            });
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error purchasing avatar:", error);
        return { success: false, error: error.message || "فشل شراء الشخصية." };
    }
}

export async function purchasePunishmentAvatar(userId: string, avatarId: string): Promise<{ success: boolean; error?: string }> {
     if (!userId || !avatarId) {
        return { success: false, error: "معلومات غير كافية." };
    }

    const userRef = doc(db, 'users', userId);
    const pricesRef = doc(db, 'game_settings', 'punishment_avatar_prices');

    try {
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            const pricesDoc = await transaction.get(pricesRef);

            if (!userDoc.exists()) throw new Error("لم يتم العثور على المستخدم.");
            if (!pricesDoc.exists()) throw new Error("لم يتم العثور على أسعار شخصيات العقوبة.");

            const userData = userDoc.data() as UserProfile;
            const priceData = pricesDoc.data();
            const avatarPriceInfo: AvatarPrice | undefined = priceData.prices?.find((p: any) => p.avatarId === avatarId);

            if (!avatarPriceInfo) throw new Error("لم يتم العثور على سعر لهذه الشخصية.");
            const { price, currency } = avatarPriceInfo;

            if (userData.unlockedPunishmentAvatars?.includes(avatarId)) throw new Error("أنت تملك شخصية العقوبة هذه بالفعل.");
            
            const userCurrency = currency === 'diamonds' ? userData.diamonds : userData.coins;
            if (userCurrency < price) {
                throw new Error(`ليس لديك ما يكفي من ${currency === 'diamonds' ? 'الألماس' : 'الكوينز'}.`);
            }
            
            const currencyFieldToUpdate = currency === 'diamonds' ? 'diamonds' : 'coins';

            transaction.update(userRef, {
                [currencyFieldToUpdate]: increment(-price),
                unlockedPunishmentAvatars: arrayUnion(avatarId)
            });
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error purchasing punishment avatar:", error);
        return { success: false, error: error.message || "فشل شراء شخصية العقوبة." };
    }
}

export async function exchangeCoinsForHonor(userId: string, coinsToExchange: number): Promise<{ success: boolean; error?: string }> {
    if (coinsToExchange <= 0) {
        return { success: false, error: "يجب أن يكون عدد الكوينز أكبر من صفر." };
    }
    const HONOR_RATE = 2;
    const honorToGain = coinsToExchange * HONOR_RATE;

    const userRef = doc(db, 'users', userId);

    return runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("المستخدم غير موجود.");
        const userData = userDoc.data() as UserProfile;

        if ((userData.coins || 0) < coinsToExchange) {
            throw new Error("ليس لديك ما يكفي من الكوينز.");
        }

        transaction.update(userRef, {
            coins: increment(-coinsToExchange),
            honorPoints: increment(honorToGain)
        });

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل تبديل العملات." };
    });
}

export async function exchangeCoinsForRebellion(userId: string, coinsToExchange: number): Promise<{ success: boolean; error?: string }> {
    if (coinsToExchange <= 0) {
        return { success: false, error: "يجب أن يكون عدد الكوينز أكبر من صفر." };
    }
    const REBELLION_RATE = 2;
    const rebellionToGain = coinsToExchange * REBELLION_RATE;

    const userRef = doc(db, 'users', userId);

    return runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("المستخدم غير موجود.");
        const userData = userDoc.data() as UserProfile;

        if ((userData.coins || 0) < coinsToExchange) {
            throw new Error("ليس لديك ما يكفي من الكوينز.");
        }

        transaction.update(userRef, {
            coins: increment(-coinsToExchange),
            rebellionPoints: increment(rebellionToGain)
        });

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل تبديل العملات." };
    });
}

export async function exchangeCoinsForLoyaltyPoints(userId: string, coinsToExchange: number): Promise<{ success: boolean; error?: string }> {
    if (coinsToExchange <= 0) {
        return { success: false, error: "يجب أن يكون عدد الكوينز أكبر من صفر." };
    }
    const LOYALTY_RATE = 3;
    const loyaltyToGain = coinsToExchange * LOYALTY_RATE;

    const userRef = doc(db, 'users', userId);

    return runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("المستخدم غير موجود.");
        const userData = userDoc.data() as UserProfile;

        if ((userData.coins || 0) < coinsToExchange) {
            throw new Error(`ليس لديك ما يكفي من الكوينز.`);
        }

        transaction.update(userRef, {
            coins: increment(-cost),
            loyaltyPoints: increment(gain)
        });

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل تبديل العملات." };
    });
}

```
- src/lib/actions/user/leagues.ts:
```ts


'use server';

import { db } from '@/lib/firebase';
import { doc, serverTimestamp, setDoc, updateDoc, collection, query, getDocs, getDoc, where, increment, runTransaction, arrayUnion, arrayRemove, deleteField, Timestamp, writeBatch, type Transaction } from 'firebase/firestore';
import { generateLeagueId, withAdminAuth } from '../helpers';
import type { UserProfile, League, Game } from '@/types';
import { updateUserWinCount } from './queries';
import { calculateEndOfGameAwards } from './awards';
import { sendSystemMail } from './mail';


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
 * Distributes end-of-game awards like leaderboard points and coins based on player ranking.
 * This function commits the updates to Firestore.
 * @param game The final game state object.
 */
export async function distributeEndOfGameAwards(game: Game) {
    const playersToUpdate = game.players.filter(p => p.status !== 'left');
    if (playersToUpdate.length === 0) return;

    const { updates, winUpdate, specialAwards } = calculateEndOfGameAwards(game);
    const batch = writeBatch(db);

    Object.entries(updates).forEach(([playerId, playerUpdates]) => {
        const userRef = doc(db, "users", playerId);
        const firestoreUpdates: any = { gamesPlayed: increment(1) };
        if (playerUpdates.leaderboardPoints > 0) {
            firestoreUpdates.leaderboardPoints = increment(playerUpdates.leaderboardPoints);
        }
        if (playerUpdates.coins > 0) {
            firestoreUpdates.coins = increment(playerUpdates.coins);
        }
        batch.update(userRef, firestoreUpdates);
    });

    if (winUpdate) {
        updateUserWinCount(winUpdate.gameType, winUpdate.userId, batch);
    }
    
    // Handle team-based wins
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

```
- src/lib/actions/user/mail.ts:
```ts


'use server';

import { db } from '@/lib/firebase';
import { doc, serverTimestamp, collection, query, getDocs, orderBy, getDoc, where, increment, runTransaction, updateDoc, Timestamp, writeBatch, type Transaction, setDoc } from 'firebase/firestore';
import type { Mail } from '@/types';


export async function getMail(userId: string): Promise<Mail[]> {
    if (!userId) return [];
    try {
        const mailRef = collection(db, `users/${userId}/mail`);
        const now = Timestamp.now();
        const q = query(mailRef, where('expiresAt', '>', now), orderBy('expiresAt', 'desc'));
        const snapshot = await getDocs(q);

        deleteExpiredMail(userId);

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                senderName: data.senderName,
                subject: data.subject,
                body: data.body,
                isRead: data.isRead,
                createdAt: data.createdAt.toDate(),
                expiresAt: data.expiresAt.toDate(),
                coins: data.coins,
                coinsClaimed: data.coinsClaimed,
            } as Mail;
        });
    } catch (error) {
        console.error("Error fetching mail:", error);
        return [];
    }
}

export async function markMailAsRead(userId: string, mailId: string): Promise<void> {
  if (!userId || !mailId) return;
  try {
    const mailDocRef = doc(db, `users/${userId}/mail`, mailId);
    await updateDoc(mailDocRef, { isRead: true });
  } catch (error) {
    console.error("Error marking mail as read:", error);
  }
}

async function deleteExpiredMail(userId: string) {
    try {
        const mailRef = collection(db, `users/${userId}/mail`);
        const now = Timestamp.now();
        const q = query(mailRef, where('expiresAt', '<=', now));
        const snapshot = await getDocs(q);
        if (snapshot.empty) return;

        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`Deleted ${snapshot.size} expired mail(s) for user ${userId}.`);
    } catch (error) {
        console.error("Error deleting expired mail:", error);
    }
}


export async function claimMailCoins(userId: string, mailId: string): Promise<{ success: boolean; error?: string }> {
    if (!userId || !mailId) {
        return { success: false, error: "معلومات غير كافية للمطالبة." };
    }

    const userRef = doc(db, "users", userId);
    const mailRef = doc(db, `users/${userId}/mail`, mailId);

    try {
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            const mailDoc = await transaction.get(mailRef);

            if (!userDoc.exists()) throw new Error("المستخدم غير موجود.");
            if (!mailDoc.exists()) throw new Error("الرسالة غير موجودة.");

            const mailData = mailDoc.data() as Mail;

            if (mailData.coinsClaimed) throw new Error("لقد طالبت بهذه الكوينز بالفعل.");
            if (!mailData.coins || mailData.coins <= 0) throw new Error("لا توجد كوينز للمطالبة بها في هذه الرسالة.");

            transaction.update(userRef, {
                coins: increment(mailData.coins)
            });

            transaction.update(mailRef, {
                coinsClaimed: true
            });
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || "فشل المطالبة بالكوينز." };
    }
}


export async function sendSystemMail(userId: string, mailContent: Omit<Mail, 'id' | 'senderName' | 'createdAt' | 'expiresAt' | 'isRead'>, transaction?: Transaction) {
    const mailRef = doc(collection(db, `users/${userId}/mail`));
    const mailData = {
        ...mailContent,
        senderName: 'النظام',
        isRead: false,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000), // Expires in 3 days
    };

    if (transaction) {
        transaction.set(mailRef, mailData);
    } else {
        await setDoc(mailRef, mailData);
    }
}

```
- src/lib/actions/user/profile.ts:
```ts


'use server';

import { db, auth } from '@/lib/firebase';
import { doc, serverTimestamp, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { isFirebaseError } from '../helpers';
import { getDefaultAvatar } from '../admin';
import type { UserProfile } from '@/types';


export async function createUserProfile(userId: string, name: string, email: string, gender: 'male' | 'female') {
    if (!name.trim()) {
        return { error: 'الاسم مطلوب.' };
    }
     if (!gender) {
        return { error: 'الجنس مطلوب.' };
    }
    try {
        const { avatarId: defaultAvatar } = await getDefaultAvatar();
        await setDoc(doc(db, 'users', userId), {
            name: name.trim(),
            email: email,
            gender: gender,
            createdAt: serverTimestamp(),
            isAdmin: false,
            isEditor: false,
            coins: 5,
            diamonds: 0,
            avatarId: defaultAvatar || 'Avatar00.png',
            unlockedAvatars: [defaultAvatar || 'Avatar00.png'],
            unlockedPunishmentAvatars: [],
            leaderboardPoints: 0,
            honorPoints: 0, 
            loyaltyPoints: 0, 
            rebellionPoints: 0,
            trophies: 0,
            gamesPlayed: 0,
            hasChangedName: false,
            punishmentsIssued: 0,
            leagues: [],
            winCounts: {},
            humiliation: null,
            allegiance: null,
            alliances: [],
            taxDemands: [],
            decrees: [],
            duelChallenges: [],
            lastPunishmentTimestamp: {},
            originalAvatarToRevert: null,
            isPunished: false, // Initialize punishment flag
        });
        return { success: true };
    } catch (error) {
        console.error("Firebase error in createUserProfile:", error);
        if (isFirebaseError(error)) {
            return { error: 'فشل إنشاء الملف الشخصي بسبب خطأ في Firebase.' };
        }
        return { error: 'حدث خطأ غير متوقع عند إنشاء الملف الشخصي.' };
    }
}


export async function updateUserName(userId: string, newName: string) {
    if (!userId || !newName.trim()) {
        return { success: false, error: "الاسم الجديد مطلوب." };
    }

    const userRef = doc(db, 'users', userId);

    try {
        const currentUser = auth.currentUser;
        if (!currentUser || currentUser.uid !== userId) {
            throw new Error("User not authenticated or mismatch.");
        }

        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
            throw new Error("لم يتم العثور على المستخدم.");
        }
        const userData = userDoc.data();
        if (userData.hasChangedName) {
            throw new Error("لقد قمت بتغيير اسمك بالفعل. لا يمكن تغييره مرة أخرى.");
        }

        // Update both Firestore and Auth profile
        await updateDoc(userRef, {
            name: newName,
            hasChangedName: true,
        });
        await updateProfile(currentUser, { displayName: newName });
        
        return { success: true };

    } catch (error: any) {
        console.error("Error updating username:", error);
        return { success: false, error: error.message || "حدث خطأ غير متوقع." };
    }
}


export async function updateUserAvatar(userId: string, avatarId: string) {
    if (!userId || !avatarId) {
        return { error: "معلومات غير كافية لتحديث الشخصية." };
    }
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        const userData = userDoc.data() as UserProfile;
        
        if (!userDoc.exists() || !userData.unlockedAvatars?.includes(avatarId)) {
            return { error: "أنت لا تملك هذه الشخصية." };
        }
        
        // Prevent changing avatar if under punishment
        if (userData.originalAvatarToRevert && new Date((userData.originalAvatarToRevert.until as any).toDate()) > new Date()) {
             return { error: "لا يمكنك تغيير شخصيتك وأنت تحت تأثير عقوبة." };
        }

        await updateDoc(userRef, {
            avatarId: avatarId
        });
        return { success: true };
    } catch (error) {
        console.error("Firebase error in updateUserAvatar:", error);
        if (isFirebaseError(error)) {
            return { error: `فشل تحديث الشخصية: ${error.message}` };
        }
        return { error: 'حدث خطأ غير متوقع.' };
    }
}

export async function updateUserGender(userId: string, gender: 'male' | 'female'): Promise<{ success: boolean; error?: string }> {
    if (!userId || !gender) {
        return { success: false, error: "معلومات غير كافية." };
    }
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, { gender });
        return { success: true };
    } catch (error) {
        console.error("Firebase error in updateUserGender:", error);
        if (isFirebaseError(error)) {
            return { success: false, error: `فشل تحديث الجنس: ${error.message}` };
        }
        return { success: false, error: 'حدث خطأ غير متوقع.' };
    }
}

```
- src/lib/actions/user/queries.ts:
```ts


'use server';

import { db } from '@/lib/firebase';
import { doc, collection, query, getDocs, orderBy, limit, getDoc, where, setDoc, updateDoc, WriteBatch, writeBatch } from 'firebase/firestore';
import type { UserProfile, GameKing, SocialRank, TaxDemand, Decree, DuelChallenge } from '@/types';
import { DEFAULT_SOCIAL_RANKS } from '@/types';


// This function is purely for fetching ranks from the database.
export async function getRanks(): Promise<SocialRank[]> {
    try {
        const docRef = doc(db, 'game_settings', 'social_ranks');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().list?.length > 0) {
            const storedRanks: SocialRank[] = docSnap.data().list.map((rank: any) => ({
                permissions: rank.permissions || [],
                ...rank,
            }));
            return storedRanks;
        }
        await setDoc(docRef, { list: DEFAULT_SOCIAL_RANKS });
        return DEFAULT_SOCIAL_RANKS;
    } catch(e) {
        console.error("Could not fetch ranks, returning default. Error: ", e);
        return DEFAULT_SOCIAL_RANKS;
    }
}


export async function getPlayerFromUserId(userId: string): Promise<UserProfile> {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
       throw new Error(`لم يتم العثور على ملف تعريف للمستخدم بالمعرف: ${userId}. تأكد من أن المستخدم قد أكمل التسجيل.`);
    }
    
    const userData = userDoc.data();
    
    const decrees = (userData.decrees || []).map((d: any) => ({
      ...d,
      until: d.until?.toDate ? d.until.toDate() : d.until,
    }));
    
    const humiliation = userData.humiliation ? { ...userData.humiliation, at: userData.humiliation.at?.toDate(), until: userData.humiliation.until?.toDate() } : null;
    const originalAvatarToRevert = userData.originalAvatarToRevert ? { ...userData.originalAvatarToRevert, until: userData.originalAvatarToRevert.until?.toDate() } : null;

    return {
        uid: userId,
        name: userData.name || 'لاعب غير معروف',
        avatarId: userData.avatarId || 'Avatar00.png',
        leaderboardPoints: userData.leaderboardPoints || 0,
        ...userData,
        decrees,
        humiliation,
        originalAvatarToRevert,
    } as UserProfile;
}

export async function getGameKings(): Promise<Record<string, GameKing>> {
  try {
    const kingsCol = collection(db, 'game_kings');
    const snapshot = await getDocs(kingsCol);
    if (snapshot.empty) {
      return {};
    }
    const kings: Record<string, GameKing> = {};
    snapshot.forEach(doc => {
      kings[doc.id] = doc.data() as GameKing;
    });
    return kings;
  } catch (error) {
    console.error("Error fetching game kings:", error);
    return {};
  }
}

export async function getKingOfGames(): Promise<UserProfile | null> {
    try {
        const q = query(collection(db, 'users'), orderBy('leaderboardPoints', 'desc'), limit(1));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            return null;
        }
        const userDoc = snapshot.docs[0];
        return { uid: userDoc.id, ...userDoc.data() } as UserProfile;
    } catch (error) {
        console.error("Error fetching king of games:", error);
        return null;
    }
}


export async function getAllUsers(filter?: 'punished'): Promise<UserProfile[]> {
    try {
        const usersCol = collection(db, 'users');
        let usersQuery;
        
        if (filter === 'punished') {
            usersQuery = query(usersCol, where('isPunished', '==', true));
        } else {
            usersQuery = query(usersCol, orderBy('leaderboardPoints', 'desc'));
        }

        const snapshot = await getDocs(usersQuery);
        let users = snapshot.docs.map(doc => {
            const data = doc.data();
            const decrees = (data.decrees || []).map((d: any) => ({ ...d, until: d.until?.toDate ? d.until.toDate() : d.until }));
            const humiliation = data.humiliation ? { ...data.humiliation, at: (data.humiliation.at as any)?.toDate(), until: (data.humiliation.until as any)?.toDate() } : null;
            const originalAvatarToRevert = data.originalAvatarToRevert ? { ...data.originalAvatarToRevert, until: (data.originalAvatarToRevert.until as any)?.toDate() } : null;

            return {
                uid: doc.id,
                name: data.name || 'Unknown',
                email: data.email || null,
                gender: data.gender,
                isAdmin: data.isAdmin || false,
                isEditor: data.isEditor || false,
                coins: data.coins ?? 0,
                diamonds: data.diamonds ?? 0,
                avatarId: data.avatarId || 'Avatar00.png',
                unlockedAvatars: data.unlockedAvatars || ['Avatar00.png'],
                leaderboardPoints: data.leaderboardPoints || 0,
                honorPoints: data.honorPoints || 0,
                loyaltyPoints: data.loyaltyPoints || 0,
                rebellionPoints: data.rebellionPoints || 0,
                trophies: data.trophies || 0,
                gamesPlayed: data.gamesPlayed || 0,
                hasChangedName: data.hasChangedName || false,
                punishmentsIssued: data.punishmentsIssued || 0,
                leagues: data.leagues || [],
                winCounts: data.winCounts || {},
                clan: data.clan || null,
                clanRole: data.clanRole,
                audienceGroups: data.audienceGroups || [],
                humiliation: humiliation,
                allegiance: data.allegiance || null,
                taxDemands: (data.taxDemands || []),
                alliances: data.alliances || [],
                decrees: decrees,
                duelChallenges: (data.duelChallenges || []),
                lastPunishmentTimestamp: data.lastPunishmentTimestamp || {},
                originalAvatarToRevert: originalAvatarToRevert,
                unlockedPunishmentAvatars: data.unlockedPunishmentAvatars || [],
                isPunished: data.isPunished || false,
            } as UserProfile;
        });
        
        return users;

    } catch (error) {
        console.error("Error fetching all users:", error);
        return [];
    }
}

export async function getTopPunisher(): Promise<UserProfile | null> {
    try {
        const q = query(collection(db, 'users'), orderBy('punishmentsIssued', 'desc'), limit(1));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            return null;
        }
        const userDoc = snapshot.docs[0];
        // Ensure punishmentsIssued is a number and exists
        if (!userDoc.data().punishmentsIssued || userDoc.data().punishmentsIssued === 0) {
            return null;
        }
        return { uid: userDoc.id, ...userDoc.data() } as UserProfile;
    } catch (error) {
        console.error("Error fetching top punisher:", error);
        return null;
    }
}


// Internal function to update win counts and check for new Game Kings
export async function updateUserWinCount(gameType: any, userId: string, transaction: WriteBatch) {
    
    // This function should NOT handle team games, as that logic is in `distributeEndOfGameAwards`
    const teamGameTypes = ['word_war', 'king-of-genius', 'behind-the-mask'];
    if (teamGameTypes.includes(gameType)) {
        return; 
    }

    const userRef = doc(db, 'users', userId);
    // Note: This function now accepts a WriteBatch object instead of a full transaction,
    // so we cannot `get` docs. We must perform updates blindly. This is acceptable
    // as we are only using increments.
    
    transaction.update(userRef, {
      [`winCounts.${gameType}`]: increment(1)
    });
}


export async function searchUsers(searchTerm: string): Promise<UserProfile[]> {
  if (!searchTerm.trim()) {
    return [];
  }
  
  const term = searchTerm.toLowerCase();

  try {
    const usersRef = collection(db, 'users');

    const nameQuery = query(usersRef, 
        where('name', '>=', term),
        where('name', '<=', term + '\uf8ff')
    );
    const emailQuery = query(usersRef, 
        where('email', '>=', term), 
        where('email', '<=', term + '\uf8ff')
    );

    const [nameSnapshot, emailSnapshot] = await Promise.all([
        getDocs(nameQuery),
        getDocs(emailQuery)
    ]);
    
    const usersMap = new Map<string, UserProfile>();

    const processSnapshot = (snapshot: any) => {
         snapshot.docs.forEach((doc: any) => {
            if (!usersMap.has(doc.id)) {
                const data = doc.data();
                 const humiliation = data.humiliation ? { ...data.humiliation, at: (data.humiliation.at as any)?.toDate(), until: (data.humiliation.until as any)?.toDate() } : null;
                const originalAvatarToRevert = data.originalAvatarToRevert ? { ...data.originalAvatarToRevert, until: (data.originalAvatarToRevert.until as any)?.toDate() } : null;

                usersMap.set(doc.id, { 
                    uid: doc.id, 
                    ...data,
                    humiliation,
                    originalAvatarToRevert
                } as UserProfile);
            }
        });
    }

    processSnapshot(nameSnapshot);
    processSnapshot(emailSnapshot);

    return Array.from(usersMap.values());
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
}

export async function getUsersByRank(minPoints: number, maxPoints: number | null, limitCount: number = 8): Promise<UserProfile[]> {
    try {
        const usersCol = collection(db, 'users');
        let usersQuery;
        
        const qConstraints: any[] = [
            orderBy('leaderboardPoints', 'desc'),
            limit(limitCount)
        ];
        
        if (minPoints > 0) {
             qConstraints.unshift(where('leaderboardPoints', '>=', minPoints));
        }
        if (maxPoints !== null) {
            qConstraints.unshift(where('leaderboardPoints', '<', maxPoints));
        }


        usersQuery = query(usersCol, ...qConstraints);

        const snapshot = await getDocs(usersQuery);
        return snapshot.docs.map(doc => {
            const data = doc.data();
             const humiliation = data.humiliation ? { ...data.humiliation, at: data.humiliation.at?.toDate(), until: data.humiliation.until?.toDate() } : null;
            const originalAvatarToRevert = data.originalAvatarToRevert ? { ...data.originalAvatarToRevert, until: data.originalAvatarToRevert.until?.toDate() } : null;
            const decrees = (data.decrees || []).map((d: Decree) => ({ ...d, until: (d.until as any)?.toDate ? (d.until as any).toDate() : d.until }));

            return {
                uid: doc.id,
                name: data.name || 'Unknown',
                email: data.email || null,
                gender: data.gender,
                isAdmin: data.isAdmin || false,
                isEditor: data.isEditor || false,
                coins: data.coins ?? 0,
                diamonds: data.diamonds ?? 0,
                avatarId: data.avatarId || 'Avatar00.png',
                unlockedAvatars: data.unlockedAvatars || ['Avatar00.png'],
                leaderboardPoints: data.leaderboardPoints || 0,
                honorPoints: data.honorPoints || 0,
                loyaltyPoints: data.loyaltyPoints || 0,
                rebellionPoints: data.rebellionPoints || 0,
                trophies: data.trophies || 0,
                gamesPlayed: data.gamesPlayed || 0,
                hasChangedName: data.hasChangedName || false,
                punishmentsIssued: data.punishmentsIssued || 0,
                leagues: data.leagues || [],
                winCounts: data.winCounts || {},
                clan: data.clan || null,
                clanRole: data.clanRole,
                audienceGroups: data.audienceGroups || [],
                humiliation: humiliation,
                allegiance: data.allegiance || null,
                taxDemands: (data.taxDemands || []),
                alliances: data.alliances || [],
                decrees: decrees,
                duelChallenges: (data.duelChallenges || []),
                lastPunishmentTimestamp: data.lastPunishmentTimestamp || {},
                originalAvatarToRevert: originalAvatarToRevert,
                unlockedPunishmentAvatars: data.unlockedPunishmentAvatars || [],
                isPunished: data.isPunished || false,
            } as UserProfile;
        });
    } catch (error) {
        console.error("Error fetching users by rank:", error);
        return [];
    }
}

    
```
- src/lib/actions/user.ts:
```ts


/**
 * @fileoverview This file re-exports all user-related actions from their new, modular locations.
 * This structure improves maintainability by separating concerns.
 */

// Explicitly import and export to avoid namespace collisions and help bundlers.
import { createUserProfile, updateUserName, updateUserAvatar, updateUserGender } from './user/profile';
import { purchaseAvatar, purchasePunishmentAvatar, exchangeCoinsForHonor, exchangeCoinsForRebellion, exchangeCoinsForLoyaltyPoints } from './user/currency';
import { getPlayerFromUserId, getGameKings, getKingOfGames, getAllUsers, updateUserWinCount, searchUsers, getRanks, getUsersByRank, getTopPunisher } from './user/queries';
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
} from './user/leagues';
import { calculateEndOfGameAwards } from './user/awards';
import { giveReward, applyPunishment, humiliatePlayer, requestAllegiance, issueDecree, begForMercy, demandTaxes, respondToTaxDemand, requestAlliance, respondToAlliance, issueDuelChallenge, respondToDuelChallenge, forceAvatarChange, payPunishmentTax } from './user/social';

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
    getTopPunisher,
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
    exchangeCoinsForLoyaltyPoints,
    getRanks,
};

```
- src/tailwind.config.ts:
```ts
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-tajawal)', 'sans-serif'],
        code: ['monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

```
- src/types/index.ts:
```ts


import type { Timestamp } from 'firebase/firestore';
import type { LucideIcon } from 'lucide-react';
import { z } from 'zod';
import type { ALL_PERMISSIONS } from '@/data/permissions';


// Zod Schemas for AI Flows
const PlayerAnswersSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  answers: z.array(z.string()),
});

export const JudgeSingleSubmissionInputSchema = z.object({
    question: z.string().describe("The question that was asked."),
    submission: PlayerAnswersSchema.describe("The submission from a single player."),
});
export type JudgeSingleSubmissionInput = z.infer<typeof JudgeSingleSubmissionInputSchema>;

export const JudgeSingleSubmissionOutputSchema = z.object({
    playerId: z.string(),
    name: z.string(),
    correctAnswers: z.array(z.string()).describe("An array of the answers that were deemed correct."),
    score: z.number().int().describe("The final score for this player for the round."),
    evaluation: z.string().optional().describe("A witty and concise explanation for the score given to this specific player.")
});
export type JudgeSingleSubmissionOutput = z.infer<typeof JudgeSingleSubmissionOutputSchema>;


export const JudgePrisonAnswersInputSchema = z.object({
  question: z.string().describe("The question that was asked."),
  submissions: z.array(PlayerAnswersSchema).describe("An array of submissions from all players."),
  rejudgeReason: z.object({
      name: z.string(),
      reason: z.string()
  }).optional().describe("An optional reason provided by a player for a re-evaluation request."),
});
export type JudgePrisonAnswersInput = z.infer<typeof JudgePrisonAnswersInputSchema>;

export const JudgePrisonAnswersOutputSchema = z.object({
  results: z.array(JudgeSingleSubmissionOutputSchema),
  judgeExplanation: z.string().optional().describe("A witty and concise explanation of the overall judgment, especially when a re-judge is requested."),
  isRejectionJustified: z.boolean().optional().describe("Set to true only if a re-judge request was denied."),
});
export type JudgePrisonAnswersOutput = z.infer<typeof JudgePrisonAnswersOutputSchema>;


// Schemas for News Article Flow
export const EventSummarySchema = z.object({
  key_events: z.array(z.string()).describe('A list of the most interesting and dramatic events of the day, including key points from previous articles.'),
  overall_mood: z.string().describe('A one-sentence summary of the general mood of the day (e.g., "A day of surprising betrayals and unexpected victories.").'),
});

export const DraftArticleSchema = z.object({
  headline: z.string().describe('A catchy, satirical, and dramatic headline for the news article.'),
  body: z.string().describe('The full body of the news article, written in an engaging and slightly sarcastic journalistic style. It should connect the key events into a coherent narrative. The length should be between 100 and 200 words.'),
});

export const NewsArticleInputSchema = z.object({
  events: z.array(z.any()).describe('An array of social event objects from the game from the last 24 hours.'),
  previous_articles: z.array(z.any()).describe('An array of articles published in the last week, to provide context.'),
  date: z.string().describe("Today's date in a readable format (e.g., 'Sunday, July 28, 2024')."),
});
export type NewsArticleInput = z.infer<typeof NewsArticleInputSchema>;

export const NewsArticleOutputSchema = z.object({
  headline: z.string(),
  body: z.string(),
  category: z.string().default('أخبار اللعبة'),
  imageUrl: z.string().optional(),
});
export type NewsArticleOutput = z.infer<typeof NewsArticleOutputSchema>;


// Regular Types
export type PermissionId = typeof ALL_PERMISSIONS[number]['id'];

export interface Permission {
    id: PermissionId;
    name: string;
    description: string;
    category: 'economic' | 'social' | 'gameplay' | 'meta';
}

export interface AudienceGroup {
    id: string;
    name: string;
    members: string[]; // array of user IDs
}
export interface Article {
    id: string;
    title: string;
    content: string;
    imageUrl?: string;
    authorName: string;
    authorId: string;
    createdAt: Date;
    isPublished: boolean;
    // New fields
    category?: string; 
    audience?: 'public' | string[]; // public or array of audience group IDs
    tags?: string[];
    views?: number;
}

export type ChallengePrize = {
    type: 'coins' | 'diamonds' | 'honorPoints';
    value: number;
};

export interface Challenge {
    id: string;
    title: string;
    targetPoints: number; 
    specificGameType?: Game['gameType'] | 'all';
    firstPlacePrize: ChallengePrize[];
    secondPlacePrize: ChallengePrize[];
    thirdPlacePrize: ChallengePrize[];
    
    endsAt: Date;
    createdAt: Timestamp;
    participantIds: string[];
    participantCount?: number;
    winners?: {
        first?: { id: string, name: string };
        second?: { id: string, name: string };
        third?: { id: string, name: string };
    };
}


export interface ClanWarInvitation {
    id: string;
    challengerClan: { id: string; name: string; emblem: string };
    challengedClan: { id: string; name: string; emblem: string };
    gameType: Game['gameType'];
    battleTime: Date;
    status: 'pending' | 'accepted' | 'rejected';
}

export interface ClanWar extends ClanWarInvitation {
    gameId: string | null; // Null until the game starts
    winnerClanId: string | null;
}


export interface Mail {
  id: string;
  senderName: string; // 'Admin' or a specific admin's name
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  expiresAt: Date;
  coins?: number;
  coinsClaimed?: boolean;
}


export interface SocialRank {
  threshold: number;
  name: string;
  icon: any; 
  permissions: PermissionId[];
}

export const DEFAULT_SOCIAL_RANKS: SocialRank[] = [
    { threshold: 0, name: 'عامل وضيع', icon: 'Shield', permissions: [] },
    { threshold: 50, name: 'مواطن صالح', icon: 'ShieldCheck', permissions: [] },
    { threshold: 150, name: 'شخصية مرموقة', icon: 'Award', permissions: [] },
    { threshold: 300, name: 'عضو مجلس', icon: 'Gem', permissions: [] },
    { threshold: 500, name: 'زعيم المدينة', icon: 'Crown', permissions: [] },
];

export const DEFAULT_TRAP_ANSWER_CATEGORIES = [
    "تاريخ",
    "رياضة",
    "أدب",
    "أنمي ومانجا",
    "إسلاميات",
    "فنون",
    "جغرافيا",
    "لغة عربية",
    "معلومات غريبة",
    "الحيوانات والطبيعة",
    "النباتات",
    "المطبخ"
];

export const DEFAULT_DRAW_AND_GUESS_CATEGORIES = [
    "جملة مركبة",
    "أمثال عامية",
    "أنميات مشهورة",
    "أفلام مشهورة",
];


export interface League {
  id: string;
  name: string;
  adminId: string;
  members: string[]; // array of user IDs
  password?: string;
  createdAt: Timestamp;
  scores?: Record<string, number>; // { [userId]: score }
  gamesPlayed?: Record<string, number>;
}

export type PlayerRole = 'killer' | 'detective' | 'doctor' | 'soldier' | 'spy' | 'shapeshifter' | 'bomber' | 'civilian' | 'contestant';
export type PlayerTeam = 'mafia' | 'good' | 'neutral' | 'red' | 'blue';
export type PlayerStatus = 'alive' | 'killed' | 'voted_out' | 'left' | 'executed' | 'in_prison' | 'bankrupt';

export type ClanMemberRole = 'leader' | 'vice-leader' | 'member';

export interface ClanMember {
    id: string;
    name: string;
    avatarId: string;
    leaderboardPoints: number;
    role: ClanMemberRole;
}

export interface Clan {
  id: string;
  name: string;
  emblem: string;
  color: string;
  leaderId: string;
  members: ClanMember[];
  invitations: { userId: string; userName: string; avatarId: string; }[];
  totalPoints: number;
  totalHonorPoints: number;
  unlockedEmblems: string[];
}


export interface Player {
  id: string;
  name: string;
  avatarId: string;
  leaderboardPoints: number; 
  role?: PlayerRole;
  team?: PlayerTeam;
  apparentRole?: PlayerRole; // For shapeshifter
  status: PlayerStatus;
  isProtected?: boolean; // For doctor's protection
  score: number; 
  clan?: { id: string; name: string, emblem: string };
  position: number; 
  isReady?: boolean; 
  temporaryTitle?: string | null;
}

export interface Humiliation {
    by: string; // ID of the humiliator
    byName: string;
    at: Date;
    until: Date;
    taxToLift: number;
    durationInDays: number;
}

export interface AllegianceRequest {
    fromId: string;
    fromName: string;
    fromAvatar: string;
    offer: {
        amount: number;
        currency: 'coins'; // For now, only coins
    };
    durationInDays: number; // 1, 2, or 3
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: Date;
}

export interface ActiveAllegiance {
    to: string; // ID of the liege lord
    toName: string;
    until: Date;
}


export interface TaxDemand {
    fromId: string;
    fromName: string;
    amount: number;
    status: 'pending' | 'paid' | 'rejected';
    createdAt: Date;
}

export interface AllianceMemberInfo {
    name: string;
    avatarId: string;
    status: 'pending' | 'accepted';
}

export interface Alliance {
    id: string; // sorted_id1_id2
    members: Record<string, AllianceMemberInfo>;
    createdAt: Date;
}

export interface Decree {
    id: string;
    title: string;
    issuedBy: string;
    issuedByName: string;
    at: Date;
    until: Date;
    durationInDays: number;
    taxToLift: number;
}

export interface SocialEvent {
    type: 'allegiance' | 'rebellion' | 'humiliation' | 'game_end';
    description: string;
    timestamp: Date;
}


export interface ClanInvitation {
    clanId: string;
    clanName: string;
    invitedBy: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string | null;
  gender?: 'male' | 'female';
  isAdmin: boolean;
  isEditor: boolean; // Added for news editors
  coins: number;
  diamonds: number;
  avatarId: string;
  unlockedAvatars: string[];
  unlockedPunishmentAvatars?: string[];
  leaderboardPoints: number; 
  honorPoints: number;
  loyaltyPoints: number;
  rebellionPoints?: number;
  trophies: number;
  gamesPlayed: number;
  punishmentsIssued?: number;
  hasChangedName?: boolean;
  leagues?: {id: string, name: string}[];
  winCounts?: Record<Game['gameType'], number>;
  clan?: { id: string; name: string, emblem: string };
  clanRole?: ClanMemberRole;
  clanInvitations?: ClanInvitation[];
  audienceGroups?: string[];
  humiliation?: Humiliation | null;
  allegiance?: ActiveAllegiance | null;
  allegianceRequests?: AllegianceRequest[];
  taxDemands?: TaxDemand[];
  alliances?: Alliance[];
  decrees?: Decree[];
  duelChallenges?: DuelChallenge[];
  lastPunishmentTimestamp?: Record<string, Timestamp>; // { [targetId]: timestamp }
  originalAvatarToRevert?: { 
      id: string; 
      until: Date; 
      taxToLift: number; 
      by: string; 
      byName: string;
      durationInDays: number;
  } | null;
  permissions?: PermissionId[]; // All permissions granted by the user's current rank
  isPunished?: boolean;
}

export interface GameKing {
    name: string;
    avatarId: string;
    winCount: number;
    kingId: string;
}

export type KingOfGeniusGameState = "lobby" | "team_selection" | "challenge_intro" | "challenge_active" | "challenge_results" | "final_results";
export type TrapAnswerGameState = "lobby" | "category-selection" | "answer-submission" | "guessing" | "round-results" | "final-results";
export type MafiaGameState = "lobby" | "role_reveal" | "night" | "day" | "voting" | "execution" | "final_results";
export type WordWarGameState = "lobby" | "preparation" | "guide_turn" | "guesser_turn" | "board_reveal" | "final_results";
export type DrawAndGuessGameState = "lobby" | "category_selection" | "drawing" | "guessing" | "round-results" | "final_results";
export type PrisonGameState = "lobby" | "instructions" | "open_auction" | "closed_auction_bidding" | "closed_auction_answering" | "judging" | "rejudging" | "results" | "final_results";
export type SnakesAndScissorsGameState = "lobby" | "rolling" | "answering" | "moving" | "final_results";

export type GameState = KingOfGeniusGameState | TrapAnswerGameState | MafiaGameState | WordWarGameState | DrawAndGuessGameState | PrisonGameState | SnakesAndScissorsGameState;

export type ScoreMatrix = Record<string, Record<string, number>>; 

export interface ChallengeResult {
    playerId: string;
    team: 'A' | 'B';
    isCorrect: boolean;
    time: number; 
    score?: number; 
    playerDrawnPath?: PathTile[]; 
}

export type GridPosition = { r: number; c: number };
export type PathTile = { x: number; y: number };

export interface PlayerProgress {
  currentProblemIndex?: number;
  currentStep?: number;
  wrongAttempts?: number;
  clickedTiles?: { x: number, y: number }[];
  position?: GridPosition;
  visited?: GridPosition[];
  hitWalls?: GridPosition[];
  points?: number;
  revealedByHint?: GridPosition[];
  attempts?: { guess: string[], feedback: ('correct' | 'misplaced' | 'incorrect')[] }[];
  answers?: Record<string, string> | string[]; 
}

export type SmartGridColumn = {
  cells: (number | null)[];
  pattern: string;
  solution: number[];
}

export interface SmartGridPuzzleData {
    columns: SmartGridColumn[];
}

export interface TrapQuestion {
    id: string;
    question: string;
    answer: string;
    category: string;
    dummyAnswers: string[];
}

export interface PrisonQuestion {
    id: string;
    text: string;
}

export interface AvatarPrice {
    avatarId: string;
    price: number;
    currency: 'coins' | 'diamonds';
}

export type EmojiReactionType = 'laugh' | 'mock' | 'apologize' | 'shame';

export interface EmojiReaction {
    emoji: EmojiReactionType;
    timestamp: Timestamp;
}


export interface DrawingLine {
    points: number[];
    color: string;
    strokeWidth: number;
    tool: 'pen' | 'eraser';
}

export interface DrawingRect {
    type: 'rect';
    x: number;
    y: number;
    width: number;
    height: number;
    stroke: string;
    strokeWidth: number;
    isDrawing?: boolean;
}

export interface DrawingCircle {
    type: 'circle';
    x: number;
    y: number;
    radius: number;
    stroke: string;
    strokeWidth: number;
    isDrawing?: boolean;
}

export interface DrawingSimpleLine {
    type: 'line';
    points: [number, number, number, number];
    stroke: string;
    strokeWidth: number;
    isDrawing?: boolean;
}

export interface DrawingTriangle {
    type: 'triangle';
    x: number;
    y: number;
    radius: number;
    stroke: string;
    strokeWidth: number;
    isDrawing?: boolean;
}


export type DrawingShape = DrawingRect | DrawingCircle | DrawingSimpleLine | DrawingTriangle;

export interface DrawingData {
    lines: DrawingLine[];
    shapes: DrawingShape[];
    bgColor: string;
    width: number;
    height: number;
}
export type GuessStatus = 'correct' | 'close' | 'incorrect';
export interface PlayerGuess {
    playerId: string;
    playerName: string;
    guess: string;
    status: GuessStatus;
}
export interface DrawAndGuessPrompt {
    id: string;
    text: string;
    category: string;
}

export type MafiaPhase = MafiaGameState;
export type NightActionType = 'kill' | 'heal' | 'investigate' | 'spy' | 'bomb' | 'shapeshift';

export interface NightAction {
    actorId: string;
    action: NightActionType;
    targetId: string;
    disguiseRole?: PlayerRole;
}

export interface DayEvent {
    type: 'death' | 'protection' | 'investigation' | 'spy_reveal' | 'execution';
    message: string;
    killedPlayer?: {
        name: string;
        avatarId: string;
    };
    revealedRole?: PlayerRole;
    revealedTeam?: PlayerTeam;
}

export interface PrivateEvent {
    type: 'investigation_result' | 'spy_result' | 'spy_result_soldier_block' | 'doctor_success';
    message: string;
    targetPlayer?: {
        id: string;
        name: string;
        avatarId: string;
        role?: PlayerRole;
    };
}


export interface PublicChatMessage {
    senderId: string;
    senderName: string;
    message: string;
    timestamp: Timestamp;
}

export interface PrivateChatMessage {
    senderId: string;
    senderName: string;
    message: string;
    timestamp: Timestamp;
}
export interface PrivateChat {
    participants: string[]; // [spyId, killerId]
    messages: PrivateChatMessage[];
}

export interface WordWarCard {
    text: string;
    color: 'red' | 'blue' | 'neutral' | 'assassin';
    revealed: boolean;
}


export interface DuelChallenge {
    id: string; // gameId
    fromId: string;
    fromName: string;
    betAmount: number;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: Date;
}

export interface Game {
  id: string;
  hostId: string;
  challengeId?: string; // For challenges
  challengeDetails?: {
      title: string;
      minPlayersToStart: number;
      entryFee: {
          type: 'coins' | 'leaderboardPoints';
          value: number;
      };
  };
  gameType: 'king-of-genius' | 'trap-answer' | 'behind-the-mask' | 'word_war' | 'draw-and-guess' | 'prison' | 'snakes_and_scissors';
  players: Player[];
  playerUids: string[];
  gameState: GameState;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  isDuel?: boolean;
  duelDetails?: {
      challengerId: string;
      challengedId: string;
      betAmount: number;
  };
  
  round?: number; 
  playerScores?: Record<string, number>;
  
  gameResult?: {
    winner: PlayerTeam | 'draw' | 'game_over' | string;
    message: string;
  };
  
  // king-of-genius specific fields
  teamScores?: { A: number; B: number };
  challengeOrder?: string[];
  currentChallengeIndex?: number;
  puzzles?: string[];
  challengeState?: {
      duration: number,
      challengeEndsAt: Timestamp,
      puzzle?: any;
      results?: ChallengeResult[];
      playerProgress?: Record<string, PlayerProgress>;
  };

  // trap-answer specific fields
  trapAnswerState?: {
      settings: {
          categories: string[];
          rounds: number;
          answerTime: number;
      };
      turnOrder?: string[];
      currentTurnIndex?: number;
      fiveRandomCategories?: string[];
      selectedCategory?: string;
      currentQuestion?: TrapQuestion;
      playerAnswers?: Record<string, string | null>;
      playerGuesses?: Record<string, string>;
      timerEndsAt?: Timestamp | null;
      dummyAnswerForRound?: string;
      shuffledAnswers?: string[];
      lastRoundResults?: {
        answers: {
          text: string;
          isCorrect: boolean;
          authorIds: string[] | null;
          guesserIds: string[];
        }[];
        scores: Record<string, {
            points: number;
            breakdown: { reason: string, points: number }[];
        }>;
    };
    reactions?: Record<string, EmojiReaction>;
    trickStats?: {
        trickedBy: Record<string, string[]>; // { [trickedPlayerId]: [trickerPlayerId1, trickerPlayerId2...] }
        trickedOthers: Record<string, string[]>; // { [trickerPlayerId]: [trickedPlayerId1, ...] }
    };
    finalAwards?: {
        deceivedFool?: { playerId: string; name: string; avatarId: string; count: number } | null;
        cunningDeceiver?: { playerId: string; name: string; avatarId: string; count: number } | null;
    };
  };

  // "خلف القناع" (Mafia) specific state
  mafiaState?: {
    settings?: {
      nightTime: number;
      dayTime: number;
    };
    phase: MafiaPhase;
    rolesInGame?: PlayerRole[];
    timerEndsAt?: Timestamp;
    night?: number;
    events?: DayEvent[];
    publicChat?: PublicChatMessage[];
    privateEvents?: Record<string, PrivateEvent[]>; // { [playerId]: [PrivateEvent, ...] }
    nightActions?: Record<string, NightAction>;
    lastKilledPlayerId?: string | null;
    lastHealedPlayerId?: string | null;
    lastAbilityUse?: Record<string, number>; // { [playerId]: nightNumber }
    lastExecutedPlayer?: { name: string; avatarId: string; temporaryTitle?: string } | null;
    votes?: Record<string, string | null>; // { voterId: targetId }
    privateChats?: Record<string, PrivateChat>; // Keyed by a unique chat ID
  };

  // "حرب الكلمات" (Word War) specific state
  wordWarState?: {
    settings: {
        turnTime: number;
    };
    cards: WordWarCard[];
    turn: 'red' | 'blue';
    guides: {
        red: string;
        blue: string;
    };
    previousGuides?: {
        red?: string;
        blue?: string;
    };
    currentHint?: {
        word: string;
        count: number;
    };
    guessesLeft?: number;
    turnResult?: 'hit' | 'miss' | 'neutral' | 'assassin';
    timerEndsAt?: Timestamp | null;
    suspicions?: Record<string, number[]>; // { [team_color]: [cardIndex1, cardIndex2...] }
  };
    
   // "Draw and Guess" specific state
  drawAndGuessState?: {
    settings: {
        drawingTime: number;
        guessingTime: number;
        roundsPerPlayer: number;
    };
    categories?: string[];
    fiveRandomCategories?: string[];
    turnOrder?: string[];
    drawerTurnCounts?: Record<string, number>; // { [playerId]: count }
    currentDrawerId?: string;
    prompt?: DrawAndGuessPrompt;
    drawing?: DrawingData | null;
    guesses?: PlayerGuess[];
    ratings?: Record<string, number>; // { [raterId]: rating }
    timerEndsAt?: Timestamp;
    retries?: number; // Number of retries for the drawer
  };
  
    // "The Prison" specific state
  prisonState?: {
      settings: {
          biddingTime: number;
          answeringTime: number;
          judgingTime: number;
          rounds: number;
      };
      currentQuestion?: PrisonQuestion;
      closedAuctionQuestion?: PrisonQuestion;
      playerProgress?: Record<string, { answers: string[] }>;
      openAuctionSubmissions?: Record<string, string[]>;
      bids?: Record<string, number>; // { playerId: amount }
      highestBid?: number;
      auctionWinnerId?: string;
      aiJudgeResults?: JudgeSingleSubmissionOutput[];
      lastRoundResult?: {
          message: string;
          points: Record<string, {
              points: number;
              breakdown: { reason: string, points: number }[];
          }>;
          freedPlayerName?: string;
          freedPlayerAvatarId?: string;
      };
      prisonHistory?: Record<string, { inPrison: number, roundsWithoutWinningAuction: number }>; // { playerId: { inPrison: rounds, ... }}
      timerEndsAt?: Timestamp;
      judgingStarted?: boolean;
      questionChangersUsedBy?: string[];
      rejudgeRequestsUsedBy?: string[];
      activeRejudgeRequest?: { playerId: string; name: string; reason: string };
      judgeExplanation?: string;
      isRejectionJustified?: boolean;
  };

   // "Snakes & Scissors" specific state
  snakesAndScissorsState?: {
      board: BoardProperty[];
      diceResult?: number;
      currentQuestion?: SnakesAndScissorsQuestion;
      questionTimeLeft?: number;
  }
}

export interface SnakesAndScissorsQuestion {
    id: string;
    text: string;
    options: string[];
    correctAnswer: string;
    category: string;
}

export const GAME_TYPE_NAMES: Record<Game['gameType'], string> = {
    'king-of-genius': 'ساحة العباقرة',
    'trap-answer': 'الجواب المفخخ',
    'behind-the-mask': 'خلف القناع',
    'word_war': 'حرب الكلمات',
    'draw-and-guess': 'لعبة رسمة',
    'prison': 'السجن',
    'snakes_and_scissors': 'السلم والمقص',
};

```
- tailwind.config.ts:
```ts
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-cairo)', 'sans-serif'],
        code: ['monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

```
- tsconfig.json:
```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```