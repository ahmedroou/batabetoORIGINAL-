
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
import type { Player, ScoreMatrix } from '@/types';
import { AVATAR_IDS } from '@/data/avatars';

export const TOTAL_ROUNDS_WHO_AM_I = 15;

export function isFirebaseError(err: unknown): err is { code: string; message: string } {
    return typeof err === 'object' && err !== null && 'code' in err && 'message' in err;
}

export async function getPlayerFromUserId(userId: string): Promise<Omit<Player, 'avatarId' | 'status'>> {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
       throw new Error(`لم يتم العثور على ملف تعريف للمستخدم بالمعرف: ${userId}. تأكد من أن المستخدم قد أكمل التسجيل.`);
    }
    
    const userData = userDoc.data();
    return {
        id: userId,
        name: userData.name || 'لاعب غير معروف',
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

export function getNextAvailableAvatar(players: Player[]): string {
  const usedAvatars = new Set(players.map(p => p.avatarId));
  const availableAvatar = AVATAR_IDS.find(id => !usedAvatars.has(id));
  return availableAvatar || AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}

export async function getShuffledQuestions(category: string, count: number): Promise<string[]> {
    const questionsQuery = query(collection(db, 'questions'), where("category", "==", category));
    const questionsSnapshot = await getDocs(questionsQuery);

    let questions: string[] = [];
    if (questionsSnapshot.empty) {
        console.warn(`No questions found for category: ${category}.`);
    } else {
        questions = questionsSnapshot.docs.map(doc => doc.data().text as string);
    }
    
    const shuffled = [...questions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

export function initializeScoreMatrix(players: Player[]): ScoreMatrix {
    const matrix: ScoreMatrix = {};
    for (const player of players) {
        matrix[player.id] = {};
        for (const otherPlayer of players) {
            if (player.id !== otherPlayer.id) {
                matrix[player.id][otherPlayer.id] = 0;
            }
        }
    }
    return matrix;
}

export function getPlayerNumberMap(players: Player[]): Record<string, string> {
    const playerMap: Record<string, string> = {};
    const playersToNumber = players.filter(p => p.role !== 'detective');
    const sortedPlayers = [...playersToNumber].sort((a, b) => a.id.localeCompare(b.id));
    
    sortedPlayers.forEach((p, index) => {
        playerMap[p.id] = `لاعب ${index + 1}`;
    });
    return playerMap;
}
