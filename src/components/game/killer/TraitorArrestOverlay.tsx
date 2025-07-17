
"use client";

import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { Gavel } from 'lucide-react';

// =================================================================================
// ==  ملاحظة للمطور: هذا هو المكان الذي تضع فيه رابط الفيديو الخاص بك.            ==
// ==  يمكنك وضع الفيديو في مجلد `public` (مثل `public/videos/arrest.mp4`)     ==
// ==  ثم استخدم المسار `"/videos/arrest.mp4"` هنا.                            ==
// =================================================================================
const VIDEO_URL = '/videos/traitor-arrested.mp4'; // <--- ضع رابط الفيديو هنا

export const TraitorArrestOverlay = ({ onAnimationEnd }: { onAnimationEnd: () => void }) => {

    useEffect(() => {
        const timer = setTimeout(() => {
            onAnimationEnd();
        }, 5000); // مدة الأنيميشن: 5 ثوانٍ
        return () => clearTimeout(timer);
    }, [onAnimationEnd]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center text-white"
        >
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1, rotate: [0, -15, 15, -15, 0] }}
                transition={{ type: "spring", stiffness: 120, damping: 8, delay: 0.2 }}
                className="mb-8"
            >
                <Gavel className="w-32 h-32 text-yellow-400" />
            </motion.div>
            
            <video 
                src={VIDEO_URL} 
                autoPlay 
                loop 
                muted 
                playsInline 
                className="absolute inset-0 w-full h-full object-cover opacity-30 z-[-1]"
            />
            
            <motion.h1
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="text-4xl font-bold mt-8 text-yellow-300 drop-shadow-lg"
            >
                تم القبض على الشاهد الخائن!
            </motion.h1>
             <motion.p
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.5 }}
                className="text-xl text-muted-foreground"
            >
                ...العدالة تأخذ مجراها.
            </motion.p>
        </motion.div>
    );
};
