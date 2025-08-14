
import { getArticleById, getPublishedArticles } from '@/lib/actions/news';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { User, Calendar, Tag } from 'lucide-react';
import { Metadata, ResolvingMetadata } from 'next';
import Link from 'next/link';

// -----------------------------
// Metadata
// -----------------------------

type Props = {
  params: { articleId: string }
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const articleId = params.articleId;
  const articleResult = await getArticleById(articleId);
  const article = articleResult.success ? articleResult.data : null;

  if (!article) {
    return {
      title: 'المقال غير موجود',
    }
  }

  const description = article.content.substring(0, 160);

  return {
    title: `${article.title} | صحيفة اللعبة`,
    description,
    openGraph: {
      type: 'article',
      title: `${article.title} | صحيفة اللعبة`,
      description,
      images: article.imageUrl ? [article.imageUrl] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${article.title} | صحيفة اللعبة`,
      description,
      images: article.imageUrl ? [article.imageUrl] : [],
    },
  }
}

// -----------------------------
// Sidebar (Server Component)
// -----------------------------

const Sidebar = async () => {
  const articlesResult = await getPublishedArticles();
  const latestArticles = articlesResult.success ? articlesResult.data?.articles ?? [] : [];
  return (
    <aside className="space-y-6 lg:sticky lg:top-6">
      {/* Box: Latest News */}
      <div className="rounded-lg bg-white/90 backdrop-blur border border-neutral-200 shadow-sm">
        <div className="px-4 py-3 border-b border-neutral-200">
          <h3 className="font-serif font-bold text-xl tracking-wide">آخر الأخبار</h3>
        </div>
        <ul className="p-4 space-y-4">
          {latestArticles.slice(0, 6).map(article => (
            <li key={article.id} className="group">
              <Link href={`/news/${article.id}`} className="font-semibold text-neutral-800 group-hover:text-primary transition-colors leading-snug">
                {article.title}
              </Link>
              <p className="text-xs text-neutral-500 mt-1">
                {format(article.createdAt, 'd MMMM', { locale: ar })}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {/* Box: Newspaper Note */}
      <div className="rounded-lg bg-amber-50/70 border border-amber-200 p-4 text-amber-900">
        <p className="font-serif text-sm leading-7">
          تنويه التحرير: الآراء المنشورة في مقالات اللاعبين لا تعبّر بالضرورة عن رأي إدارة اللعبة.
        </p>
      </div>
    </aside>
  )
}

// -----------------------------
// Page
// -----------------------------

export default async function ArticlePage({ params }: Props) {
  const articleResult = await getArticleById(params.articleId);
  const article = articleResult.success ? articleResult.data : null;

  if (!article || !article.isPublished) {
    notFound();
  }

  // Prepare related & navigation
  const allArticlesResult = await getPublishedArticles();
  const allArticles = allArticlesResult.success ? allArticlesResult.data?.articles ?? [] : [];

  const sorted = allArticles; // نفترض أنها مرتبة من المصدر تنازليًا بالتاريخ
  const currentIndex = sorted.findIndex(a => a.id === article.id);
  const prevArticle = currentIndex > 0 ? sorted[currentIndex - 1] : null;
  const nextArticle = currentIndex < sorted.length - 1 ? sorted[currentIndex + 1] : null;
  const related = sorted
    .filter(a => a.id !== article.id && a.category === article.category)
    .slice(0, 4);

  // Reading time (تقريبي)
  const words = article.content.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));

  // Prepare paragraphs (to allow drop-cap on first paragraph)
  const paragraphs = article.content.split(/\n\s*\n/);
  
  const isAiGeneratedImage = article.imageUrl?.startsWith('data:image');

  return (
    <div className="min-h-screen newspaper-bg text-neutral-900">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {/* Back link */}
        <div className="mb-6">
          <Link href="/news" className="inline-flex items-center text-primary hover:underline">
            <span className="mr-1">&larr;</span> العودة إلى الصحيفة
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main */}
          <main className="lg:col-span-3">
            <article className="bg-white/95 backdrop-blur rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
              {/* Top rule */}
              <div className="h-2 bg-[repeating-linear-gradient(to right,transparent,transparent_8px,rgba(0,0,0,0.05)_8px,rgba(0,0,0,0.05)_16px)]" />

              <header className="px-5 sm:px-8 pt-8 pb-6 border-b border-neutral-200">
                {article.category && (
                  <p className="text-[13px] font-semibold tracking-wider text-primary/90 mb-3 font-sans">
                    {article.category}
                  </p>
                )}

                <h1 className="font-serif text-4xl md:text-5xl font-extrabold leading-[1.15] text-neutral-900">
                  {article.title}
                </h1>

                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px] text-neutral-600 font-sans">
                  <span className="flex items-center gap-2"><User className="w-5 h-5" />{article.authorName}</span>
                  <span className="flex items-center gap-2"><Calendar className="w-5 h-5" />{format(article.createdAt, 'EEEE, d MMMM yyyy', { locale: ar })}</span>
                  <span className="text-neutral-500">{minutes} دقيقة قراءة</span>
                </div>
              </header>

              {article.imageUrl && (
                <figure className="px-5 sm:px-8 pt-6">
                  <div className="rounded-lg overflow-hidden shadow-md">
                    <Image
                      src={article.imageUrl}
                      alt={article.title}
                      width={1400}
                      height={740}
                      className="w-full h-auto object-cover"
                      priority
                      data-ai-hint="newspaper illustration"
                    />
                  </div>
                  <figcaption className="mt-3 text-sm text-neutral-500 border-t border-dashed border-neutral-200 pt-2 font-sans">
                    {article.title} {isAiGeneratedImage && '(صورة مُولّدة بالذكاء الاصطناعي)'}
                  </figcaption>
                </figure>
              )}

              <div className="px-5 sm:px-8 py-8">
                {/* Dek/lede (اختياري) */}
                {paragraphs[0] && (
                  <p className="mb-6 font-sans text-xl leading-9 text-neutral-800 first-letter:float-right first-letter:ml-3 first-letter:text-6xl first-letter:leading-[0.75] first-letter:font-serif first-letter:font-black first-letter:text-neutral-900">
                    {paragraphs[0]}
                  </p>
                )}

                {/* Remaining paragraphs in a light newspaper multi-column on xl */}
                <div className="printable-article-content [&_p]:mb-5">
                  {paragraphs.slice(1).map((para, idx) => (
                    <p key={idx} className="font-sans text-[17px] leading-8 text-neutral-800">
                      {para}
                    </p>
                  ))}
                </div>

                {/* Tags */}
                {article.tags && article.tags.length > 0 && (
                  <footer className="mt-10 pt-6 border-t border-neutral-200 font-sans">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Tag className="w-5 h-5 text-neutral-500" />
                      <h3 className="font-semibold text-neutral-700">الوسوم:</h3>
                      <div className="flex flex-wrap gap-2">
                        {article.tags.map(tag => (
                          <span key={tag} className="text-sm bg-neutral-100 text-neutral-700 px-3 py-1 rounded-full border border-neutral-200">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </footer>
                )}
              </div>

              {/* Bottom rule */}
              <div className="h-2 bg-[repeating-linear-gradient(to right,transparent,transparent_8px,rgba(0,0,0,0.05)_8px,rgba(0,0,0,0.05)_16px)]" />
            </article>

            {/* Prev / Next navigation */}
            <nav className="mt-8 flex flex-col sm:flex-row gap-4">
              {prevArticle && (
                <Link href={`/news/${prevArticle.id}`} className="flex-1 rounded-lg border border-neutral-200 bg-white/90 hover:bg-white transition shadow-sm p-4">
                  <span className="block text-sm text-neutral-500 mb-1 font-sans">المقال السابق</span>
                  <span className="font-serif font-bold text-neutral-900 leading-snug line-clamp-2">{prevArticle.title}</span>
                </Link>
              )}
              {nextArticle && (
                <Link href={`/news/${nextArticle.id}`} className="flex-1 rounded-lg border border-neutral-200 bg-white/90 hover:bg-white transition shadow-sm p-4 text-right">
                  <span className="block text-sm text-neutral-500 mb-1 font-sans">المقال التالي</span>
                  <span className="font-serif font-bold text-neutral-900 leading-snug line-clamp-2">{nextArticle.title}</span>
                </Link>
              )}
            </nav>

            {/* Related */}
            {related.length > 0 && (
              <section className="mt-10">
                <h2 className="font-serif text-2xl font-extrabold mb-4">مقالات ذات صلة</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {related.map(r => (
                    <Link key={r.id} href={`/news/${r.id}`} className="rounded-lg border border-neutral-200 bg-white/90 hover:bg-white transition shadow-sm p-4 font-sans">
                      <h3 className="font-semibold text-neutral-900 leading-snug line-clamp-2">{r.title}</h3>
                      <p className="text-xs text-neutral-500 mt-1">{format(r.createdAt, 'd MMMM yyyy', { locale: ar })}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </main>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Sidebar />
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------
// Static Params
// -----------------------------

export async function generateStaticParams() {
  const articlesResult = await getPublishedArticles();
  const articles = articlesResult.success ? articlesResult.data?.articles ?? [] : [];
  return articles.map(article => ({
    articleId: article.id,
  }));
}
