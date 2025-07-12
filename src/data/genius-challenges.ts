
import type { Player } from '@/types';

export interface GeniusChallenge {
  id: string;
  name: string;
  description: string;
  type: 'logic' | 'memory' | 'speed' | 'pattern' | 'reaction';
}

export const GENIUS_CHALLENGES: GeniusChallenge[] = [
  {
    id: 'quick_math',
    name: 'الحساب السريع',
    description: 'حل 5 مسائل حسابية متتالية بأسرع وقت ممكن!',
    type: 'speed',
  },
  {
    id: 'smart_grid_puzzle',
    name: 'لغز الشبكة الذكية',
    description: 'اكتشف النمط واملأ الفراغات. كل خلية صحيحة تمنحك نقطة، لكن إذا انتهى الوقت ستخسر كل شيء!',
    type: 'logic',
  },
  {
    id: 'path_of_survival',
    name: 'مسار النجاة',
    description: 'احفظ المسار الذي سيظهر أمامك، ثم أعد رسمه من ذاكرتك قبل نفاد الوقت!',
    type: 'memory',
  },
  {
    id: 'code_breaker',
    name: 'كسر الشيفرة',
    description: 'خمن الشيفرة الرقمية المكونة من 5 أرقام فريدة بأقل عدد من المحاولات.',
    type: 'logic',
  },
   {
    id: 'hidden_maze',
    name: 'المتاهة الخفية',
    description: 'ابحث عن الطريق الصحيح من البداية للنهاية. كل خطوة تكشف جزءًا من المتاهة.',
    type: 'logic',
  },
  {
    id: 'bomb_duel',
    name: 'قنبلة في اليد',
    description: 'كل لاعب يحمل قنبلة! تخلص منها برميها على خصومك قبل أن تنفجر في يدك. آخر لاعب يبقى هو الفائز.',
    type: 'reaction',
  }
];

export const GENIUS_CHALLENGE_MAP = new Map(GENIUS_CHALLENGES.map(c => [c.id, c]));

    
