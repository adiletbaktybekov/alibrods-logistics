'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { NewsArticle, NewsStatus } from '@prisma/client';
import {
  createNewsAction,
  updateNewsAction,
  publishNewsAction,
  archiveNewsAction,
  deleteNewsAction,
} from '@/app/actions/news';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface EnrichedNewsArticle extends NewsArticle {
  author?: { id: string; email?: string | null; phone?: string | null } | null;
  _count?: { deliveries: number };
}

interface NewsClientProps {
  initialNews: EnrichedNewsArticle[];
}

export function NewsClient({ initialNews }: NewsClientProps) {
  const router = useRouter();
  const [items, setItems] = React.useState<EnrichedNewsArticle[]>(initialNews);
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | NewsStatus>('ALL');

  // Modal state
  const [modalMode, setModalMode] = React.useState<'create' | 'edit' | 'preview' | null>(null);
  const [activeArticle, setActiveArticle] = React.useState<EnrichedNewsArticle | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form inputs
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [imageUrl, setImageUrl] = React.useState('');

  React.useEffect(() => {
    setItems(initialNews);
  }, [initialNews]);

  const openCreateModal = () => {
    setActiveArticle(null);
    setTitle('');
    setContent('');
    setImageUrl('');
    setFormError(null);
    setModalMode('create');
  };

  const openEditModal = (article: EnrichedNewsArticle) => {
    setActiveArticle(article);
    setTitle(article.title);
    setContent(article.content);
    setImageUrl(article.imageUrl || '');
    setFormError(null);
    setModalMode('edit');
  };

  const openPreviewModal = (article: EnrichedNewsArticle) => {
    setActiveArticle(article);
    setModalMode('preview');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      if (modalMode === 'create') {
        const res = await createNewsAction({
          title,
          content,
          imageUrl: imageUrl ? imageUrl.trim() : undefined,
        });

        if (res.success && res.data) {
          setNotice({ type: 'success', message: 'Новость сохранена в черновиках' });
          setModalMode(null);
          router.refresh();
        } else {
          setFormError(res.error || 'Ошибка при сохранении новости');
        }
      } else if (modalMode === 'edit' && activeArticle) {
        const res = await updateNewsAction(activeArticle.id, {
          title,
          content,
          imageUrl: imageUrl ? imageUrl.trim() : undefined,
        });

        if (res.success) {
          setNotice({ type: 'success', message: 'Новость успешно обновлена' });
          setModalMode(null);
          router.refresh();
        } else {
          setFormError(res.error || 'Ошибка при обновлении');
        }
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Сетевая ошибка');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublish = async (article: EnrichedNewsArticle) => {
    if (
      !confirm(
        `Опубликовать новость «${article.title}»?\nОна будет немедленно отправлена всем клиентам селлерам в Telegram.`
      )
    ) {
      return;
    }

    setNotice({ type: 'success', message: 'Отправка новости клиентам в Telegram...' });
    try {
      const res = await publishNewsAction(article.id);
      if (res.success) {
        setNotice({
          type: 'success',
          message: `Новость опубликована! Доставлено селлерам: ${res.sentCount}${
            res.failedCount ? ` (не удалось отправить: ${res.failedCount})` : ''
          }`,
        });
        router.refresh();
      } else {
        setNotice({ type: 'error', message: res.error || 'Ошибка публикации' });
      }
    } catch (err: unknown) {
      setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Ошибка при публикации',
      });
    }
  };

  const handleArchive = async (article: EnrichedNewsArticle) => {
    try {
      const res = await archiveNewsAction(article.id);
      if (res.success) {
        setNotice({ type: 'success', message: `Новость «${article.title}» перемещена в архив` });
        router.refresh();
      } else {
        setNotice({ type: 'error', message: res.error || 'Ошибка архивации' });
      }
    } catch {
      setNotice({ type: 'error', message: 'Сетевая ошибка' });
    }
  };

  const handleDelete = async (article: EnrichedNewsArticle) => {
    if (!confirm(`Удалить новость «${article.title}»?`)) return;

    try {
      const res = await deleteNewsAction(article.id);
      if (res.success) {
        setNotice({ type: 'success', message: `Новость удалена` });
        router.refresh();
      } else {
        setNotice({ type: 'error', message: res.error || 'Ошибка удаления' });
      }
    } catch {
      setNotice({ type: 'error', message: 'Сетевая ошибка' });
    }
  };

  const filteredNews = items.filter((art) => {
    if (statusFilter !== 'ALL' && art.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      {notice && (
        <div
          className={`rounded-xl border p-4 text-xs font-medium flex items-center justify-between ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{notice.message}</span>
          <button
            onClick={() => setNotice(null)}
            className="text-slate-400 hover:text-slate-700 ml-4 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Action / Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'ALL' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Все ({items.length})
          </button>
          <button
            onClick={() => setStatusFilter(NewsStatus.PUBLISHED)}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              statusFilter === NewsStatus.PUBLISHED
                ? 'bg-white shadow-xs text-emerald-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Опубликованные
          </button>
          <button
            onClick={() => setStatusFilter(NewsStatus.DRAFT)}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              statusFilter === NewsStatus.DRAFT
                ? 'bg-white shadow-xs text-amber-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Черновики
          </button>
          <button
            onClick={() => setStatusFilter(NewsStatus.ARCHIVED)}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              statusFilter === NewsStatus.ARCHIVED
                ? 'bg-white shadow-xs text-slate-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            В архиве
          </button>
        </div>

        <Button
          onClick={openCreateModal}
          variant="primary"
          size="sm"
          className="bg-brand-600 hover:bg-brand-700 text-white shrink-0"
        >
          + Создать новость
        </Button>
      </div>

      {/* News List */}
      {filteredNews.length === 0 ? (
        <Card className="border-slate-200 shadow-sm bg-white p-12 text-center">
          <h3 className="text-sm font-semibold text-slate-900">Новостей нет</h3>
          <p className="text-xs text-slate-500 mt-1">
            Создайте первую публикацию для клиентов, нажав «+ Создать новость»
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredNews.map((article) => (
            <div
              key={article.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col md:flex-row gap-5 items-start justify-between"
            >
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-900 text-base">{article.title}</span>
                  {article.status === NewsStatus.PUBLISHED && (
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                      Опубликовано
                    </Badge>
                  )}
                  {article.status === NewsStatus.DRAFT && (
                    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                      Черновик
                    </Badge>
                  )}
                  {article.status === NewsStatus.ARCHIVED && (
                    <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-600 border-slate-300">
                      В архиве
                    </Badge>
                  )}
                </div>

                <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                  {article.content}
                </p>

                {article.imageUrl && (
                  <div className="pt-1">
                    <span className="text-[11px] font-mono text-slate-400">
                      🖼 Баннер прикреплён
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4 pt-2 text-[11px] text-slate-400">
                  <span>Создано: {new Date(article.createdAt).toLocaleDateString('ru-RU')}</span>
                  {article.publishedAt && (
                    <span className="text-slate-500 font-medium">
                      Опубликовано: {new Date(article.publishedAt).toLocaleString('ru-RU')}
                    </span>
                  )}
                  {article._count?.deliveries !== undefined && (
                    <span className="text-brand-600 font-medium">
                      Разослано: {article._count.deliveries} клиентам
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 shrink-0 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                <Button
                  onClick={() => openPreviewModal(article)}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                >
                  👁 Предпросмотр
                </Button>

                {article.status !== NewsStatus.PUBLISHED && (
                  <Button
                    onClick={() => handlePublish(article)}
                    variant="primary"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  >
                    🚀 Опубликовать
                  </Button>
                )}

                <Button
                  onClick={() => openEditModal(article)}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                >
                  ✎ Изменить
                </Button>

                {article.status !== NewsStatus.ARCHIVED && (
                  <button
                    onClick={() => handleArchive(article)}
                    className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1"
                  >
                    В архив
                  </button>
                )}

                <button
                  onClick={() => handleDelete(article)}
                  className="text-xs text-rose-600 hover:text-rose-800 px-2 py-1"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {modalMode === 'create' ? 'Создание новости для клиентов' : 'Редактирование новости'}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
              <div>
                <Label htmlFor="news-title" required className="text-xs font-semibold text-slate-700">
                  Заголовок новости
                </Label>
                <Input
                  id="news-title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например, Новый маршрут на склад WB Казань"
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="news-content" required className="text-xs font-semibold text-slate-700">
                  Текст новости
                </Label>
                <textarea
                  id="news-content"
                  required
                  rows={6}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Подробный текст новости для селлеров..."
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 shadow-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-sans"
                />
              </div>

              <div>
                <Label htmlFor="news-image" className="text-xs font-semibold text-slate-700">
                  URL баннера / изображения (опционально)
                </Label>
                <Input
                  id="news-image"
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://images.alibros.ru/banner.jpg"
                  className="mt-1 text-xs font-mono"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Если указан URL картинки, она отобразится в Telegram сообщении и в Mini App
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalMode(null)}
                  disabled={isSubmitting}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  className="bg-brand-600 hover:bg-brand-700 text-white"
                >
                  {isSubmitting ? 'Сохранение...' : modalMode === 'create' ? 'Сохранить черновик' : 'Сохранить изменения'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {modalMode === 'preview' && activeArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-slate-400">Вид в Telegram Mini App</span>
              </div>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {activeArticle.imageUrl && (
                <div className="w-full h-44 rounded-xl bg-slate-100 overflow-hidden relative border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeArticle.imageUrl}
                    alt={activeArticle.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <h2 className="text-lg font-bold text-slate-900 leading-tight">
                {activeArticle.title}
              </h2>

              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                {activeArticle.content}
              </p>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>AliBros Logistics</span>
                <span>{new Date().toLocaleDateString('ru-RU')}</span>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalMode(null)}
              >
                Закрыть предпросмотр
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
