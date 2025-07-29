
import type { Role, MafiaRole } from '@/types';

export const MAFIA_ROLES: Role[] = [
  { id: 'killer', name: 'القاتل', team: 'mafia', description: 'يقتل لاعبًا واحدًا كل ليلة.', image: '/roles/killer.png' },
  { id: 'detective', name: 'المحقق', team: 'good', description: 'يكشف هوية لاعب واحد كل ليلة.', image: '/roles/detective.png' },
  { id: 'doctor', name: 'الطبيب', team: 'good', description: 'يحمي لاعبًا واحدًا كل ليلة.', image: '/roles/doctor.png' },
  { id: 'soldier', name: 'الجندي', team: 'good', description: 'يكتشف الجاسوس إذا حاول التجسس عليه.', image: '/roles/soldier.png' },
  { id: 'spy', name: 'الجاسوس', team: 'mafia', description: 'يكشف دور لاعب واحد كل ليلة لمصلحة المافيا.', image: '/roles/spy.png' },
  { id: 'shifter', name: 'المنتحل', team: 'good', description: 'يغير هويته الظاهرية كل ليلة لخداع الجواسيس.', image: '/roles/shifter.png' },
  { id: 'explosive', name: 'الانتحاري', team: 'good', description: 'يختار لاعبًا ليأخذه معه إذا تم قتله.', image: '/roles/explosive.png' },
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
