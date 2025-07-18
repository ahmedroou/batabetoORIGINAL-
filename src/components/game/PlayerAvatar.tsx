
import type { FC } from 'react';
import Image from 'next/image';

interface PlayerAvatarProps {
  avatarId: string; // Now this will be a filename like 'Avatar01.png'
  className?: string;
}

export const PlayerAvatar: FC<PlayerAvatarProps> = ({ avatarId, className }) => {
    // Construct the path to the image in the public folder
    const imagePath = `/avatars/${avatarId}`;

    return (
        <div className={className}>
            <Image
                src={imagePath}
                alt={`Avatar ${avatarId}`}
                width={100} // Set a base width
                height={100} // Set a base height
                className="w-full h-full object-cover rounded-full"
                unoptimized // Use this if you have many dynamic images or SVGs as PNGs
            />
        </div>
    );
};
