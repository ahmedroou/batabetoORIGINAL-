
import type { Player } from '@/types';

export interface GeniusChallenge {
  id: string;
  name: string;
  description: string;
  type: 'logic' | 'memory' | 'speed' | 'crypto' | 'pattern';
}

export const GENIUS_CHALLENGES: GeniusChallenge[] = [
  {
    id: 'code_breaker',
    name: 'كسر الشفرة',
    description: 'خمن الشفرة السرية المكونة من 5 أرقام فريدة خلال 6 محاولات.',
    type: 'logic',
  },
  {
    id: 'quick_math',
    name: 'الحساب السريع',
    description: 'حل المسألة الحسابية التالية بأسرع وقت ممكن!',
    type: 'speed',
  },
];

export const GENIUS_CHALLENGE_MAP = new Map(GENIUS_CHALLENGES.map(c => [c.id, c]));
