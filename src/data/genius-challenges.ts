
import type { Player } from '@/types';

export interface GeniusChallenge {
  id: string;
  name: string;
  description: string;
  type: 'logic' | 'memory' | 'speed' | 'pattern' | 'reaction';
  timeLimit: number;
}

export const GENIUS_CHALLENGES: GeniusChallenge[] = [
  {
    id: 'quick_math',
    name: 'الحساب السريع',
    description: 'حل 5 مسائل حسابية متتالية بأسرع وقت ممكن!',
    type: 'speed',
    timeLimit: 60,
  },
  {
    id: 'smart_grid_puzzle',
    name: 'لغز الشبكة الذكية',
    description: 'اكتشف النمط واملأ الفراغات. كل خلية صحيحة تمنحك نقطة، لكن إذا انتهى الوقت ستخسر كل شيء!',
    type: 'logic',
    timeLimit: 120,
  },
  {
    id: 'path_of_survival',
    name: 'مسار النجاة',
    description: 'احفظ المسار الذي سيظهر أمامك، ثم أعد رسمه من ذاكرتك قبل نفاد الوقت!',
    type: 'memory',
    timeLimit: 20,
  },
  {
    id: 'code_breaker',
    name: 'كسر الشيفرة',
    description: 'خمن الشيفرة الرقمية المكونة من 5 أرقام فريدة بأقل عدد من المحاولات.',
    type: 'logic',
    timeLimit: 45,
  },
   {
    id: 'hidden_maze',
    name: 'المتاهة الخفية',
    description: 'ابحث عن الطريق الصحيح من البداية للنهاية. كل خطوة تكشف جزءًا من المتاهة.',
    type: 'logic',
    timeLimit: 40,
  },
];

export const GENIUS_CHALLENGE_MAP = new Map(GENIUS_CHALLENGES.map(c => [c.id, c]));
