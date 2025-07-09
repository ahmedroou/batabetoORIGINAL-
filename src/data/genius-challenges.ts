
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
    description: 'حل 5 مسائل حسابية متتالية بأسرع وقت ممكن!',
    type: 'speed',
  },
  {
    id: 'path_of_survival',
    name: 'مسار النجاة',
    description: 'احفظ المسار الصحيح في 3 ثوانٍ ثم اعبره من الذاكرة. خطأ واحد وتخسر!',
    type: 'memory',
  },
  {
    id: 'cipher_shift',
    name: 'فك الشيفرة',
    description: 'فك تشفير الكلمة الغامضة قبل نفاد الوقت. تتغير خوارزمية التشفير في كل مرة!',
    type: 'crypto',
  },
  {
    id: 'visual_memory',
    name: 'الذاكرة الصورية',
    description: 'احفظ 9 صور في ثوانٍ، ثم ابحث عن العنصر المطلوب قبل نفاد الوقت.',
    type: 'memory',
  }
];

export const GENIUS_CHALLENGE_MAP = new Map(GENIUS_CHALLENGES.map(c => [c.id, c]));
