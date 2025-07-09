
import type { Player } from '@/types';

export interface GeniusChallenge {
  id: string;
  name: string;
  description: string;
  type: 'logic' | 'memory' | 'speed' | 'pattern';
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
    description: 'احفظ المسار الصحيح على الشبكة ثم اعبره من الذاكرة قبل نفاد الوقت.',
    type: 'memory',
  },
  {
    id: 'visual_memory',
    name: 'الذاكرة الصورية',
    description: 'تُعرض لك شبكة 5x5 من الفواكه لثوانٍ معدودة. احفظ أماكن الفاكهة المطلوبة قبل أن تختفي!',
    type: 'memory',
  }
];

export const GENIUS_CHALLENGE_MAP = new Map(GENIUS_CHALLENGES.map(c => [c.id, c]));
