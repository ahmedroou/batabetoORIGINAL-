
"use client";

import { motion } from 'framer-motion';
import { VenetianMask, BombIcon } from 'lucide-react';

const TrapAnimation = () => (
    <motion.div
        initial={{ scale: 0, opacity: 0, rotate: -45 }}
        animate={{ scale: [1, 1.2, 1], opacity: 1, rotate: 0 }}
        transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}
        className="p-4 bg-purple-500/30 backdrop-blur-md rounded-full"
    >
        <VenetianMask className="w-24 h-24 text-purple-200" />
    </motion.div>
);

const BombAnimation = () => (
    <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [1, 1.5, 1, 1.3, 1], opacity: [1, 0.8, 1, 0.5, 1] }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
        className="p-4 bg-red-500/30 backdrop-blur-md rounded-full"
    >
        <BombIcon className="w-32 h-32 text-red-300" />
    </motion.div>
);


export function AnimationOverlay({ event }: { event: any }) {
    if (!event) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
        >
            <div className="relative">
                {event.type === 'trap' && <TrapAnimation />}
                {event.type === 'bomb' && <BombAnimation />}
            </div>
        </motion.div>
    );
}
