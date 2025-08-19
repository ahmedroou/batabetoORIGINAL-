
'use server';

import { db } from '@/lib/firebase';
import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    getDocs,
    Timestamp,
    orderBy,
    doc,
    updateDoc,
    deleteDoc,
    runTransaction,
    increment,
    limit,
} from 'firebase/firestore';
import type { Complaint, Game } from '@/types';
import { sendSystemMail } from './user/mail';
import { checkRateLimit } from './helpers';

const COMPLAINT_RATE_LIMIT_SECONDS = 43200; // 12 hours

export async function submitComplaint(data: Omit<Complaint, 'id' | 'status' | 'createdAt'>): Promise<{ success: boolean; error?: string }> {
    try {
        const userRef = doc(db, 'users', data.userId);

        await runTransaction(db, async (transaction) => {
            // Check rate limit before proceeding
            await checkRateLimit(transaction, userRef, 'submit_complaint', COMPLAINT_RATE_LIMIT_SECONDS);

            const complaintRef = doc(collection(db, 'complaints'));
            transaction.set(complaintRef, {
                ...data,
                status: 'pending',
                createdAt: serverTimestamp(),
            });
        });

        return { success: true };
    } catch (error: any) {
        console.error("Error submitting complaint:", error);
        return { success: false, error: error.message || 'فشل إرسال الشكوى.' };
    }
}

export async function getComplaints(statusFilter: 'all' | 'pending' | 'resolved' | 'rejected' = 'all'): Promise<{ success: boolean; complaints?: Complaint[]; error?: string }> {
    try {
        const complaintsCol = collection(db, 'complaints');
        
        let q;
        if (statusFilter !== 'all') {
            // This query requires a composite index on (status, createdAt desc)
            q = query(complaintsCol, where('status', '==', statusFilter), orderBy('createdAt', 'desc'), limit(100));
        } else {
            // This query requires an index on (createdAt desc)
            q = query(complaintsCol, orderBy('createdAt', 'desc'), limit(200));
        }

        const snapshot = await getDocs(q);

        const complaints = snapshot.docs.map(doc => {
            const data = doc.data();
            const createdAtTimestamp = data.createdAt as Timestamp;
            return {
                id: doc.id,
                ...data,
                createdAt: createdAtTimestamp ? createdAtTimestamp.toDate() : new Date(), // Convert to JS Date here
            } as Complaint;
        });

        return { success: true, complaints };
    } catch (error) {
        console.error("Error fetching complaints:", error);
        return { success: false, error: 'فشل جلب الشكاوى. قد تحتاج إلى إنشاء فهرس مركب في Firestore.' };
    }
}


export async function resolveComplaint(complaint: Complaint, resolution: 'approved' | 'rejected' | 'resolved', coins?: number, points?: number): Promise<{ success: boolean; error?: string }> {
    const complaintRef = doc(db, 'complaints', complaint.id);
    const userRef = doc(db, 'users', complaint.userId);

    try {
        await runTransaction(db, async (transaction) => {
             const userSnap = await transaction.get(userRef);
             if (!userSnap.exists()) throw new Error("المستخدم صاحب الشكوى لم يعد موجودًا.");
            
            if (resolution === 'approved' && complaint.type === 'missing_currency') {
                const updates: any = {};
                if (coins && coins > 0) updates.coins = increment(coins);
                if (points && points > 0) updates.leaderboardPoints = increment(points);
                
                if (Object.keys(updates).length > 0) {
                    transaction.update(userRef, updates);
                }
                
                await sendSystemMail(
                    complaint.userId,
                    {
                        subject: 'تم قبول شكواك',
                        body: `لقد وافق المشرف على شكواك بخصوص النقاط/الكوينز المفقودة وتم تعويضك بـ ${coins || 0} كوينز و ${points || 0} نقاط.`
                    },
                    transaction
                );
                 transaction.update(complaintRef, { status: resolution, resolvedAt: serverTimestamp() });
            }
             else if (resolution === 'rejected') {
                 await sendSystemMail(
                    complaint.userId,
                    {
                        subject: 'تم رفض شكواك',
                        body: `بعد المراجعة، قرر المشرف رفض شكواك بخصوص النقاط/الكوينز المفقودة.`
                    },
                    transaction
                );
                transaction.update(complaintRef, { status: resolution, resolvedAt: serverTimestamp() });

            }
             else if (resolution === 'resolved' && complaint.type === 'bug_report') {
                 await sendSystemMail(
                    complaint.userId,
                    {
                        subject: 'شكراً لتقريرك',
                        body: `لقد استلمنا تقريرك بخصوص المشكلة في اللعبة وسنعمل على حلها. شكراً لمساهمتك!`
                    },
                    transaction
                );
                 transaction.update(complaintRef, { status: resolution, resolvedAt: serverTimestamp() });
            }
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error resolving complaint:", error);
        return { success: false, error: error.message || 'فشل معالجة الشكوى.' };
    }
}
