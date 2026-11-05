/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import { PhotoType } from '@prisma/client';
import { formatDateTime } from '@/lib/utils';

export interface PhotoItem {
  id: string;
  orderId: string;
  type: PhotoType;
  photoUrl: string;
  fileKey?: string | null;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
  caption?: string | null;
  createdAt: Date | string;
  uploadedBy?: {
    fullName?: string | null;
    email?: string | null;
  } | null;
}

interface PhotoGalleryProps {
  orderId: string;
  photos: PhotoItem[];
  isAdmin?: boolean;
}

const CATEGORY_TITLES: Record<string, string> = {
  CARGO_PICKUP: 'Приёмка груза у селлера',
  WAREHOUSE_ACCEPTANCE: 'Сдача на склад маркетплейса',
  PACKAGING: 'Упаковка и тара',
  LABEL_CHECK: 'Маркировка и ШК',
  DAMAGE_REPORT: 'Акт повреждений',
  ACT_DOCUMENT: 'Документы и акты',
};

export function PhotoGallery({ orderId, photos, isAdmin = false }: PhotoGalleryProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  if (!photos || photos.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-slate-500">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <p className="font-medium text-slate-700">Фотоотчёты пока не прикреплены</p>
        <p className="mt-0.5 text-slate-400 max-w-sm mx-auto">
          Водитель отправит фотографии через Telegram-бот при заборе груза и после выгрузки на складе маркетплейса.
        </p>
      </div>
    );
  }

  const categories = Array.from(new Set(photos.map((p) => p.type)));
  const filteredPhotos =
    filterCategory === 'ALL' ? photos : photos.filter((p) => p.type === filterCategory);

  return (
    <div className="space-y-4">
      {/* Category filter pills if multiple categories */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1.5 pb-2 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setFilterCategory('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              filterCategory === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Все ({photos.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                filterCategory === cat
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {CATEGORY_TITLES[cat] || cat} ({photos.filter((p) => p.type === cat).length})
            </button>
          ))}
        </div>
      )}

      {/* Photo Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filteredPhotos.map((photo) => {
          const photoSrc = `/api/orders/${orderId}/photos/${photo.id}`;
          const formattedSize = photo.fileSizeBytes
            ? photo.fileSizeBytes > 1024 * 1024
              ? `${(photo.fileSizeBytes / (1024 * 1024)).toFixed(1)} МБ`
              : `${Math.round(photo.fileSizeBytes / 1024)} КБ`
            : null;

          return (
            <div
              key={photo.id}
              className="group relative rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs hover:shadow-md transition-all flex flex-col"
            >
              <div
                className="relative aspect-4/3 bg-slate-100 overflow-hidden cursor-pointer"
                onClick={() => setSelectedPhoto(photo)}
              >
                {/* Image element requesting secure proxy route */}
                <img
                  src={photoSrc}
                  alt={photo.caption || CATEGORY_TITLES[photo.type] || photo.type}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="px-2.5 py-1 rounded-full bg-white/90 text-[11px] font-semibold text-slate-900 shadow-sm">
                    Увеличить 🔍
                  </span>
                </div>
              </div>

              <div className="p-2.5 space-y-1 flex-1 flex flex-col justify-between text-xs">
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        photo.type === 'CARGO_PICKUP'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-emerald-100 text-emerald-900'
                      }`}
                    >
                      {CATEGORY_TITLES[photo.type] || photo.type}
                    </span>
                    {formattedSize && (
                      <span className="text-[10px] text-slate-400 font-mono">{formattedSize}</span>
                    )}
                  </div>
                  {photo.caption && (
                    <p className="text-slate-700 text-[11px] mt-1 line-clamp-2 italic">
                      «{photo.caption}»
                    </p>
                  )}
                </div>

                <div className="pt-1.5 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
                  <span>{formatDateTime(photo.createdAt)}</span>
                  {isAdmin && photo.uploadedBy?.fullName && (
                    <span className="font-medium text-slate-600 truncate max-w-[90px]" title={photo.uploadedBy.fullName}>
                      {photo.uploadedBy.fullName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-3.5 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between text-white">
              <div>
                <h4 className="font-semibold text-sm">
                  {CATEGORY_TITLES[selectedPhoto.type] || selectedPhoto.type}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  {formatDateTime(selectedPhoto.createdAt)}
                  {selectedPhoto.caption && ` • «${selectedPhoto.caption}»`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`/api/orders/${orderId}/photos/${selectedPhoto.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium transition-colors"
                >
                  Оригинал ↗
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                  aria-label="Закрыть"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body: Image preview */}
            <div className="flex-1 overflow-auto p-2 bg-slate-950 flex items-center justify-center min-h-[300px]">
              <img
                src={`/api/orders/${orderId}/photos/${selectedPhoto.id}`}
                alt={selectedPhoto.caption || selectedPhoto.type}
                className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
