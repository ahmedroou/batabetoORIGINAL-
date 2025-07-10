
import type { Player } from '@/types';

export interface GeniusChallenge {
  id: string;
  name: string;
  description: string;
  type: 'logic' | 'memory' | 'speed' | 'pattern';
}

export const GENIUS_CHALLENGES: GeniusChallenge[] = [
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
    id: 'smart_grid_puzzle',
    name: 'لغز الشبكة الذكية',
    description: 'حلل الشبكة، اكتشف النمط الخفي، واملأ المربعات الفارغة قبل نفاد الوقت.',
    type: 'logic',
  },
  {
    id: 'hidden_maze',
    name: 'المتاهة المخفية',
    description: 'استكشف المتاهة المخفية، وتجنب الجدران، واعثر على طريقك إلى المخرج قبل نفاد الوقت.',
    type: 'logic',
  },
  {
    id: 'code_breaker',
    name: 'كسر الشيفرة',
    description: 'خمن الشيفرة الرقمية المكونة من 5 أرقام فريدة بأقل عدد من المحاولات.',
    type: 'logic',
  },
];

export const GENIUS_CHALLENGE_MAP = new Map(GENIUS_CHALLENGES.map(c => [c.id, c]));

    
