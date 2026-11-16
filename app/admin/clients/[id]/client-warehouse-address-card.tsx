'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { updateClientAdminAction } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';

interface ClientWarehouseAddressCardProps {
  clientId: string;
  initialAddress: string | null | undefined;
}

export function ClientWarehouseAddressCard({
  clientId,
  initialAddress,
}: ClientWarehouseAddressCardProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = React.useState(false);
  const [address, setAddress] = React.useState(initialAddress || '');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await updateClientAdminAction(clientId, {
        warehouseAddress: address.trim() || undefined,
      });

      if (res.success) {
        setIsEditing(false);
        router.refresh();
      } else {
        setError(res.error || 'Не удалось обновить адрес склада');
      }
    } catch {
      setError('Ошибка при сохранении адреса');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-slate-500 font-medium">Адрес склада клиента:</span>
        {!isEditing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="text-[11px] h-6 px-2 text-brand-600 hover:text-brand-700 hover:bg-brand-50"
          >
            Изменить
          </Button>
        )}
      </div>

      {!isEditing ? (
        initialAddress ? (
          <p className="text-slate-900 font-medium text-xs leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-200">
            📍 {initialAddress}
          </p>
        ) : (
          <p className="text-amber-600 text-xs italic bg-amber-50 p-2 rounded-lg border border-amber-200">
            ⚠️ Адрес склада не указан клиентом
          </p>
        )
      ) : (
        <form onSubmit={handleSave} className="space-y-2 mt-2">
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            placeholder="Страна, город, улица, номер дома/строения/склада"
            className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {error && <div className="text-[11px] text-rose-600">{error}</div>}
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={loading}
              className="text-xs h-7"
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => {
                setAddress(initialAddress || '');
                setIsEditing(false);
              }}
              className="text-xs h-7"
            >
              Отмена
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
