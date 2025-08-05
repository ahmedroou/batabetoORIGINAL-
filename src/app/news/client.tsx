
"use client";

import { useState, useEffect, useMemo } from 'react';
import { getPublishedArticles, getRecentSocialEvents, getAnonymousMessages, submitAnonymousMessage, revealAnonymousSender, replyToAnonymousMessage } from '@/lib/actions/news';
import type { Article, SocialEvent, AnonymousMessage, AnonymousMessageReply } from '@/types';
import { Loader2, Newspaper, Calendar, User, Search, Handshake, Angry, Send, Lock, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PlayerAvatar } from '@/components/game/PlayerAvatar';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';


// --- Components ---

const NewspaperHeader = () => (
    <div className="text-center py-8 border-b-4 border-double border-gray-700 mb-8 bg-gray-100">
        <h1 className="font-serif text-6xl md:text-8xl font-bold tracking-wider text-gray-800" style={{ fontFamily: "'Merriweather', serif" }}>
            صحيفة اللعبة
        </h1>
        <p className="text-lg text-gray-500 tracking-widest mt-2">آخر الأخبار والتحديثات من عالم بطابيطو</p>
    </div>
);

const CategoryNav = ({ categories, onSelect, selected }: { categories: string[], onSelect: (cat: string) => void, selected: string }) => (
    <nav className="border-b border-gray-300 mb-8">
        <ul className="flex items-center justify-center gap-4 md:gap-8 text-lg font-semibold text-gray-600 overflow-x-auto pb-2">
            {categories.map(cat => (
                <li key={cat}>
                    <button 
                        onClick={() => onSelect(cat)} 
                        className={`py-2 px-1 border-b-4 transition-colors duration-200 ${selected === cat ? 'text-primary border-primary' : 'border-transparent hover:border-primary/50'}`}
                    >
                        {cat}
                    </button>
                </li>
            ))}
        </ul>
    </nav>
);

const ArticleCard = ({ article, isFeatured }: { article: Article, isFeatured?: boolean }) => {
    const excerpt = article.content.substring(0, 150) + (article.content.length > 150 ? '...' : '');
    return (
        <Link href={`/news/${article.id}`} passHref>
        <article className={`group flex flex-col bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden ${isFeatured ? 'md:flex-row' : ''}`}>
             {article.imageUrl && (
                <div className={`relative ${isFeatured ? 'md:w-1/2' : 'w-full h-48'}`}>
                    <Image 
                        src={article.imageUrl} 
                        alt={article.title} 
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        data-ai-hint="newspaper illustration" 
                    />
                </div>
            )}
            <div className={`p-6 flex flex-col flex-grow ${isFeatured ? 'md:w-1/2' : ''}`}>
                <h2 className={`font-serif font-bold text-gray-900 ${isFeatured ? 'text-3xl' : 'text-xl'}`}>
                    {article.title}
                </h2>
                <div className="flex items-center gap-4 text-xs text-gray-500 my-2">
                    <span className="flex items-center gap-1"><User className="w-4 h-4" />{article.authorName}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{format(article.createdAt, 'd MMMM yyyy', { locale: ar })}</span>
                </div>
                <p className="text-gray-700 font-sans leading-relaxed flex-grow">{excerpt}</p>
                <div className="mt-4">
                    <span className="font-bold text-primary group-hover:underline">اقرأ المزيد &rarr;</span>
                </div>
            </div>
        </article>
        </Link>
    );
};

const AnonymousMailbox = () => {
    const { userProfile } = useAuth();
    const { toast } = useToast();
    const [messages, setMessages] = useState<AnonymousMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newMessage, setNewMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [revealCandidate, setRevealCandidate] = useState<AnonymousMessage | null>(null);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyContent, setReplyContent] = useState('');

    const fetchMessages = async () => {
        setIsLoading(true);
        const fetchedMessages = await getAnonymousMessages(userProfile?.uid);
        setMessages(fetchedMessages);
        setIsLoading(false);
    };

    useEffect(() => {
        fetchMessages();
    }, []);

    const handleSubmitMessage = async () => {
        if (!newMessage.trim() || !userProfile) return;
        setIsSubmitting(true);
        const result = await submitAnonymousMessage(userProfile.uid, userProfile.name, userProfile.avatarId, newMessage.trim());
        if (result.success) {
            toast({ title: 'تم إرسال رسالتك المجهولة بنجاح!' });
            setNewMessage('');
            fetchMessages(); // Refresh messages
        } else {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(false);
    };

    const handleRevealSender = async () => {
        if (!revealCandidate || !userProfile) return;
        setIsSubmitting(true);
        const result = await revealAnonymousSender(userProfile.uid, revealCandidate.id);
        if (result.success) {
            toast({ title: 'تم كشف الهوية!' });
            fetchMessages();
        } else {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setRevealCandidate(null);
        setIsSubmitting(false);
    };

    const handleReply = async (messageId: string) => {
        if (!replyContent.trim() || !userProfile) return;
        setIsSubmitting(true);
        const result = await replyToAnonymousMessage(messageId, {
            senderId: userProfile.uid,
            senderName: userProfile.name,
            senderAvatarId: userProfile.avatarId,
            content: replyContent.trim(),
        });

        if (result.success) {
            setReplyContent('');
            setReplyingTo(null);
            fetchMessages();
        } else {
            toast({ title: 'خطأ', description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(false);
    };
    
    return (
        <div className="p-4 bg-gray-100 rounded-lg shadow-sm">
            <h3 className="font-serif font-bold text-xl mb-4 border-b pb-2">صندوق الرسائل المجهولة</h3>
            <div className="space-y-4">
                <div className="p-3 bg-white rounded-md border">
                    <Textarea 
                        placeholder="اكتب رسالتك المجهولة هنا..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        rows={3}
                    />
                    <Button onClick={handleSubmitMessage} disabled={isSubmitting || !newMessage.trim()} className="mt-2 w-full">
                        {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send className="ml-2" /> إرسال رسالة مجهولة</>}
                    </Button>
                </div>
                {isLoading ? <Loader2 className="mx-auto animate-spin"/> : messages.map(msg => {
                    const amITheSender = userProfile?.uid === msg.senderId;
                    const isRevealed = amITheSender || (msg.senderId && msg.revealedBy?.includes(userProfile?.uid || ''));
                    return (
                        <div key={msg.id} className="p-3 bg-white rounded-md border">
                            <div className="flex justify-between items-start">
                                {isRevealed ? (
                                    <div className="flex items-center gap-2">
                                        <PlayerAvatar avatarId={msg.senderAvatarId!} className="w-8 h-8"/>
                                        <span className="font-bold">{msg.senderName}</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <HelpCircle className="w-8 h-8"/>
                                        <span className="font-bold">مرسل مجهول</span>
                                    </div>
                                )}
                                <span className="text-xs text-gray-500">{format(msg.createdAt, 'd MMMM', { locale: ar })}</span>
                            </div>
                            <p className="my-2 text-gray-800 whitespace-pre-wrap">{msg.content}</p>
                            {!isRevealed && (
                                <Button size="sm" variant="destructive" onClick={() => setRevealCandidate(msg)}>
                                    <Lock className="ml-2 h-4 w-4"/>
                                    كشف هوية المرسل (5 كوينز)
                                </Button>
                            )}
                            
                            {/* Replies Section */}
                            {(msg.replies && msg.replies.length > 0) && (
                                <div className="mt-3 pt-3 border-t space-y-2">
                                    {msg.replies.map((reply, index) => (
                                         <div key={index} className="flex items-start gap-2 bg-muted p-2 rounded-md">
                                            <PlayerAvatar avatarId={reply.senderAvatarId} className="w-6 h-6 mt-1"/>
                                            <div>
                                                <p className="font-bold text-sm">{reply.senderName}</p>
                                                <p className="text-sm">{reply.content}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                             {isRevealed && (
                                <div className="mt-3 pt-3 border-t">
                                    {replyingTo === msg.id ? (
                                        <div className="flex gap-2">
                                            <Input value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder="اكتب ردك..."/>
                                            <Button onClick={() => handleReply(msg.id)} disabled={isSubmitting}><Send/></Button>
                                            <Button variant="ghost" onClick={() => setReplyingTo(null)}>X</Button>
                                        </div>
                                    ) : (
                                        <Button size="sm" variant="secondary" onClick={() => setReplyingTo(msg.id)}>الرد على الرسالة</Button>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
            <AlertDialog open={!!revealCandidate} onOpenChange={() => setRevealCandidate(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>تأكيد كشف الهوية</DialogTitle>
                        <DialogDescription>
                            هل أنت متأكد من رغبتك في دفع 5 كوينز لكشف هوية مرسل هذه الرسالة؟
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRevealSender} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin" /> : 'تأكيد ودفع'}
                        </AlertDialogAction>
                    </DialogFooter>
                </DialogContent>
            </AlertDialog>
        </div>
    )
}

const Sidebar = ({ articles, onSearch }: { articles: Article[], onSearch: (term: string) => void }) => {
    const [socialEvents, setSocialEvents] = useState<SocialEvent[]>([]);
    
    useEffect(() => {
        const fetchEvents = async () => {
            const events = await getRecentSocialEvents();
            setSocialEvents(events);
        };
        fetchEvents();
    }, []);

    const latestArticles = articles.slice(0, 5);
    
    return (
        <aside className="space-y-8">
            <div className="p-4 bg-gray-100 rounded-lg shadow-sm">
                <h3 className="font-serif font-bold text-xl mb-4 border-b pb-2">بحث</h3>
                <div className="relative">
                    <Input placeholder="ابحث عن مقال..." className="pr-10" onChange={e => onSearch(e.target.value)} />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                </div>
            </div>
            
            <div className="p-4 bg-gray-100 rounded-lg shadow-sm">
                <h3 className="font-serif font-bold text-xl mb-4 border-b pb-2">أخبار المجتمع</h3>
                 <ul className="space-y-4">
                    {socialEvents.map((event, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                            <div className="mt-1">
                                {event.type === 'allegiance' && <Handshake className="w-5 h-5 text-blue-500" />}
                                {event.type === 'rebellion' && <Angry className="w-5 h-5 text-red-500" />}
                            </div>
                            <div>
                                <p dangerouslySetInnerHTML={{ __html: event.description }} />
                                <p className="text-xs text-gray-500">{format(event.timestamp, 'd MMMM', { locale: ar })}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
            
            <AnonymousMailbox />

            <div className="p-4 bg-gray-100 rounded-lg shadow-sm">
                <h3 className="font-serif font-bold text-xl mb-4 border-b pb-2">آخر الأخبار</h3>
                <ul className="space-y-3">
                    {latestArticles.map(article => (
                        <li key={article.id}>
                             <Link href={`/news/${article.id}`} className="font-semibold text-gray-800 hover:text-primary transition-colors">{article.title}</Link>
                             <p className="text-xs text-gray-500">{format(article.createdAt, 'd MMMM', { locale: ar })}</p>
                        </li>
                    ))}
                </ul>
            </div>
        </aside>
    );
};


// --- Main Client Component ---

export default function NewsClient() {
    const { userProfile, loading } = useAuth();
    const [articles, setArticles] = useState<Article[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const router = useRouter();
    const searchParams = useSearchParams();
    const selectedCategory = searchParams.get('category') || 'الكل';

    const categories = ['الكل', 'أخبار عامة', 'أخبار المجتمع', 'تحديثات', 'نصائح', 'مقالات اللاعبين', 'مقالات إدارية']; // Example categories

    useEffect(() => {
        const fetchArticles = async () => {
            setIsLoading(true);
            const fetchedArticles = await getPublishedArticles();
            setArticles(fetchedArticles);
            setIsLoading(false);
        };
        fetchArticles();
    }, []);

    const filteredArticles = useMemo(() => {
        return articles
            .filter(article => selectedCategory === 'الكل' || article.category === selectedCategory)
            .filter(article => article.title.toLowerCase().includes(searchTerm.toLowerCase()) || article.content.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [articles, searchTerm, selectedCategory]);

    const handleCategorySelect = (category: string) => {
        router.push(`/news?category=${category}`);
    };

    if (isLoading || loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
                <Loader2 className="w-16 h-16 animate-spin text-gray-700" />
                <p className="text-gray-600 mt-4 font-serif text-lg">جاري تحميل الأخبار...</p>
            </div>
        );
    }
    
    const featuredArticle = filteredArticles.length > 0 ? filteredArticles[0] : null;
    const otherArticles = filteredArticles.slice(1);

    return (
        <div className="min-h-screen bg-gray-50 text-gray-800 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                <NewspaperHeader />
                <CategoryNav categories={categories} onSelect={handleCategorySelect} selected={selectedCategory} />
                {(userProfile?.isAdmin || userProfile?.isEditor) && (
                     <div className="text-center mb-6">
                        <Button asChild>
                            <Link href="/admin">لوحة تحكم الأخبار</Link>
                        </Button>
                    </div>
                )}
                
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    <main className="lg:col-span-3 space-y-8">
                         {filteredArticles.length === 0 ? (
                            <div className="text-center py-20 bg-white shadow-md rounded-lg">
                                 <Newspaper className="w-24 h-24 mx-auto text-gray-400" />
                                <p className="mt-4 text-2xl font-serif text-gray-600">لا توجد مقالات تطابق بحثك.</p>
                                <p className="text-gray-500">حاول البحث بكلمات مختلفة أو اختيار فئة أخرى.</p>
                            </div>
                        ) : (
                            <>
                                {featuredArticle && <ArticleCard article={featuredArticle} isFeatured />}
                                
                                <div className="grid md:grid-cols-2 gap-8">
                                    {otherArticles.map(article => (
                                        <ArticleCard key={article.id} article={article} />
                                    ))}
                                </div>
                            </>
                        )}
                    </main>
                    <div className="lg:col-span-1">
                        <Sidebar articles={articles} onSearch={setSearchTerm}/>
                    </div>
                </div>
            </div>
        </div>
    );
}
