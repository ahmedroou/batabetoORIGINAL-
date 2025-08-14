
'use server';

/**
 * @fileoverview Admin actions related to global and game-specific settings.
 */

import { db } from '@/lib/firebase';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    writeBatch,
    query,
    where,
    getDocs,
    arrayUnion,
    arrayRemove,
} from 'firebase/firestore';
import type { UserProfile, AvatarPrice, SocialRank, TrapQuestion } from '@/types';
import { DEFAULT_TRAP_ANSWER_CATEGORIES, DEFAULT_SOCIAL_RANKS, DEFAULT_EDUCATED_MERCHANT_CATEGORIES } from '@/types';
import { isFirebaseError } from '../helpers';

const normalize = (s: any) => (typeof s === 'string' ? s : String(s ?? '')).trim().replace(/\s+/g, ' ');
const stringNonEmpty = (s: any) => typeof s === 'string' && normalize(s).length > 0;

// -- Announcements --
export async function setAnnouncement(text: string) {
    try {
        const ref = doc(db, 'game_settings', 'announcement');
        await setDoc(ref, { text: normalize(text) });
        return { success: true };
    } catch (e) {
        console.error("Error setting announcement:", e);
        return { error: 'فشل حفظ الإعلان.' };
    }
}

export async function getAnnouncement() {
    try {
        const ref = doc(db, 'game_settings', 'announcement');
        const snap = await getDoc(ref);
        if (snap.exists()) return { success: true, text: snap.data().text || '' };
        return { success: true, text: '' };
    } catch (e) {
        console.error("Error getting announcement:", e);
        return { error: "فشل جلب الإعلان." };
    }
}

// -- Avatar Prices & Default --
export async function setAvatarPrices(prices: AvatarPrice[]) {
    try {
        const ref = doc(db, 'game_settings', 'avatar_prices');
        await setDoc(ref, { prices: prices || [] });
        return { success: true };
    } catch (e) {
        console.error("Error setting avatar prices:", e);
        return { success: false, error: "Failed to save avatar prices." };
    }
}

export async function getAvatarPrices() {
    try {
        const ref = doc(db, 'game_settings', 'avatar_prices');
        const snap = await getDoc(ref);
        if (snap.exists()) return { success: true, prices: (snap.data().prices || []) as AvatarPrice[] };
        return { success: true, prices: [] };
    } catch (e) {
        console.error("Error getting avatar prices:", e);
        return { success: false, error: 'Failed to fetch avatar prices.' };
    }
}

export async function setPunishmentAvatarPrices(prices: AvatarPrice[]) {
    try {
        const ref = doc(db, 'game_settings', 'punishment_avatar_prices');
        await setDoc(ref, { prices: prices || [] });
        return { success: true };
    } catch (e) {
        console.error("Error setting punishment avatar prices:", e);
        return { success: false, error: "Failed to save punishment avatar prices." };
    }
}

export async function getPunishmentAvatarPrices() {
    try {
        const ref = doc(db, 'game_settings', 'punishment_avatar_prices');
        const snap = await getDoc(ref);
        if (snap.exists()) return { success: true, prices: (snap.data().prices || []) as AvatarPrice[] };
        return { success: true, prices: [] };
    } catch (e) {
        console.error("Error getting punishment avatar prices:", e);
        return { success: false, error: 'Failed to fetch punishment avatar prices.' };
    }
}

export async function setDefaultAvatar(avatarId: string) {
    if (!stringNonEmpty(avatarId)) return { success: false, error: "Avatar ID is required." };

    const settingsRef = doc(db, 'game_settings', 'default_avatar');
    const pricesRef = doc(db, 'game_settings', 'avatar_prices');
    const batch = writeBatch(db);

    try {
        batch.set(settingsRef, { avatarId });

        const pricesSnap = await getDoc(pricesRef);
        if (pricesSnap.exists()) {
            const prices = ((pricesSnap.data().prices || []) as AvatarPrice[]).slice();
            const idx = prices.findIndex(p => p.avatarId === avatarId);
            if (idx !== -1) prices[idx].price = 0;
            else prices.push({ avatarId, price: 0, currency: 'coins' });
            batch.update(pricesRef, { prices });
        } else {
            batch.set(pricesRef, { prices: [{ avatarId, price: 0, currency: 'coins' }] });
        }
        
        await batch.commit();
        return { success: true };
    } catch (e) {
        console.error("Error setting default avatar:", e);
        return { success: false, error: "Failed to set default avatar." };
    }
}

export async function getDefaultAvatar() {
    try {
        const ref = doc(db, 'game_settings', 'default_avatar');
        const snap = await getDoc(ref);
        if (snap.exists()) return { success: true, avatarId: snap.data().avatarId as string };
        return { success: true, avatarId: 'Avatar00.png' };
    } catch (e) {
        console.error("Error getting default avatar:", e);
        return { success: false, error: 'Failed to fetch default avatar.' };
    }
}

// -- Social Ranks --
export async function setSocialRanks(ranks: SocialRank[]) {
    try {
        const ref = doc(db, 'game_settings', 'social_ranks');
        await setDoc(ref, { list: ranks || [] });
        return { success: true };
    } catch (e) {
        console.error("Error setting social ranks:", e);
        return { success: false, error: 'فشل حفظ الألقاب الاجتماعية.' };
    }
}

// -- Trap Answer Categories --
export async function getTrapAnswerCategories() {
    try {
        const ref = doc(db, 'game_settings', 'trap_answer_categories');
        const snap = await getDoc(ref);
        if (snap.exists() && snap.data().list?.length > 0) {
            return { success: true, categories: snap.data().list as string[] };
        }
        await setDoc(ref, { list: DEFAULT_TRAP_ANSWER_CATEGORIES });
        return { success: true, categories: DEFAULT_TRAP_ANSWER_CATEGORIES };
    } catch (e) {
        console.error("Error getting trap answer categories:", e);
        return { success: false, error: 'Failed to fetch trap answer categories.' };
    }
}

export async function addTrapAnswerCategory(category: string) {
    if (!stringNonEmpty(category)) return { error: 'اسم القسم غير صالح.' };
    try {
        const ref = doc(db, 'game_settings', 'trap_answer_categories');
        await updateDoc(ref, { list: arrayUnion(normalize(category)) });
        return { success: true };
    } catch (e: any) {
        if (isFirebaseError(e) && e.code === 'not-found') {
            await setDoc(doc(db, 'game_settings', 'trap_answer_categories'), { list: [normalize(category)] });
            return { success: true };
        }
        console.error("Error adding trap answer category:", e);
        return { success: false, error: 'Failed to add trap answer category.' };
    }
}

export async function editTrapAnswerCategory(oldCategory: string, newCategory: string) {
    if (!stringNonEmpty(oldCategory) || !stringNonEmpty(newCategory)) return { error: 'الاسم القديم والجديد مطلوبان.' };
    if (normalize(oldCategory) === normalize(newCategory)) return { error: 'الاسم الجديد يجب أن يختلف عن القديم.' };

    const settingsRef = doc(db, 'game_settings', 'trap_answer_categories');
    const batch = writeBatch(db);

    try {
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) throw new Error("مستند إعدادات الأقسام غير موجود.");

        const categories: string[] = settingsSnap.data().list || [];
        if (!categories.includes(oldCategory)) return { error: 'القسم القديم غير موجود.' };
        if (categories.includes(normalize(newCategory))) return { error: 'الاسم الجديد للقسم موجود بالفعل.' };

        const updated = categories.map(c => c === oldCategory ? normalize(newCategory) : c);
        batch.update(settingsRef, { list: updated });

        const qRef = query(collection(db, 'trap_answer_questions'), where('category', '==', oldCategory));
        const qs = await getDocs(qRef);
        qs.forEach(d => batch.update(d.ref, { category: normalize(newCategory) }));

        await batch.commit();
        return { success: true };
    } catch (e) {
        console.error("Error editing category:", e);
        return { success: false, error: 'فشل تعديل قسم الجواب المفخخ.' };
    }
}

export async function deleteTrapAnswerCategory(categoryToDelete: string) {
    if (!stringNonEmpty(categoryToDelete)) return { error: 'يجب تحديد قسم للحذف.' };
    
    const settingsRef = doc(db, 'game_settings', 'trap_answer_categories');
    const batch = writeBatch(db);

    try {
        const snap = await getDoc(settingsRef);
        if (!snap.exists()) throw new Error("مستند إعدادات الأقسام غير موجود.");
        const categories: string[] = snap.data().list || [];
        if (categories.length <= 1) return { error: "لا يمكن حذف آخر قسم متبقٍ." };
        if (!categories.includes(categoryToDelete)) return { error: "القسم المحدد غير موجود." };

        batch.update(settingsRef, { list: arrayRemove(categoryToDelete) });
        const qRef = query(collection(db, 'trap_answer_questions'), where("category", "==", categoryToDelete));
        const qs = await getDocs(qRef);
        qs.forEach(doc => batch.delete(doc.ref));

        await batch.commit();
        return { success: true, count: qs.size };
    } catch (error) {
        console.error("Error deleting category:", error);
        return { success: false, error: 'فشل حذف القسم والأسئلة المرتبطة به.' };
    }
}

// -- Educated Merchant Categories --
export async function getEducatedMerchantCategories() {
    try {
        const ref = doc(db, 'game_settings', 'educated_merchant_categories');
        const snap = await getDoc(ref);
        if (snap.exists() && snap.data().list?.length > 0) {
            return { success: true, categories: snap.data().list as string[] };
        }
        await setDoc(ref, { list: DEFAULT_EDUCATED_MERCHANT_CATEGORIES });
        return { success: true, categories: DEFAULT_EDUCATED_MERCHANT_CATEGORIES };
    } catch (e) {
        console.error("Error getting educated merchant categories:", e);
        return { success: false, error: 'Failed to fetch educated merchant categories.' };
    }
}

export async function addEducatedMerchantCategory(category: string) {
    if (!stringNonEmpty(category)) return { error: 'اسم القسم غير صالح.' };
    try {
        const ref = doc(db, 'game_settings', 'educated_merchant_categories');
        await updateDoc(ref, { list: arrayUnion(normalize(category)) });
        return { success: true };
    } catch (e: any) {
        if (isFirebaseError(e) && e.code === 'not-found') {
            await setDoc(doc(db, 'game_settings', 'educated_merchant_categories'), { list: [normalize(category)] });
            return { success: true };
        }
        console.error("Error adding educated merchant category:", e);
        return { success: false, error: 'Failed to add educated merchant category.' };
    }
}

export async function editEducatedMerchantCategory(oldCategory: string, newCategory: string) {
    if (!stringNonEmpty(oldCategory) || !stringNonEmpty(newCategory)) return { error: 'الاسم القديم والجديد مطلوبان.' };
    if (normalize(oldCategory) === normalize(newCategory)) return { error: 'الاسم الجديد يجب أن يختلف عن القديم.' };

    const settingsRef = doc(db, 'game_settings', 'educated_merchant_categories');
    const batch = writeBatch(db);

    try {
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) throw new Error('مستند إعدادات الأقسام غير موجود.');

        const categories: string[] = settingsSnap.data().list || [];
        if (!categories.includes(oldCategory)) return { error: 'القسم القديم غير موجود.' };
        if (categories.includes(normalize(newCategory))) return { error: 'الاسم الجديد للقسم موجود بالفعل.' };

        const updated = categories.map(c => c === oldCategory ? normalize(newCategory) : c);
        batch.update(settingsRef, { list: updated });

        const qRef = query(collection(db, 'educated_merchant_questions'), where('category', '==', oldCategory));
        const qs = await getDocs(qRef);
        qs.forEach(d => batch.update(d.ref, { category: normalize(newCategory) }));

        await batch.commit();
        return { success: true };
    } catch (e) {
        console.error("Error editing category:", e);
        return { success: false, error: 'فشل تعديل قسم التاجر المتعلم.' };
    }
}

export async function deleteEducatedMerchantCategory(categoryToDelete: string) {
    if (!stringNonEmpty(categoryToDelete)) return { error: 'يجب تحديد قسم للحذف.' };
    
    const settingsRef = doc(db, 'game_settings', 'educated_merchant_categories');
    const batch = writeBatch(db);

    try {
        const snap = await getDoc(settingsRef);
        if (!snap.exists()) throw new Error('مستند إعدادات الأقسام غير موجود.');
        const categories: string[] = snap.data().list || [];
        if (categories.length <= 1) return { error: "لا يمكن حذف آخر قسم متبقٍ." };
        if (!categories.includes(categoryToDelete)) return { error: "القسم المحدد غير موجود." };

        batch.update(settingsRef, { list: arrayRemove(categoryToDelete) });
        const qRef = query(collection(db, 'educated_merchant_questions'), where("category", "==", categoryToDelete));
        const qs = await getDocs(qRef);
        qs.forEach(doc => batch.delete(doc.ref));

        await batch.commit();
        return { success: true, count: qs.size };
    } catch (error) {
        console.error("Error deleting category:", error);
        return { success: false, error: 'فشل حذف قسم التاجر المتعلم والأسئلة المرتبطة به.' };
    }
}

export async function addPermissionToRank(rankName: string, permissionId: string): Promise<{ success: boolean, error?: string }> {
    if (!stringNonEmpty(rankName) || !stringNonEmpty(permissionId)) {
        return { success: false, error: 'اسم الرتبة والصلاحية مطلوبان.' };
    }
    
    const ref = doc(db, 'game_settings', 'social_ranks');
    try {
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error('مستند الألقاب غير موجود.');

        const ranks: SocialRank[] = snap.data().list || [];
        const rankIndex = ranks.findIndex(r => r.name === rankName);
        if (rankIndex === -1) throw new Error('لم يتم العثور على الرتبة المحددة.');

        const rank = ranks[rankIndex];
        if (!rank.permissions) rank.permissions = [];
        if (rank.permissions.includes(permissionId as any)) return { success: true }; // Already exists

        rank.permissions.push(permissionId as any);
        ranks[rankIndex] = rank;
        
        await updateDoc(ref, { list: ranks });
        return { success: true };
    } catch (e: any) {
        console.error('Error adding permission to rank:', e);
        return { success: false, error: e.message };
    }
}

export async function removePermissionFromRank(rankName: string, permissionId: string): Promise<{ success: boolean, error?: string }> {
    if (!stringNonEmpty(rankName) || !stringNonEmpty(permissionId)) {
        return { success: false, error: 'اسم الرتبة والصلاحية مطلوبان.' };
    }

    const ref = doc(db, 'game_settings', 'social_ranks');
    try {
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error('مستند الألقاب غير موجود.');

        const ranks: SocialRank[] = snap.data().list || [];
        const rankIndex = ranks.findIndex(r => r.name === rankName);
        if (rankIndex === -1) throw new Error('لم يتم العثور على الرتبة المحددة.');

        const rank = ranks[rankIndex];
        if (!rank.permissions) return { success: true }; // Nothing to remove

        rank.permissions = rank.permissions.filter(p => p !== permissionId);
        ranks[rankIndex] = rank;

        await updateDoc(ref, { list: ranks });
        return { success: true };
    } catch (e: any) {
        console.error('Error removing permission from rank:', e);
        return { success: false, error: e.message };
    }
}
