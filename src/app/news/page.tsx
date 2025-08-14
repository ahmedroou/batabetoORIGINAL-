
"use client";

import NewsClient from './client';
import { Suspense } from 'react';

// Newspaper-styled skeleton for Suspense fallback — no extra imports needed
function NewspaperFallback() {
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8" role="status" aria-live="polite" aria-busy>
      {/* Masthead */}
      <div className="text-center py-8 border-b-4 border-double border-gray-700 mb-8 bg-gray-100">
        <div className="mx-auto h-10 md:h-14 w-72 md:w-96 bg-gray-300/70 animate-pulse rounded" />
        <div className="mx-auto mt-3 h-3 w-64 bg-gray-200 animate-pulse rounded" />
      </div>

      {/* Grid of article placeholders */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <article key={i} className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="h-40 bg-gray-200 animate-pulse" />
            <div className="p-4 space-y-3">
              <div className="h-5 w-5/6 bg-gray-200 animate-pulse rounded" />
              <div className="h-3 w-2/3 bg-gray-200 animate-pulse rounded" />
              <div className="h-3 w-full bg-gray-200 animate-pulse rounded" />
              <div className="h-3 w-11/12 bg-gray-200 animate-pulse rounded" />
            </div>
          </article>
        ))}
      </div>
      <span className="sr-only">جاري تحميل الأخبار...</span>
    </div>
  );
}

export default function NewsPage() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-800">
      <Suspense fallback={<NewspaperFallback />}> 
        <NewsClient />
      </Suspense>
    </main>
  );
}
