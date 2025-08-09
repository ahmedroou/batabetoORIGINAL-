

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

export async function exchangeCoinsForLoyalty(userId: string, coinsToExchange: number): Promise<{ success: boolean; error?: string }> {
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
            throw new Error("ليس لديك ما يكفي من الكوينز.");
        }

        transaction.update(userRef, {
            coins: increment(-coinsToExchange),
            loyaltyPoints: increment(loyaltyToGain)
        });

        return { success: true };
    }).catch((error: any) => {
        return { success: false, error: error.message };
    });
}
