export interface OrderFilterParams {
  search?: string;
  status?: string;
  warehouseId?: string;
  date?: string;
}

export function buildOrdersPaginationUrl(
  targetPage: number,
  filters: OrderFilterParams
): string {
  const query = new URLSearchParams();
  if (targetPage > 1) {
    query.set('page', String(targetPage));
  }
  if (filters.search) {
    query.set('search', filters.search);
  }
  if (filters.status) {
    query.set('status', filters.status);
  }
  if (filters.warehouseId) {
    query.set('warehouseId', filters.warehouseId);
  }
  if (filters.date) {
    query.set('date', filters.date);
  }
  const qs = query.toString();
  return qs ? `/admin/orders?${qs}` : '/admin/orders';
}

export function calculateDisplayRange(
  page: number,
  pageSize: number,
  itemsCount: number,
  total: number
): { fromRecord: number; toRecord: number } {
  if (itemsCount === 0 || total === 0) {
    return { fromRecord: 0, toRecord: 0 };
  }
  const fromRecord = (page - 1) * pageSize + 1;
  const toRecord = Math.min((page - 1) * pageSize + itemsCount, total);
  return { fromRecord, toRecord };
}

export function sanitizePaginationParams(
  rawPage?: unknown,
  rawPageSize?: unknown
): { page: number; pageSize: number; skip: number } {
  const numPage = Number(rawPage);
  const page = Number.isInteger(numPage) && numPage > 0 ? numPage : 1;
  const numPageSize = Number(rawPageSize);
  const pageSize =
    Number.isInteger(numPageSize) && numPageSize > 0 ? Math.min(numPageSize, 100) : 25;
  const skip = Math.max(0, (page - 1) * pageSize);
  return { page, pageSize, skip };
}
