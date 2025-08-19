/**
 * @fileoverview Shared helper utilities used across game action modules.
 *
 * ✔️ Preserves existing API/signatures
 *    - shuffle, isFirebaseError, generateGameId, generateLeagueId,
 *      getPlayerNumberMap, getSimilaritySignature, safeCompareStrings
 * ✔️ Unbiased randomness (rejection sampling) + crypto when available
 * ✔️ Better Arabic normalization for text signatures
 * ✔️ Zero unused imports & tighter types
 */

import type { Timestamp } from "firebase/firestore";
import type { Game, Player } from '@/types';

// ---------------------------------------------------------------------------
// Random utilities
// ---------------------------------------------------------------------------

/**
 * Return an unbiased cryptographically-strong random integer in [0, maxExclusive).
 * Falls back to Math.random if crypto is unavailable.
 */
export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0;
  const max = Math.floor(maxExclusive);
  const g = (globalThis as any)?.crypto;
  if (g?.getRandomValues) {
    // Rejection sampling to avoid modulo bias
    const buf = new Uint32Array(1);
    const range = 0x100000000; // 2^32
    const lim = range - (range % max);
    let x = 0;
    do {
      g.getRandomValues(buf);
      x = buf[0] >>> 0;
    } while (x >= lim);
    return x % max;
  }
  return Math.floor(Math.random() * max);
}

/** Fisher–Yates (Durstenfeld) shuffle using secureRandomInt when possible. */
export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    if (j !== i) [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/** Get a random character from a given alphabet. */
function pickRandomChar(alphabet: string): string {
  return alphabet.charAt(secureRandomInt(alphabet.length));
}

/**
 * Generic ID generator: N letters + M digits (uppercased).
 * Example output: ABC123
 */
export function generateId(lettersCount = 3, digitsCount = 3): string {
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const DIGITS = '0123456789';
  let out = '';
  for (let i = 0; i < lettersCount; i++) out += pickRandomChar(LETTERS);
  for (let i = 0; i < digitsCount; i++) out += pickRandomChar(DIGITS);
  return out;
}

/** Back-compat helpers kept as-is for external callers. */
export function generateGameId(): string { return generateId(3, 3); }
export function generateLeagueId(): string { return generateId(3, 3); }

/** Normalize a code (e.g. room ID) to [A–Z0–9], max 6 chars. */
export function normalizeCodeId(value: string, maxLen = 6): string {
  return (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// Error type guards
// ---------------------------------------------------------------------------
export interface FirebaseErrorLike { code: string; message: string }

export function isFirebaseError(err: unknown): err is FirebaseErrorLike {
  return !!err && typeof err === 'object'
    && typeof (err as any).code === 'string'
    && typeof (err as any).message === 'string';
}

// ---------------------------------------------------------------------------
// Players helpers
// ---------------------------------------------------------------------------

/**
 * Maps player.id → "لاعب N" excluding specific roles (defaults to detective).
 * Sorting by id is preserved to keep the original numbering logic stable.
 */
export function getPlayerNumberMap(
  players: Player[],
  excludedRoles: Array<Player['role'] | undefined> = ['detective']
): Record<string, string> {
  const playerMap: Record<string, string> = {};
  const filtered = (players || []).filter(p => !excludedRoles.includes((p as any).role));
  const sorted = [...filtered].sort((a, b) => a.id.localeCompare(b.id));
  sorted.forEach((p, i) => { playerMap[p.id] = `لاعب ${i + 1}`; });
  return playerMap;
}

/**
 * Returns an array of active players.
 * Kept here to centralize the definition used across server/client: status !== 'left'
 */
export const getActivePlayers = (game: Game): Player[] => {
  const list = Array.isArray(game?.players) ? game.players : [];
  return list.filter((player) => player.status !== 'left');
};

// ---------------------------------------------------------------------------
// Text normalization & similarity
// ---------------------------------------------------------------------------

/** Remove common Arabic diacritics (tashkeel + superscript alif). */
const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670]/g; // tashkeel + superscript alif
/** Remove common punctuation (Arabic & Latin; extended). */
const PUNCTUATION = /[.,\/#!$%\^&*;:{}=\-_`~()؟?!،؛\[\]\\"“”‘’'«»‹›<>+|]/g;
/** Tatweel/kashida. */
const TATWEEL = /\u0640/g;
/** Arabic-Indic and Eastern Arabic-Indic digits. */
const ARABIC_INDIC = /[٠-٩]/g;
const EASTERN_ARABIC_INDIC = /[۰-۹]/g;

function toWesternDigits(s: string): string {
  const ar = '٠١٢٣٤٥٦٧٨٩';
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  return s
    .replace(ARABIC_INDIC, (d) => String(ar.indexOf(d)))
    .replace(EASTERN_ARABIC_INDIC, (d) => String(fa.indexOf(d)));
}

/**
 * Normalize Arabic text for signature comparison:
 * - NFKD normalize + strip combining marks
 * - lowercases
 * - strips punctuation & tatweel
 * - removes Arabic diacritics
 * - unifies digits to Western 0–9
 * - unifies Alef forms (أإآ → ا)
 * - unifies Yeh/Alef Maqsura (ي/ى → ي)
 * - Ta Marbuta → ه
 * - collapses whitespace
 */
export function normalizeForSignature(s: string): string {
  const base = (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, ''); // strip common combining marks
  return toWesternDigits(
    base
      .toLowerCase()
      .replace(PUNCTUATION, ' ')
      .replace(TATWEEL, '')
      .replace(ARABIC_DIACRITICS, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/[يى]/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Produce a stable signature string by sorting normalized words.
 * Useful for fuzzy matching answers regardless of order/diacritics.
 */
export function getSimilaritySignature(text: string): string {
  try {
    if (typeof text !== 'string' || !text.trim()) return '';
    const normalized = normalizeForSignature(text);
    if (!normalized) return '';
    const words = normalized.split(' ').filter(Boolean).sort();
    return words.join(' ');
  } catch (e) {
    console.error('Error generating similarity signature:', e, { text });
    return text || '';
  }
}

/** Simple token-set Jaccard similarity as a lightweight fallback. */
function jaccardSimilarity(a: string, b: string): number {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const denom = A.size + B.size - inter;
  return inter / (denom || 1);
}

/**
 * Client-safe comparator. Tries `string-similarity` if available, otherwise
 * falls back to a deterministic token-based similarity.
 * Returns 0..1 where 1 means perfect match.
 */
export function safeCompareStrings(str1: string, str2: string): number {
  const a = normalizeForSignature(str1);
  const b = normalizeForSignature(str2);
  if (!a || !b) return 0;

  try {
    // Avoid touching `require` in environments where it's undefined
    // to keep client bundles happy.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const r: any = (typeof require !== 'undefined') ? require : null;
    if (r) {
      const mod = r('string-similarity');
      if (mod && typeof mod.compareTwoStrings === 'function') {
        return mod.compareTwoStrings(a, b) as number;
      }
    }
  } catch {
    // noop – fallback below
  }
  return jaccardSimilarity(a, b);
}

/**
 * Gets a Timestamp from a given number of seconds in the future.
 * @param seconds The number of seconds from now.
 */
export const tsFromNowS = (seconds: number): Timestamp => {
  return Timestamp.fromMillis(Date.now() + seconds * 1000);
};

/**
 * Checks if a user is rate-limited for a specific action. Throws an error if they are.
 * Updates the timestamp for the action if they are not rate-limited.
 * @param tx The Firestore transaction.
 * @param userRef The reference to the user document.
 * @param actionType A unique key for the action (e.g., 'submit_complaint').
 * @param limitSeconds The cooldown period in seconds.
 */
export async function checkRateLimit(
  tx: FirebaseFirestore.Transaction,
  userRef: FirebaseFirestore.DocumentReference,
  actionType: string,
  limitSeconds: number
) {
  const userDoc = await tx.get(userRef);
  if (!userDoc.exists()) throw new Error("المستخدم غير موجود.");

  const userData = userDoc.data();
  const lastActionTimestamps = userData.lastActionTimestamp || {};
  const lastActionTime = lastActionTimestamps[actionType] as Timestamp | undefined;

  if (lastActionTime) {
    const timeSinceLastAction = (Date.now() - lastActionTime.toMillis()) / 1000;
    if (timeSinceLastAction < limitSeconds) {
      const waitTime = Math.ceil(limitSeconds - timeSinceLastAction);
      throw new Error(`يجب عليك الانتظار ${waitTime} ثانية قبل القيام بهذا الإجراء مرة أخرى.`);
    }
  }

  // If not rate-limited, update the timestamp for this action.
  tx.update(userRef, {
    [`lastActionTimestamp.${actionType}`]: Timestamp.now()
  });
}
