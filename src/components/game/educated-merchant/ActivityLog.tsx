
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { Timestamp } from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';


interface ActivityLogProps {
  log: { message: string; timestamp: Date | Timestamp }[];
}

export function ActivityLog({ log }: ActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const toValidDate = (timestamp: Date | Timestamp): Date => {
    if (timestamp instanceof Date) {
      return timestamp;
    }
    if (timestamp && typeof (timestamp as any).toDate === 'function') {
      return (timestamp as Timestamp).toDate();
    }
    return new Date();
  };

  // Auto-scroll to bottom on new log entry
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [log]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 10, transition: { duration: 0.15 } },
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>سجل الأحداث</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className={cn(isMobile ? "h-[15vh]" : "h-[45vh]")} ref={scrollRef}>
          {log.length === 0 ? (
            <div className="text-center text-muted-foreground mt-4">لا توجد أحداث حالياً</div>
          ) : (
            <motion.div
              className="space-y-2 pr-4"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              <AnimatePresence initial={false}>
                {[...log].reverse().map((entry, index) => {
                  const dateKey = toValidDate(entry.timestamp).getTime();
                  return (
                    <motion.div
                      key={`${dateKey}-${index}`}
                      variants={itemVariants}
                      layout
                      whileHover={{ scale: 1.02, boxShadow: '0 0 8px rgba(255,255,255,0.2)' }}
                      className="text-sm p-2 bg-muted rounded-md cursor-default select-text"
                      title={toValidDate(entry.timestamp).toLocaleString('ar-EG')}
                    >
                      <p>{entry.message}</p>
                      <p className="text-xs text-muted-foreground text-left mt-1 font-mono">
                        {formatDistanceToNow(toValidDate(entry.timestamp), { addSuffix: true, locale: ar })}
                      </p>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
