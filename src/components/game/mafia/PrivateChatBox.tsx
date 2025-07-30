import React, { useState, useEffect, useRef } from 'react';
import type { Game, Player, PrivateChat } from '@/types';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, MessageCircle } from 'lucide-react';
import { sendPrivateChatMessage } from '@/lib/actions/mafia';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

interface PrivateChatBoxProps {
    game: Game;
    self: Player;
}

export function PrivateChatBox({ game, self }: PrivateChatBoxProps) {
    const [message, setMessage] = useState('');
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    const privateChat: PrivateChat | undefined = Object.values(game.mafiaState?.privateChats || {}).find(chat =>
        chat.participants.includes(self.id)
    );

    useEffect(() => {
        // Auto-scroll to the bottom when a new message arrives
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [privateChat?.messages]);
    
    if (!privateChat) {
        return (
            <Card className="h-full bg-slate-800/50 border-slate-700">
                <CardHeader>
                    <CardTitle className="text-lg text-slate-400">الدردشة الخاصة</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center h-full">
                    <p className="text-slate-500 text-center">لا توجد دردشة خاصة متاحة لك حاليًا.</p>
                </CardContent>
            </Card>
        );
    }
    
    const chatId = Object.keys(game.mafiaState?.privateChats || {}).find(key => 
         game.mafiaState?.privateChats?.[key].participants.includes(self.id)
    );

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim() || !chatId) return;
        
        sendPrivateChatMessage(game.id, chatId, self.id, message.trim());
        setMessage('');
    };

    return (
         <Card className="h-full flex flex-col bg-slate-800/50 border-slate-700">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><MessageCircle/> دردشة خاصة</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow min-h-0">
                <ScrollArea className="h-full pr-4" ref={scrollAreaRef as any}>
                    <div className="space-y-4">
                        <AnimatePresence>
                        {privateChat.messages.map((msg, index) => (
                            <motion.div 
                                key={index}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={cn(
                                    "flex flex-col",
                                    msg.senderId === self.id ? 'items-end' : 'items-start'
                                )}
                            >
                                <div className={cn(
                                    "p-3 rounded-lg max-w-[80%]",
                                    msg.senderId === self.id ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'
                                )}>
                                    <p className="text-sm">{msg.message}</p>
                                </div>
                                <span className="text-xs text-slate-500 mt-1">{msg.senderName}</span>
                            </motion.div>
                        ))}
                        </AnimatePresence>
                    </div>
                </ScrollArea>
            </CardContent>
            <CardFooter>
                 <form onSubmit={handleSendMessage} className="flex gap-2 w-full">
                    <Input 
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="اكتب رسالتك..."
                        className="bg-slate-700 border-slate-600 text-white"
                    />
                    <Button type="submit" size="icon">
                        <Send/>
                    </Button>
                </form>
            </CardFooter>
        </Card>
    );
}
