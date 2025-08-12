
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
    increment
} from 'firebase/firestore';
import type { Complaint, Game } from '@/types';
import { sendSystemMail } from './user/mail';


export async function submitComplaint(data: Omit<Complaint, 'id' | 'status' | 'createdAt'>): Promise<{ success: boolean; error?: string }> {
    try {
        await addDoc(collection(db, 'complaints'), {
            ...data,
            status: 'pending',
            createdAt: serverTimestamp(),
        });
        return { success: true };
    } catch (error) {
        console.error("Error submitting complaint:", error);
        return { success: false, error: 'فشل إرسال الشكوى.' };
    }
}

export async function getComplaints(): Promise<{ success: boolean; complaints?: Complaint[]; error?: string }> {
    try {
        const complaintsCol = collection(db, 'complaints');
        const q = query(complaintsCol, where('status', '==', 'pending'), orderBy('createdAt', 'asc'));
        const snapshot = await getDocs(q);

        const complaints = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: (data.createdAt as Timestamp) || Timestamp.now(),
            } as Complaint;
        });

        return { success: true, complaints };
    } catch (error) {
        console.error("Error fetching complaints:", error);
        return { success: false, error: 'فشل جلب الشكاوى.' };
    }
}

export async function resolveComplaint(complaint: Complaint, resolution: 'approved' | 'rejected' | 'resolved', coins?: number, points?: number): Promise<{ success: boolean; error?: string }> {
    const complaintRef = doc(db, 'complaints', complaint.id);
    const userRef = doc(db, 'users', complaint.userId);

    try {
        await runTransaction(db, async (transaction) => {
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
            }
            // After handling, delete the complaint
            transaction.delete(complaintRef);
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error resolving complaint:", error);
        return { success: false, error: error.message || 'فشل معالجة الشكوى.' };
    }
}
