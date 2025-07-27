
import type { PlayerRole } from '@/types';

export const ROLE_CARD_IMAGES: Record<PlayerRole, string> = {
    killer: '/roles/killer.png',
    detective: '/roles/detective.png',
    doctor: '/roles/doctor.png',
    spy: '/roles/spy.png',
    soldier: '/roles/soldier.png',
    impersonator: '/roles/impersonator.png',
    civilian: '/roles/civilian.png',
    suicide_bomber: '/roles/suicide-bomber.png', // Add new card image path
    contestant: '/roles/civilian.png', // Fallback for other game modes
};

// You can add your own images to the public/roles/ folder and update the paths here.
// For example, if you add doctor.png, the path would be '/roles/doctor.png'.
