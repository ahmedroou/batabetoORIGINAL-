
"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { Skull } from 'lucide-react';
import { PlayerAvatar } from '../PlayerAvatar';

interface ExecutionAnimationOverlayProps {
    playerName: string;
    playerAvatarId: string;
    onAnimationEnd: () => void;
}

export const ExecutionAnimationOverlay = ({ playerName, playerAvatarId, onAnimationEnd }: ExecutionAnimationOverlayProps) => {
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
                <div className="relative mb-4">
                    <PlayerAvatar avatarId={playerAvatarId} className="w-40 h-40 rounded-full border-4 border-destructive" />
                    <motion.div
                        key="skull-icon"
                        initial={{ scale: 0, rotate: -45, y: 50 }}
                        animate={{ scale: 1, rotate: 0, y: -20, transition: { type: 'spring', stiffness: 150, damping: 10, delay: 0.5 } }}
                        className="absolute -top-8 left-1/2 -translate-x-1/2"
                    >
                        <Skull className="w-24 h-24 text-gray-300 drop-shadow-lg" />
                    </motion.div>
                </div>
                <motion.h1
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.8, duration: 0.5 }}
                    className="text-4xl font-bold mt-8"
                >
                    تم إعدام {playerName}!
                </motion.h1>
                <motion.p
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 1.1, duration: 0.5 }}
                    className="text-xl text-muted-foreground"
                >
                    ...لقد انتهى وقته في المدينة.
                </motion.p>
            </motion.div>
        </AnimatePresence>
    );
};
