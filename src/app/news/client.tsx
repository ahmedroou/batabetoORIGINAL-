
"use client";

import { useState, useEffect } from 'react';
import { getPublishedArticles } from '@/lib/actions/news';
import type { Article } from '@/types';
import { Loader2, Newspaper } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import Image from 'next/image';

const NewspaperTitle = () => (
    <div className="text-center py-8 border-b-4 border-double border-gray-800 mb-8">
        <h1 className="font-serif text-7xl font-bold tracking-wider text-gray-900" style={{ fontFamily: "'Merriweather', serif" }}>
            بطابيطو تايمز
        </h1>
        <p className="text-lg text-gray-600 tracking-widest mt-2">الإصدار اليومي للأخبار والمغامرات</p>
    </div>
);

const ArticleCard = ({ article, isFeatured }: { article: Article, isFeatured?: boolean }) => (
    <article className="py-6 border-b border-gray-300">
        <h2 className={`font-serif font-bold text-gray-900 ${isFeatured ? 'text-4xl' : 'text-2xl'}`}>
            {article.title}
        </h2>
        <p className="text-sm text-gray-500 my-2">
            بواسطة: <span className="font-semibold">{article.authorName}</span> | {format(article.createdAt, 'EEEE, d MMMM yyyy', { locale: ar })}
        </p>
        {isFeatured && article.imageUrl && (
            <div className="my-4">
                <Image src={article.imageUrl} alt={article.title} width={800} height={400} className="w-full h-auto object-cover border-4 border-white shadow-lg" data-ai-hint="newspaper illustration" />
            </div>
        )}
        <div className={`mt-4 text-gray-800 font-serif leading-relaxed text-lg whitespace-pre-wrap ${!isFeatured ? 'column-2' : ''}`}>
            <p>{article.content}</p>
        </div>
    </article>
);


export default function NewsClient() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchArticles = async () => {
            setIsLoading(true);
            const fetchedArticles = await getPublishedArticles();
            setArticles(fetchedArticles);
            setIsLoading(false);
        };
        fetchArticles();
    }, []);

    if (isLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#fdfdf8]">
                <Loader2 className="w-16 h-16 animate-spin text-gray-700" />
                <p className="text-gray-600 mt-4 font-serif text-lg">جاري تحميل الأخبار...</p>
            </div>
        );
    }
    
    const featuredArticle = articles.length > 0 ? articles[0] : null;
    const otherArticles = articles.slice(1);

    return (
        <div className="min-h-screen bg-[#fdfdf8] text-gray-900 p-4 md:p-8">
            <div className="max-w-7xl mx-auto bg-white shadow-2xl p-8 md:p-12">
                <NewspaperTitle />

                {articles.length === 0 ? (
                    <div className="text-center py-20">
                         <Newspaper className="w-24 h-24 mx-auto text-gray-400" />
                        <p className="mt-4 text-2xl font-serif text-gray-600">لا توجد أخبار منشورة بعد.</p>
                        <p className="text-gray-500">عد قريباً للتحقق من جديد!</p>
                    </div>
                ) : (
                    <>
                        {featuredArticle && <ArticleCard article={featuredArticle} isFeatured={true} />}
                        
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 mt-8">
                            {otherArticles.map(article => (
                                <ArticleCard key={article.id} article={article} />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

