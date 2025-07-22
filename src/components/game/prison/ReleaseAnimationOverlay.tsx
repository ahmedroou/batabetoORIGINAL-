
"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { KeyRound } from 'lucide-react';

interface ReleaseAnimationOverlayProps {
    playerName: string;
    onAnimationEnd: () => void;
}

export const ReleaseAnimationOverlay = ({ playerName, onAnimationEnd }: ReleaseAnimationOverlayProps) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onAnimationEnd();
        }, 4000); // Animation duration + buffer
        return () => clearTimeout(timer);
    }, [onAnimationEnd]);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="fixed inset-0 z-[200] bg-black/80 flex flex-col items-center justify-center text-white"
            >
                <motion.div
                    key="key-icon"
                    initial={{ scale: 0, rotate: 90 }}
                    animate={{ scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 150, damping: 10, delay: 0.5 } }}
                    className="mb-4"
                >
                    <KeyRound className="w-32 h-32 text-yellow-400 drop-shadow-lg" />
                </motion.div>
                <motion.h1
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.8, duration: 0.5 }}
                    className="text-4xl font-bold mt-8"
                >
                    تم الإفراج عن {playerName}!
                </motion.h1>
                <motion.p
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 1.1, duration: 0.5 }}
                    className="text-xl text-muted-foreground"
                >
                    ...لقد نال حريته.
                </motion.p>
            </motion.div>
        </AnimatePresence>
    );
};
