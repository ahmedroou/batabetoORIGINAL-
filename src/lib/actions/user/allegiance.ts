

'use server';

import { db } from '@/lib/firebase';
import { doc, runTransaction, increment, arrayUnion, arrayRemove, Timestamp } from 'firebase/firestore';
import type { UserProfile, SocialRank, AllegianceRequest, ActiveAllegiance } from '@/types';
import { getRanks } from './queries';
import { sendSystemMail } from './mail';

const LOYALTY_COST_MAP: Record<number, number> = { 1: 3, 2: 6, 3: 8 };

// Helper to safely convert various date-like types to milliseconds for comparison
const toMs = (v: any): number => {
    if (!v) return 0;
    if (v instanceof Date) return v.getTime();
    if (v instanceof Timestamp) return v.toMillis();
    if (typeof v === 'number') return v;
    if (typeof v.toDate === 'function') return v.toDate().getTime();
    // Fallback for ISO string etc.
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

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
        const actorRank = getRank(actor.leaderboardPoints || 0, allRanks);
        const targetRank = getRank(target.leaderboardPoints || 0, allRanks);

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
    const actorRef = doc(db, "users", actorId); // The one accepting/rejecting (the liege lord)
    const requesterRef = doc(db, "users", request.fromId); // The one who sent the request

    const loyaltyCost = LOYALTY_COST_MAP[request.durationInDays] || 3;

    return runTransaction(db, async (transaction) => {
        const [actorDoc, requesterDoc] = await Promise.all([transaction.get(actorRef), transaction.get(requesterRef)]);
        
        if (!actorDoc.exists() || !requesterDoc.exists()) throw new Error("لم يتم العثور على أحد اللاعبين.");

        const actorData = actorDoc.data() as UserProfile;
        const requesterData = requesterDoc.data() as UserProfile;
        
        const requests = actorData.allegianceRequests || [];
        const requestTimestampMs = toMs(request.createdAt);

        const requestIndex = requests.findIndex(r => 
            r.fromId === request.fromId && toMs(r.createdAt) === requestTimestampMs
        );

        if (requestIndex === -1) throw new Error("لم يتم العثور على طلب الولاء هذا. ربما تم التفاعل معه بالفعل.");

        const updatedRequests = [...requests];
        updatedRequests.splice(requestIndex, 1);
        
        if (response === 'rejected') {
            await sendSystemMail(request.fromId, { subject: 'تم رفض طلب الولاء', body: `للأسف، قام اللاعب ${actorData.name} برفض طلب ولائك.` }, transaction);
            transaction.update(actorRef, { allegianceRequests: updatedRequests });
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

        // All writes must be after all reads.
        transaction.update(actorRef, { allegianceRequests: updatedRequests });
        
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

export async function deleteAllegianceRequest(actorId: string, requestToDelete: AllegianceRequest): Promise<{ success: boolean, error?: string }> {
    const actorRef = doc(db, 'users', actorId);

    return runTransaction(db, async (tx) => {
        const actorDoc = await tx.get(actorRef);
        if (!actorDoc.exists()) throw new Error("لم يتم العثور على المستخدم.");

        const actorData = actorDoc.data() as UserProfile;
        const requests = actorData.allegianceRequests || [];

        // Find the exact request to delete using a robust comparison
        const requestTimestampMs = toMs(requestToDelete.createdAt);
        const updatedRequests = requests.filter(r => 
            !(r.fromId === requestToDelete.fromId && toMs(r.createdAt) === requestTimestampMs)
        );

        if (updatedRequests.length === requests.length) {
            // This case can be treated as a success if the goal is to ensure it's gone
            return { success: true };
        }

        tx.update(actorRef, { allegianceRequests: updatedRequests });
        return { success: true };

    }).catch((error: any) => {
        console.error("Error deleting allegiance request:", error);
        return { success: false, error: error.message || 'فشل حذف الطلب.' };
    });
}
