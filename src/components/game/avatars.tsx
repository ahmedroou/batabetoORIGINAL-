"use client";

import type { FC } from 'react';

interface AvatarProps {
  className?: string;
}

export const Avatar01: FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="45" fill="#FFDDC1"/>
    <circle cx="35" cy="40" r="6" fill="#000"/>
    <circle cx="65" cy="40" r="6" fill="#000"/>
    <path d="M30 65 Q 50 85, 70 65" stroke="#000" strokeWidth="5" fill="none" strokeLinecap="round"/>
  </svg>
);

export const Avatar02: FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="45" fill="#A2D2FF"/>
    <rect x="25" y="35" width="50" height="20" rx="10" fill="#000"/>
    <path d="M30 70 H 70" stroke="#000" strokeWidth="5" fill="none" strokeLinecap="round"/>
  </svg>
);

export const Avatar03: FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="45" fill="#FFC8DD"/>
    <circle cx="35" cy="40" r="6" fill="#000"/>
    <path d="M60 45 L 70 35 M 70 45 L 60 35" stroke="#000" strokeWidth="5" strokeLinecap="round"/>
    <path d="M30 65 Q 50 80, 70 65" stroke="#000" strokeWidth="5" fill="none" strokeLinecap="round"/>
  </svg>
);

export const Avatar04: FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="45" fill="#FFF3AD"/>
    <circle cx="35" cy="40" r="8" fill="#000"/>
    <circle cx="65" cy="40" r="8" fill="#000"/>
    <circle cx="50" cy="70" r="10" fill="#000"/>
  </svg>
);

export const Avatar05: FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="45" fill="#BDE0FE"/>
    <path d="M25 45 C 30 35, 40 35, 45 45" stroke="#000" strokeWidth="5" fill="none"/>
    <path d="M55 45 C 60 35, 70 35, 75 45" stroke="#000" strokeWidth="5" fill="none"/>
    <path d="M30 65 Q 50 90, 70 65" stroke="#000" strokeWidth="5" fill="none" strokeLinecap="round"/>
    <path d="M30 50 C 35 55, 30 60, 25 55" fill="#0000FF"/>
    <path d="M75 50 C 70 55, 75 60, 80 55" fill="#0000FF"/>
  </svg>
);

export const Avatar06: FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="45" fill="#FFADAD"/>
    <path d="M25 35 L 45 45" stroke="#000" strokeWidth="5" strokeLinecap="round"/>
    <path d="M45 35 L 25 45" stroke="#000" strokeWidth="5" strokeLinecap="round"/>
    <path d="M55 45 L 75 35" stroke="#000" strokeWidth="5" strokeLinecap="round"/>
    <path d="M75 45 L 55 35" stroke="#000" strokeWidth="5" strokeLinecap="round"/>
    <path d="M30 75 Q 50 60, 70 75" stroke="#000" strokeWidth="5" fill="none" strokeLinecap="round"/>
  </svg>
);

export const Avatar07: FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="45" fill="#CDB4DB"/>
    <path d="M35 45 C 25 30, 45 30, 35 45" fill="#B57EDC"/>
    <path d="M65 45 C 55 30, 75 30, 65 45" fill="#B57EDC"/>
    <path d="M30 65 Q 50 85, 70 65" stroke="#000" strokeWidth="5" fill="none" strokeLinecap="round"/>
  </svg>
);

export const Avatar08: FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="45" fill="#E0E0E0"/>
    <circle cx="35" cy="40" r="6" fill="#000"/>
    <circle cx="65" cy="40" r="6" fill="#000"/>
    <path d="M40 70 H 60" stroke="#000" strokeWidth="5" fill="none" strokeLinecap="round"/>
    <path d="M70 55 A 10 10 0 1 1 80 65" stroke="#000" strokeWidth="3" fill="none"/>
  </svg>
);

export const Avatar09: FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <rect x="15" y="15" width="70" height="70" rx="10" fill="#C0C0C0"/>
    <rect x="30" y="35" width="15" height="15" fill="#2F4F4F"/>
    <rect x="55" y="35" width="15" height="15" fill="#2F4F4F"/>
    <rect x="30" y="60" width="40" height="8" rx="4" fill="#2F4F4F"/>
  </svg>
);

export const Avatar10: FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="60" r="40" fill="#87CEEB"/>
    <circle cx="38" cy="55" r="5" fill="#000"/>
    <circle cx="62" cy="55" r="5" fill="#000"/>
    <path d="M35 75 Q 50 90, 65 75" stroke="#000" strokeWidth="4" fill="none" strokeLinecap="round"/>
    <polygon points="50,0 25,40 75,40" fill="#FF69B4"/>
    <circle cx="50" cy="10" r="5" fill="#FFFF00"/>
  </svg>
);

export const Avatar11: FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="45" fill="#FFC0CB"/>
    <path d="M35 45 C 25 30, 45 30, 35 45" fill="#FF1493"/>
    <path d="M35 45 C 45 30, 25 30, 35 45" fill="#FF1493"/>
    <path d="M65 45 C 55 30, 75 30, 65 45" fill="#FF1493"/>
    <path d="M65 45 C 75 30, 55 30, 65 45" fill="#FF1493"/>
    <path d="M30 65 Q 50 85, 70 65" stroke="#000" strokeWidth="5" fill="none" strokeLinecap="round"/>
  </svg>
);

export const Avatar12: FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="45" fill="#F5DEB3"/>
    <circle cx="35" cy="40" r="6" fill="#000"/>
    <circle cx="65" cy="40" r="6" fill="#000"/>
    <path d="M30,60 C 40,50 60,50 70,60 C 60,70 40,70 30,60" fill="#8B4513"/>
    <path d="M40 75 H 60" stroke="#000" strokeWidth="5" fill="none" strokeLinecap="round"/>
  </svg>
);

export const AVATAR_MAP: Record<string, FC<AvatarProps>> = {
  'Avatar01': Avatar01,
  'Avatar02': Avatar02,
  'Avatar03': Avatar03,
  'Avatar04': Avatar04,
  'Avatar05': Avatar05,
  'Avatar06': Avatar06,
  'Avatar07': Avatar07,
  'Avatar08': Avatar08,
  'Avatar09': Avatar09,
  'Avatar10': Avatar10,
  'Avatar11': Avatar11,
  'Avatar12': Avatar12,
};

export const DefaultAvatar: FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="45" fill="#E5E5E5"/>
    <circle cx="50" cy="50" r="15" fill="#BDBDBD"/>
  </svg>
);
