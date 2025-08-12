
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

interface ActivityLogProps {
  log: { message: string; timestamp: Date }[];
}

export function ActivityLog({ log }: ActivityLogProps) {
  return (
    <Card className="h-full">
        <CardHeader>
            <CardTitle>سجل الأحداث</CardTitle>
        </CardHeader>
      <CardContent>
        <ScrollArea className="h-[45vh]">
          <div className="space-y-2 pr-4">
            <AnimatePresence initial={false}>
            {log.slice().reverse().map((entry, index) => (
                <motion.div
                    key={entry.timestamp.toISOString() + index}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                    className="text-sm p-2 bg-muted rounded-md"
                >
                    <p>{entry.message}</p>
                    <p className="text-xs text-muted-foreground text-left">
                        {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true, locale: ar })}
                    </p>
                </motion.div>
            ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
