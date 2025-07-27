

/**
 * @fileoverview This file contains helper functions shared across game action modules.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import type { Player, UserProfile, TrapQuestion } from '@/types';
import { AVATAR_IDS } from '@/data/avatars';

export function isFirebaseError(err: unknown): err is { code: string; message: string } {
    return typeof err === 'object' && err !== null && 'code' in err && 'message' in err;
}

export async function getPlayerFromUserId(userId: string): Promise<Pick<UserProfile, 'name' | 'leaderboardPoints' | 'id'>> {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
       throw new Error(`لم يتم العثور على ملف تعريف للمستخدم بالمعرف: ${userId}. تأكد من أن المستخدم قد أكمل التسجيل.`);
    }
    
    const userData = userDoc.data() as UserProfile;
    return {
        id: userId,
        name: userData.name || 'لاعب غير معروف',
        leaderboardPoints: userData.leaderboardPoints || 0,
    };
}

export function generateGameId(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  let id = '';
  for (let i = 0; i < 3; i++) {
    id += letters.charAt(Math.floor(Math.random() * letters.length));
    id += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  return id;
}

export function generateLeagueId(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  let id = '';
  for (let i = 0; i < 3; i++) {
    id += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  for (let i = 0; i < 3; i++) {
    id += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  return id;
}


export async function getShuffledQuestions(category: string, count: number): Promise<TrapQuestion[]> {
    const q = query(collection(db, "trap_answer_questions"), where("category", "==", category));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.docs.length < count) {
        throw new Error(`لا يوجد أسئلة كافية في قسم "${category}".`);
    }

    const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<TrapQuestion, 'id'> }));
    
    // Simple shuffle
    for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
    }

    return questions.slice(0, count);
}
