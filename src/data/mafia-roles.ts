
import type { Role, MafiaRole } from '@/types';

export const MAFIA_ROLES: Role[] = [
  { id: 'killer', name: 'القاتل', team: 'mafia', description: 'يقتل لاعبًا واحدًا كل ليلة.', image: '/roles/killer.png' },
  { id: 'detective', name: 'المحقق', team: 'good', description: 'يكشف فريق لاعب واحد كل ليلة (خير أم مافيا).', image: '/roles/detective.png' },
  { id: 'doctor', name: 'الطبيب', team: 'good', description: 'يحمي لاعبًا واحدًا كل ليلة من القتل.', image: '/roles/doctor.png' },
  { id: 'soldier', name: 'الجندي', team: 'good', description: 'لا يمكن قتله في الليلة الأولى. إذا حاول الجاسوس التجسس عليه، فإنه يكشف الجاسوس.', image: '/roles/soldier.png' },
  { id: 'spy', name: 'الجاسوس', team: 'mafia', description: 'يكشف دور لاعب واحد كل ليلة لفريقه. إذا كشف مافيا آخر، تفتح دردشة خاصة بينهما.', image: '/roles/spy.png' },
  { id: 'shifter', name: 'المنتحل', team: 'good', description: 'يختار كل ليلة دورًا يظهر به للجواسيس لخداعهم.', image: '/roles/shifter.png' },
  { id: 'explosive', name: 'الانتحاري', team: 'good', description: 'يختار لاعبًا ليأخذه معه إذا تم قتله في الليل.', image: '/roles/explosive.png' },
  { id: 'civilian', name: 'مدني', team: 'good', description: 'لاعب عادي يحاول كشف القاتل والنجاة.', image: '/roles/civilian.png' },
];

export function getRoleDistribution(playerCount: number): MafiaRole[] {
    if (playerCount < 4) return [];
    
    let roles: MafiaRole[] = ['killer', 'detective', 'doctor'];
    
    if (playerCount >= 4) {
        roles.push('soldier');
    }
    if (playerCount >= 5) {
        roles.push('explosive');
    }
    if (playerCount >= 6) {
        roles.push('spy');
    }
     if (playerCount >= 7) {
        roles.push('shifter');
    }
    
    // Fill remaining spots with civilians
    while (roles.length < playerCount) {
        roles.push('civilian');
    }
    
    return roles;
}
