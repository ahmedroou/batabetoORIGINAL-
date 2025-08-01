
import type { PlayerRole, PlayerTeam } from '@/types';

export interface RoleDetails {
    id: PlayerRole;
    name: string;
    team: PlayerTeam;
    description: string;
    // imagePath is kept for fallback or other UI uses, but the primary display will be video
    imagePath: string; 
}

export const ROLES: Record<PlayerRole, RoleDetails> = {
    killer: {
        id: 'killer',
        name: 'القاتل',
        team: 'mafia',
        description: 'هدفك هو القضاء على فريق الخير. في كل ليلة، يمكنك اختيار لاعب لقتله.',
        imagePath: '/roles/killer.png'
    },
    detective: {
        id: 'detective',
        name: 'المحقق',
        team: 'good',
        description: 'هدفك كشف هوية القاتل. في كل ليلة، يمكنك التحقيق في هوية لاعب واحد، وستعرف ما إذا كان من فريق الخير أم الشر.',
        imagePath: '/roles/detective.png'
    },
    doctor: {
        id: 'doctor',
        name: 'الطبيب',
        team: 'good',
        description: 'هدفك حماية الأبرياء. في كل ليلة، يمكنك اختيار لاعب لحمايته من القتل. لا يمكنك حماية نفس الشخص في ليلتين متتاليتين.',
        imagePath: '/roles/doctor.png'
    },
    soldier: {
        id: 'soldier',
        name: 'الجندي',
        team: 'good',
        description: 'أنت درع فريق الخير. إذا حاول الجاسوس كشف هويتك، ستتمكن من كشفه بدلاً من ذلك.',
        imagePath: '/roles/soldier.png'
    },
    spy: {
        id: 'spy',
        name: 'الجاسوس',
        team: 'mafia',
        description: 'أنت تعمل لمصلحة المافيا. في كل ليلة، يمكنك كشف دور لاعب واحد. إذا كشفت القاتل، ستتمكن من التواصل معه سراً.',
        imagePath: '/roles/spy.png'
    },
    shapeshifter: {
        id: 'shapeshifter',
        name: 'المنتحل',
        team: 'good',
        description: 'أنت خبير في التخفي. كل ليلة، تختار هوية وهمية. إذا حاول الجاسوس كشفك، سيرى هويتك الوهمية. المحقق يستطيع كشفك.',
        imagePath: '/roles/shapeshifter.png'
    },
    bomber: {
        id: 'bomber',
        name: 'الانتحاري',
        team: 'good',
        description: 'أنت قنبلة موقوتة. كل ليلة، تختار هدفاً. إذا تم إعدامك، سيموت هدفك معك.',
        imagePath: '/roles/bomber.png'
    },
    civilian: {
        id: 'civilian',
        name: 'المدني',
        team: 'good',
        description: 'أنت مواطن بسيط. هدفك هو البقاء على قيد الحياة والمساعدة في كشف القاتل من خلال النقاش والتصويت.',
        imagePath: '/roles/civilian.png'
    },
    contestant: {
        id: 'contestant',
        name: 'متسابق',
        team: 'neutral',
        description: 'دور يستخدم في ألعاب أخرى.',
        imagePath: '/roles/civilian.png'
    }
};

/**
 * Distributes roles based on the number of players.
 * Ensures a balanced game with key roles present.
 * @param {number} playerCount - The number of players in the game.
 * @returns {PlayerRole[]} An array of roles to be assigned.
 */
export function getRoleDistribution(playerCount: number): PlayerRole[] {
    if (playerCount < 4) {
        // Fallback for less than minimum players, though UI should prevent this.
        return ['killer', 'detective', 'doctor', 'civilian'].slice(0, playerCount) as PlayerRole[];
    }
    
    // Core roles for all game sizes
    const roles: PlayerRole[] = ['killer', 'detective', 'doctor'];

    if (playerCount >= 4) {
        roles.push('soldier');
    }
    if (playerCount >= 5) {
        roles.push('spy');
    }
    if (playerCount >= 6) {
        roles.push('bomber');
    }
    if (playerCount >= 7) {
        roles.push('shapeshifter');
    }
    
    // Fill the rest with civilians
    while (roles.length < playerCount) {
        roles.push('civilian');
    }

    // Shuffle the roles for random assignment
    for (let i = roles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    return roles;
}
