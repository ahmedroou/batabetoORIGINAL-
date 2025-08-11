'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, increment, arrayUnion, arrayRemove } from 'firebase/firestore';
import type { UserProfile, SocialRank, AllegianceRequest, ActiveAllegiance } from '@/types';
import { getRanks } from './queries';
import { sendSystemMail } from './mail';

const LOYALTY_COST_MAP: Record<number, number> = { 1: 3, 2: 6, 3: 8 };

export async function requestAllegiance(actorId: string, targetId: string, durationInDays: number, offerAmount: number): Promise<{ success: boolean; error?: string }> {
    const allRanks = await getRanks();
    const loyaltyCost = LOYALTY_COST_MAP[durationInDays] || 3;

    return runTransaction(db, async (transaction) => {
        const actorRef = doc(db, "users", actorId);
        const targetRef = doc(db, "users", targetId);

        const [actorDoc, targetDoc] = await Promise.all([transaction.get(actorRef), transaction.get(targetRef)]);

        if (!actorDoc.exists() || !targetDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

        const actor = actorDoc.data() as UserProfile;
        const target = targetDoc.data() as UserProfile;

        const getRank = (points: number, ranks: SocialRank[]) => {
            const sortedRanks = [...ranks].sort((a,b) => b.threshold - a.threshold);
            for (const rank of sortedRanks) {
                if (points >= rank.threshold) return rank;
            }
            return sortedRanks[sortedRanks.length - 1] || null;
        };
        const actorRank = getRank(actor.leaderboardPoints, allRanks);
        const targetRank = getRank(target.leaderboardPoints, allRanks);

        if (!actorRank || !targetRank) throw new Error("خطأ في تحديد الرتب.");
        if (actorRank.threshold >= targetRank.threshold) throw new Error("لا يمكنك طلب الولاء إلا من لاعب أعلى منك رتبة.");
        
        if ((actor.loyaltyPoints || 0) < loyaltyCost) throw new Error(`لا تملك نقاط ولاء كافية (التكلفة ${loyaltyCost}).`);
        if ((actor.coins || 0) < offerAmount) throw new Error("لا تملك ما يكفي من الكوينز لتقديم هذا العرض.");

        const newRequest: AllegianceRequest = {
            fromId: actorId,
            fromName: actor.name,
            fromAvatar: actor.avatarId,
            offer: { amount: offerAmount, currency: 'coins' },
            durationInDays,
            status: 'pending',
            createdAt: new Date(),
        };

        transaction.update(targetRef, {
            allegianceRequests: arrayUnion(newRequest)
        });
        
        // No need to deduct loyalty/coins yet. That happens upon acceptance.

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message || "فشل إرسال طلب الولاء." };
    });
}

export async function respondToAllegianceRequest(actorId: string, request: AllegianceRequest, response: 'accepted' | 'rejected'): Promise<{ success: boolean; error?: string }> {
    const actorRef = doc(db, 'users', actorId); // The one accepting/rejecting (the liege lord)
    const requesterRef = doc(db, 'users', request.fromId); // The one who sent the request

    const LOYALTY_COST_MAP: Record<number, number> = { 1: 3, 2: 6, 3: 8 };
    const loyaltyCost = LOYALTY_COST_MAP[request.durationInDays] || 3;

    return runTransaction(db, async (transaction) => {
        const [actorDoc, requesterDoc] = await Promise.all([transaction.get(actorRef), transaction.get(requesterRef)]);
        
        if (!actorDoc.exists() || !requesterDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

        const actorData = actorDoc.data() as UserProfile;
        let requesterData = requesterDoc.data() as UserProfile;
        
        // Find and remove the request from the actor's list
        const requests = actorData.allegianceRequests || [];
        const requestIndex = requests.findIndex(r => r.fromId === request.fromId && r.createdAt.toString() === request.createdAt.toString());
        if (requestIndex === -1) throw new Error("لم يتم العثور على طلب الولاء هذا.");
        const updatedRequests = [...requests];
        updatedRequests.splice(requestIndex, 1);

        transaction.update(actorRef, { allegianceRequests: updatedRequests });
        
        if (response === 'rejected') {
            await sendSystemMail(request.fromId, { subject: 'تم رفض طلب الولاء', body: `للأسف، قام اللاعب ${actorData.name} برفض طلب ولائك.` }, transaction);
            return { success: true };
        }
        
        // --- Handle Acceptance ---
        if ((requesterData.loyaltyPoints || 0) < loyaltyCost) {
            await sendSystemMail(request.fromId, { subject: 'فشل إعلان الولاء', body: `قام اللاعب ${actorData.name} بقبول طلبك، لكن ليس لديك نقاط الولاء الكافية (${loyaltyCost}) لإتمام العملية.` }, transaction);
            throw new Error("اللاعب الطالب للولاء لم يعد يملك نقاط الولاء الكافية.");
        }
        if ((requesterData.coins || 0) < request.offer.amount) {
            await sendSystemMail(request.fromId, { subject: 'فشل إعلان الولاء', body: `قام اللاعب ${actorData.name} بقبول طلبك، لكن ليس لديك الكوينز الكافية لدفع العرض (${request.offer.amount}).` }, transaction);
            throw new Error("اللاعب الطالب للولاء لم يعد يملك الكوينز الكافية للعرض.");
        }

        const newAllegiance: ActiveAllegiance = {
            to: actorId,
            toName: actorData.name,
            until: new Date(Date.now() + request.durationInDays * 24 * 60 * 60 * 1000)
        };

        // Update requester: deduct resources, set allegiance
        transaction.update(requesterRef, {
            loyaltyPoints: increment(-loyaltyCost),
            coins: increment(-request.offer.amount),
            allegiance: newAllegiance
        });

        // Update liege lord: gain resources
        transaction.update(actorRef, {
            coins: increment(request.offer.amount),
            honorPoints: increment(loyaltyCost)
        });

        await sendSystemMail(request.fromId, { subject: 'تم قبول طلب الولاء!', body: `لقد قبل اللاعب ${actorData.name} طلب ولائك. أنت الآن تحت حمايته!` }, transaction);

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message };
    });
}