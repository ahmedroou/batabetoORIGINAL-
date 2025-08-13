

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

const normalizeForSignature = (s: string): string => {
    return s
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()؟?،؛]/g, "")
        .replace(/[\u064B-\u065F\u0670]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/[يى]/g, "ي")
        .replace(/[ة]/g, "ه")
        .replace(/\s+/g, ' ')
        .trim();
};

export function getSimilaritySignature(text: string): string {
    try {
        if (typeof text !== 'string' || !text.trim()) {
            return '';
        }
        const normalized = normalizeForSignature(text);
        // Sort words alphabetically to handle different word orders
        const words = normalized.split(' ').sort();
        return words.join(' ');
    } catch (e) {
        console.error("Error generating similarity signature:", e, { text });
        return text; // Fallback to the original text
    }
}
