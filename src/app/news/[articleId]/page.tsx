
import { getArticleById, getPublishedArticles } from '@/lib/actions/news';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { User, Calendar, Tag } from 'lucide-react';
import { Metadata, ResolvingMetadata } from 'next';
import Link from 'next/link';

type Props = {
  params: { articleId: string }
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const articleId = params.articleId;
  const article = await getArticleById(articleId);

  if (!article) {
    return {
      title: 'المقال غير موجود',
    }
  }

  return {
    title: `${article.title} | صحيفة اللعبة`,
    description: article.content.substring(0, 160),
    openGraph: {
      images: article.imageUrl ? [article.imageUrl] : [],
    },
  }
}

const Sidebar = async () => {
    const latestArticles = await getPublishedArticles();
    return (
        <aside className="space-y-6">
             <div className="p-4 bg-gray-100 rounded-lg shadow-sm">
                <h3 className="font-serif font-bold text-xl mb-4 border-b pb-2">آخر الأخبار</h3>
                <ul className="space-y-3">
                    {latestArticles.slice(0, 5).map(article => (
                        <li key={article.id}>
                             <Link href={`/news/${article.id}`} className="font-semibold text-gray-800 hover:text-primary transition-colors">{article.title}</Link>
                             <p className="text-xs text-gray-500">{format(article.createdAt, 'd MMMM', { locale: ar })}</p>
                        </li>
                    ))}
                </ul>
            </div>
        </aside>
    )
}

export default async function ArticlePage({ params }: Props) {
  const article = await getArticleById(params.articleId);

  if (!article || !article.isPublished) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 p-4 md:p-8">
        <div className="max-w-7xl mx-auto bg-white shadow-xl p-8 md:p-12">
            <div className="mb-8">
                <Link href="/news" className="text-primary hover:underline">&larr; العودة إلى الصحيفة</Link>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
                <main className="lg:col-span-3">
                    <article>
                        <header className="mb-8 border-b-2 border-gray-200 pb-6">
                            {article.category && (
                                <p className="text-sm font-semibold text-primary mb-2">{article.category}</p>
                            )}
                            <h1 className="font-serif text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight">
                                {article.title}
                            </h1>
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-base text-gray-500 mt-4">
                                <span className="flex items-center gap-2"><User className="w-5 h-5" />{article.authorName}</span>
                                <span className="flex items-center gap-2"><Calendar className="w-5 h-5" />{format(article.createdAt, 'EEEE, d MMMM yyyy', { locale: ar })}</span>
                            </div>
                        </header>

                        {article.imageUrl && (
                            <div className="my-8 rounded-lg overflow-hidden shadow-lg">
                                <Image 
                                    src={article.imageUrl} 
                                    alt={article.title} 
                                    width={1200} 
                                    height={600}
                                    className="w-full h-auto object-cover" 
                                    priority
                                    data-ai-hint="newspaper illustration"
                                />
                            </div>
                        )}
                        
                        <div className="prose prose-lg max-w-none font-sans text-gray-800 leading-relaxed whitespace-pre-wrap">
                           {article.content}
                        </div>

                         {article.tags && article.tags.length > 0 && (
                            <footer className="mt-12 pt-6 border-t border-gray-200">
                                <div className="flex items-center gap-2">
                                    <Tag className="w-5 h-5 text-gray-500" />
                                    <h3 className="font-semibold">الوسوم:</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {article.tags.map(tag => (
                                            <span key={tag} className="text-sm bg-gray-200 text-gray-700 px-3 py-1 rounded-full">{tag}</span>
                                        ))}
                                    </div>
                                </div>
                            </footer>
                        )}
                    </article>
                </main>
                <div className="lg:col-span-1">
                    <Sidebar />
                </div>
            </div>
        </div>
    </div>
  );
}

// Generate static paths for better performance
export async function generateStaticParams() {
    const articles = await getPublishedArticles();
    return articles.map(article => ({
        articleId: article.id,
    }));
}
