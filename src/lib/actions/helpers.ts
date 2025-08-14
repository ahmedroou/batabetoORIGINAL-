/**
 * @fileoverview Shared helper utilities used across game action modules.
 *
 * ✔️ Preserves existing API/signatures
 *    - shuffle, isFirebaseError, generateGameId, generateLeagueId,
 *      getPlayerNumberMap, getSimilaritySignature, safeCompareStrings
 * ✔️ Safer randomness (Crypto when available)
 * ✔️ Better Arabic normalization for text signatures
 * ✔️ Zero unused imports & tighter types
 */

// ---------------------------------------------------------------------------
// Random utilities
// ---------------------------------------------------------------------------

/**
 * Return a cryptographically stronger random integer in [0, maxExclusive).
 * Falls back to Math.random if crypto is unavailable.
 */
export function secureRandomInt(maxExclusive: number): number {
    if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0;
    const g = (globalThis as any).crypto;
    if (g && typeof g.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      g.getRandomValues(buf);
      return buf[0] % Math.floor(maxExclusive);
    }
    return Math.floor(Math.random() * maxExclusive);
  }
  
  /** Fisher–Yates (Durstenfeld) shuffle using secureRandomInt when possible. */
  export function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = secureRandomInt(i + 1);
      if (j !== i) {
        [array[i], array[j]] = [array[j], array[i]];
      }
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
  
  import type { Player } from '@/types';
  
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
  
  // ---------------------------------------------------------------------------
  // Text normalization & similarity
  // ---------------------------------------------------------------------------
  
  /** Remove common Arabic diacritics. */
  const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670]/g; // tashkeel + superscript alif
  /** Remove common punctuation (Arabic & Latin). */
  const PUNCTUATION = /[.,\/#!$%\^&*;:{}=\-_`~()؟؟?،؛\[\]"'<>+|]/g;
  
  /**
   * Normalize Arabic text for signature comparison:
   * - lowercases
   * - strips punctuation
   * - removes diacritics
   * - unifies Alef forms (أإآ → ا)
   * - unifies Yeh/Alef Maqsura (ي/ى → ي)
   * - Ta Marbuta → ه
   * - collapses whitespace
   */
  export function normalizeForSignature(s: string): string {
    return (s || '')
      .toLowerCase()
      .replace(PUNCTUATION, ' ')
      .replace(ARABIC_DIACRITICS, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/[يى]/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim();
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
    return inter / (A.size + B.size - inter || 1);
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
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('string-similarity');
      if (mod && typeof mod.compareTwoStrings === 'function') {
        return mod.compareTwoStrings(a, b) as number;
      }
    } catch { /* noop - fallback below */ }
    return jaccardSimilarity(a, b);
  }
  