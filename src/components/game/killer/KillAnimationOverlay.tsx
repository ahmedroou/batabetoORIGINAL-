
"use client";

import { motion, AnimatePresence } from 'framer-motion';
import type { KillerMethod } from '@/types';
import { useEffect } from 'react';

// Custom SVG Icons for animations
const KnifeIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-32 h-32 text-red-400">
        <path d="M14.5 3L21 9.5 9.5 21 3 14.5 14.5 3z" />
        <path d="M12 6L6 12" />
    </svg>
);
const GunIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-32 h-32 text-gray-400">
        <path d="M21 4.2c-.3-.2-.7-.2-1 0L14.6 8H10c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h4.6l5.4 3.8c.2.1.4.2.6.2.2 0 .3 0 .5-.1.3-.2.5-.5.5-.9V5.1c0-.4-.2-.7-.5-.9zM10 14V10h3.4l4-2.8V16.8l-4-2.8H10zM3 15c-1.1 0-2-.9-2-2V11c0-1.1.9-2 2-2h1V7H3c-2.2 0-4 1.8-4 4v2c0 2.2 1.8 4 4 4h1v-2H3z" />
    </svg>
);
const PoisonIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-32 h-32 text-green-400">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
        <path d="M12 12l-2-2m4 4l-2-2m0 0l2-2m-2 2l-2 2" />
        <path d="M15 9h.01" />
        <path d="M9 15h.01" />
    </svg>
);
const FistIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-32 h-32 text-yellow-400">
        <path d="M18.5 4.5c-1.9 0-3.5 1.6-3.5 3.5 0 1.9 1.6 3.5 3.5 3.5s3.5-1.6 3.5-3.5c0-1.9-1.6-3.5-3.5-3.5zm-5 0c-1.9 0-3.5 1.6-3.5 3.5 0 1.9 1.6 3.5 3.5 3.5s3.5-1.6 3.5-3.5c0-1.9-1.6-3.5-3.5-3.5zM8.5 4.5c-1.9 0-3.5 1.6-3.5 3.5 0 1.9 1.6 3.5 3.5 3.5S12 9.9 12 8s-1.6-3.5-3.5-3.5zM19 14h-2.1c-.5-1.2-1.5-2.2-2.9-2.7V11c1.2-.5 2-1.6 2-2.9 0-.2 0-.4-.1-.6 1.1.5 1.9 1.5 2.1 2.7.1.3.4.5.7.5s.6-.2.7-.5c.2-1.2 1-2.2 2.1-2.7-.1.2-.1.4-.1.6 0 1.3.8 2.4 2 2.9v.3c-1.4.5-2.4 1.5-2.9 2.7H21c-.4 0-.7.3-.7.7 0 .4.3.7.7.7h2c.4 0 .7-.3.7-.7s-.3-.7-.7-.7h-2.1c.5-1.2 1.5-2.2 2.9-2.7v-.3c-1.2-.5-2-1.6-2-2.9 0-.2 0-.4.1-.6-1.1-.5-1.9-1.5-2.1-2.7-.1-.3-.4-.5-.7-.5s-.6.2-.7.5c-.2 1.2-1 2.2-2.1 2.7.1.2.1.4.1.6 0 1.3-.8 2.4-2 2.9v.3c1.4.5 2.4 1.5 2.9 2.7H19c.4 0 .7.3.7.7s-.3.7-.7.7z" />
    </svg>
);


const animationMap: Record<KillerMethod, React.ReactNode> = {
    "طعن بالسكين": <KnifeIcon />,
    "ضرب مبرح": <FistIcon />,
    "طلقة مسدس": <GunIcon />,
    "وابل من الرصاصات": <GunIcon />,
    "تعذيبه حتى الموت": <FistIcon />,
    "تسميمه": <PoisonIcon />,
    "منحه ميتة رحيمة": <KnifeIcon />,
};

const animationVariants = {
    "طعن بالسكين": { initial: { x: "-100vw", rotate: -45 }, animate: { x: 0, rotate: 15 }, transition: { type: "spring", stiffness: 100, damping: 10 } },
    "ضرب مبرح": { initial: { scale: 0 }, animate: { scale: [1, 0.9, 1], transition: { duration: 0.5, repeat: 3 } } },
    "طلقة مسدس": { initial: { x: "100vw" }, animate: { x: 0, transition: { duration: 0.3, ease: "easeOut" } } },
    "وابل من الرصاصات": { initial: { opacity: 0 }, animate: { opacity: 1, transition: { staggerChildren: 0.1 } } },
    "تسميمه": { initial: { scale: 0.5, opacity: 0 }, animate: { scale: 1, opacity: 1, transition: { duration: 1, ease: "easeInOut" } } },
    "منحه ميتة رحيمة": { initial: { y: "-100vh", opacity: 0 }, animate: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 50 } } },
    "تعذيبه حتى الموت": { initial: { scale: 0 }, animate: { scale: 1, rotate: [0, 10, -10, 10, 0], transition: { duration: 1, repeat: 1 } } },
};

const Bullet = () => <motion.div className="w-4 h-4 bg-yellow-400 rounded-full" variants={{ initial: { y: 20, opacity: 0 }, animate: { y: -20, opacity: 1 } }} />;

export const KillAnimationOverlay = ({ method, onAnimationEnd }: { method: KillerMethod, onAnimationEnd: () => void }) => {

    useEffect(() => {
        const timer = setTimeout(() => {
            onAnimationEnd();
        }, 4000); // Animation duration + buffer
        return () => clearTimeout(timer);
    }, [onAnimationEnd]);

    const animationProps = animationVariants[method] || {};

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center text-white"
            >
                <motion.div
                    key={method}
                    variants={animationProps}
                    initial="initial"
                    animate="animate"
                >
                    {animationMap[method]}
                </motion.div>
                <motion.h1
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    className="text-4xl font-bold mt-8"
                >
                    تم اغتيالك
                </motion.h1>
                <motion.p
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.8, duration: 0.5 }}
                    className="text-xl text-muted-foreground"
                >
                    ...بواسطة {method}
                </motion.p>
            </motion.div>
        </AnimatePresence>
    );
};
