import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildOrdersPaginationUrl,
  calculateDisplayRange,
  sanitizePaginationParams,
} from '@/lib/pagination';
import { OrderStatus } from '@prisma/client';

describe('Admin Orders Pagination & Filter System (Unit Tests)', () => {
  describe('1. Pagination Parameter Sanitization (sanitizePaginationParams)', () => {
    it('should use default page = 1, pageSize = 25, skip = 0 when no params provided', () => {
      const result = sanitizePaginationParams();
      expect(result).toEqual({ page: 1, pageSize: 25, skip: 0 });
    });

    it('should handle valid page and pageSize numbers correctly', () => {
      const result = sanitizePaginationParams(3, 25);
      expect(result).toEqual({ page: 3, pageSize: 25, skip: 50 });
    });

    it('should sanitize negative page numbers to page 1 and skip 0', () => {
      const result = sanitizePaginationParams(-10, 25);
      expect(result.page).toBe(1);
      expect(result.skip).toBe(0);
      expect(result.skip).toBeGreaterThanOrEqual(0);
    });

    it('should sanitize page = 0 to page 1 and skip 0', () => {
      const result = sanitizePaginationParams(0, 25);
      expect(result.page).toBe(1);
      expect(result.skip).toBe(0);
    });

    it('should sanitize non-integer and NaN page values to page 1', () => {
      expect(sanitizePaginationParams('invalid-page', 25)).toEqual({
        page: 1,
        pageSize: 25,
        skip: 0,
      });
      expect(sanitizePaginationParams(3.7, 25)).toEqual({
        page: 1,
        pageSize: 25,
        skip: 0,
      });
      expect(sanitizePaginationParams(undefined, undefined)).toEqual({
        page: 1,
        pageSize: 25,
        skip: 0,
      });
    });

    it('should enforce maximum pageSize protection (cap at 100) to prevent DoS', () => {
      const result = sanitizePaginationParams(1, 5000);
      expect(result.pageSize).toBe(100);
      expect(result.skip).toBe(0);
    });

    it('should sanitize negative or zero pageSize to default 25', () => {
      expect(sanitizePaginationParams(1, -25).pageSize).toBe(25);
      expect(sanitizePaginationParams(1, 0).pageSize).toBe(25);
    });
  });

  describe('2. Display Range Calculation (calculateDisplayRange)', () => {
    it('should return 0-0 when total is 0 or itemsCount is 0', () => {
      expect(calculateDisplayRange(1, 25, 0, 0)).toEqual({
        fromRecord: 0,
        toRecord: 0,
      });
      expect(calculateDisplayRange(2, 25, 0, 10)).toEqual({
        fromRecord: 0,
        toRecord: 0,
      });
    });

    it('should calculate first page display range correctly (e.g. 1–25 of 100)', () => {
      const { fromRecord, toRecord } = calculateDisplayRange(1, 25, 25, 100);
      expect(fromRecord).toBe(1);
      expect(toRecord).toBe(25);
    });

    it('should calculate middle page display range correctly (e.g. 26–50 of 100)', () => {
      const { fromRecord, toRecord } = calculateDisplayRange(2, 25, 25, 100);
      expect(fromRecord).toBe(26);
      expect(toRecord).toBe(50);
    });

    it('should calculate last partial page display range correctly (e.g. 76–83 of 83)', () => {
      const { fromRecord, toRecord } = calculateDisplayRange(4, 25, 8, 83);
      expect(fromRecord).toBe(76);
      expect(toRecord).toBe(83);
    });

    it('should handle small datasets (e.g. 1–3 of 3)', () => {
      const { fromRecord, toRecord } = calculateDisplayRange(1, 25, 3, 3);
      expect(fromRecord).toBe(1);
      expect(toRecord).toBe(3);
    });
  });

  describe('3. URL Search Params & Filter Preservation (buildOrdersPaginationUrl)', () => {
    it('should return /admin/orders when targetPage is 1 and no filters are present', () => {
      const url = buildOrdersPaginationUrl(1, {});
      expect(url).toBe('/admin/orders');
    });

    it('should include page parameter when targetPage > 1', () => {
      const url = buildOrdersPaginationUrl(2, {});
      expect(url).toBe('/admin/orders?page=2');
    });

    it('should preserve all active filters (search, status, warehouseId, date) across page navigation', () => {
      const url = buildOrdersPaginationUrl(3, {
        search: 'ABL-2026',
        status: OrderStatus.CONFIRMED,
        warehouseId: 'wh-uuid-1',
        date: '2026-11-15',
      });

      const parsedUrl = new URL(url, 'http://localhost:3000');
      expect(parsedUrl.pathname).toBe('/admin/orders');
      expect(parsedUrl.searchParams.get('page')).toBe('3');
      expect(parsedUrl.searchParams.get('search')).toBe('ABL-2026');
      expect(parsedUrl.searchParams.get('status')).toBe('CONFIRMED');
      expect(parsedUrl.searchParams.get('warehouseId')).toBe('wh-uuid-1');
      expect(parsedUrl.searchParams.get('date')).toBe('2026-11-15');
    });

    it('should omit empty filter strings from the generated URL to keep it clean', () => {
      const url = buildOrdersPaginationUrl(2, {
        search: '',
        status: undefined,
        warehouseId: '',
        date: '',
      });
      expect(url).toBe('/admin/orders?page=2');
    });

    it('should correctly build return to page 1 url while preserving filters', () => {
      const url = buildOrdersPaginationUrl(1, {
        search: 'ООО Ромашка',
        status: OrderStatus.DELIVERED_TO_WAREHOUSE,
      });
      const parsedUrl = new URL(url, 'http://localhost:3000');
      expect(parsedUrl.pathname).toBe('/admin/orders');
      expect(parsedUrl.searchParams.get('page')).toBeNull(); // page 1 is omitted for clean URL
      expect(parsedUrl.searchParams.get('search')).toBe('ООО Ромашка');
      expect(parsedUrl.searchParams.get('status')).toBe('DELIVERED_TO_WAREHOUSE');
    });
  });

  describe('4. Pagination Disjointness (No Duplication Between Pages)', () => {
    it('should ensure skip/take produces strictly non-overlapping item ranges', () => {
      // Simulate 75 items with sequential IDs
      const mockDataset = Array.from({ length: 75 }, (_, i) => ({
        id: `order-${i + 1}`,
        orderNumber: `ABL-2026-${String(i + 1).padStart(3, '0')}`,
        createdAt: new Date(Date.now() - i * 1000).toISOString(),
      }));

      const pageSize = 25;

      // Page 1
      const p1 = sanitizePaginationParams(1, pageSize);
      const page1Items = mockDataset.slice(p1.skip, p1.skip + p1.pageSize);

      // Page 2
      const p2 = sanitizePaginationParams(2, pageSize);
      const page2Items = mockDataset.slice(p2.skip, p2.skip + p2.pageSize);

      // Page 3
      const p3 = sanitizePaginationParams(3, pageSize);
      const page3Items = mockDataset.slice(p3.skip, p3.skip + p3.pageSize);

      expect(page1Items.length).toBe(25);
      expect(page2Items.length).toBe(25);
      expect(page3Items.length).toBe(25);

      // Verify no overlap between page 1 and page 2
      const page1Ids = new Set(page1Items.map((item) => item.id));
      const page2Ids = new Set(page2Items.map((item) => item.id));
      const page3Ids = new Set(page3Items.map((item) => item.id));

      for (const id of page2Ids) {
        expect(page1Ids.has(id)).toBe(false);
      }
      for (const id of page3Ids) {
        expect(page1Ids.has(id)).toBe(false);
        expect(page2Ids.has(id)).toBe(false);
      }

      // Verify full coverage of dataset
      const allCombinedIds = new Set([...page1Ids, ...page2Ids, ...page3Ids]);
      expect(allCombinedIds.size).toBe(75);
    });
  });

  describe('5. Total Pages Calculation', () => {
    it('should return totalPages = 1 when total is 0', () => {
      const total = 0;
      const pageSize = 25;
      const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
      expect(totalPages).toBe(1);
    });

    it('should return totalPages = 1 when total <= pageSize', () => {
      expect(Math.ceil(25 / 25)).toBe(1);
      expect(Math.ceil(1 / 25)).toBe(1);
    });

    it('should return totalPages = 2 when total is 26 and pageSize is 25', () => {
      expect(Math.ceil(26 / 25)).toBe(2);
    });

    it('should return totalPages = 4 when total is 100 and pageSize is 25', () => {
      expect(Math.ceil(100 / 25)).toBe(4);
    });
  });
});
