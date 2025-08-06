
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

export async function exchangeCoinsForHonor(userId: string, coinsToExchange: number): Promise<{ success: boolean; error?: string }> {
    if (coinsToExchange <= 0) {
        return { success: false, error: "يجب أن يكون عدد الكوينز أكبر من صفر." };
    }
    const HONOR_RATE = 3; // 1 coin = 3 honor points
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
