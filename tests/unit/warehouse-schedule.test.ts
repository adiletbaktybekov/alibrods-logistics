import { describe, it, expect } from 'vitest';
import {
  CONFIRMED_WAREHOUSES,
  isWarehouseOpenOnDate,
  getDayOfWeekFromDate,
  WarehousesService,
} from '@/modules/warehouses/warehouses.service';

describe('Warehouse Schedule Engine (12 Confirmed Warehouses)', () => {
  it('should have exactly 12 confirmed warehouses without extraneous entries', () => {
    expect(CONFIRMED_WAREHOUSES).toHaveLength(12);

    const names = CONFIRMED_WAREHOUSES.map((w) => w.name);
    expect(names).toContain('Коледино');
    expect(names).toContain('СК Вешки');
    expect(names).toContain('Подольск');
    expect(names).toContain('Подольск 4');
    expect(names).toContain('ВБ Щербинка');
    expect(names).toContain('Озон Щербинка');
    expect(names).toContain('Озон Гривно');
    expect(names).toContain('Радумля');
    expect(names).toContain('Обухово');
    expect(names).toContain('Чашниково');
    expect(names).toContain('Чехов 1');
    expect(names).toContain('Чехов 2');
  });

  // Calendar dates reference (November 2026):
  // 2026-11-08: Sunday (0)
  // 2026-11-09: Monday (1)
  // 2026-11-10: Tuesday (2)
  // 2026-11-11: Wednesday (3)
  // 2026-11-12: Thursday (4)
  // 2026-11-13: Friday (5)
  // 2026-11-14: Saturday (6)

  it('correctly calculates days of week without timezone skew', () => {
    expect(getDayOfWeekFromDate('2026-11-08')).toBe(0); // Sun
    expect(getDayOfWeekFromDate('2026-11-09')).toBe(1); // Mon
    expect(getDayOfWeekFromDate('2026-11-10')).toBe(2); // Tue
    expect(getDayOfWeekFromDate('2026-11-11')).toBe(3); // Wed
    expect(getDayOfWeekFromDate('2026-11-12')).toBe(4); // Thu
    expect(getDayOfWeekFromDate('2026-11-13')).toBe(5); // Fri
    expect(getDayOfWeekFromDate('2026-11-14')).toBe(6); // Sat
  });

  it('Daily warehouses are open every day of the week', () => {
    const koledino = CONFIRMED_WAREHOUSES.find((w) => w.name === 'Коледино')!;
    expect(koledino.schedule).toBe('DAILY');

    const testDays = [
      '2026-11-08', // Sun
      '2026-11-09', // Mon
      '2026-11-10', // Tue
      '2026-11-11', // Wed
      '2026-11-12', // Thu
      '2026-11-13', // Fri
      '2026-11-14', // Sat
    ];

    for (const day of testDays) {
      expect(isWarehouseOpenOnDate(koledino, day)).toBe(true);
    }
  });

  it('MWF warehouses (Радумля, Обухово) are open ONLY on Monday, Wednesday, Friday', () => {
    const radumlya = CONFIRMED_WAREHOUSES.find((w) => w.name === 'Радумля')!;
    const obukhovo = CONFIRMED_WAREHOUSES.find((w) => w.name === 'Обухово')!;

    expect(radumlya.schedule).toBe('MWF');
    expect(obukhovo.schedule).toBe('MWF');

    // Open on Mon, Wed, Fri
    expect(isWarehouseOpenOnDate(radumlya, '2026-11-09')).toBe(true); // Mon
    expect(isWarehouseOpenOnDate(radumlya, '2026-11-11')).toBe(true); // Wed
    expect(isWarehouseOpenOnDate(radumlya, '2026-11-13')).toBe(true); // Fri

    // Closed on Sun, Tue, Thu, Sat
    expect(isWarehouseOpenOnDate(radumlya, '2026-11-08')).toBe(false); // Sun
    expect(isWarehouseOpenOnDate(radumlya, '2026-11-10')).toBe(false); // Tue
    expect(isWarehouseOpenOnDate(radumlya, '2026-11-12')).toBe(false); // Thu
    expect(isWarehouseOpenOnDate(radumlya, '2026-11-14')).toBe(false); // Sat
  });

  it('TTS warehouses (Чашниково, Чехов 1, Чехов 2) are open ONLY on Tuesday, Thursday, Saturday', () => {
    const chashnikovo = CONFIRMED_WAREHOUSES.find((w) => w.name === 'Чашниково')!;
    const chekhov1 = CONFIRMED_WAREHOUSES.find((w) => w.name === 'Чехов 1')!;
    const chekhov2 = CONFIRMED_WAREHOUSES.find((w) => w.name === 'Чехов 2')!;

    expect(chashnikovo.schedule).toBe('TTS');
    expect(chekhov1.schedule).toBe('TTS');
    expect(chekhov2.schedule).toBe('TTS');

    // Open on Tue, Thu, Sat
    expect(isWarehouseOpenOnDate(chekhov1, '2026-11-10')).toBe(true); // Tue
    expect(isWarehouseOpenOnDate(chekhov1, '2026-11-12')).toBe(true); // Thu
    expect(isWarehouseOpenOnDate(chekhov1, '2026-11-14')).toBe(true); // Sat

    // Closed on Sun, Mon, Wed, Fri
    expect(isWarehouseOpenOnDate(chekhov1, '2026-11-08')).toBe(false); // Sun
    expect(isWarehouseOpenOnDate(chekhov1, '2026-11-09')).toBe(false); // Mon
    expect(isWarehouseOpenOnDate(chekhov1, '2026-11-11')).toBe(false); // Wed
    expect(isWarehouseOpenOnDate(chekhov1, '2026-11-13')).toBe(false); // Fri
  });

  it('Only Daily warehouses (7 warehouses) are open on Sunday', async () => {
    const sundayOpen = await WarehousesService.listAvailableForDate('2026-11-08');
    expect(sundayOpen).toHaveLength(7);
    expect(sundayOpen.every((w) => w.schedule === 'DAILY')).toBe(true);
  });

  it('On Tuesday, exactly 10 warehouses are open (7 Daily + 3 TTS)', async () => {
    const tuesdayOpen = await WarehousesService.listAvailableForDate('2026-11-10');
    expect(tuesdayOpen).toHaveLength(10);
    expect(tuesdayOpen.map((w) => w.name)).not.toContain('Радумля');
    expect(tuesdayOpen.map((w) => w.name)).not.toContain('Обухово');
  });

  it('On Wednesday, exactly 9 warehouses are open (7 Daily + 2 MWF)', async () => {
    const wednesdayOpen = await WarehousesService.listAvailableForDate('2026-11-11');
    expect(wednesdayOpen).toHaveLength(9);
    expect(wednesdayOpen.map((w) => w.name)).not.toContain('Чашниково');
    expect(wednesdayOpen.map((w) => w.name)).not.toContain('Чехов 1');
    expect(wednesdayOpen.map((w) => w.name)).not.toContain('Чехов 2');
  });

  it('Server assertion throws ValidationError when attempting order on closed warehouse date', () => {
    const radumlya = CONFIRMED_WAREHOUSES.find((w) => w.name === 'Радумля')!;

    // Tuesday is closed for Radumlya
    expect(() =>
      WarehousesService.assertWarehouseAvailable(radumlya, '2026-11-10')
    ).toThrow('не работает в вторник');

    // Monday is open for Radumlya
    expect(() =>
      WarehousesService.assertWarehouseAvailable(radumlya, '2026-11-09')
    ).not.toThrow();
  });
});
