

/**
 * @fileoverview This file contains helper functions shared across game action modules.
 */

import { db } from '@/lib/firebase';
import { getDoc, doc, type Transaction } from 'firebase/firestore';
import type { Player, UserProfile } from '@/types';

export function shuffle<T>(array: T[]): T[] {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}


export function isFirebaseError(err: unknown): err is { code: string; message: string } {
    return typeof err === 'object' && err !== null && 'code' in err && 'message' in err;
}


export function generateGameId(): string {
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

function diceCoefficient(s1: string, s2: string): number {
    if (!s1 || !s2) return 0;
    const pairs = (str: string) => {
        const p = new Set<string>();
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

export function safeCompareStrings(a: string, b: string): number {
    try {
        if (typeof a !== 'string' || typeof b !== 'string' || !a.trim() || !b.trim()) {
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
        
        return diceCoefficient(s1_norm, s2_norm);

    } catch (e) {
        console.error("Error in safeCompareStrings:", e, {a, b});
        return 0;
    }
}
