
import type { Permission } from '@/types';

export const ALL_PERMISSIONS: Permission[] = [
    // Economic Permissions
    { id: 'can_collect_extra_go_salary', name: 'راتب انطلاق إضافي', description: 'يحصل على 100 كوينز إضافية عند المرور بنقطة الانطلاق.', category: 'economic' },
    { id: 'receives_tax_income', name: 'جامع الضرائب', description: 'يحصل على 10% من جميع الضرائب المدفوعة في اللعبة.', category: 'economic' },
    { id: 'property_purchase_discount', name: 'خصم على العقارات', description: 'يحصل على خصم 10% عند شراء أي عقار.', category: 'economic' },
    { id: 'increased_rent_income', name: 'إيجار مضاعف', description: 'يجمع 25% إيجار إضافي من جميع ممتلكاته.', category: 'economic' },
    { id: 'protection_money_enabled', name: 'تفعيل أموال الحماية', description: 'يمكنه طلب أموال حماية من اللاعبين الأضعف.', category: 'economic' },
    { id: 'free_house_build', name: 'بناء منزل مجاني', description: 'يمكنه بناء منزل واحد مجانًا في كل دور.', category: 'economic' },
    { id: 'lower_interest_mortgage', name: 'رهن بفائدة أقل', description: 'يدفع فائدة أقل عند فك رهن عقاراته.', category: 'economic' },
    { id: 'can_auction_properties', name: 'بدء مزاد', description: 'يمكنه بدء مزاد على عقار غير مملوك بدلاً من شرائه مباشرة.', category: 'economic' },

    // Social Permissions
    { id: 'can_view_player_balances', name: 'كشف الأرصدة', description: 'يمكنه رؤية الرصيد المالي لجميع اللاعبين في أي وقت.', category: 'social' },
    { id: 'can_force_name_change', name: 'تغيير الاسم القسري', description: 'يمكنه إجبار لاعب من طبقة أدنى على تغيير اسمه لاسم مهين مؤقتًا.', category: 'social' },
    { id: 'can_send_global_taunt', name: 'رسالة إذلال عالمية', description: 'يمكنه إرسال رسالة إذلال تظهر لجميع اللاعبين.', category: 'social' },
    { id: 'can_propose_alliance', name: 'اقتراح تحالف', description: 'يمكنه اقتراح تحالف رسمي مع لاعب آخر (لا يتشاركون المال ولكن لا يدفعون إيجارًا لبعضهم).', category: 'social' },
    { id: 'can_break_alliance', name: 'كسر التحالف', description: 'يمكنه كسر تحالف قائم مع لاعب آخر.', category: 'social' },
    { id: 'can_view_unseen_cards', name: 'رؤية البطاقات', description: 'يمكنه رؤية بطاقة الحظ أو الفرص التالية قبل سحبها.', category: 'social' },
    { id: 'can_pardon_player_from_jail', name: 'عفو عن سجين', description: 'يمكنه إصدار عفو عن لاعب آخر في السجن مرة واحدة في اللعبة.', category: 'social' },
    { id: 'can_demand_allegiance', name: 'طلب الولاء', description: 'يمكنه طلب الولاء من لاعب آخر، مما يمنحه حماية مؤقتة.', category: 'social' },
    
    // Gameplay Permissions
    { id: 'can_roll_three_dice', name: 'رمي ثلاثة نرد', description: 'يحق له رمي ثلاثة نرد بدلاً من اثنين مرة واحدة في كل دور.', category: 'gameplay' },
    { id: 'gets_extra_vote', name: 'صوت إضافي', description: 'يحصل على صوت إضافي في أي تصويت جماعي.', category: 'gameplay' },
    { id: 'can_veto_execution', name: 'حق الفيتو', description: 'يمكنه نقض قرار إعدام لاعب في لعبة المافيا.', category: 'gameplay' },
    { id: 'starts_with_get_out_of_jail_card', name: 'بطاقة خروج من السجن', description: 'يبدأ اللعبة ومعه بطاقة "اخرج من السجن مجانًا".', category: 'gameplay' },
    { id: 'can_choose_starting_position', name: 'اختيار نقطة البداية', description: 'يمكنه اختيار أي خانة على اللوحة ليبدأ منها (باستثناء السجن).', category: 'gameplay' },
    { id: 'immune_to_first_attack', name: 'حصانة من الهجوم الأول', description: 'لديه حصانة من أول هجوم أو تأثير سلبي في اللعبة.', category: 'gameplay' },
    { id: 'can_see_killer_identity', name: 'كشف القاتل', description: 'في لعبة المافيا، يعرف هوية القاتل من البداية.', category: 'gameplay' },
    { id: 'can_swap_positions', name: 'تبديل الأماكن', description: 'يمكنه تبديل مكانه مع أي لاعب آخر على اللوحة مرة واحدة.', category: 'gameplay' },
    { id: 'can_skip_turn', name: 'تخطي الدور', description: 'يمكنه اختيار تخطي دوره مرة واحدة في اللعبة دون عقوبة.', category: 'gameplay' },
    { id: 'can_reroll_dice', name: 'إعادة رمي النرد', description: 'يمكنه إعادة رمي النرد مرة واحدة إذا لم تعجبه النتيجة.', category: 'gameplay' },
    
    // Meta Permissions
    { id: 'has_golden_name', name: 'اسم ذهبي', description: 'يظهر اسمه باللون الذهبي في جميع أنحاء اللعبة.', category: 'meta' },
    { id: 'has_special_avatar_aura', name: 'هالة مميزة', description: 'تظهر هالة متوهجة حول صورته الرمزية (Avatar).', category: 'meta' },
    { id: 'can_set_lobby_motd', name: 'رسالة ترحيب', description: 'يمكنه وضع رسالة ترحيب تظهر لجميع اللاعبين عند دخولهم اللوبي.', category: 'meta' },
    { id: 'can_access_exclusive_avatars', name: 'شخصيات حصرية', description: 'يحصل على إمكانية الوصول إلى مجموعة من الشخصيات الحصرية.', category: 'meta' },
    { id: 'unlocks_special_game_theme', name: 'سمة لعبة خاصة', description: 'يفتح سمة (Theme) خاصة للعبة يراها هو فقط.', category: 'meta' },
    { id: 'can_view_game_log', name: 'سجل اللعبة', description: 'يمكنه عرض سجل مفصل لجميع الأحداث التي وقعت في اللعبة.', category: 'meta' },
    { id: 'has_custom_chat_color', name: 'لون دردشة مخصص', description: 'يمكنه اختيار لون مخصص لرسائله في الدردشة.', category: 'meta' },
    
    // More creative permissions
    { id: 'can_place_trap', name: 'نصب فخ', description: 'يمكنه وضع فخ على عقار غير مملوك. أول لاعب يهبط عليه يدفع له 50 كوينز.', category: 'gameplay' },
    { id: 'can_sabotage_property', name: 'تخريب عقار', description: 'يمكنه تخريب عقار لاعب آخر، مما يمنع جمع الإيجار منه لدور واحد.', category: 'gameplay' },
    { id: 'can_bribe_guard', name: 'رشوة الحارس', description: 'في السجن، يمكنه دفع نصف الكفالة للخروج فورًا.', category: 'economic' },
    { id: 'can_spy_on_trade', name: 'التجسس على صفقة', description: 'يمكنه رؤية تفاصيل أي صفقة تتم بين لاعبين آخرين.', category: 'social' },
    { id: 'can_host_private_tournaments', name: 'بطولات خاصة', description: 'يمكنه إنشاء بطولات خاصة بدعوات فقط.', category: 'meta' },
    { id: 'can_issue_bounty', name: 'إصدار مكافأة', description: 'يمكنه وضع مكافأة على رأس لاعب آخر. أول لاعب يتسبب في إفلاسه يحصل على المكافأة.', category: 'social' },
    { id: 'can_see_chance_outcome', name: 'رؤية نتيجة الحظ', description: 'يمكنه رؤية نتيجة بطاقة الحظ قبل أن يقرر سحبها أو تمريرها.', category: 'gameplay' },
    { id: 'receives_passive_income', name: 'دخل سلبي', description: 'يحصل على 10 كوينز في بداية كل دور له.', category: 'economic' },
    { id: 'can_gift_property', name: 'إهداء عقار', description: 'يمكنه إهداء أحد عقاراته للاعب آخر.', category: 'social' },
    { id: 'can_view_player_stats', name: 'عرض الإحصائيات', description: 'يمكنه عرض إحصائيات مفصلة لأي لاعب (نسبة الفوز، إلخ).', category: 'social' },
    { id: 'can_propose_new_rule', name: 'اقتراح قانون جديد', description: 'يمكنه اقتراح قانون جديد مؤقت يتم التصويت عليه من قبل اللاعبين.', category: 'gameplay' },
    { id: 'has_bodyguard', name: 'حارس شخصي', description: 'لديه حارس شخصي يمنع أول محاولة إذلال ضده.', category: 'social' },
    { id: 'can_establish_monopoly', name: 'تأسيس احتكار', description: 'عند امتلاك مجموعة لونية، يحصل على خصم 50% على بناء المنازل فيها.', category: 'economic' },
    { id: 'can_impersonate', name: 'انتحال شخصية', description: 'في لعبة المافيا، يمكنه الظهور كمدني للمحقق مرة واحدة.', category: 'gameplay' },
];
