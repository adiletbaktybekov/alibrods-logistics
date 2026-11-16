import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Task 4 & System Architecture Verifications', () => {
  const rootDir = process.cwd();

  it('verifies «Спецификация мест» is completely removed from admin order detail page', () => {
    const adminOrderDetailPath = path.join(rootDir, 'app/admin/orders/[id]/page.tsx');
    const content = fs.readFileSync(adminOrderDetailPath, 'utf-8');

    expect(content.toLowerCase()).not.toContain('спецификация мест');
    expect(content).not.toContain('Спецификация мест');
  });

  it('verifies OrderItem model and data structure is preserved in Prisma schema', () => {
    const schemaPath = path.join(rootDir, 'prisma/schema.prisma');
    const content = fs.readFileSync(schemaPath, 'utf-8');

    expect(content).toContain('model OrderItem {');
    expect(content).toContain('model OrderDestination {');
  });

  it('verifies Client order detail page includes driver card, warehouse breakdown, and totals', () => {
    const clientOrderDetailPath = path.join(rootDir, 'app/(client)/orders/[id]/page.tsx');
    const content = fs.readFileSync(clientOrderDetailPath, 'utf-8');

    // Assigned driver info
    expect(content).toContain('Назначенный водитель');
    expect(content).toContain('vehicleModel');
    expect(content).toContain('vehiclePlateNumber');

    // Destinations and totals
    expect(content).toContain('Маршрут и склады назначения');
    expect(content).toContain('totalPalletsCount');
    expect(content).toContain('totalBoxesCount');
    expect(content).toContain('Всего складов');
    expect(content).toContain('Всего паллет');

    // Pickup & comments
    expect(content).toContain('Адрес и контакт забора груза');
    expect(content).toContain('Комментарий селлера к заявке');
  });

  it('verifies Client orders list displays warehouse count and pallets-first format', () => {
    const clientOrdersPath = path.join(rootDir, 'app/(client)/orders/page.tsx');
    const content = fs.readFileSync(clientOrdersPath, 'utf-8');

    expect(content).toContain('Складов:');
    expect(content).toContain('палл.');
    expect(content).toContain('кор.');
  });

  it('verifies OrderForm separates Wildberries and Ozon warehouses with distinct branding', () => {
    const formPath = path.join(rootDir, 'app/(client)/orders/new/order-form.tsx');
    const content = fs.readFileSync(formPath, 'utf-8');

    expect(content).toContain('Wildberries');
    expect(content).toContain('Ozon');
    expect(content).toContain('#cb11ab');
    expect(content).toContain('#005bff');
  });

  it('verifies MiniApp order form separates Wildberries and Ozon warehouses', () => {
    const miniappFormPath = path.join(rootDir, 'components/miniapp/miniapp-order-form.tsx');
    const content = fs.readFileSync(miniappFormPath, 'utf-8');

    expect(content).toContain('Wildberries');
    expect(content).toContain('Ozon');
  });
});
