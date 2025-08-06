
"use client";

import { useState, useEffect, useMemo } from 'react';
import { getPublishedArticles, createPlayerArticle } from '@/lib/actions/news';
import type { Article } from '@/types';
import { Loader2, Newspaper, Calendar, User, Edit } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

// --- Components ---

const NewspaperHeader = () => (
    <div className="text-center py-8 border-b-4 border-double border-gray-700 mb-8 bg-gray-100">
        <h1 className="font-serif text-6xl md:text-8xl font-bold tracking-wider text-gray-800" style={{ fontFamily: "'Merriweather', serif" }}>
            صحيفة اللعبة
        </h1>
        <p className="text-lg text-gray-500 tracking-widest mt-2">آخر الأخبار والتحديثات من عالم بطابيطو</p>
    </div>
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

const CreateArticleDialog = ({ onArticleCreated }: { onArticleCreated: () => void }) => {
    const { userProfile } = useAuth();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isAnonymous, setIsAnonymous] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handlePublish = async () => {
        if (!title.trim() || !content.trim() || !userProfile) {
            toast({ title: 'الرجاء ملء العنوان والمحتوى', variant: 'destructive' });
            return;
        }
        setIsSubmitting(true);
        const result = await createPlayerArticle(userProfile.uid, { title, content }, isAnonymous);
        if (result.success) {
            toast({ title: 'تم نشر مقالك بنجاح!' });
            onArticleCreated();
            setIsOpen(false);
            setTitle('');
            setContent('');
            setIsAnonymous(true);
        } else {
            toast({ title: 'فشل النشر', description: result.error, variant: 'destructive' });
        }
        setIsSubmitting(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Edit className="ml-2"/> اكتب مقالاً
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>نشر مقال جديد</DialogTitle>
                    <DialogDescription>
                        سيتم نشر مقالك في قسم "مقالات اللاعبين". تكلفة النشر هي 1 كوينز.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="title" className="text-right">العنوان</Label>
                        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-start gap-4">
                        <Label htmlFor="content" className="text-right pt-2">المحتوى</Label>
                        <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} className="col-span-3" rows={10} />
                    </div>
                     <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="anonymous-switch" className="text-right">نشر كمجهول</Label>
                        <div className="col-span-3 flex items-center space-x-2 space-x-reverse">
                             <Switch id="anonymous-switch" checked={isAnonymous} onCheckedChange={setIsAnonymous} />
                             <span className="text-sm text-muted-foreground">{isAnonymous ? 'سيظهر اسمك كـ "لاعب مجهول"' : 'سيظهر اسمك الحقيقي'}</span>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">إلغاء</Button></DialogClose>
                    <Button onClick={handlePublish} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="animate-spin" /> : 'نشر (1 كوينز)'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


// --- Main Client Component ---

export default function NewsClient() {
    const { userProfile, loading, latestArticleDate, setLatestArticleDate } = useAuth();
    const [articles, setArticles] = useState<Article[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchArticles = async () => {
        setIsLoading(true);
        const fetchedArticles = await getPublishedArticles(userProfile?.uid);
        if (fetchedArticles.length > 0 && fetchedArticles[0].createdAt.getTime() !== latestArticleDate?.getTime()) {
           if (setLatestArticleDate) setLatestArticleDate(fetchedArticles[0].createdAt);
        }
        setArticles(fetchedArticles);
        setIsLoading(false);
    };
    
    useEffect(() => {
        if (!loading) {
            fetchArticles();
        }
    }, [loading, userProfile]);

    useEffect(() => {
        // Mark news as read when the component mounts
        localStorage.setItem('lastNewsVisit', new Date().toISOString());
         if (setLatestArticleDate) setLatestArticleDate(new Date()); // Optimistic update
    }, [setLatestArticleDate]);

    const adminArticles = useMemo(() => articles.filter(a => a.category !== 'مقالات اللاعبين'), [articles]);
    const playerArticles = useMemo(() => articles.filter(a => a.category === 'مقالات اللاعبين'), [articles]);

    if (isLoading || loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
                <Loader2 className="w-16 h-16 animate-spin text-gray-700" />
                <p className="text-gray-600 mt-4 font-serif text-lg">جاري تحميل الأخبار...</p>
            </div>
        );
    }
    
    const featuredAdminArticle = adminArticles[0];
    const otherAdminArticles = adminArticles.slice(1);
    
    const featuredPlayerArticle = playerArticles[0];
    const otherPlayerArticles = playerArticles.slice(1);

    return (
        <div className="min-h-screen bg-gray-50 text-gray-800 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                <NewspaperHeader />
                 <div className="text-center mb-6 flex justify-center items-center gap-4">
                    {userProfile?.isAdmin && (
                        <Button asChild>
                            <Link href="/admin">لوحة تحكم الأخبار</Link>
                        </Button>
                    )}
                    {userProfile && (
                       <CreateArticleDialog onArticleCreated={fetchArticles} />
                    )}
                </div>

                <Tabs defaultValue="all-articles" className="w-full">
                     <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="all-articles">كل الأخبار</TabsTrigger>
                        <TabsTrigger value="admin-articles">أخبار الإدارة</TabsTrigger>
                        <TabsTrigger value="player-articles">مقالات اللاعبين</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="all-articles" className="mt-6">
                        {articles.length === 0 ? (
                            <div className="text-center py-20 bg-white shadow-md rounded-lg">
                                <Newspaper className="w-24 h-24 mx-auto text-gray-400" />
                                <p className="mt-4 text-2xl font-serif text-gray-600">لا توجد مقالات حاليًا.</p>
                            </div>
                        ) : (
                             <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {articles.map(article => (
                                    <ArticleCard key={article.id} article={article} />
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="admin-articles" className="mt-6">
                        {adminArticles.length === 0 ? (
                             <div className="text-center py-20 bg-white shadow-md rounded-lg">
                                 <Newspaper className="w-24 h-24 mx-auto text-gray-400" />
                                <p className="mt-4 text-2xl font-serif text-gray-600">لا توجد أخبار من الإدارة حاليًا.</p>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {featuredAdminArticle && <ArticleCard article={featuredAdminArticle} isFeatured />}
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {otherAdminArticles.map(article => (
                                        <ArticleCard key={article.id} article={article} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </TabsContent>
                    
                    <TabsContent value="player-articles" className="mt-6">
                        {playerArticles.length === 0 ? (
                             <div className="text-center py-20 bg-white shadow-md rounded-lg">
                                 <Newspaper className="w-24 h-24 mx-auto text-gray-400" />
                                <p className="mt-4 text-2xl font-serif text-gray-600">لم يكتب أي لاعب مقالاً بعد.</p>
                                <p className="text-gray-500">كن أول من ينشر!</p>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {featuredPlayerArticle && <ArticleCard article={featuredPlayerArticle} isFeatured />}
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {otherPlayerArticles.map(article => (
                                        <ArticleCard key={article.id} article={article} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

    