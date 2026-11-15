import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NewsService } from '@/modules/news/news.service';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

interface MiniAppNewsDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function MiniAppNewsDetailPage({ params }: MiniAppNewsDetailPageProps) {
  const { id } = await params;
  const article = await NewsService.getById(id);

  if (!article || article.status !== 'PUBLISHED') {
    notFound();
  }

  return (
    <div className="p-4 space-y-4">
      {/* Back button */}
      <div>
        <Link
          href="/miniapp/news"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-600 transition-colors"
        >
          <span>←</span> Все новости
        </Link>
      </div>

      <Card className="border-slate-200 bg-white p-5 shadow-xs space-y-4">
        {article.imageUrl && (
          <div className="w-full h-48 rounded-xl bg-slate-100 overflow-hidden relative border border-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.imageUrl}
              alt={article.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div>
          <div className="text-[11px] font-medium text-slate-400 mb-1">
            {article.publishedAt
              ? new Date(article.publishedAt).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : new Date(article.createdAt).toLocaleDateString('ru-RU')}
          </div>
          <h1 className="text-lg font-bold text-slate-900 leading-snug">
            {article.title}
          </h1>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
            {article.content}
          </p>
        </div>

        <div className="border-t border-slate-100 pt-3 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Служба логистики AliBros</span>
          <span>Официальное оповещение</span>
        </div>
      </Card>
    </div>
  );
}
