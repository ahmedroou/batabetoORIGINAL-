

/**
 * @fileoverview This file contains helper functions shared across game action modules.
 */

import { db } from '@/lib/firebase';
import { getDoc, doc, type Transaction, collection, query, where, getDocs } from 'firebase/firestore';
import type { Player, UserProfile, SnakesAndScissorsQuestion } from '@/types';

export function isFirebaseError(err: unknown): err is { code: string; message: string } {
    return typeof err === 'object' && err !== null && 'code' in err && 'message' in err;
}

/**
 * A higher-order function to wrap server actions that require admin privileges.
 * It checks for admin status before executing the action.
 * @param action The admin-only server action to execute.
 * @returns A new function that performs the auth check before running the action.
 */
export function withAdminAuth<T extends any[], R>(
  action: (adminId: string, ...args: T) => Promise<R>
): (adminId: string | undefined | null, ...args: T) => Promise<R> {
  return async (adminId, ...args) => {
    if (!adminId) {
      throw new Error("User is not authenticated.");
    }

    const adminRef = doc(db, 'users', adminId);
    const adminDoc = await getDoc(adminRef);

    if (!adminDoc.exists() || !adminDoc.data()?.isAdmin) {
      throw new Error("Unauthorized: You do not have permission to perform this action.");
    }
    
    // If authorized, execute the original action.
    return action(adminId, ...args);
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

export function getPlayerNumberMap(players: Player[]): Record<string, string> {
    const playerMap: Record<string, string> = {};
    const playersToNumber = players.filter(p => p.role !== 'detective');
    const sortedPlayers = [...playersToNumber].sort((a, b) => a.id.localeCompare(b.id));
    
    sortedPlayers.forEach((p, index) => {
        playerMap[p.id] = `لاعب ${index + 1}`;
    });
    return playerMap;
}

export function safeCompareStrings(a: string, b: string): number {
    try {
        if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) {
            return 0;
        }

        const normalize = (s: string) => {
            return s
                .toLowerCase()
                // Remove punctuation (including Arabic punctuation like ؟ ، ؛)
                .replace(/[.,/#!$%^&*;:{}=\-_`~()؟?،؛]/g, "")
                // Remove Arabic diacritics (Tashkeel)
                .replace(/[\u064B-\u065F\u0670]/g, "")
                // Normalize specific Arabic characters
                .replace(/[أإآ]/g, "ا")
                .replace(/[يى]/g, "ي")
                .replace(/[ة]/g, "ه")
                .replace(/\s+/g, ' ')
                .trim();
        };

        const s1_norm = normalize(a);
        const s2_norm = normalize(b);

        if (s1_norm === s2_norm) return 1.0;
        
        const isNumeric1 = /^-?\d+(\.\d+)?$/.test(s1_norm);
        const isNumeric2 = /^-?\d+(\.\d+)?$/.test(s2_norm);

        if (isNumeric1 && isNumeric2) {
            return s1_norm === s2_norm ? 1.0 : 0.0;
        }
        
        if (isNumeric1 || isNumeric2) {
            return 0.0;
        }


        const diceCoefficient = (s1: string, s2: string): number => {
            const pairs = (str: string) => {
                const p = new Set<string>();
                if (!str) return p;
                for (let i = 0; i < str.length - 1; i++) {
                    p.add(str.substring(i, i + 2));
                }
                return p;
            };
            const s1_pairs = pairs(s1);
            const s2_pairs = pairs(s2);

            if (s1_pairs.size === 0 && s2_pairs.size === 0) return 1.0;
            if (s1_pairs.size === 0 || s2_pairs.size === 0) return 0;
            
            const intersection = new Set([...s1_pairs].filter(x => s2_pairs.has(x)));
            return (2.0 * intersection.size) / (s1_pairs.size + s2_pairs.size);
        };
        
        const jaroWinkler = (s1: string, s2: string): number => {
            let m = 0;
            const range = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
            const s1Matches = new Array(s1.length).fill(false);
            const s2Matches = new Array(s2.length).fill(false);

            for (let i = 0; i < s1.length; i++) {
                const low = Math.max(0, i - range);
                const high = Math.min(s2.length, i + range + 1);
                for (let j = low; j < high; j++) {
                    if (!s2Matches[j] && s1[i] === s2[j]) {
                        s1Matches[i] = true;
                        s2Matches[j] = true;
                        m++;
                        break;
                    }
                }
            }
            if (m === 0) return 0.0;

            let t = 0;
            let k = 0;
            for (let i = 0; i < s1.length; i++) {
                if (s1Matches[i]) {
                    while (!s2Matches[k]) k++;
                    if (s1[i] !== s2[k]) t++;
                    k++;
                }
            }
            t /= 2;

            const jaro = ((m / s1.length) + (m / s2.length) + ((m - t) / m)) / 3;

            let p = 0.1;
            let l = 0;
            while(l < 4 && s1[l] === s2[l]) l++;

            return jaro + l * p * (1 - jaro);
        };
        
        const diceScore = diceCoefficient(s1_norm, s2_norm);
        const jwScore = jaroWinkler(s1_norm, s2_norm);
        
        const hybridScore = (diceScore * 0.6) + (jwScore * 0.4);

        return Math.min(1.0, hybridScore);
    } catch (e) {
        console.error("Error in safeCompareStrings:", e, {a, b});
        return 0;
    }
}


function shuffle<T>(array: T[]): T[] {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}


export async function getShuffledQuestions(gameType: 'smart-merchant', category: string, count: number): Promise<SnakesAndScissorsQuestion[]> {
    const collectionName = 'snakes_and_scissors_questions';
    
    const q = query(collection(db, collectionName), where("category", "==", category));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.docs.length < count) {
        console.warn(`Not enough questions in category "${category}" for game "${gameType}". Found ${querySnapshot.docs.length}, needed ${count}.`);
        // To prevent crash, fetch from all categories as a fallback
        const fallbackSnapshot = await getDocs(collection(db, collectionName));
         if (fallbackSnapshot.docs.length < count) {
            throw new Error(`لا يوجد أسئلة كافية في اللعبة بأكملها.`);
         }
         const fallbackQuestions = fallbackSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
         const shuffledFallback = shuffle(fallbackQuestions);
         return shuffledFallback.slice(0, count);
    }

    const questions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    
    const shuffled = shuffle(questions);

    return shuffled.slice(0, count);
}
