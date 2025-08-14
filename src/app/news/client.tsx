"use client";

import { useState, useEffect, useMemo } from 'react';
import { getPublishedArticles, createPlayerArticle } from '@/lib/actions/news';
import type { Article } from '@/types';
import { Loader2, Newspaper, Calendar, User, Edit, Search, RefreshCw, Megaphone, ArrowRight } from 'lucide-react';
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
import { motion } from 'framer-motion';

// ----------------------------------
// Utilities
// ----------------------------------
const formatDate = (d: Date | string) => {
  const date = typeof d === 'string' ? new Date(d) : d;
  return format(date, 'd MMMM yyyy', { locale: ar });
};

// ----------------------------------
// Header & Ticker
// ----------------------------------
const NewspaperHeader = ({ headlines }: { headlines: string[] }) => {
  const today = useMemo(() => formatDate(new Date()), []);
  return (
    <header className="relative mb-8">
      <div className="mx-auto max-w-7xl">
        <div className="paper-bg rounded-xl border border-zinc-300 shadow-sm">
          <div className="text-center py-8 border-b-4 border-double border-zinc-700 bg-zinc-50 rounded-t-xl">
            <h1 className="font-serif text-5xl md:text-7xl font-extrabold tracking-wide text-zinc-900">
              صحيفة اللعبة
            </h1>
            <p className="mt-2 text-base md:text-lg text-zinc-600 tracking-widest font-sans">آخر الأخبار والتحديثات من عالم بطابيطو</p>
            <p className="mt-1 text-sm text-zinc-500 font-sans">العدد اليومي — {today}</p>
          </div>

          {/* Breaking news ticker */}
          {headlines.length > 0 && (
            <div className="relative bg-zinc-900 text-zinc-100 overflow-hidden font-sans">
              <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-700">
                <Megaphone className="w-4 h-4" />
                <span className="text-xs font-medium tracking-widest">عاجل الآن</span>
              </div>
              <div className="relative">
                <div className="ticker-mask">
                  <motion.div
                    className="flex gap-8 whitespace-nowrap px-4 py-2"
                    initial={{ x: 0 }}
                    animate={{ x: ['0%', '-50%'] }}
                    transition={{ ease: 'linear', repeat: Infinity, duration: 30 }}
                  >
                    {[...headlines, ...headlines].map((h, i) => (
                      <span key={i} className="text-sm md:text-base text-zinc-100/90">
                        • {h}
                      </span>
                    ))}
                  </motion.div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

// ----------------------------------
// Article Card
// ----------------------------------
const ArticleCard = ({ article, isFeatured }: { article: Article; isFeatured?: boolean }) => {
  const excerpt = (article.content || '').slice(0, 180) + ((article.content || '').length > 180 ? '…' : '');

  return (
    <Link href={`/news/${article.id}`} className="block group">
      <article className={`paper-card overflow-hidden ${isFeatured ? 'md:flex' : 'flex flex-col'}`}>
        {article.imageUrl && (
          <div className={`${isFeatured ? 'md:w-1/2' : 'w-full h-48'} relative`}>
            <Image
              src={article.imageUrl}
              alt={article.title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/20 via-transparent" />
          </div>
        )}
        <div className={`${isFeatured ? 'md:w-1/2' : ''} p-6 flex flex-col gap-3`}>
          <h2 className={`font-serif text-zinc-900 leading-tight ${isFeatured ? 'text-3xl' : 'text-xl'} group-hover:underline`}>{article.title}</h2>
          <div className="flex flex-wrap items-center gap-4 text-[11px] md:text-xs text-zinc-500 font-sans">
            <span className="flex items-center gap-1"><User className="w-4 h-4" />{article.authorName}</span>
            <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{formatDate(article.createdAt as any)}</span>
          </div>
          <p className="text-zinc-700 leading-relaxed font-sans">
            {excerpt}
          </p>
          <div className="mt-auto pt-2">
            <span className="inline-flex items-center gap-1 font-medium text-primary group-hover:gap-2 transition-all font-sans">
              اقرأ المزيد <ArrowRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
};

// ----------------------------------
// Skeleton Loader
// ----------------------------------
const ArticleSkeleton = ({ featured }: { featured?: boolean }) => (
  <div className={`paper-card overflow-hidden ${featured ? 'md:flex' : ''}`}>
    <div className={`${featured ? 'md:w-1/2' : 'w-full h-48'} bg-zinc-200 animate-pulse`} />
    <div className={`${featured ? 'md:w-1/2' : ''} p-6 space-y-3`}>
      <div className="h-6 bg-zinc-200 rounded w-3/4 animate-pulse" />
      <div className="flex gap-4">
        <div className="h-3 bg-zinc-200 rounded w-24 animate-pulse" />
        <div className="h-3 bg-zinc-200 rounded w-24 animate-pulse" />
      </div>
      <div className="h-3 bg-zinc-200 rounded w-full animate-pulse" />
      <div className="h-3 bg-zinc-200 rounded w-5/6 animate-pulse" />
      <div className="h-3 bg-zinc-200 rounded w-2/3 animate-pulse" />
    </div>
  </div>
);

// ----------------------------------
// Create Article Dialog
// ----------------------------------
const CreateArticleDialog = ({ onArticleCreated }: { onArticleCreated: () => void }) => {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const titleCount = title.trim().length;
  const contentCount = content.trim().length;

  const handlePublish = async () => {
    if (!title.trim() || !content.trim() || !userProfile) {
      toast({ title: 'الرجاء ملء العنوان والمحتوى', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    const result = await createPlayerArticle(userProfile.uid, { title, content }, isAnonymous);
    setIsSubmitting(false);
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
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Edit className="ml-2" /> اكتب مقالاً
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>نشر مقال جديد</DialogTitle>
          <DialogDescription>
            سيتم نشر مقالك في قسم "مقالات اللاعبين". تكلفة النشر هي 1 كوينز.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">العنوان</Label>
            <div className="col-span-3 space-y-2">
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <p className="text-xs text-zinc-500 text-left">{titleCount} حرف</p>
            </div>
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="content" className="text-right pt-2">المحتوى</Label>
            <div className="col-span-3 space-y-2">
              <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} rows={10} />
              <p className="text-xs text-zinc-500 text-left">{contentCount} حرف</p>
            </div>
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

// ----------------------------------
// Toolbar
// ----------------------------------
function Toolbar({
  canWrite,
  onRefresh,
  onSearch,
}: {
  canWrite: boolean;
  onRefresh: () => void;
  onSearch: (q: string) => void;
}) {
  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
      <div className="flex items-center gap-2 w-full md:w-1/2">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="ابحث في العناوين والمحتوى…"
            className="pl-9"
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={onRefresh} className="shrink-0">
          <RefreshCw className="w-4 h-4 ml-1" /> تحديث
        </Button>
      </div>
      <div className="flex items-center gap-2 justify-center md:justify-end">
        {canWrite && <CreateArticleDialog onArticleCreated={onRefresh} />}
      </div>
    </div>
  );
}

// ----------------------------------
// Main Client Component
// ----------------------------------
export default function NewsClient() {
  const { userProfile, loading, latestArticleDate, setLatestArticleDate } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userProfile]);

  useEffect(() => {
    // Mark news as read when the component mounts
    if (typeof window !== 'undefined') {
      localStorage.setItem('lastNewsVisit', new Date().toISOString());
    }
    if (setLatestArticleDate) setLatestArticleDate(new Date()); // Optimistic update
  }, [setLatestArticleDate]);

  // Derived lists
  const adminArticles = useMemo(() => articles.filter((a) => a.category !== 'مقالات اللاعبين'), [articles]);
  const playerArticles = useMemo(() => articles.filter((a) => a.category === 'مقالات اللاعبين'), [articles]);

  // Search filtering (title, author, content)
  const normalize = (s: string) => (s || '').toLowerCase();
  const matchesQuery = (a: Article) => {
    if (!query.trim()) return true;
    const q = normalize(query);
    return (
      normalize(a.title).includes(q) ||
      normalize(a.authorName || '').includes(q) ||
      normalize(a.content || '').includes(q)
    );
  };

  const filteredAll = useMemo(() => articles.filter(matchesQuery), [articles, query]);
  const filteredAdmin = useMemo(() => adminArticles.filter(matchesQuery), [adminArticles, query]);
  const filteredPlayers = useMemo(() => playerArticles.filter(matchesQuery), [playerArticles, query]);

  const headlines = useMemo(() => articles.slice(0, 10).map((a) => a.title), [articles]);

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50">
        <Loader2 className="w-16 h-16 animate-spin text-zinc-700" />
        <p className="text-zinc-600 mt-4 font-serif text-lg">جاري تحميل الأخبار…</p>
      </div>
    );
  }

  const featuredAdminArticle = filteredAdmin[0];
  const otherAdminArticles = filteredAdmin.slice(1);
  const featuredPlayerArticle = filteredPlayers[0];
  const otherPlayerArticles = filteredPlayers.slice(1);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="relative">
        <NewspaperHeader headlines={headlines} />
      </div>

      <main className="px-4 md:px-8">
        <div className="mx-auto max-w-7xl">
          {/* Toolbar */}
          <div className="mb-6">
            <Toolbar
              canWrite={!!(userProfile && userProfile?.permissions?.includes('can_write_article'))}
              onRefresh={fetchArticles}
              onSearch={setQuery}
            />
          </div>

          <Tabs defaultValue="all-articles" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all-articles">كل الأخبار</TabsTrigger>
              <TabsTrigger value="admin-articles">أخبار الإدارة</TabsTrigger>
              <TabsTrigger value="player-articles">مقالات اللاعبين</TabsTrigger>
            </TabsList>

            {/* All Articles */}
            <TabsContent value="all-articles" className="mt-6">
              {filteredAll.length === 0 ? (
                <div className="text-center py-20 paper-card">
                  <Newspaper className="w-24 h-24 mx-auto text-zinc-400" />
                  <p className="mt-4 text-2xl font-serif text-zinc-600">لا توجد مقالات حاليًا.</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {filteredAll.map((article) => (
                    <ArticleCard key={article.id} article={article} />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Admin Articles */}
            <TabsContent value="admin-articles" className="mt-6">
              {filteredAdmin.length === 0 ? (
                <div className="text-center py-20 paper-card">
                  <Newspaper className="w-24 h-24 mx-auto text-zinc-400" />
                  <p className="mt-4 text-2xl font-serif text-zinc-600">لا توجد أخبار من الإدارة حاليًا.</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {featuredAdminArticle && <ArticleCard article={featuredAdminArticle} isFeatured />}
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {otherAdminArticles.map((article) => (
                      <ArticleCard key={article.id} article={article} />
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Player Articles */}
            <TabsContent value="player-articles" className="mt-6">
              {filteredPlayers.length === 0 ? (
                <div className="text-center py-20 paper-card">
                  <Newspaper className="w-24 h-24 mx-auto text-zinc-400" />
                  <p className="mt-4 text-2xl font-serif text-zinc-600">لم يكتب أي لاعب مقالاً بعد.</p>
                  <p className="text-zinc-500">كن أول من ينشر!</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {featuredPlayerArticle && <ArticleCard article={featuredPlayerArticle} isFeatured />}
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {otherPlayerArticles.map((article) => (
                      <ArticleCard key={article.id} article={article} />
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Footer strip */}
          <div className="mt-12 mb-8 text-center text-xs text-zinc-500">
            <p>© {new Date().getFullYear()} بطابيطو — جميع الحقوق محفوظة. نسخة الصحيفة التجريبية.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
