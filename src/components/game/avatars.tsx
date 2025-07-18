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

export const Avatar13: FC<AvatarProps> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360" fill="none" shapeRendering="auto" width="512" height="512" className={className}>
    <mask id="viewboxMask"><rect width="360" height="360" rx="0" ry="0" x="0" y="0" fill="#fff" /></mask><g mask="url(#viewboxMask)"><g transform="translate(80 23)"><path d="M154 319.5c-14.4-20-25.67-58.67-27-78L58.5 212 30 319.5h124Z" fill="#f9c9b6" stroke="#000" strokeWidth="4"/><path d="M130.37 263.69c-2.1.2-4.22.31-6.37.31-30.78 0-56.05-21.57-58.76-49.1L127 241.5c.38 5.48 1.55 13.32 3.37 22.19Z" fill="#000" style={{mixBlendMode:'multiply'}}/><path d="M181.94 151.37v.01l.1.4.14.65A75.72 75.72 0 0 1 34.93 187.7l-.2-.74L18 117.13l-.06-.29A75.72 75.72 0 0 1 165.2 81.55l.05.21.02.08.05.2.05.2v.01l16.4 68.44.08.34.08.34Z" fill="#f9c9b6" stroke="#000" strokeWidth="4"/><g transform="translate(34 102.3)"></g></g><g transform="translate(170 183)"><path d="M13 46c1.72-7.96 8.07-24.77 19.77-28.35 11.7-3.58 17.7 8.46 19.23 14.92" stroke="#000000" strokeWidth="4"/></g><g transform="translate(110 102)"><path d="M99 10.21c5.67-2.66 19-5.1 27 6.5M23.58 35.52c2.07-5.9 9.68-17.12 23.56-14.7" stroke="#000000" strokeWidth="4" strokeLinecap="round"/></g><g transform="translate(49 11)"><path d="M123.79 17.49H123.94a96.78 96.78 0 0 1 62.07 24.36c14.06 12.4 22.45 26.87 25.19 36.73-4.06 2.32-11.01 4.31-19.88 5.95-9.68 1.78-21.3 3.08-33.15 4.01-23.7 1.86-48.2 2.2-59.63 1.96l-6.07-.13 4.8 3.71c2.5 1.93 5.83 3.28 9.34 4.22 3.55.95 7.42 1.54 11.14 1.87 3.82.34 7.55.42 10.64.34-10.59 8.16-24.06 14.44-37.35 19.09a225.88 225.88 0 0 1-39.83 9.92l-2.15.32.5 2.11c3.34 14.43 9.5 39.65 13.62 56.57 1.83 7.5 3.26 13.38 3.87 15.94 1.09 4.56 4.5 11.05 8.4 17.03 3.6 5.52 7.78 10.89 11.32 14.2l-7.84 31.81H49.37c8.34-12.71 10.1-27.4 8.4-42.98-1.84-16.87-7.76-35-14-53.17l-1.85-5.36c-5.69-16.46-11.36-32.88-14.43-48.6-3.4-17.44-3.56-33.75 2.83-48.09 10.34-23.21 28.66-36.7 47-44.12 18.37-7.45 36.61-8.76 46.46-7.71Z" fill="#000000" stroke="#000" strokeWidth="4"/></g><g transform="translate(142 119)"><g fill="#000000"><ellipse cx="16.53" cy="29.4" rx="9" ry="13.5" transform="rotate(-6.78 16.53 29.4)"/><ellipse cx="80.53" cy="19.4" rx="9" ry="13.5" transform="rotate(-6.28 80.53 19.4)"/></g><g transform="translate(-40 -8)"></g></g><g transform="rotate(-8 1149.44 -1186.92)"><path d="M16.5 7c-.33 3.83 0 12.2 4 15 5 3.5-.5 12-10.5 10" stroke="#000" strokeWidth="4"/></g><g transform="translate(84 154)"><path d="M30.5 6.18A23.78 23.78 0 0 0 23.08 5c-10.5 0-19 6.5-18 18.5 1.04 12.5 8.5 17 19 17A19.6 19.6 0 0 0 31 39.23" stroke="#000" strokeWidth="8"/><path d="M31.5 39.04a19.38 19.38 0 0 1-7.42 1.46c-10.5 0-17.96-4.5-19-17-1-12 7.5-18.5 18-18.5 3.14 0 6.19.6 8.92 1.73l-.5 32.3Z" fill="#f9c9b6"/><path d="M27.5 13.5c-4-1.83-12.8-2.8-16 8" stroke="#000" strokeWidth="4"/><path d="M17 14c2.17 1.83 6.3 7.5 5.5 15.5" stroke="#000" strokeWidth="4"/><g transform="translate(3 35)"></g></g><g transform="translate(53 272)"><path d="M260.37 90.86H-12.54l.1-.2C-7.89 81.38.5 64.31 11.4 49.03c6.2-8.67 13.13-16.65 20.54-22.27 7.41-5.61 15.12-8.73 22.95-8.04 15.06 1.31 28.46 9.56 41.93 17.83l3.83 2.35c14.48 8.82 29.35 17.02 45.72 13.43 5.53-1.2 9.26-3.8 11.6-7.16 2.32-3.3 3.15-7.15 3.3-10.66.14-3.52-.4-6.85-.96-9.26a39.89 39.89 0 0 0-.75-2.78c3.63-3.64 7.47-5.77 11.43-6.73 4.3-1.03 8.89-.73 13.72.7 9.73 2.87 20.14 10.25 30.3 19.73 18.61 17.37 35.69 41.14 45.36 54.68Z" fill="#000000" stroke="#000" strokeWidth="4.27"/></g></g></svg>
);

export const Avatar14: FC<AvatarProps> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" shapeRendering="auto" width="512" height="512" className={className}>
    <mask id="viewboxMask"><rect width="100" height="100" rx="0" ry="0" x="0" y="0" fill="#fff" /></mask><g mask="url(#viewboxMask)"><rect fill="#69d2e7" width="100" height="100" x="0" y="0" /><g transform="translate(1, -5) rotate(20 50 70)"><path d="M95 53.33C95 29.4 74.85 10 50 10S5 29.4 5 53.33V140h90V53.33Z" fill="#0a5b83"/><g transform="translate(29 33)"><g transform="translate(-7, 0) rotate(-15 21 21)"><g transform="translate(0 1)"><path d="M6.5 10C2.62 10-.61 5.77.1 5.15c.71-.62 2.63 1.3 6.4 1.3 3.77 0 5.69-2 6.4-1.3S10.38 10 6.5 10ZM35.5 10c-3.88 0-7.11-4.23-6.4-4.85.71-.62 2.63 1.3 6.4 1.3 3.77 0 5.69-2 6.4-1.3S39.38 10 35.5 10Z" fill="#ffffff"/></g><g transform="translate(6 27)"><path d="M15 14C1.9 14-.72 1.29.15.23 1.03-.83 6.27 2.11 15 2.11S28.97-.83 29.85.23C30.72 1.3 28.1 14 15 14Z" fill="#ffffff"/></g></g></g></g></g></svg>
);

export const Avatar15: FC<AvatarProps> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" shapeRendering="auto" width="512" height="512" className={className}>
    <mask id="viewboxMask"><rect width="100" height="100" rx="0" ry="0" x="0" y="0" fill="#fff" /></mask><g mask="url(#viewboxMask)"><rect fill="#f1f4dc" width="100" height="100" x="0" y="0" /><g transform="translate(-2, -4) rotate(8 50 70)"><path d="M95 53.33C95 29.4 74.85 10 50 10S5 29.4 5 53.33V140h90V53.33Z" fill="#69d2e7"/><g transform="translate(29 33)"><g transform="translate(-7, 15) rotate(-16 21 21)"><g transform="translate(0 5)"><path d="M-2.75 8.12C-1.34 11.86 9 16 9 16s5.17-9.58 3.76-13.32c0 0-1.41-3.74-5.3-2.38-3.87 1.36-2.7 4.48-2.7 4.48S3.6 1.66-.27 3.02c-3.88 1.36-2.47 5.1-2.47 5.1ZM29.24 2.68C27.84 6.42 33 16 33 16s10.34-4.14 11.75-7.88c0 0 1.41-3.74-2.47-5.1-3.87-1.36-5.05 1.76-5.05 1.76s1.18-3.12-2.7-4.48c-3.88-1.36-5.29 2.38-5.29 2.38Z" fill="#ffffff"/></g><g transform="translate(6 23)"><path d="M15 14C1.9 14-.72 1.29.15.23 1.03-.83 6.27 2.11 15 2.11S28.97-.83 29.85.23C30.72 1.3 28.1 14 15 14Z" fill="#ffffff"/></g></g></g></g></g></svg>
);

export const Avatar16: FC<AvatarProps> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none" shapeRendering="auto" width="512" height="512" className={className}>
    <mask id="viewboxMask"><rect width="200" height="200" rx="0" ry="0" x="0" y="0" fill="#fff" /></mask><g mask="url(#viewboxMask)"><rect fill="#d84be5" width="200" height="200" x="0" y="0" /><g transform="matrix(1.5625 0 0 1.5625 37.5 110.94)"><path d="M40.54 12h-.75c-9.7.22-20.8 5.3-23.7 16.15a1.36 1.36 0 0 0 .44 1.55 1.41 1.41 0 0 0 2.26-.86c2.55-9.46 12.42-13.89 21.06-14.08 8.24-.16 19.04 3.84 22.46 14.57a1.47 1.47 0 0 0 1.65.55A1.44 1.44 0 0 0 65 28.5C61.85 18.69 52.3 12 40.54 12Z" fill="#000"/></g><g transform="matrix(1.5625 0 0 1.5625 31.25 59.38)"><path d="M87.22 13.98c0-7.2-5.82-13.04-13-13.04s-13 5.84-13 13.04v3.92c0 7.2 5.82 13.04 13 13.04s13-5.83 13-13.04v-3.92Z" fill="#000"/><path d="M70 10.48a2.29 2.29 0 1 0 0-4.58 2.29 2.29 0 0 0 0 4.58Z" fill="#fff"/><path opacity=".1" d="M74.24 19.3a5.32 5.32 0 1 0 0-10.66 5.32 5.32 0 0 0 0 10.65Z" fill="#fff"/><path d="M26.22 13.98c0-7.2-5.82-13.04-13-13.04s-13 5.84-13 13.04v3.92c0 7.2 5.82 13.04 13 13.04s13-5.83 13-13.04v-3.92Z" fill="#000"/><path d="M9 10.48A2.29 2.29 0 1 0 9 5.9a2.29 2.29 0 0 0 0 4.58Z" fill="#fff"/><path opacity=".1" d="M13.24 19.3a5.32 5.32 0 1 0 0-10.66 5.32 5.32 0 0 0 0 10.65Z" fill="#fff"/><path d="M84.33-5.7H65.45C58.63-5.7 53.1-.2 53.1 6.6v18.8c0 6.79 5.52 12.3 12.34 12.3h18.88c6.81 0 12.34-5.51 12.34-12.3V6.6c0-6.8-5.53-12.3-12.34-12.3Z" fill="url(#eyesGlasses-a)"/><path d="M21.3-5.7H2.42C-4.4-5.7-9.92-.2-9.92 6.6v18.8c0 6.79 5.52 12.3 12.34 12.3H21.3c6.81 0 12.34-5.51 12.34-12.3V6.6c0-6.8-5.53-12.3-12.34-12.3Z" fill="url(#eyesGlasses-b)"/><g fill="#000"><path d="M21.06 40.12H2.18A14.83 14.83 0 0 1-8.2 35.81a14.71 14.71 0 0 1-4.33-10.34V6.6c.02-3.87 1.58-7.59 4.34-10.34A14.85 14.85 0 0 1 2.18-8.06h18.88c3.92.02 7.66 1.58 10.42 4.35 2.76 2.76 4.31 6.5 4.31 10.4v18.7A14.62 14.62 0 0 1 26.71 39c-1.79.74-3.7 1.12-5.65 1.12ZM2.18-3.26A9.96 9.96 0 0 0-7 2.83a9.85 9.85 0 0 0-.76 3.78v18.8a9.85 9.85 0 0 0 9.9 9.86h18.92a9.93 9.93 0 0 0 9.9-9.86V6.6a9.87 9.87 0 0 0-9.9-9.86H2.18ZM84.33 40.12H65.46a14.83 14.83 0 0 1-10.39-4.31 14.71 14.71 0 0 1-4.33-10.34V6.6c.02-3.87 1.58-7.59 4.34-10.34a14.85 14.85 0 0 1 10.38-4.32h18.87c3.9.03 7.65 1.59 10.41 4.35s4.31 6.5 4.32 10.4v18.7c0 3.9-1.56 7.64-4.32 10.4a14.83 14.83 0 0 1-10.41 4.33ZM65.46-3.26a9.93 9.93 0 0 0-9.9 9.87v18.8a9.85 9.85 0 0 0 9.9 9.86h18.87a9.93 9.93 0 0 0 9.9-9.86V6.6a9.85 9.85 0 0 0-9.9-9.86H65.46Z"/><path d="M53.1 10.64H33.4v4.89h19.7v-4.89Z"/></g><defs><linearGradient id="eyesGlasses-a" x1="2332.67" y1="1561.82" x2="3621.21" y2="1561.82" gradientUnits="userSpaceOnUse"><stop stopColor="#fff" stopOpacity=".3"/><stop offset=".5" stopColor="#969696" stopOpacity=".2"/><stop offset="1" stopColor="#fff" stopOpacity=".3"/></linearGradient><linearGradient id="eyesGlasses-b" x1="2269.64" y1="1561.82" x2="3558.18" y2="1561.82" gradientUnits="userSpaceOnUse"><stop stopColor="#fff" stopOpacity=".3"/><stop offset=".5" stopColor="#969696" stopOpacity=".2"/><stop offset="1" stopColor="#fff" stopOpacity=".3"/></linearGradient></defs></g></g></svg>
);

export const Avatar17: FC<AvatarProps> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none" shapeRendering="auto" width="512" height="512" className={className}>
    <mask id="viewboxMask"><rect width="200" height="200" rx="0" ry="0" x="0" y="0" fill="#fff" /></mask><g mask="url(#viewboxMask)"><rect fill="#71cf62" width="200" height="200" x="0" y="0" /><g transform="matrix(1.5625 0 0 1.5625 37.5 110.94)"><path d="M75.08 12a1.37 1.37 0 0 1 1.26.83 15.26 15.26 0 0 1-15.67 22.03 15.2 15.2 0 0 1-9.53-5.26 1.48 1.48 0 0 1 1.15-2.09c.3-.04.61.02.88.17a12.52 12.52 0 0 0 16.54 2.35c4.01-2.7 7.51-8.54 4.1-16.07a1.48 1.48 0 0 1 .77-1.83c.16-.08.34-.12.51-.13Z" fill="#000"/></g><g transform="matrix(1.5625 0 0 1.5625 31.25 59.38)"><path d="M75.76 21.94c-2.9.04-5.72-.89-8.04-2.63a13.47 13.47 0 0 1-4.85-7.03 1.75 1.75 0 0 1 .49-1.92 1.7 1.7 0 0 1 2.76.9c.6 2.12 1.88 3.98 3.62 5.29a9.84 9.84 0 0 0 6.04 1.98c2.17.01 4.29-.68 6.03-2a10.17 10.17 0 0 0 3.65-5.26c.15-.42.46-.75.85-.95a1.68 1.68 0 0 1 2.24.7c.21.38.27.83.17 1.26a13.48 13.48 0 0 1-4.87 7.04 13.17 13.17 0 0 1-8.08 2.62ZM13.76 21.94c-2.9.03-5.73-.9-8.06-2.65a13.54 13.54 0 0 1-4.85-7.06 1.78 1.78 0 0 1 .51-1.88 1.67 1.67 0 0 1 2.4.22c.15.17.25.38.32.6.62 2.1 1.9 3.96 3.64 5.28a9.93 9.93 0 0 0 6.02 2c2.18.03 4.3-.67 6.06-1.99a10.22 10.22 0 0 0 3.66-5.3 1.68 1.68 0 0 1 3.08-.25c.21.4.27.85.17 1.27a13.57 13.57 0 0 1-4.87 7.1 13.19 13.19 0 0 1-8.08 2.65Z" fill="#000"/></g></g></svg>
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
  'Avatar13': Avatar13,
  'Avatar14': Avatar14,
  'Avatar15': Avatar15,
  'Avatar16': Avatar16,
  'Avatar17': Avatar17,
};

export const DefaultAvatar: FC<AvatarProps> = ({ className }) => (
  <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="45" fill="#E5E5E5"/>
    <circle cx="50" cy="50" r="15" fill="#BDBDBD"/>
  </svg>
);
