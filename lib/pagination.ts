export interface OrderFilterParams {
  search?: string;
  status?: string;
  warehouseId?: string;
  date?: string;
}

export function buildPaginationUrl(
  basePath: string,
  targetPage: number,
  filters: Record<string, string | undefined>
): string {
  const query = new URLSearchParams();
  if (targetPage > 1) {
    query.set('page', String(targetPage));
  }
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value.trim() !== '') {
      query.set(key, value.trim());
    }
  }
  const qs = query.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function buildOrdersPaginationUrl(
  targetPage: number,
  filters: OrderFilterParams
): string {
  return buildPaginationUrl('/admin/orders', targetPage, {
    search: filters.search,
    status: filters.status,
    warehouseId: filters.warehouseId,
    date: filters.date,
  });
}

export function buildClientsPaginationUrl(
  targetPage: number,
  filters: { search?: string }
): string {
  return buildPaginationUrl('/admin/clients', targetPage, {
    search: filters.search,
  });
}

export function buildDriversPaginationUrl(
  targetPage: number,
  filters: { search?: string; isAvailable?: string; isActive?: string }
): string {
  return buildPaginationUrl('/admin/drivers', targetPage, {
    search: filters.search,
    isAvailable: filters.isAvailable,
    isActive: filters.isActive,
  });
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
