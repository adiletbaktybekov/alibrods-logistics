'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { updateAdminOrderAction } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DestinationItemInput, UpdateOrderDto } from '@/modules/orders/orders.dto';

interface WarehouseOption {
  id: string;
  name: string;
  marketplace?: string;
  city?: string | null;
}

interface DestinationState {
  id: string;
  warehouseId?: string | null;
  isCustomWarehouse: boolean;
  customWarehouseName?: string | null;
  deliveryDate: string;
  palletsCount: number;
  boxesCount: number;
  comment?: string | null;
}

interface OrderEditModalProps {
  orderId: string;
  orderNumber: string;
  initialPickupAddress?: string | null;
  initialPickupCity?: string | null;
  initialPickupContactName?: string | null;
  initialPickupContactPhone?: string | null;
  initialClientComment?: string | null;
  initialDestinations: Array<{
    warehouseId?: string | null;
    isCustomWarehouse?: boolean;
    customWarehouseName?: string | null;
    deliveryDate?: Date | string | null;
    palletsCount: number;
    boxesCount: number;
    comment?: string | null;
    warehouse?: { name?: string; marketplace?: string } | null;
  }>;
  warehouses: WarehouseOption[];
  disabled?: boolean;
}

export function OrderEditModal({
  orderId,
  orderNumber,
  initialPickupAddress,
  initialPickupCity,
  initialPickupContactName,
  initialPickupContactPhone,
  initialClientComment,
  initialDestinations,
  warehouses,
  disabled = false,
}: OrderEditModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Pickup fields
  const [pickupAddress, setPickupAddress] = React.useState(initialPickupAddress || '');
  const [pickupCity, setPickupCity] = React.useState(initialPickupCity || '');
  const [pickupContactName, setPickupContactName] = React.useState(initialPickupContactName || '');
  const [pickupContactPhone, setPickupContactPhone] = React.useState(initialPickupContactPhone || '');
  const [clientComment, setClientComment] = React.useState(initialClientComment || '');

  // Destinations state
  const formatDateForInput = (d?: Date | string | null): string => {
    if (!d) return '';
    try {
      const date = typeof d === 'string' ? new Date(d) : d;
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const [destinations, setDestinations] = React.useState<DestinationState[]>(() => {
    if (!initialDestinations || initialDestinations.length === 0) {
      return [
        {
          id: 'dest-0',
          warehouseId: warehouses[0]?.id || '',
          isCustomWarehouse: false,
          customWarehouseName: '',
          deliveryDate: new Date().toISOString().split('T')[0],
          palletsCount: 0,
          boxesCount: 0,
          comment: '',
        },
      ];
    }
    return initialDestinations.map((d, idx) => ({
      id: `dest-${idx}-${Date.now()}`,
      warehouseId: d.isCustomWarehouse ? '' : d.warehouseId || '',
      isCustomWarehouse: Boolean(d.isCustomWarehouse),
      customWarehouseName: d.customWarehouseName || '',
      deliveryDate: formatDateForInput(d.deliveryDate),
      palletsCount: d.palletsCount || 0,
      boxesCount: d.boxesCount || 0,
      comment: d.comment || '',
    }));
  });

  // Reset to initial when opened
  const handleOpen = () => {
    setPickupAddress(initialPickupAddress || '');
    setPickupCity(initialPickupCity || '');
    setPickupContactName(initialPickupContactName || '');
    setPickupContactPhone(initialPickupContactPhone || '');
    setClientComment(initialClientComment || '');
    if (initialDestinations && initialDestinations.length > 0) {
      setDestinations(
        initialDestinations.map((d, idx) => ({
          id: `dest-${idx}-${Date.now()}`,
          warehouseId: d.isCustomWarehouse ? '' : d.warehouseId || '',
          isCustomWarehouse: Boolean(d.isCustomWarehouse),
          customWarehouseName: d.customWarehouseName || '',
          deliveryDate: formatDateForInput(d.deliveryDate),
          palletsCount: d.palletsCount || 0,
          boxesCount: d.boxesCount || 0,
          comment: d.comment || '',
        }))
      );
    }
    setError(null);
    setIsOpen(true);
  };

  const handleAddDestination = () => {
    setDestinations((prev) => [
      ...prev,
      {
        id: `dest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        warehouseId: warehouses[0]?.id || '',
        isCustomWarehouse: false,
        customWarehouseName: '',
        deliveryDate: new Date().toISOString().split('T')[0],
        palletsCount: 0,
        boxesCount: 0,
        comment: '',
      },
    ]);
  };

  const handleRemoveDestination = (id: string) => {
    if (destinations.length <= 1) return;
    setDestinations((prev) => prev.filter((d) => d.id !== id));
  };

  const updateDestination = (id: string, updates: Partial<DestinationState>) => {
    setDestinations((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...updates } : d))
    );
  };

  // Totals
  const totalPallets = destinations.reduce((sum, d) => sum + (Number(d.palletsCount) || 0), 0);
  const totalBoxes = destinations.reduce((sum, d) => sum + (Number(d.boxesCount) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (totalPallets === 0 && totalBoxes === 0) {
      setError('Укажите количество коробок или паллет (минимум 1 единица груза)');
      return;
    }

    // Validate destinations
    for (let i = 0; i < destinations.length; i++) {
      const d = destinations[i];
      if (d.isCustomWarehouse && (!d.customWarehouseName || d.customWarehouseName.trim().length < 2)) {
        setError(`Укажите название индивидуального склада (строка ${i + 1})`);
        return;
      }
      if (!d.isCustomWarehouse && !d.warehouseId) {
        setError(`Выберите склад из списка (строка ${i + 1})`);
        return;
      }
      if (!d.deliveryDate) {
        setError(`Укажите дату доставки для каждого склада (строка ${i + 1})`);
        return;
      }
      if ((d.palletsCount || 0) <= 0 && (d.boxesCount || 0) <= 0) {
        setError(`Укажите паллеты или коробки для каждого склада (строка ${i + 1})`);
        return;
      }
    }

    setLoading(true);
    try {
      const dtoDestinations: DestinationItemInput[] = destinations.map((d) => ({
        warehouseId: d.isCustomWarehouse ? null : d.warehouseId || null,
        isCustomWarehouse: d.isCustomWarehouse,
        customWarehouseName: d.isCustomWarehouse ? d.customWarehouseName?.trim() || null : null,
        deliveryDate: new Date(d.deliveryDate),
        palletsCount: Number(d.palletsCount) || 0,
        boxesCount: Number(d.boxesCount) || 0,
        comment: d.comment?.trim() || null,
      }));

      const dto: UpdateOrderDto = {
        pickupAddress: pickupAddress.trim() || null,
        pickupCity: pickupCity.trim() || null,
        pickupContactName: pickupContactName.trim() || null,
        pickupContactPhone: pickupContactPhone.trim() || undefined,
        clientComment: clientComment.trim() || null,
        destinations: dtoDestinations,
      };

      const res = await updateAdminOrderAction(orderId, dto);
      if (res.success) {
        setIsOpen(false);
        router.refresh();
      } else {
        setError(res.error || 'Не удалось сохранить изменения');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Произошла непредвиденная ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={handleOpen}
        className="text-xs font-medium text-slate-700 hover:text-brand-600 border-slate-300 hover:border-brand-500"
      >
        ✏️ Редактировать заявку
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-6 my-8 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Редактирование заявки №{orderNumber}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Изменение параметров груза, складов назначения, адреса забора и заметок
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <span className="font-semibold">Ошибка:</span> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Pickup info */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  📍 Данные забора груза
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Адрес забора груза
                    </label>
                    <Input
                      type="text"
                      value={pickupAddress}
                      onChange={(e) => setPickupAddress(e.target.value)}
                      placeholder="Улица, дом, ворота/склад"
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Город / Населённый пункт
                    </label>
                    <Input
                      type="text"
                      value={pickupCity}
                      onChange={(e) => setPickupCity(e.target.value)}
                      placeholder="Бишкек / Чуйская область"
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Контактное лицо на заборе
                    </label>
                    <Input
                      type="text"
                      value={pickupContactName}
                      onChange={(e) => setPickupContactName(e.target.value)}
                      placeholder="Имя кладовщика / селлера"
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Телефон на заборе
                    </label>
                    <Input
                      type="tel"
                      value={pickupContactPhone}
                      onChange={(e) => setPickupContactPhone(e.target.value)}
                      placeholder="+996XXXXXXXXX"
                      className="text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Destinations section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    🏢 Склады назначения и объём
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddDestination}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    + Добавить склад
                  </button>
                </div>

                <div className="space-y-3">
                  {destinations.map((dest, idx) => (
                    <div
                      key={dest.id}
                      className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                        <span className="font-semibold text-slate-800">
                          Точка назначения #{idx + 1}
                        </span>
                        {destinations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDestination(dest.id)}
                            className="text-rose-600 hover:text-rose-800 text-[11px] font-medium hover:underline"
                          >
                            Удалить точку
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-medium text-slate-600">
                              Склад маркетплейса
                            </label>
                            <label className="text-[10px] text-slate-500 flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={dest.isCustomWarehouse}
                                onChange={(e) =>
                                  updateDestination(dest.id, {
                                    isCustomWarehouse: e.target.checked,
                                  })
                                }
                                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                              />
                              Свой склад
                            </label>
                          </div>
                          {dest.isCustomWarehouse ? (
                            <Input
                              type="text"
                              value={dest.customWarehouseName || ''}
                              onChange={(e) =>
                                updateDestination(dest.id, {
                                  customWarehouseName: e.target.value,
                                })
                              }
                              placeholder="Название индивидуального склада"
                              className="text-xs"
                              required
                            />
                          ) : (
                            <select
                              value={dest.warehouseId || ''}
                              onChange={(e) =>
                                updateDestination(dest.id, {
                                  warehouseId: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none"
                              required
                            >
                              <option value="">-- Выберите склад --</option>
                              {warehouses.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name} {w.marketplace ? `(${w.marketplace})` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Дата сдачи на склад
                          </label>
                          <Input
                            type="date"
                            value={dest.deliveryDate}
                            onChange={(e) =>
                              updateDestination(dest.id, {
                                deliveryDate: e.target.value,
                              })
                            }
                            className="text-xs"
                            required
                          />
                        </div>

                        {/* STRICT: PALLETS FIRST, THEN BOXES */}
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Паллеты (шт.)
                          </label>
                          <Input
                            type="number"
                            min="0"
                            value={dest.palletsCount}
                            onChange={(e) =>
                              updateDestination(dest.id, {
                                palletsCount: Math.max(0, parseInt(e.target.value) || 0),
                              })
                            }
                            className="text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Коробки (шт.)
                          </label>
                          <Input
                            type="number"
                            min="0"
                            value={dest.boxesCount}
                            onChange={(e) =>
                              updateDestination(dest.id, {
                                boxesCount: Math.max(0, parseInt(e.target.value) || 0),
                              })
                            }
                            className="text-xs"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Примечание к точке сдачи (необязательно)
                          </label>
                          <Input
                            type="text"
                            value={dest.comment || ''}
                            onChange={(e) =>
                              updateDestination(dest.id, {
                                comment: e.target.value,
                              })
                            }
                            placeholder="Особый пропуск, транзитный склад..."
                            className="text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary bar */}
                <div className="p-3 bg-brand-50/50 border border-brand-100 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-medium text-brand-900">Общий объём партии:</span>
                  <span className="font-bold text-brand-700">
                    {totalPallets} палл. • {totalBoxes} кор.
                  </span>
                </div>
              </div>

              {/* Client comment */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  💬 Комментарий клиента / Заметка
                </label>
                <Textarea
                  value={clientComment}
                  onChange={(e) => setClientComment(e.target.value)}
                  placeholder="Любые дополнительные пожелания селлера..."
                  rows={2}
                  className="text-xs"
                />
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => setIsOpen(false)}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={loading}
                  className="bg-brand-600 hover:bg-brand-700 text-white"
                >
                  {loading ? 'Сохранение...' : 'Сохранить изменения'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
