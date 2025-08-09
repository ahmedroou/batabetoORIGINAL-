
import type { Permission } from '@/types';

export const ALL_PERMISSIONS: Permission[] = [
    // --- Social & Meta Permissions ---
    { id: 'can_view_player_balances', name: 'كشف الأرصدة', description: 'يمكنه رؤية الرصيد المالي لجميع اللاعبين في أي وقت.', category: 'social' },
    { id: 'can_force_name_change', name: 'تغيير اللقب القسري', description: 'يمكنه إجبار لاعب من طبقة أدنى على تغيير اسمه للقب مهين مؤقتًا.', category: 'social' },
    { id: 'can_force_avatar_change', name: 'فرض تغيير الصورة', description: 'يمكنه إجبار لاعب من طبقة أدنى على تغيير صورته الشخصية لواحدة من شخصيات العقاب.', category: 'social' },
    { id: 'can_send_global_taunt', name: 'رسالة إذلال عالمية', description: 'يمكنه إرسال رسالة إذلال تظهر لجميع اللاعبين.', category: 'social' },
    { id: 'can_pardon_player_from_jail', name: 'عفو عن سجين', description: 'يمكنه إصدار عفو عن لاعب آخر في السجن مرة واحدة في اللعبة.', category: 'social' },
    { id: 'can_demand_allegiance', name: 'طلب الولاء', description: 'يمكنه طلب الولاء من لاعب آخر، مما يمنحه حماية مؤقتة.', category: 'social' },
    { id: 'has_bodyguard', name: 'حارس شخصي', description: 'لديه حارس شخصي يمنع أول محاولة إذلال ضده.', category: 'social' },
    { id: 'can_issue_bounty', name: 'إصدار مكافأة', description: 'يمكنه وضع مكافأة على رأس لاعب آخر. أول لاعب يتسبب في هزيمته يحصل على المكافأة.', category: 'social' },
    { id: 'can_view_player_stats', name: 'عرض الإحصائيات', description: 'يمكنه عرض إحصائيات مفصلة لأي لاعب (نسبة الفوز، إلخ).', category: 'social' },
    { id: 'has_golden_name', name: 'اسم ذهبي', description: 'يظهر اسمه باللون الذهبي في جميع أنحاء اللعبة.', category: 'meta' },
    { id: 'has_special_avatar_aura', name: 'هالة مميزة', description: 'تظهر هالة متوهجة حول صورته الرمزية (Avatar).', category: 'meta' },
    { id: 'can_access_exclusive_avatars', name: 'شخصيات حصرية', description: 'يحصل على إمكانية الوصول إلى مجموعة من الشخصيات الحصرية.', category: 'meta' },
    { id: 'can_host_private_tournaments', name: 'بطولات خاصة', description: 'يمكنه إنشاء بطولات خاصة بدعوات فقط.', category: 'meta' },
    { id: 'receives_passive_income', name: 'دخل سلبي', description: 'يحصل على 10 كوينز في بداية كل دور له في الألعاب التي تدعم ذلك.', category: 'economic' },
    { id: 'avatar_store_discount', name: 'خصم المتجر', description: 'يحصل على خصم 10% عند شراء أي أفاتار من المتجر.', category: 'economic' },
    { id: 'increased_winnings', name: 'مكاسب إضافية', description: 'يحصل على 5% كوينز إضافية عند الفوز في أي لعبة.', category: 'economic' },
    
    // --- Behind The Mask (Mafia) Permissions ---
    { id: 'mafia_extra_vote', name: 'صوت إضافي (خلف القناع)', description: 'يحصل على صوت إضافي في مرحلة التصويت اليومي.', category: 'gameplay' },
    { id: 'mafia_immune_to_first_kill', name: 'حصانة من القتل الأول (خلف القناع)', description: 'لديه حصانة من أول محاولة قتل ضده من قبل القاتل.', category: 'gameplay' },
    { id: 'mafia_can_see_one_role', name: 'كشف دور (خلف القناع)', description: 'يمكنه في بداية اللعبة اختيار لاعب واحد لكشف دوره الحقيقي سراً.', category: 'gameplay' },
    { id: 'mafia_detective_extra_check', name: 'تحقيق إضافي (خلف القناع)', description: 'إذا كان محققًا، يمكنه التحقيق في هوية لاعبين في ليلة واحدة (مرة واحدة في اللعبة).', category: 'gameplay' },
    { id: 'mafia_doctor_self_heal', name: 'علاج ذاتي (خلف القناع)', description: 'إذا كان طبيبًا، يمكنه علاج نفسه مرة واحدة في اللعبة.', category: 'gameplay' },
    { id: 'mafia_can_veto_execution', name: 'حق الفيتو (خلف القناع)', description: 'يمكنه نقض قرار إعدام لاعب مرة واحدة في اللعبة.', category: 'gameplay' },
    
    // --- The Prison Permissions ---
    { id: 'prison_start_with_extra_points', name: 'نقاط بداية (السجن)', description: 'يبدأ كل جولة في لعبة السجن بنقطة إضافية.', category: 'gameplay' },
    { id: 'prison_reduce_penalty', name: 'تقليل عقوبة (السجن)', description: 'يقلل من عقوبة النقاط عند الفشل في المزاد أو البقاء في السجن.', category: 'gameplay' },
    { id: 'prison_free_question_change', name: 'تغيير سؤال مجاني (السجن)', description: 'يحصل على فرصة واحدة لتغيير سؤال المزاد المغلق مجانًا.', category: 'gameplay' },
    { id: 'prison_view_highest_bid', name: 'رؤية أعلى مزايدة (السجن)', description: 'يمكنه رؤية أعلى مزايدة حالية قبل أن يضع مزايدته في المزاد المغلق.', category: 'gameplay' },
    { id: 'prison_immunity_from_loser', name: 'حصانة من الخسارة (السجن)', description: 'لديه حصانة من أن يكون الخاسر الوحيد في المزاد المفتوح مرة واحدة في اللعبة.', category: 'gameplay' },

    // --- Trap Answer Permissions ---
    { id: 'trap_extra_point_on_deceive', name: 'نقطة خداع إضافية (الجواب المفخخ)', description: 'يحصل على نقطة إضافية لكل لاعب يخدعه بنجاح.', category: 'gameplay' },
    { id: 'trap_reveal_one_trap_answer', name: 'كشف جواب مفخخ (الجواب المفخخ)', description: 'يمكنه كشف أحد الأجوبة المفخخة (وليس الصحيح) قبل التصويت.', category: 'gameplay' },
    { id: 'trap_safe_from_self_vote', name: 'حماية من التصويت الذاتي (الجواب المفخخ)', description: 'لا يخسر نقاطًا إذا صوّت لإجابته المفخخة عن طريق الخطأ.', category: 'gameplay' },
    
    // --- Word War Permissions ---
    { id: 'wordwar_extra_guess', name: 'تخمين إضافي (حرب الكلمات)', description: 'إذا كان مخمنًا، يحصل فريقه على محاولة تخمين إضافية واحدة لكل دور.', category: 'gameplay' },
    { id: 'wordwar_see_one_neutral', name: 'كشف كلمة محايدة (حرب الكلمات)', description: 'إذا كان مرشدًا، يمكنه رؤية موقع كلمة محايدة واحدة في بداية اللعبة.', category: 'gameplay' },
    { id: 'wordwar_block_one_opponent_guess', name: 'صد تخمين (حرب الكلمات)', description: 'يمكنه منع الفريق الآخر من تخمين كلمة واحدة في أحد أدوارهم (مرة واحدة في اللعبة).', category: 'gameplay' },
    
    // --- Draw & Guess Permissions ---
    { id: 'draw_extra_time', name: 'وقت رسم إضافي (لعبة رسمة)', description: 'إذا كان رسامًا، يحصل على 15 ثانية إضافية.', category: 'gameplay' },
    { id: 'draw_extra_guess_attempt', name: 'محاولة تخمين إضافية (لعبة رسمة)', description: 'إذا كان مخمنًا، يحصل على محاولة تخمين إضافية.', category: 'gameplay' },
    { id: 'draw_see_category_early', name: 'رؤية الفئة مبكرًا (لعبة رسمة)', description: 'يمكنه رؤية الفئة التي سيتم الرسم منها قبل أن يراها الآخرون.', category: 'gameplay' },

    // --- King of Genius Permissions ---
    { id: 'genius_extra_life', name: 'حياة إضافية (ساحة العباقرة)', description: 'يحصل على فرصة خطأ إضافية في تحديات مثل "كسر الشيفرة".', category: 'gameplay' },
    { id: 'genius_time_bonus', name: 'مكافأة وقت (ساحة العباقرة)', description: 'يحصل على 5 ثوانٍ إضافية في التحديات المعتمدة على الوقت.', category: 'gameplay' },
    { id: 'genius_reveal_one_hint', name: 'كشف تلميح (ساحة العباقرة)', description: 'يحصل على تلميح واحد مجاني في تحديات مثل "المتاهة الخفية" أو "الشبكة الذكية".', category: 'gameplay' }
];
