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
import type { Player } from '@/types';
import { AVATAR_IDS } from '@/data/avatars';

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

export function getPlayerNumberMap(players: Player[]): Record<string, string> {
    const playerMap: Record<string, string> = {};
    const playersToNumber = players.filter(p => p.role !== 'detective');
    const sortedPlayers = [...playersToNumber].sort((a, b) => a.id.localeCompare(b.id));
    
    sortedPlayers.forEach((p, index) => {
        playerMap[p.id] = `لاعب ${index + 1}`;
    });
    return playerMap;
}