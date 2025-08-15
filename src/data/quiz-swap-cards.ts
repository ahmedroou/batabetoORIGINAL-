
import type { QuizSwapCard } from '@/types';

// =====================================================================
// Card Data for QuizSwap
// =====================================================================

export const QUIZ_SWAP_DECK: QuizSwapCard[] = [
    // --- Special Cards (20 total) ---
    { id: 'S01', kind: 'special', name: 'مشاهدة ورقتي', effect: 'PeekSelf' },
    { id: 'S02', kind: 'special', name: 'مشاهدة ورقتي', effect: 'PeekSelf' },
    { id: 'S03', kind: 'special', name: 'مشاهدة ورقتي', effect: 'PeekSelf' },
    { id: 'S04', kind: 'special', name: 'مشاهدة ورقتي', effect: 'PeekSelf' },
    { id: 'S05', kind: 'special', name: 'مشاهدة ورقة خصم', effect: 'PeekOpponent' },
    { id: 'S06', kind: 'special', name: 'مشاهدة ورقة خصم', effect: 'PeekOpponent' },
    { id: 'S07', kind: 'special', name: 'مشاهدة ورقة خصم', effect: 'PeekOpponent' },
    { id: 'S08', kind: 'special', name: 'مشاهدة ورقة خصم', effect: 'PeekOpponent' },
    { id: 'S09', kind: 'special', name: 'سؤال مجاني', effect: 'FreeQuestion' },
    { id: 'S10', kind: 'special', name: 'سؤال مجاني', effect: 'FreeQuestion' },
    { id: 'S11', kind: 'special', name: 'بدّل بطاقتك', effect: 'SwapWithOpponent' },
    { id: 'S12', kind: 'special', name: 'بدّل بطاقتك', effect: 'SwapWithOpponent' },
    { id: 'S13', kind: 'special', name: 'بدّل بطاقتك', effect: 'SwapWithOpponent' },
    { id: 'S14', kind: 'special', name: 'بدّل بطاقتك', effect: 'SwapWithOpponent' },
    { id: 'S15', kind: 'special', name: 'دمّر خصمك', effect: 'Burden' },
    { id: 'S16', kind: 'special', name: 'دمّر خصمك', effect: 'Burden' },
    { id: 'S17', kind: 'special', name: 'نقطة إضافية', effect: 'BonusPoint' },
    { id: 'S18', kind: 'special', name: 'الفضيحة', effect: 'Expose' },
    { id: 'S19', kind: 'special', name: 'الفضيحة', effect: 'Expose' },
    { id: 'S20', kind: 'special', name: 'بطاقة الحماية', effect: 'Shield' },

    // --- Easy Questions (20) ---
    { id: 'Q001', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هو أكبر كوكب في المجموعة الشمسية؟', answer: 'المشتري' },
    { id: 'Q002', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هو لون الموز الناضج؟', answer: 'أصفر' },
    { id: 'Q003', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'كم عدد أيام الأسبوع؟', answer: 'سبعة' },
    { id: 'Q004', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هو الحيوان الذي يُعرف بأنه "ملك الغابة"؟', answer: 'الأسد' },
    { id: 'Q005', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هي عاصمة مصر؟', answer: 'القاهرة' },
    { id: 'Q006', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هو الكوكب الذي نعيش عليه؟', answer: 'الأرض' },
    { id: 'Q007', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'كم عدد الأحرف في الأبجدية الإنجليزية؟', answer: '26' },
    { id: 'Q008', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هو الشيء الذي يتجمد عند درجة حرارة صفر مئوية؟', answer: 'الماء' },
    { id: 'Q009', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هو أسرع حيوان بري؟', answer: 'الفهد' },
    { id: 'Q010', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هو اسم الشكل ذو الجوانب الثلاثة؟', answer: 'مثلث' },
    { id: 'Q011', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'من هو أول إنسان صعد إلى الفضاء؟', answer: 'يوري جاجارين' },
    { id: 'Q012', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هو أكبر محيط في العالم؟', answer: 'المحيط الهادئ' },
    { id: 'Q013', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ماذا يسمى صغير الدب؟', answer: 'ديسم' },
    { id: 'Q014', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هو أطول نهر في العالم؟', answer: 'نهر النيل' },
    { id: 'Q015', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هي المادة التي تصنع منها النوافذ عادة؟', answer: 'الزجاج' },
    { id: 'Q016', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'كم عدد القارات في العالم؟', answer: 'سبع' },
    { id: 'Q017', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هي العملة المستخدمة في اليابان؟', answer: 'الين' },
    { id: 'Q018', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هو الغاز الذي نتنفسه لنبقى على قيد الحياة؟', answer: 'الأكسجين' },
    { id: 'Q019', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هو اسم منزل الإسكيمو؟', answer: 'الإيجلو' },
    { id: 'Q020', kind: 'question', difficulty: 'easy', name: 'سؤال سهل', question: 'ما هو الكوكب المعروف باسم "الكوكب الأحمر"؟', answer: 'المريخ' },

    // --- Medium Questions (20) ---
    { id: 'Q021', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'من رسم لوحة الموناليزا؟', answer: 'ليوناردو دافنشي' },
    { id: 'Q022', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'في أي بلد تقع الأهرامات؟', answer: 'مصر' },
    { id: 'Q023', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'ما هي أصغر دولة في العالم؟', answer: 'الفاتيكان' },
    { id: 'Q024', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'ما هو العنصر الكيميائي الذي رمزه Au؟', answer: 'الذهب' },
    { id: 'Q025', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'كم عدد لاعبي فريق كرة القدم على أرض الملعب؟', answer: '11' },
    { id: 'Q026', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'من كتب "هاملت"؟', answer: 'ويليام شكسبير' },
    { id: 'Q027', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'ما هو أعلى جبل في العالم؟', answer: 'جبل إيفرست' },
    { id: 'Q028', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'ما هي نظرية النسبية؟', answer: 'نظرية لألبرت أينشتاين' },
    { id: 'Q029', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'ما هو أصل رياضة الجودو؟', answer: 'اليابان' },
    { id: 'Q030', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'ما هو أكبر حيوان في العالم؟', answer: 'الحوت الأزرق' },
    { id: 'Q031', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'ما هي سرعة الضوء؟', answer: '300,000 كم/ثانية' },
    { id: 'Q032', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'في أي عام بدأت الحرب العالمية الثانية؟', answer: '1939' },
    { id: 'Q033', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'ما هو الكوكب الذي لديه أكبر عدد من الأقمار؟', answer: 'زحل' },
    { id: 'Q034', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'من اخترع المصباح الكهربائي؟', answer: 'توماس إديسون' },
    { id: 'Q035', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'ماذا يسمى طبيب الأسنان؟', answer: 'طبيب أسنان' },
    { id: 'Q036', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'ما هي أكبر صحراء في العالم؟', answer: 'الصحراء القطبية الجنوبية' },
    { id: 'Q037', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'كم عدد عظام جسم الإنسان البالغ؟', answer: '206' },
    { id: 'Q038', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'ما هو الغاز الأكثر وفرة في الغلاف الجوي للأرض؟', answer: 'النيتروجين' },
    { id: 'Q039', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'من هو مؤلف سلسلة كتب "هاري بوتر"؟', answer: 'ج. ك. رولينج' },
    { id: 'Q040', kind: 'question', difficulty: 'medium', name: 'سؤال متوسط', question: 'ما هي القوة التي تبقي الكواكب في مدارها حول الشمس؟', answer: 'الجاذبية' },

    // --- Hard Questions (20) ---
    { id: 'Q041', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'ما هو ثاني أعلى جبل في العالم؟', answer: 'جبل كي 2' },
    { id: 'Q042', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'ما هو العدد الذري للأكسجين؟', answer: '8' },
    { id: 'Q043', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'ما اسم العملية التي تحول بها النباتات ضوء الشمس إلى طاقة؟', answer: 'التمثيل الضوئي' },
    { id: 'Q044', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'في أي مدينة يوجد تمثال الحرية؟', answer: 'نيويورك' },
    { id: 'Q045', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'من هو إله الرعد في الأساطير الإسكندنافية؟', answer: 'ثور' },
    { id: 'Q046', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'ما هو أصل الألعاب الأولمبية؟', answer: 'اليونان القديمة' },
    { id: 'Q047', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'ما هو أندر فصيلة دم لدى البشر؟', answer: 'AB سالب' },
    { id: 'Q048', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'كم تساوي باي (π) لأقرب منزلتين عشريتين؟', answer: '3.14' },
    { id: 'Q049', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'ما هو اسم أعمق نقطة في المحيط؟', answer: 'خندق ماريانا' },
    { id: 'Q050', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'من كتب "الجريمة والعقاب"؟', answer: 'دوستويفسكي' },
    { id: 'Q051', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'ما هو أطول هيكل من صنع الإنسان في العالم؟', answer: 'برج خليفة' },
    { id: 'Q052', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'ما هي اللغة الأكثر تحدثًا في العالم؟', answer: 'الماندرين الصينية' },
    { id: 'Q053', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'ما هو أصل الكلمة "روبوت"؟', answer: 'تشيكي' },
    { id: 'Q054', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'ما هو أصلب معدن طبيعي على الأرض؟', answer: 'الماس' },
    { id: 'Q055', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'في أي قرن عاش شكسبير؟', answer: 'السادس عشر' },
    { id: 'Q056', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'ماذا يدرس علم الحشرات؟', answer: 'الحشرات' },
    { id: 'Q057', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'ما هي أكبر جزيرة في العالم؟', answer: 'جرينلاند' },
    { id: 'Q058', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'من هو أول رئيس للولايات المتحدة؟', answer: 'جورج واشنطن' },
    { id: 'Q059', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'ما هو لون دم سرطان حدوة الحصان؟', answer: 'أزرق' },
    { id: 'Q060', kind: 'question', difficulty: 'hard', name: 'سؤال صعب', question: 'ما هي عاصمة أستراليا؟', answer: 'كانبرا' },
];

export const QUIZ_SWAP_DECK_MAP = new Map<string, QuizSwapCard>(
    QUIZ_SWAP_DECK.map(card => [card.id, card])
);
