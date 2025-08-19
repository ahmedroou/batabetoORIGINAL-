

import type { SocialRank } from '../types';
import { Award, Crown, Gem, Shield, ShieldCheck } from 'lucide-react';

export const DEFAULT_SOCIAL_RANKS: SocialRank[] = [
    { threshold: 0, name: 'عامل وضيع', icon: Shield, permissions: [] },
    { threshold: 50, name: 'مواطن صالح', icon: ShieldCheck, permissions: [] },
    { threshold: 150, name: 'شخصية مرموقة', icon: Award, permissions: [] },
    { threshold: 300, name: 'عضو مجلس', icon: Gem, permissions: ['can_view_player_balances'] },
    { threshold: 500, name: 'زعيم المدينة', icon: Crown, permissions: ['can_view_player_balances', 'can_force_name_change'] },
];

export const DEFAULT_TRAP_ANSWER_CATEGORIES = [
    "تاريخ",
    "رياضة",
    "أدب",
    "أنمي ومانجا",
    "إسلاميات",
    "فنون",
    "جغرافيا",
    "لغة عربية",
    "معلومات غريبة",
    "الحيوانات والطبيعة",
    "النباتات",
    "المطبخ"
];

export const DEFAULT_EDUCATED_MERCHANT_CATEGORIES = [
    "علوم",
    "رياضيات",
    "برمجة",
    "أحياء",
    "كيمياء",
    "قسم الغرامات"
];
