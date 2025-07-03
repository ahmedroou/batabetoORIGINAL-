
import type { FC } from 'react';
import { AVATAR_MAP, DefaultAvatar } from '@/components/game/avatars';

interface PlayerAvatarProps {
  avatarId: string;
  className?: string;
}

export const PlayerAvatar: FC<PlayerAvatarProps> = ({ avatarId, className }) => {
    const AvatarComponent = AVATAR_MAP[avatarId] || DefaultAvatar;
    return <AvatarComponent className={className} />;
};
