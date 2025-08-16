import type { PlayerRole, PlayerTeam } from '@/types';

/** أنواع الأفعال الليلية المدعومة */
export type NightActionType =
  | 'kill'
  | 'heal'
  | 'investigate'
  | 'spy'
  | 'bomb'
  | 'shapeshift'
  | null;

/** سلوك التحقيق تجاه الدور */
export type InvestigationBehavior =
  | 'normal'              // يظهر التحقيق كما هو
  | 'immune-to-spy'       // الجاسوس لا يكشفه
  | 'immune-to-detective' // المحقق لا يكشفه
  | 'immune-to-both'      // لا يكشفه أي منهما
  | 'reflect-spy';        // يعكس كشف الجاسوس عليه/يكشف الجاسوس

export interface RoleDetails {
  /** المعرّف المطابق لنوع الدور */
  id: PlayerRole;
  /** اسم عربي لعرضه */
  name: string;
  /** الفريق */
  team: PlayerTeam;
  /** وصف موجز */
  description: string;

  /** مسار صورة fallback */
  imagePath: string;
  /** مسار فيديو العرض (اختياري) */
  videoPath?: string;

  /** الفعل الليلي الأساسي */
  nightAction: NightActionType;

  /** هل يمكن الاستهداف الذاتي (مثل الطبيب) */
  canTargetSelf?: boolean;

  /** منع استهداف نفس اللاعب في ليالٍ متتالية (مثل الطبيب) */
  consecutiveTargetBan?: boolean;

  /** تبريد/راحة إجبارية بعد الاستخدام (ليالٍ). مثال: 1 يعني لا يمكن استخدامه ليلتين متتاليتين. */
  cooldown?: number;

  /** حوض التنكّر (للمنتحل) */
  disguisePool?: PlayerRole[];

  /** سلوك دور ضد التحقيق/التجسس */
  investigationBehavior?: InvestigationBehavior;

  /** أولوية تنفيذ الفعل الليلي (أقل = يُنفّذ أولاً). تُترك للمعالجة الخلفية إن وُجدت. */
  priority?: number;
}

export const ROLES: Record<PlayerRole, RoleDetails> = {
  killer: {
    id: 'killer',
    name: 'القاتل',
    team: 'mafia',
    description:
      'هدفك هو القضاء على فريق الخير. في كل ليلة يمكنك اختيار لاعب لقتله.',
    imagePath: '/roles/killer.png',
    videoPath: '/roles/killer.mp4',
    nightAction: 'kill',
    cooldown: 1, // لا يستخدم ليلتين متتاليتين (يتماشى مع NightPhase)
    priority: 60,
  },
  detective: {
    id: 'detective',
    name: 'المحقق',
    team: 'good',
    description:
      'هدفك كشف هوية الأشرار. في كل ليلة يمكنك التحقيق في هوية لاعب واحد.',
    imagePath: '/roles/detective.png',
    videoPath: '/roles/detective.mp4',
    nightAction: 'investigate',
    cooldown: 1, // لا يستخدم ليلتين متتاليتين
    priority: 20,
  },
  doctor: {
    id: 'doctor',
    name: 'الطبيب',
    team: 'good',
    description:
      'تحمي الأبرياء. كل ليلة يمكنك حماية لاعب من القتل. لا يمكنك حماية نفس اللاعب في ليلتين متتاليتين، ويمكنك حماية نفسك.',
    imagePath: '/roles/doctor.png',
    videoPath: '/roles/doctor.mp4',
    nightAction: 'heal',
    canTargetSelf: true,
    consecutiveTargetBan: true,
    priority: 10,
  },
  soldier: {
    id: 'soldier',
    name: 'الجندي',
    team: 'good',
    description:
      'درع فريق الخير. إذا حاول الجاسوس كشفك، يرتدّ الكشف عليه ويتم كشفه.',
    imagePath: '/roles/soldier.png',
    videoPath: '/roles/soldier.mp4',
    nightAction: null,
    investigationBehavior: 'reflect-spy',
  },
  spy: {
    id: 'spy',
    name: 'الجاسوس',
    team: 'mafia',
    description:
      'عين المافيا الخفية. كل ليلة يمكنك محاولة كشف دور لاعب واحد.',
    imagePath: '/roles/spy.png',
    videoPath: '/roles/spy.mp4',
    nightAction: 'spy',
    priority: 30,
  },
  shapeshifter: {
    id: 'shapeshifter',
    name: 'المنتحل',
    team: 'good',
    description:
      'خبير في التخفي. كل ليلة تختار هوية وهمية تُضلِّل الجاسوس. المحقق يستطيع كشفك الحقيقي.',
    imagePath: '/roles/shapeshifter.png',
    videoPath: '/roles/shapeshifter.mp4',
    nightAction: 'shapeshift',
    disguisePool: ['doctor', 'detective', 'soldier', 'civilian'],
    priority: 5,
  },
  bomber: {
    id: 'bomber',
    name: 'الانتحاري',
    team: 'good',
    description:
      'تختار هدفًا كل ليلة، وإذا تم إعدامك نهارًا يموت هدفك معك.',
    imagePath: '/roles/bomber.png',
    videoPath: '/roles/bomber.mp4',
    nightAction: 'bomb',
    priority: 50,
  },
  civilian: {
    id: 'civilian',
    name: 'المدني',
    team: 'good',
    description:
      'مواطن عادي. ساعد فريقك عبر النقاش الذكي والتصويت.',
    imagePath: '/roles/civilian.png',
    videoPath: '/roles/civilian.mp4',
    nightAction: null,
  },
  contestant: {
    id: 'contestant',
    name: 'متسابق',
    team: 'neutral',
    description: 'دور محايد لأطوار لعب أخرى.',
    imagePath: '/roles/civilian.png',
    videoPath: '/roles/civilian.mp4',
    nightAction: null,
  },
};

/** قائمة سريعة للمعرّفات */
export const ROLE_IDS = Object.keys(ROLES) as PlayerRole[];

/** أدوار بلا فعل ليلي (يفيد NightPhase) */
export const ROLES_WITH_NO_NIGHT_ACTION = ROLE_IDS.filter(
  (r) => ROLES[r].nightAction === null
) as PlayerRole[];

/** إرجاع الفعل الليلي لدور ما */
export function getActionTypeForRole(role: PlayerRole): NightActionType {
  return ROLES[role]?.nightAction ?? null;
}

/** خلط مصفوفة مع دعم بذرة اختيارية (للتحكم في الاختبار/التكرار) */
function shuffleInPlace<T>(arr: T[], seed?: number) {
  if (seed === undefined) {
    // عشوائي بسيط
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return;
  }
  // Mulberry32 generator
  let t = seed >>> 0;
  const rnd = () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * توزيع أدوار متوازن حسب عدد اللاعبين.
 * القاعدة:
 * - دائماً يوجد قاتل واحد.
 * - 5–6 لاعبين: نضيف الانتحاري بدل الجاسوس للتوازن.
 * - 7+ لاعبين: نضيف الجاسوس.
 * - 4+ لاعبين: جندي.
 * - 6+ لاعبين: منتحل.
 * - الباقي يُملأ بمدنيين.
 *
 * ملاحظة: يمكن تمرير seed لاختبارات ثابتة الترتيب.
 */
export function getRoleDistribution(
  playerCount: number,
  opts: { seed?: number } = {}
): PlayerRole[] {
  const { seed } = opts;

  if (playerCount <= 0) return [];

  if (playerCount < 4) {
    const base: PlayerRole[] = ['killer', 'detective', 'doctor', 'civilian'];
    const slice = base.slice(0, playerCount) as PlayerRole[];
    shuffleInPlace(slice, seed);
    return slice;
  }

  const roles: PlayerRole[] = [];

  // أساسيات
  roles.push('killer');     // مافيا أساسي
  roles.push('detective');  // خير أساسي
  roles.push('doctor');     // خير أساسي

  if (playerCount >= 4) {
    roles.push('soldier');
  }

  if (playerCount >= 5) {
    // 5–6: انتحاري أفضل للتوازن من الجاسوس
    if (playerCount < 7) {
      roles.push('bomber');
    } else {
      roles.push('spy'); // 7+: نضيف الجاسوس
    }
  }

  if (playerCount >= 6) {
    roles.push('shapeshifter');
  }

  // اكتمال العدد بمدنيين
  while (roles.length < playerCount) {
    roles.push('civilian');
  }

  shuffleInPlace(roles, seed);
  return roles;
}
