
'use server';

/**
 * @file Trap Answer — Game Flow Logic
 * @version 4.0
 * @overview Manages the main state transitions of the game, such as starting a new round or ending the game.
 */

import { db } from '@/lib/firebase';
import { doc, runTransaction, Timestamp, deleteField } from 'firebase/firestore';
import type { Game, TrapQuestion } from '@/types';
import { isFirebaseError, safeCompareStrings, shuffle } from '../helpers';
import { getActivePlayers, tsFromNowS } from '../helpers';

// -----------------------------------------------------------------------------
// Constants & small helpers
// -----------------------------------------------------------------------------
const SIMILARITY_THRESHOLD = 0.75 as const;
const SIMILARITY_BLOCK = 0.95 as const; // block traps/dummies too similar to the real answer
const CATEGORY_SELECTION_TIME_S = 30 as const;
const DEFAULT_TRAP_TIME_S = 35;
const DEFAULT_GUESSING_TIME_S = 25;
const DEFAULT_RESULTS_TIME_S = 90;
const FIELD_TRAP_STATE = 'trapAnswerState' as const;
const TIMEOUT_TOKEN = '__TIMEOUT__' as const;

const nowMs = () => Date.now();
const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
const ensure: (cond: any, msg: string) => asserts cond = (cond, msg) => { if (!cond) throw new Error(msg); };


const requireHost = (game: Game, hostId: string) => {
  ensure(game.hostId === hostId, 'فقط المضيف يستطيع تنفيذ هذا الإجراء.');
};

const requireState = (game: Game, expected: Game['gameState']) => {
  ensure(game.gameState === expected, `الحالة الحالية لا تسمح بهذا الإجراء (الحالة: ${game.gameState}).`);
};

// A minimal transaction typing to avoid importing internal SDK types
export type FirebaseFirestoreLikeTransaction = {
  get: (ref: any) => Promise<any>;
  update: (ref: any, data: any) => void;
};


// -----------------------------------------------------------------------------
// Core Flow
// -----------------------------------------------------------------------------
export async function nextTrapAnswerRound(gameId: string, hostId: string) {
    const gameRef = doc(db, 'games', gameId);

    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(gameRef);
            ensure(snap.exists(), 'اللعبة غير موجودة.');
            const game = snap.data() as Game;
            requireHost(game, hostId);
            if(game.gameState !== 'round-results') return;

            const currentRound = game.round || 0;
            const totalRounds = (game as any)[FIELD_TRAP_STATE]?.settings?.rounds || 10;

            if (currentRound >= totalRounds) {
                // Game Over
                 tx.update(gameRef, {
                    gameState: 'final_results',
                    [`${FIELD_TRAP_STATE}.timerEndsAt`]: deleteField(),
                });
            } else {
                // Next Round
                const nextTurnIndex = (((game as any)[FIELD_TRAP_STATE]?.currentTurnIndex || 0) + 1) % game.players.length;
                const availableCategories = (game as any)[FIELD_TRAP_STATE]?.settings?.categories || [];
                 const sourceCats: string[] = Array.isArray(availableCategories) && availableCategories.length > 0
                    ? availableCategories
                    : (((game as any)[FIELD_TRAP_STATE]?.fiveRandomCategories as string[]) || []);

                const fiveRandomCategories = shuffle([...sourceCats]).slice(0, 5);

                tx.update(gameRef, {
                    gameState: 'category-selection',
                    round: currentRound + 1,
                    [`${FIELD_TRAP_STATE}.currentTurnIndex`]: nextTurnIndex,
                    [`${FIELD_TRAP_STATE}.fiveRandomCategories`]: fiveRandomCategories,
                    [`${FIELD_TRAP_STATE}.playerAnswers`]: {},
                    [`${FIELD_TRAP_STATE}.playerGuesses`]: {},
                    [`${FIELD_TRAP_STATE}.lastRoundResults`]: {},
                    [`${FIELD_TRAP_STATE}.selectedCategory`]: deleteField(),
                    [`${FIELD_TRAP_STATE}.currentQuestion`]: deleteField(),
                    [`${FIELD_TRAP_STATE}.timerEndsAt`]: tsFromNowS(CATEGORY_SELECTION_TIME_S),
                    [`${FIELD_TRAP_STATE}.shuffledAnswers`]: [],
                    [`${FIELD_TRAP_STATE}.awayPlayerIds`]: [],
                });
            }
        });
    } catch (error) {
        console.error('Error in nextTrapAnswerRound:', error);
    }
}


export async function handleTimeout(gameId: string, hostId: string) {
  const gameRef = doc(db, 'games', gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;

    const game = snap.data() as Game;
    const timerEndsAt = (game as any)[FIELD_TRAP_STATE]?.timerEndsAt as Timestamp | undefined;
    if (!timerEndsAt || timerEndsAt.toMillis() > nowMs()) return;

    if (game.hostId !== hostId) return;

    tx.update(gameRef, { [`${FIELD_TRAP_STATE}.timerEndsAt`]: deleteField() });

    if (game.gameState === 'category-selection') {
      const categories: string[] = (game as any)[FIELD_TRAP_STATE]?.fiveRandomCategories || [];
      if (!Array.isArray(categories) || categories.length === 0) return;
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      tx.update(gameRef, {
        [`${FIELD_TRAP_STATE}.selectedCategory`]: randomCategory
      });
    } else if (game.gameState === 'answer-submission') {
      // Logic to advance to guessing
    } else if (game.gameState === 'guessing') {
      // Logic to advance to results
    }
  });
}
