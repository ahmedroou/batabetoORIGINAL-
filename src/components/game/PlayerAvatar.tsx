
import type { FC } from 'react';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';

interface PlayerAvatarProps {
  avatarId: string;
  className?: string;
  temporaryTitle?: string;
  priority?: boolean;
}

export const PlayerAvatar: FC<PlayerAvatarProps> = ({ avatarId, className, temporaryTitle, priority = false }) => {
    // Check if the avatar is a punishment avatar to construct the correct path
    const isPunishmentAvatar = avatarId.startsWith('Punish');
    const imagePath = isPunishmentAvatar ? `/punishment/${avatarId}` : `/avatars/${avatarId}`;

    return (
        <div className="relative">
            <div className={className}>
                <Image
                    src={imagePath}
                    alt={`Avatar ${avatarId}`}
                    width={100} // Set a base width
                    height={100} // Set a base height
                    className="w-full h-full object-cover rounded-full"
                    unoptimized // Use this if you have many dynamic images or SVGs as PNGs
                    priority={priority}
                />
            </div>
             {temporaryTitle && (
                <Badge 
                    variant="destructive" 
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-xs px-1 py-0.5 whitespace-nowrap"
                >
                    {temporaryTitle}
                </Badge>
            )}
        </div>
    );
};
