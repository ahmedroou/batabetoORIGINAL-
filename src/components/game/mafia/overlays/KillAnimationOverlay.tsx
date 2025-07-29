
"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { Skull } from 'lucide-react';

interface KillAnimationOverlayProps {
    playerName: string;
    onAnimationEnd: () => void;
}

export const KillAnimationOverlay = ({ playerName, onAnimationEnd }: KillAnimationOverlayProps) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onAnimationEnd();
        }, 3500); // Animation duration + buffer
        return () => clearTimeout(timer);
    }, [onAnimationEnd]);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center text-white"
            >
                <motion.div
                    key="skull-icon"
                    initial={{ scale: 0, rotate: -45, y: 50 }}
                    animate={{ scale: 1, rotate: 0, y: 0, transition: { type: 'spring', stiffness: 150, damping: 10, delay: 0.5 } }}
                    className="mb-4"
                >
                    <Skull className="w-32 h-32 text-red-500 drop-shadow-lg" />
                </motion.div>
                <motion.h1
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.8, duration: 0.5 }}
                    className="text-4xl font-bold mt-8"
                >
                    لقد تم اغتيال {playerName}!
                </motion.h1>
            </motion.div>
        </AnimatePresence>
    );
};
