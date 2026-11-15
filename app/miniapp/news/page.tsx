import * as React from 'react';
import Link from 'next/link';
import { NewsService } from '@/modules/news/news.service';
import { MiniAppHeader } from '@/components/miniapp/miniapp-header';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function MiniAppNewsPage() {
  const news = await NewsService.listPublished();

  return (
    <div className="space-y-4">
      <MiniAppHeader title="Новости и оповещения" subtitle="Регламенты и важные обновления" />

      <div className="px-4 space-y-3">
        {news.length === 0 ? (
          <Card className="border-slate-200 bg-white p-8 text-center shadow-xs">
            <div className="text-3xl mb-2">📰</div>
            <h3 className="text-sm font-semibold text-slate-800">Новостей пока нет</h3>
            <p className="text-xs text-slate-400 mt-1">
              Здесь будут публиковаться графики приёмки, изменения тарифов и регламенты складов.
            </p>
          </Card>
        ) : (
          news.map((item) => (
            <Link key={item.id} href={`/miniapp/news/${item.id}`} className="block">
              <Card className="border-slate-200 bg-white p-4 shadow-xs hover:border-brand-300 transition-all active:scale-[0.99] space-y-2.5">
                {item.imageUrl && (
                  <div className="w-full h-36 rounded-xl bg-slate-100 overflow-hidden relative border border-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                    {item.content}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    {item.publishedAt
                      ? new Date(item.publishedAt).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'long',
                        })
                      : new Date(item.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                  <span className="text-brand-600 font-semibold flex items-center gap-1">
                    Читать <span>→</span>
                  </span>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
