import { describe, it, expect, vi } from 'vitest';
import { resolveWarehouseSchedule } from '@/modules/warehouses/warehouses.service';
import { canModifyUserRole } from '@/config/permissions';

describe('Warehouse Schedule Resolution & Administration', () => {
  it('resolves confirmed warehouse schedule correctly', () => {
    const koledino = resolveWarehouseSchedule({ code: 'WB_KOLEDINO', name: 'Коледино' });
    expect(koledino.schedule).toBe('DAILY');
    expect(koledino.scheduleDescription).toBe('Ежедневно');

    const radumlya = resolveWarehouseSchedule({ code: 'WB_RADUMLYA', name: 'Радумля' });
    expect(radumlya.schedule).toBe('MWF');
    expect(radumlya.scheduleDescription).toBe('Понедельник / среда / пятница');

    const chashnikovo = resolveWarehouseSchedule({ code: 'WB_CHASHNIKOVO', name: 'Чашниково' });
    expect(chashnikovo.schedule).toBe('TTS');
    expect(chashnikovo.scheduleDescription).toBe('Вторник / четверг / суббота');
  });

  it('resolves custom warehouse schedule based on operating hours', () => {
    const ttsWh = resolveWarehouseSchedule({
      code: 'CUSTOM_TTS',
      name: 'Склад ВТ-ЧТ-СБ',
      operatingHours: 'Вторник / четверг / суббота с 9 до 18',
    });
    expect(ttsWh.schedule).toBe('TTS');

    const mwfWh = resolveWarehouseSchedule({
      code: 'CUSTOM_MWF',
      name: 'Склад ПН-СР-ПТ',
      operatingHours: 'Приём понедельник, среда, пятница',
    });
    expect(mwfWh.schedule).toBe('MWF');

    const dailyWh = resolveWarehouseSchedule({
      code: 'CUSTOM_DAILY',
      name: 'Склад Ежедневный',
      operatingHours: 'Круглосуточно без выходных',
    });
    expect(dailyWh.schedule).toBe('DAILY');
  });
});

describe('RBAC Superadmin Hierarchy Protections', () => {
  it('allows SUPER_ADMIN to assign any role including SUPER_ADMIN', () => {
    expect(canModifyUserRole('SUPER_ADMIN', 'ADMIN', 'SUPER_ADMIN')).toBe(true);
    expect(canModifyUserRole('SUPER_ADMIN', 'SUPER_ADMIN', 'ADMIN')).toBe(true);
    expect(canModifyUserRole('SUPER_ADMIN', 'MANAGER', 'ADMIN')).toBe(true);
  });

  it('forbids regular ADMIN from assigning SUPER_ADMIN role', () => {
    expect(canModifyUserRole('ADMIN', 'MANAGER', 'SUPER_ADMIN')).toBe(false);
  });

  it('forbids regular ADMIN from demoting or altering a SUPER_ADMIN', () => {
    expect(canModifyUserRole('ADMIN', 'SUPER_ADMIN', 'ADMIN')).toBe(false);
    expect(canModifyUserRole('ADMIN', 'SUPER_ADMIN', 'MANAGER')).toBe(false);
  });

  it('forbids non-staff roles from modifying any roles', () => {
    expect(canModifyUserRole('CLIENT', 'CLIENT', 'ADMIN')).toBe(false);
    expect(canModifyUserRole('DRIVER', 'DRIVER', 'MANAGER')).toBe(false);
  });
});
