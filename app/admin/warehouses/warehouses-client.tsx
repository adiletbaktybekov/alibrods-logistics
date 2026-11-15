'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MarketplaceType, Warehouse } from '@prisma/client';
import {
  createWarehouseAction,
  updateWarehouseAction,
  toggleWarehouseActiveAction,
  deleteWarehouseAction,
} from '@/app/actions/admin';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface EnrichedWarehouse extends Warehouse {
  schedule?: string;
  scheduleDescription?: string;
}

interface WarehousesClientProps {
  initialWarehouses: EnrichedWarehouse[];
}

export function WarehousesClient({ initialWarehouses }: WarehousesClientProps) {
  const router = useRouter();
  const [items, setItems] = React.useState<EnrichedWarehouse[]>(initialWarehouses);
  const [search, setSearch] = React.useState('');
  const [filterMarketplace, setFilterMarketplace] = React.useState<'ALL' | 'WILDBERRIES' | 'OZON'>('ALL');
  const [filterStatus, setFilterStatus] = React.useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal states
  const [modalMode, setModalMode] = React.useState<'create' | 'edit' | null>(null);
  const [editingWh, setEditingWh] = React.useState<EnrichedWarehouse | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [actionNotice, setActionNotice] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form fields
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [marketplace, setMarketplace] = React.useState<MarketplaceType>(MarketplaceType.WILDBERRIES);
  const [address, setAddress] = React.useState('');
  const [city, setCity] = React.useState('');
  const [operatingHours, setOperatingHours] = React.useState('');

  React.useEffect(() => {
    setItems(initialWarehouses);
  }, [initialWarehouses]);

  const openCreateModal = () => {
    setEditingWh(null);
    setName('');
    setCode('');
    setMarketplace(MarketplaceType.WILDBERRIES);
    setAddress('');
    setCity('Москва и МО');
    setOperatingHours('Ежедневно');
    setFormError(null);
    setModalMode('create');
  };

  const openEditModal = (wh: EnrichedWarehouse) => {
    setEditingWh(wh);
    setName(wh.name);
    setCode(wh.code);
    setMarketplace(wh.marketplace);
    setAddress(wh.address || '');
    setCity(wh.city || '');
    setOperatingHours(wh.operatingHours || wh.scheduleDescription || 'Ежедневно');
    setFormError(null);
    setModalMode('edit');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      if (modalMode === 'create') {
        const res = await createWarehouseAction({
          name,
          code,
          marketplace,
          address,
          city,
          operatingHours,
        });

        if (res.success && res.data) {
          setActionNotice({ type: 'success', message: `Склад «${res.data.name}» успешно добавлен` });
          setModalMode(null);
          router.refresh();
        } else {
          setFormError(res.error || 'Ошибка при добавлении склада');
        }
      } else if (modalMode === 'edit' && editingWh) {
        const res = await updateWarehouseAction(editingWh.id, {
          name,
          code,
          marketplace,
          address,
          city,
          operatingHours,
        });

        if (res.success && res.data) {
          setActionNotice({ type: 'success', message: `Склад «${res.data.name}» успешно обновлён` });
          setModalMode(null);
          router.refresh();
        } else {
          setFormError(res.error || 'Ошибка при обновлении склада');
        }
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Сетевая ошибка');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (wh: EnrichedWarehouse) => {
    const nextState = !wh.isActive;
    // Optimistic update
    setItems((prev) => prev.map((item) => (item.id === wh.id ? { ...item, isActive: nextState } : item)));

    try {
      const res = await toggleWarehouseActiveAction(wh.id, nextState);
      if (res.success) {
        setActionNotice({
          type: 'success',
          message: `Склад «${wh.name}» ${nextState ? 'активирован' : 'деактивирован'}`,
        });
        router.refresh();
      } else {
        // Rollback
        setItems((prev) => prev.map((item) => (item.id === wh.id ? { ...item, isActive: !nextState } : item)));
        setActionNotice({ type: 'error', message: res.error || 'Не удалось изменить статус' });
      }
    } catch {
      setItems((prev) => prev.map((item) => (item.id === wh.id ? { ...item, isActive: !nextState } : item)));
      setActionNotice({ type: 'error', message: 'Сетевая ошибка' });
    }
  };

  const handleDelete = async (wh: EnrichedWarehouse) => {
    if (!confirm(`Вы действительно хотите удалить склад «${wh.name}» (${wh.code})?`)) {
      return;
    }

    try {
      const res = await deleteWarehouseAction(wh.id);
      if (res.success) {
        setItems((prev) => prev.filter((item) => item.id !== wh.id));
        setActionNotice({ type: 'success', message: `Склад «${wh.name}» удалён` });
        router.refresh();
      } else {
        setActionNotice({
          type: 'error',
          message: res.error || 'Не удалось удалить склад',
        });
      }
    } catch (err: unknown) {
      setActionNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Ошибка при удалении',
      });
    }
  };

  // Filter items
  const filteredItems = items.filter((wh) => {
    if (filterMarketplace !== 'ALL' && wh.marketplace !== filterMarketplace) return false;
    if (filterStatus === 'ACTIVE' && !wh.isActive) return false;
    if (filterStatus === 'INACTIVE' && wh.isActive) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = wh.name.toLowerCase().includes(q);
      const matchCode = wh.code.toLowerCase().includes(q);
      const matchCity = wh.city?.toLowerCase().includes(q) || false;
      const matchAddr = wh.address?.toLowerCase().includes(q) || false;
      if (!matchName && !matchCode && !matchCity && !matchAddr) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Notifications / Alerts */}
      {actionNotice && (
        <div
          className={`rounded-xl border p-4 text-xs font-medium flex items-center justify-between ${
            actionNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{actionNotice.message}</span>
          <button
            onClick={() => setActionNotice(null)}
            className="text-slate-400 hover:text-slate-700 ml-4 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию, коду, адресу или городу..."
              className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs">
            <button
              onClick={() => setFilterMarketplace('ALL')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterMarketplace === 'ALL' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Все
            </button>
            <button
              onClick={() => setFilterMarketplace('WILDBERRIES')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterMarketplace === 'WILDBERRIES' ? 'bg-white shadow-xs text-brand-600' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              WB
            </button>
            <button
              onClick={() => setFilterMarketplace('OZON')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterMarketplace === 'OZON' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Ozon
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs">
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterStatus === 'ALL' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Все статусы
            </button>
            <button
              onClick={() => setFilterStatus('ACTIVE')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterStatus === 'ACTIVE' ? 'bg-white shadow-xs text-emerald-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Активные
            </button>
            <button
              onClick={() => setFilterStatus('INACTIVE')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterStatus === 'INACTIVE' ? 'bg-white shadow-xs text-rose-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Отключенные
            </button>
          </div>
        </div>

        <Button
          onClick={openCreateModal}
          variant="primary"
          size="sm"
          className="bg-brand-600 hover:bg-brand-700 text-white shrink-0"
        >
          + Добавить склад
        </Button>
      </div>

      {/* Warehouses Grid */}
      {filteredItems.length === 0 ? (
        <Card className="border-slate-200 shadow-sm bg-white p-12 text-center">
          <h3 className="text-sm font-semibold text-slate-900">Склады не найдены</h3>
          <p className="text-xs text-slate-500 mt-1">Попробуйте изменить параметры поиска или фильтры</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((wh) => (
            <div
              key={wh.id}
              className={`rounded-xl border p-4 transition-all bg-white flex flex-col justify-between ${
                wh.isActive
                  ? 'border-slate-200 hover:border-brand-300 hover:shadow-xs'
                  : 'border-slate-200 bg-slate-50/70 opacity-75'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{wh.name}</span>
                    {!wh.isActive && (
                      <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">
                        Отключен
                      </Badge>
                    )}
                  </div>
                  <Badge
                    variant={wh.marketplace === 'WILDBERRIES' ? 'default' : 'warning'}
                    className="text-[10px]"
                  >
                    {wh.marketplace}
                  </Badge>
                </div>

                <div className="font-mono text-[11px] text-slate-400">
                  Код: <span className="font-semibold text-slate-600">{wh.code}</span>
                </div>

                {wh.city && <div className="text-[11px] text-slate-600 mt-1">📍 {wh.city}</div>}
                {wh.address && <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{wh.address}</div>}

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400">График:</span>
                  <span className="font-medium text-slate-700">
                    {wh.operatingHours || wh.scheduleDescription || 'Ежедневно'}
                  </span>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => openEditModal(wh)}
                  className="text-xs font-medium text-slate-600 hover:text-brand-600 transition-colors"
                >
                  ✎ Изменить
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(wh)}
                    className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                      wh.isActive
                        ? 'text-amber-700 hover:bg-amber-50'
                        : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    {wh.isActive ? 'Деактивировать' : 'Активировать'}
                  </button>

                  <button
                    onClick={() => handleDelete(wh)}
                    className="text-xs font-medium text-rose-600 hover:bg-rose-50 px-2 py-1 rounded transition-colors"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Dialog: Add / Edit */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {modalMode === 'create' ? 'Добавить новый склад' : `Редактирование склада «${editingWh?.name}»`}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="wh-name" required className="text-xs font-semibold text-slate-700">
                    Название склада
                  </Label>
                  <Input
                    id="wh-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Например, Коледино"
                    className="mt-1 text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="wh-code" required className="text-xs font-semibold text-slate-700">
                    Код склада (уникальный)
                  </Label>
                  <Input
                    id="wh-code"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="WB_KOLEDINO"
                    className="mt-1 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="wh-marketplace" required className="text-xs font-semibold text-slate-700">
                    Маркетплейс
                  </Label>
                  <select
                    id="wh-marketplace"
                    value={marketplace}
                    onChange={(e) => setMarketplace(e.target.value as MarketplaceType)}
                    className="mt-1 flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  >
                    <option value={MarketplaceType.WILDBERRIES}>WILDBERRIES</option>
                    <option value={MarketplaceType.OZON}>OZON</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="wh-city" required className="text-xs font-semibold text-slate-700">
                    Город / Регион
                  </Label>
                  <Input
                    id="wh-city"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Москва и МО"
                    className="mt-1 text-xs"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="wh-address" required className="text-xs font-semibold text-slate-700">
                  Точный адрес склада
                </Label>
                <Input
                  id="wh-address"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Московская область, Подольский р-н, д. Коледино"
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="wh-hours" className="text-xs font-semibold text-slate-700">
                  Режим работы / Расписание
                </Label>
                <Input
                  id="wh-hours"
                  value={operatingHours}
                  onChange={(e) => setOperatingHours(e.target.value)}
                  placeholder="Ежедневно (или Понедельник / Среда / Пятница)"
                  className="mt-1 text-xs"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Укажите дни приёма («Ежедневно», «Понедельник / Среда / Пятница», «Вторник / Четверг / Суббота»)
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
                  {isSubmitting ? 'Сохранение...' : modalMode === 'create' ? 'Создать склад' : 'Сохранить изменения'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
