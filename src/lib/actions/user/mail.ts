
'use server';

import { db } from '@/lib/firebase';
import { doc, serverTimestamp, collection, query, getDocs, orderBy, getDoc, where, increment, runTransaction, updateDoc, Timestamp, writeBatch, type Transaction } from 'firebase/firestore';
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
        expiresAt: Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000),
    };

    if (transaction) {
        transaction.set(mailRef, mailData);
    } else {
        await setDoc(mailRef, mailData);
    }
}
