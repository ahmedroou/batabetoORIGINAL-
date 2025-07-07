
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
    description: 'خمن الشفرة السرية المكونة من 4 أرقام فريدة خلال 6 محاولات.',
    type: 'logic',
  },
//   {
//     id: 'false_memory',
//     name: 'الذاكرة الكاذبة',
//     description: 'شاهد سلسلة من الرموز، ثم قرر ما إذا كان الرمز الجديد جزءًا منها.',
//     type: 'memory',
//   },
//   {
//     id: 'find_the_mistake',
//     name: 'اكتشف الخطأ',
//     description: 'ابحث عن العنصر الذي لا يتبع النمط في السلسلة المعروضة.',
//     type: 'pattern',
//   },
//   {
//     id: 'cipher_shift',
//     name: 'فك التشفير',
//     description: 'فك تشفير الكلمة المعروضة التي تم تشفيرها بطريقة متغيرة.',
//     type: 'crypto',
//   },
//   {
//     id: 'path_of_survival',
//     name: 'مسار النجاة',
//     description: 'احفظ المسار الصحيح على الشبكة ثم اتبعه من الذاكرة.',
//     type: 'memory',
//   },
];

export const GENIUS_CHALLENGE_MAP = new Map(GENIUS_CHALLENGES.map(c => [c.id, c]));
